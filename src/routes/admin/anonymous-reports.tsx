/**
 * 관리자 — 익명 신고 처리 (/admin/system/anonymous-reports)
 *  - HR 전용
 *  - feature_rollouts.anonymous_report = true 일 때만 노출
 */
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Textarea } from '@/components/ui/Textarea'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { Shield, AlertCircle, MessageSquare, Send, Filter, Megaphone, Copy, Download, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { FEATURE_KEYS } from '@/types/compliance'
import { logAudit } from '@/lib/audit-logger'
import { formatDate } from '@/lib/utils'

const CATEGORY_LABELS: Record<string, string> = {
  harassment: '직장 내 괴롭힘',
  sexual: '성희롱·성차별',
  discrimination: '차별',
  retaliation: '보복',
  safety: '안전·보건',
  other: '기타',
}

const STATUS_LABELS: Record<string, string> = {
  received: '접수',
  reviewing: '검토중',
  escalated: '상신',
  resolved: '해결',
  closed: '종결',
}

interface ReportRow {
  id: string
  category: string
  subject: string | null
  body: string
  related_persons: string | null
  status: string
  severity: string
  hr_internal_notes: string | null
  assigned_to: string | null
  created_at: string
  resolved_at: string | null
}

export default function AnonymousReportsPage() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [featureOn, setFeatureOn] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<ReportRow[]>([])
  const [selected, setSelected] = useState<ReportRow | null>(null)
  const [replies, setReplies] = useState<any[]>([])
  const [filterStatus, setFilterStatus] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [hrReply, setHrReply] = useState('')
  const [posting, setPosting] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [guideTab, setGuideTab] = useState<'email' | 'slack' | 'poster' | 'ojt' | 'rules'>('email')

  const canAccess = !!profile?.role && ['admin','hr_admin','ceo'].includes(profile.role)

  const PUBLIC_URL = typeof window !== 'undefined' ? `${window.location.origin}/report-anonymous` : '/report-anonymous'
  const TRACK_URL = typeof window !== 'undefined' ? `${window.location.origin}/report-anonymous/track` : '/report-anonymous/track'
  const QR_URL = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(PUBLIC_URL)}`
  const QR_DOWNLOAD_URL = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=20&format=png&data=${encodeURIComponent(PUBLIC_URL)}`

  const TEMPLATES: Record<string, { title: string; body: string }> = {
    email: {
      title: '전사 이메일 공지 (제목 + 본문)',
      body: `[전사 안내] 익명 신고 핫라인 운영 안내

안녕하세요. 인사팀입니다.

당사는 「근로기준법」 제76조의2(직장 내 괴롭힘의 금지) 및 제76조의3(직장 내 괴롭힘 발생 시 조치) 에 따라
직장 내 괴롭힘·성희롱·차별·보복·안전사고 등에 대한 익명 제보 채널을 상시 운영하고 있습니다.

▣ 익명 제보 URL
   ${PUBLIC_URL}

▣ 제보 후 진행 확인 URL (토큰 입력)
   ${TRACK_URL}

▣ 운영 원칙
   1) 제보자의 이름·이메일·계정 정보는 일체 저장되지 않습니다.
   2) 제출 시 발급되는 32자 토큰을 안전한 곳에 보관해 주세요. (HR 답변 확인 시 필요)
   3) 회사 와이파이/사내망 접속 시 IP 추적 우려가 있을 수 있으므로, 가능하면 개인 모바일 데이터 사용을 권장합니다.
   4) 신고를 이유로 한 불이익·보복 행위는 법적으로 금지되며, 적발 시 엄중 조치됩니다.

▣ 처리 절차
   접수 → 검토(최대 ${'10영업일'}) → HR 답변(토큰을 통해 확인) → 종결

문의: 인사팀 (사내 별도 채널은 익명성을 해칠 수 있어 안내하지 않습니다 — 위 URL 사용 권장)

감사합니다.
인사팀 드림`,
    },
    slack: {
      title: '슬랙/사내 메신저 공지 (짧은 버전)',
      body: `:loudspeaker: *익명 신고 핫라인 안내*

직장 내 괴롭힘·성희롱·차별·안전 이슈 등을 *익명*으로 제보할 수 있습니다.

:link: 제보: ${PUBLIC_URL}
:mag: 진행 확인: ${TRACK_URL}

• 이름/이메일/계정 정보 미저장
• 제출 후 발급되는 *32자 토큰* 보관 필수
• 개인 모바일 데이터 사용 권장 (IP 추적 우려)
• 신고로 인한 불이익은 법적으로 금지`,
    },
    poster: {
      title: '게시판/포스터용 짧은 문구 (QR 함께 부착)',
      body: `■ 익명 신고 핫라인 ■

말하기 어려운 일,
혼자 끌어안지 마세요.

직장 내 괴롭힘 · 성희롱 · 차별 · 안전 위해
모두 익명으로 제보할 수 있습니다.

→ 우측 QR 코드 스캔
→ 또는 주소창에 직접 입력:
   ${PUBLIC_URL}

• 이름/계정 미저장 · 완전 익명
• 제보 후 발급되는 토큰으로 HR 답변 확인
• 신고로 인한 불이익 일체 금지 (근로기준법 §76-3)

— 인사팀 —`,
    },
    ojt: {
      title: '신규 입사자 OJT 안내문',
      body: `[OJT 자료 — 안전한 근무환경 안내]

당사는 모든 구성원이 안전하고 존중받는 환경에서 일할 권리를 보장합니다.
만약 다음과 같은 상황을 경험하거나 목격하셨다면, 익명 채널을 통해 언제든 제보해 주세요.

ⓘ 제보 가능 사례
  - 직장 내 괴롭힘 (지속적 폭언, 따돌림, 부당한 업무 지시 등)
  - 성희롱·성차별
  - 인종/성별/연령/장애 등에 기반한 차별
  - 신고자에 대한 보복 행위
  - 안전·보건상 위해 요소
  - 기타 부정행위 (회계 부정, 이해상충 등)

ⓘ 익명 제보 채널
  URL: ${PUBLIC_URL}
  진행 확인: ${TRACK_URL}

ⓘ 보장 사항
  - 신원 비공개 (이름·이메일·계정 정보 미저장)
  - 신고 이유로 인한 인사상 불이익 일체 금지
  - HR 처리 결과는 발급된 토큰으로 확인 가능

ⓘ 주의
  - 회사 네트워크 접속 시 IP 추적 우려 → 개인 모바일 데이터 사용 권장
  - 발급된 32자 토큰은 안전한 곳에 보관 (재발급 불가)

— 인사팀 —`,
    },
    rules: {
      title: '취업규칙 부속 — 직장 내 괴롭힘 예방 안내문',
      body: `[직장 내 괴롭힘 예방 및 발생 시 처리 절차 안내]

근거: 근로기준법 제76조의2, 제76조의3 및 당사 취업규칙 제○○조

제1조 (목적)
본 안내문은 「근로기준법」에 따라 직장 내 괴롭힘 예방 및 발생 시 처리 절차를 정함을 목적으로 한다.

제2조 (정의)
"직장 내 괴롭힘"이란 사용자 또는 근로자가 직장에서의 지위 또는 관계 등의 우위를 이용하여
업무상 적정범위를 넘어 다른 근로자에게 신체적·정신적 고통을 주거나 근무환경을 악화시키는 행위를 말한다.

제3조 (신고 채널)
① 직장 내 괴롭힘을 당하거나 목격한 자는 다음 채널을 통해 익명으로 신고할 수 있다.
   - 익명 신고 URL: ${PUBLIC_URL}
   - 처리 확인 URL: ${TRACK_URL}
② 신고 시 이름·이메일·계정 정보는 저장되지 않는다.
③ 신고자에게는 32자 토큰이 발급되며, 해당 토큰으로 HR 답변을 확인할 수 있다.

제4조 (처리 절차)
① 접수 → 사실관계 조사 → 피해자 보호조치 → 가해자 조치 → 종결 통보
② 조사 기간: 접수일로부터 최대 ${'1개월'} (불가피한 경우 연장 가능)
③ 조사 중 피해자에 대한 근무장소 변경, 유급휴가 등 보호조치 가능

제5조 (불이익 금지)
신고자 및 피해자에게 신고를 이유로 한 해고·전보·징계 등 일체의 불이익 처우를 금지한다.
위반 시 「근로기준법」 제116조에 따라 3년 이하의 징역 또는 3천만원 이하의 벌금에 처해질 수 있다.

— 시행일: ${new Date().getFullYear()}년 ${new Date().getMonth() + 1}월 ${new Date().getDate()}일 —`,
    },
  }

  function copyToClipboard(text: string) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        () => toast('클립보드에 복사되었습니다', 'success'),
        () => toast('복사 실패 — 직접 선택 후 복사해주세요', 'error'),
      )
    } else {
      toast('이 브라우저는 자동 복사를 지원하지 않습니다', 'error')
    }
  }

  useEffect(() => { isFeatureEnabled(FEATURE_KEYS.ANONYMOUS_REPORT).then(setFeatureOn) }, [])

  async function load() {
    setLoading(true)
    let q = supabase
      .from('anonymous_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    if (filterStatus) q = q.eq('status', filterStatus)
    const { data } = await q
    setRows((data || []) as ReportRow[])
    setLoading(false)
  }

  useEffect(() => { if (featureOn && canAccess) load() }, [featureOn, canAccess, filterStatus])

  async function openDetail(r: ReportRow) {
    setSelected(r)
    setInternalNotes(r.hr_internal_notes || '')
    const { data } = await supabase
      .from('anonymous_report_replies')
      .select('*')
      .eq('report_id', r.id)
      .order('created_at', { ascending: true })
    setReplies(data || [])
  }

  async function updateReport(patch: Partial<ReportRow>) {
    if (!selected) return
    const { error } = await supabase
      .from('anonymous_reports')
      .update(patch)
      .eq('id', selected.id)
    if (error) { toast('업데이트 실패: ' + error.message, 'error'); return }
    await logAudit({
      action: 'update', entity: 'anonymous_report', entityId: selected.id,
      diff: `상태/내부메모 갱신 — ${JSON.stringify(patch)}`,
    })
    toast('업데이트 완료', 'success')
    setSelected({ ...selected, ...patch } as ReportRow)
    load()
  }

  async function sendHrReply() {
    if (!selected || !hrReply.trim()) return
    setPosting(true)
    const { error } = await supabase.rpc('reply_anonymous_report_hr', {
      p_report_id: selected.id,
      p_body: hrReply.trim(),
    })
    setPosting(false)
    if (error) { toast('답변 실패: ' + error.message, 'error'); return }
    setHrReply('')
    openDetail(selected)
    toast('답변 전송 완료', 'success')
  }

  if (featureOn === null || loading) return <PageSpinner />

  if (!featureOn) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
        <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
        <h2 className="text-base font-bold text-amber-800">익명 신고 핫라인 비활성 상태</h2>
        <p className="text-sm text-amber-700 mt-1">시스템 관리 &gt; 기능 토글에서 활성화 후 사용하세요.</p>
      </div>
    )
  }
  if (!canAccess) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-lg p-6 text-center text-sm text-rose-800">
        HR/관리자/대표만 접근할 수 있습니다.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="h-6 w-6 text-brand-500" /> 익명 신고 처리
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">제보자 신원 정보는 저장되지 않습니다. 토큰 기반 응답.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowGuide((v) => !v)}>
          <Megaphone className="h-4 w-4 mr-1" />
          {showGuide ? '공지 자료 닫기' : '공지 자료 / QR / 안내문'}
          {showGuide ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
        </Button>
      </div>

      {showGuide && (
        <Card className="border-brand-200 bg-brand-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-brand-500" /> 전사 안내 자료
            </CardTitle>
            <p className="text-xs text-gray-500 mt-1">
              직원에게는 사이드바 메뉴가 아닌 <strong>공개 URL</strong>을 안내하세요 (익명성 보장).
              아래 자료를 그대로 사용하거나 수정해서 공지하세요.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              <div className="md:col-span-1 bg-white rounded-lg p-3 border border-gray-200 text-center">
                <p className="text-xs font-semibold text-gray-700 mb-2">QR 코드</p>
                <img src={QR_URL} alt="익명 신고 QR" className="mx-auto rounded border border-gray-200" width={180} height={180} />
                <p className="text-[10px] text-gray-400 mt-1 break-all">{PUBLIC_URL}</p>
                <div className="flex gap-1 justify-center mt-2">
                  <a
                    href={QR_DOWNLOAD_URL}
                    download="anonymous-report-qr.png"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
                  >
                    <Download className="h-3 w-3" /> PNG 600px
                  </a>
                  <a
                    href={PUBLIC_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
                  >
                    <ExternalLink className="h-3 w-3" /> 미리보기
                  </a>
                </div>
              </div>

              <div className="md:col-span-2 space-y-2">
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-semibold text-gray-700">제보 URL</span>
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => copyToClipboard(PUBLIC_URL)}>
                      <Copy className="h-3 w-3 mr-1" /> 복사
                    </Button>
                  </div>
                  <code className="text-xs text-brand-700 break-all">{PUBLIC_URL}</code>
                </div>
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-semibold text-gray-700">진행 확인 URL</span>
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => copyToClipboard(TRACK_URL)}>
                      <Copy className="h-3 w-3 mr-1" /> 복사
                    </Button>
                  </div>
                  <code className="text-xs text-brand-700 break-all">{TRACK_URL}</code>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-800">
                  <strong>운영 팁</strong> · 사내 네트워크 IP 추적 우려를 반드시 안내하세요. · QR을 휴게실/화장실 입구 등 사람 없는 장소에 부착하면 접근성↑.
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1 flex-wrap border-b border-gray-200 mb-2">
                {(['email','slack','poster','ojt','rules'] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setGuideTab(k)}
                    className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px ${
                      guideTab === k
                        ? 'border-brand-500 text-brand-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {k === 'email' && '이메일 공지'}
                    {k === 'slack' && '슬랙/메신저'}
                    {k === 'poster' && '게시판/포스터'}
                    {k === 'ojt' && 'OJT 안내문'}
                    {k === 'rules' && '취업규칙 부속'}
                  </button>
                ))}
              </div>
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100">
                  <span className="text-xs font-semibold text-gray-700">{TEMPLATES[guideTab].title}</span>
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => copyToClipboard(TEMPLATES[guideTab].body)}>
                    <Copy className="h-3 w-3 mr-1" /> 본문 복사
                  </Button>
                </div>
                <pre className="p-3 text-xs text-gray-800 whitespace-pre-wrap break-keep font-sans leading-relaxed max-h-[420px] overflow-y-auto">
                  {TEMPLATES[guideTab].body}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Filter className="h-4 w-4" /> 필터</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 flex-wrap">
            {['', 'received', 'reviewing', 'escalated', 'resolved', 'closed'].map((s) => (
              <button
                key={s || 'all'}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium border ${
                  filterStatus === s ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {s ? STATUS_LABELS[s] : '전체'}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">접수 목록 ({rows.length}건)</CardTitle>
          </CardHeader>
          <CardContent className="p-0 max-h-[600px] overflow-y-auto">
            {rows.length === 0 && <p className="text-center text-gray-400 py-8">접수된 제보 없음</p>}
            {rows.map((r) => (
              <button
                key={r.id}
                onClick={() => openDetail(r)}
                className={`block w-full text-left px-4 py-3 border-b hover:bg-gray-50 ${
                  selected?.id === r.id ? 'bg-brand-50' : ''
                }`}
              >
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge variant="info">{CATEGORY_LABELS[r.category]}</Badge>
                  <Badge variant={r.status === 'resolved' ? 'success' : r.status === 'closed' ? 'default' : 'warning'}>
                    {STATUS_LABELS[r.status]}
                  </Badge>
                  <span className="text-[11px] text-gray-400">{formatDate(r.created_at, 'yyyy.MM.dd HH:mm')}</span>
                </div>
                {r.subject && <div className="font-semibold text-sm text-gray-900">{r.subject}</div>}
                <p className="text-xs text-gray-600 line-clamp-2 break-keep mt-1">{r.body}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        {selected && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">상세 처리</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm whitespace-pre-wrap break-keep">{selected.body}</div>
              {selected.related_persons && (
                <div className="text-xs text-gray-600">관련자: {selected.related_persons}</div>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs font-medium text-gray-700">상태:</label>
                {Object.entries(STATUS_LABELS).map(([s, label]) => (
                  <button
                    key={s}
                    onClick={() => updateReport({ status: s })}
                    className={`px-2 py-0.5 rounded text-xs border ${
                      selected.status === s ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-700 border-gray-200'
                    }`}
                  >{label}</button>
                ))}
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">HR 내부 메모 (제보자에게 보이지 않음)</label>
                <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={3} />
                <Button size="sm" variant="outline" className="mt-1"
                  onClick={() => updateReport({ hr_internal_notes: internalNotes })}>
                  내부 메모 저장
                </Button>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                  <MessageSquare className="h-4 w-4" /> 대화 ({replies.length}건)
                </h3>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {replies.map((r) => (
                    <div key={r.id} className={`p-2 rounded text-xs ${
                      r.from_role === 'hr' ? 'bg-brand-50 ml-4' : 'bg-gray-100 mr-4'
                    }`}>
                      <div className="text-[10px] text-gray-500 mb-0.5">
                        {r.from_role === 'hr' ? 'HR' : '제보자'} · {formatDate(r.created_at, 'MM.dd HH:mm')}
                      </div>
                      <div className="whitespace-pre-wrap break-keep">{r.body}</div>
                    </div>
                  ))}
                </div>
                <Textarea
                  value={hrReply}
                  onChange={(e) => setHrReply(e.target.value)}
                  placeholder="HR 답변 (토큰 기반으로 제보자에게 전달됨)"
                  rows={3}
                />
                <Button size="sm" onClick={sendHrReply} disabled={posting || !hrReply.trim()}>
                  <Send className="h-3 w-3 mr-1" /> HR 답변 전송
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
