/**
 * Cloudflare Pages Function — AI API 프록시
 * 브라우저에서 직접 AI API를 호출하지 않고 서버 사이드에서 프록시
 * API 키는 X-AI-Key 헤더로 수신 (DB에서 가져온 값)
 */

interface Env {}

interface FileAttachment {
  mimeType: string  // e.g. 'application/pdf', 'image/jpeg'
  base64: string    // base64-encoded file data
  name?: string     // optional file name
}

interface AIRequestBody {
  provider: 'gemini' | 'openai' | 'claude'
  model: string
  action: 'generate' | 'chat' | 'transcribe'
  prompt?: string
  systemPrompt?: string
  messages?: { role: string; content: string }[]
  files?: FileAttachment[]  // 첨부 파일 (멀티모달)
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-AI-Key',
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export const onRequestPost: PagesFunction<Env> = async ({ request }) => {
  const apiKey = request.headers.get('X-AI-Key')
  if (!apiKey) {
    return jsonResponse({ error: 'API key required' }, 401)
  }

  try {
    const body: AIRequestBody = await request.json()
    const { provider, model, action } = body

    if (!provider || !model) {
      return jsonResponse({ error: 'provider and model required' }, 400)
    }

    // ─── Transcribe (Whisper) ───
    if (action === 'transcribe') {
      return jsonResponse({ error: 'Transcribe requires multipart — use direct upload' }, 400)
    }

    // ─── Generate / Chat ───
    let result: string

    if (provider === 'gemini') {
      result = await callGemini(apiKey, model, body)
    } else if (provider === 'claude') {
      result = await callClaude(apiKey, model, body)
    } else {
      result = await callOpenAI(apiKey, model, body)
    }

    return jsonResponse({ content: result, provider, model })
  } catch (err: any) {
    return jsonResponse({ error: err.message || 'AI proxy error' }, 500)
  }
}

// ─── Provider implementations ────────────────────────────────────

async function callGemini(apiKey: string, model: string, body: AIRequestBody): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  let requestBody: any
  if (body.action === 'chat' && body.messages) {
    const contents = body.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))
    requestBody = {
      ...(body.systemPrompt ? { system_instruction: { parts: [{ text: body.systemPrompt }] } } : {}),
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
    }
  } else {
    // 텍스트 + 파일 첨부 (멀티모달)
    // Gemini 지원 MIME: application/pdf, image/*, text/plain, audio/*, video/*
    const GEMINI_MIME_PREFIXES = ['application/pdf', 'image/', 'text/', 'audio/', 'video/']
    const parts: any[] = [{ text: body.prompt || '' }]
    if (body.files && body.files.length > 0) {
      for (const file of body.files) {
        const isSupported = GEMINI_MIME_PREFIXES.some((p) => file.mimeType.startsWith(p))
        if (isSupported) {
          parts.push({
            inline_data: {
              mime_type: file.mimeType,
              data: file.base64,
            },
          })
        }
        // 미지원 MIME(docx 등)은 건너뜀 — 텍스트 추출은 프론트에서 처리
      }
    }
    requestBody = {
      contents: [{ parts }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
    }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any)?.error?.message || `Gemini API error: ${res.status}`)
  }

  const data: any = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

async function callOpenAI(apiKey: string, model: string, body: AIRequestBody): Promise<string> {
  const systemMsg = body.systemPrompt || '당신은 인사평가 전문 분석가입니다. 한국어로 응답하며, 구조화된 마크다운 형식으로 분석 리포트를 작성합니다.'

  const messages = body.action === 'chat' && body.messages
    ? [{ role: 'system', content: systemMsg }, ...body.messages]
    : [{ role: 'system', content: systemMsg }, { role: 'user', content: body.prompt || '' }]

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 4096 }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any)?.error?.message || `OpenAI API error: ${res.status}`)
  }

  const data: any = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

async function callClaude(apiKey: string, model: string, body: AIRequestBody): Promise<string> {
  const systemMsg = body.systemPrompt || '당신은 인사평가 전문 분석가입니다. 한국어로 응답하며, 구조화된 마크다운 형식으로 분석 리포트를 작성합니다.'

  // 멀티모달 처리: prompt + files → Claude content blocks
  // 지원: image/* (image block), application/pdf (document block), text/* (text 로 인라인)
  let messages: any[]
  if (body.action === 'chat' && body.messages) {
    messages = body.messages.map((m) => ({ role: m.role, content: m.content }))
  } else {
    const content: any[] = []
    let promptText = body.prompt || ''

    if (body.files && body.files.length > 0) {
      for (const f of body.files) {
        if (f.mimeType.startsWith('image/')) {
          content.push({
            type: 'image',
            source: { type: 'base64', media_type: f.mimeType, data: f.base64 },
          })
        } else if (f.mimeType === 'application/pdf') {
          content.push({
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: f.base64 },
          })
        } else if (f.mimeType.startsWith('text/')) {
          // base64 디코드 후 prompt 에 인라인
          try {
            const decoded = atob(f.base64)
            const label = f.name ? `[${f.name}]` : '[첨부 텍스트]'
            promptText += `\n\n${label}\n${decoded}`
          } catch { /* 디코드 실패는 무시 */ }
        }
        // 기타 MIME 은 Claude 가 직접 처리 불가 — 프론트에서 텍스트 추출 후 text/plain 으로 전달해야 함
      }
    }

    content.push({ type: 'text', text: promptText })
    messages = [{ role: 'user', content }]
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: 4096, system: systemMsg, messages }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any)?.error?.message || `Claude API error: ${res.status}`)
  }

  const data: any = await res.json()
  // content blocks 중 첫 번째 text 블록 찾아 반환
  const blocks = data.content as Array<{ type: string; text?: string }> | undefined
  return blocks?.find((b) => b.type === 'text')?.text ?? blocks?.[0]?.text ?? ''
}
