/**
 * Cloudflare Pages Function — 미결재 일일 리마인더 cron
 * POST /api/cron-pending-approval-reminder
 * Header: X-Cron-Secret: ${CRON_SECRET}
 *
 * Design Ref: §4.2 — 매일 KST 08:30 (UTC 23:30 전일, cron expr `30 23 * * *`)
 * Plan SC-09, FR-08, FR-09 — push + in_app 만 (이메일 제외, 사용자 Q3 확정), 당일 중복 0
 *
 * 사용법:
 *  - 외부 cron (cron-job.org, GitHub Actions) 에서 매일 호출
 *  - 또는 Cloudflare Cron Triggers (대시보드에서 설정)
 *
 * 환경변수:
 *   CRON_SECRET                — 무단 호출 방지
 *   VITE_SUPABASE_URL          — Supabase URL
 *   SUPABASE_SERVICE_ROLE_KEY  — Service Role Key (RLS bypass)
 *   VAPID_*                    — (간접) send-push 가 사용
 */

interface Env {
  CRON_SECRET?: string
  VITE_SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

interface ApprovalDoc {
  id: string
  title: string
  doc_type: string
  current_step: number
}

interface ApprovalStep {
  document_id: string
  approver_id: string
}

interface DeliveryDedup {
  recipient_uid: string
  related_entity_id: string
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Cron-Secret',
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

const DOC_TYPE_LABEL: Record<string, string> = {
  leave: '연차/반차/조퇴',
  overtime: '연장/야간/휴일 근무',
  business_trip: '출장',
  expense: '지출결의서',
  purchase: '사무용품 요청',
  daily_report: '일일 업무보고',
  general: '일반 결재',
}

export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS_HEADERS })

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const env = ctx.env

  // 인증
  const secret = ctx.request.headers.get('X-Cron-Secret')
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) {
    return jsonResponse({ error: 'unauthorized' }, 401)
  }
  if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Supabase 서비스 키 미설정' }, 500)
  }

  const sbHeaders = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  }
  const baseUrl = env.VITE_SUPABASE_URL

  let dryRun = false
  try {
    const body = (await ctx.request.json().catch(() => ({}))) as { dryRun?: boolean }
    dryRun = !!body.dryRun
  } catch { /* noop */ }

  // 1) 진행 중 결재 문서 조회 (status submitted / in_review)
  const docsRes = await fetch(
    `${baseUrl}/rest/v1/approval_documents?status=in.(submitted,in_review)&select=id,title,doc_type,current_step`,
    { headers: sbHeaders },
  )
  if (!docsRes.ok) {
    return jsonResponse({ error: 'approval_documents 조회 실패', detail: await docsRes.text() }, 500)
  }
  const docs = (await docsRes.json()) as ApprovalDoc[]
  if (docs.length === 0) {
    return jsonResponse({ scanned: 0, recipientsNotified: 0, skippedDuplicates: 0, dryRun })
  }

  // 2) 각 문서의 current_step pending approver 조회 (한 번에 OR 쿼리 — REST 는 in.() 활용)
  //    필터: document_id in [...] AND action eq pending
  //    각 doc 마다 step_order 가 다르므로 client-side filter (서버사이드 row 양은 적음)
  const docIds = docs.map((d) => d.id)
  const idsParam = docIds.map((id) => `"${id}"`).join(',')
  const stepsRes = await fetch(
    `${baseUrl}/rest/v1/approval_steps?document_id=in.(${idsParam})&action=eq.pending&select=document_id,approver_id,step_order`,
    { headers: sbHeaders },
  )
  if (!stepsRes.ok) {
    return jsonResponse({ error: 'approval_steps 조회 실패', detail: await stepsRes.text() }, 500)
  }
  const allSteps = (await stepsRes.json()) as Array<ApprovalStep & { step_order: number }>

  // 3) doc 의 current_step 과 일치하는 pending step 만 필터링 → (approver_id, doc) 쌍 생성
  const docMap = new Map(docs.map((d) => [d.id, d]))
  const pairs: Array<{ uid: string; doc: ApprovalDoc }> = []
  for (const step of allSteps) {
    const doc = docMap.get(step.document_id)
    if (!doc) continue
    if (step.step_order !== doc.current_step) continue
    pairs.push({ uid: step.approver_id, doc })
  }
  if (pairs.length === 0) {
    return jsonResponse({ scanned: docs.length, recipientsNotified: 0, skippedDuplicates: 0, dryRun })
  }

  // 4) 당일 dedupe: notification_deliveries 에서 오늘 UTC 00:00 이후 approval_pending 발송 이력
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const todayIso = todayStart.toISOString()

  const dedupRes = await fetch(
    `${baseUrl}/rest/v1/notification_deliveries` +
      `?related_entity_type=eq.approval_pending` +
      `&sent_at=gte.${todayIso}` +
      `&status=in.(sent,queued)` +
      `&select=recipient_uid,related_entity_id`,
    { headers: sbHeaders },
  )
  const sentToday = dedupRes.ok ? ((await dedupRes.json()) as DeliveryDedup[]) : []
  const dedupSet = new Set(sentToday.map((d) => `${d.recipient_uid}::${d.related_entity_id}`))

  // 5) 발송 대상 필터
  let skipped = 0
  const targets: typeof pairs = []
  for (const p of pairs) {
    const key = `${p.uid}::${p.doc.id}`
    if (dedupSet.has(key)) { skipped++; continue }
    targets.push(p)
    dedupSet.add(key) // 같은 cron 실행 내에서도 중복 방지
  }

  if (dryRun) {
    return jsonResponse({
      scanned: docs.length,
      recipientsNotified: 0,
      skippedDuplicates: skipped,
      targets: targets.map((t) => ({ uid: t.uid, docId: t.doc.id, title: t.doc.title })),
      dryRun: true,
    })
  }

  // 6) push + in_app 발송 (이메일 제외 — 사용자 Q3 확정)
  // self-origin 으로 send-push 호출 + record_notification_delivery RPC 직접 호출
  const origin = new URL(ctx.request.url).origin
  const channelResults: Array<{ uid: string; docId: string; in_app: string; push: string }> = []

  for (const t of targets) {
    const docType = DOC_TYPE_LABEL[t.doc.doc_type] || t.doc.doc_type
    const subject = `[리마인드] ${docType} 결재 대기 — ${t.doc.title}`
    const bodyText = `미결재 건이 있습니다. 결재 페이지에서 확인해 주세요.`
    const appUrl = origin
    const link = `${appUrl}/admin/approval/${t.doc.id}`

    // (a) in_app — record_notification_delivery RPC 직접 호출
    let inAppStatus = 'unknown'
    try {
      const rpcRes = await fetch(`${baseUrl}/rest/v1/rpc/record_notification_delivery`, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify({
          p_template_key: null,
          p_channel: 'in_app',
          p_recipient_uid: t.uid,
          p_recipient_email: null,
          p_subject: subject,
          p_payload: { body: bodyText, link, reminder: true },
          p_status: 'sent',
          p_error_message: null,
          p_related_entity_type: 'approval_pending',
          p_related_entity_id: t.doc.id,
        }),
      })
      inAppStatus = rpcRes.ok ? 'sent' : `failed:${rpcRes.status}`
    } catch (err: any) {
      inAppStatus = `error:${err?.message || 'unknown'}`
    }

    // (b) push — send-push 함수에 위임
    let pushStatus = 'unknown'
    try {
      const pushRes = await fetch(`${origin}/api/send-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient_uid: t.uid,
          title: subject,
          body: bodyText,
          url: `/admin/approval/${t.doc.id}`,
        }),
      })
      pushStatus = pushRes.ok ? 'sent' : `failed:${pushRes.status}`
      // push 도 deliveries 에 기록 (감사용)
      await fetch(`${baseUrl}/rest/v1/rpc/record_notification_delivery`, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify({
          p_template_key: null,
          p_channel: 'push',
          p_recipient_uid: t.uid,
          p_recipient_email: null,
          p_subject: subject,
          p_payload: { body: bodyText, link, reminder: true, push_status: pushStatus },
          p_status: pushRes.ok ? 'sent' : 'failed',
          p_error_message: pushRes.ok ? null : `HTTP ${pushRes.status}`,
          p_related_entity_type: 'approval_pending',
          p_related_entity_id: t.doc.id,
        }),
      }).catch(() => {})
    } catch (err: any) {
      pushStatus = `error:${err?.message || 'unknown'}`
    }

    channelResults.push({ uid: t.uid, docId: t.doc.id, in_app: inAppStatus, push: pushStatus })
  }

  return jsonResponse({
    scanned: docs.length,
    recipientsNotified: targets.length,
    skippedDuplicates: skipped,
    channelResults,
    dryRun: false,
  })
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  if (ctx.request.method === 'OPTIONS') return onRequestOptions()
  if (ctx.request.method === 'POST') return onRequestPost(ctx)
  return new Response('Method not allowed', { status: 405 })
}
