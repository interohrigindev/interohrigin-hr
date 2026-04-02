/**
 * Cloudflare Pages Function — 면접 녹음/녹화 텍스트 추출 + AI 분석
 * POST /api/transcribe
 *
 * 녹음/녹화 파일을 Gemini 멀티모달 API로 전송하여
 * 텍스트 추출(전사) + 면접 내용 분석을 수행
 *
 * Body: { recordingUrl, apiKey, model, candidateName, interviewType }
 */

interface Env {}

interface TranscribeRequestBody {
  recordingUrl: string       // Supabase Storage signed URL
  apiKey: string             // Gemini API key
  model?: string             // Gemini model (default: gemini-2.5-flash)
  candidateName: string
  interviewType: 'video' | 'face_to_face'
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunks: string[] = []
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length))
    chunks.push(String.fromCharCode(...chunk))
  }
  return btoa(chunks.join(''))
}

const ANALYSIS_PROMPT = `HR 면접 전문가로서 이 면접 녹음/녹화를 분석하세요.

다음 작업을 수행하세요:
1. 전체 대화를 한국어로 전사(transcription)하세요. 면접관과 지원자를 구분하세요.
2. 주요 질문과 지원자의 답변을 정리하세요.
3. 지원자의 역량을 다각도로 평가하세요.

반드시 다음 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "transcription": "전체 대화 전사 텍스트 (면접관: / 지원자: 형태로 구분)",
  "key_answers": [
    {"question": "면접관 질문", "answer": "지원자 답변 요약", "evaluation": "해당 답변 평가 (1~2줄)"}
  ],
  "communication_score": 0~100,
  "expertise_score": 0~100,
  "attitude_score": 0~100,
  "overall_score": 0~100,
  "strengths": ["강점 항목 (3~5개)"],
  "concerns": ["우려사항 (1~3개)"],
  "overall_impression": "전체 인상 요약 (2~3줄)"
}`

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export const onRequestPost: PagesFunction<Env> = async ({ request }) => {
  try {
    const body: TranscribeRequestBody = await request.json()
    const { recordingUrl, apiKey, candidateName, interviewType } = body
    const model = body.model || 'gemini-2.5-flash'

    if (!recordingUrl || !apiKey) {
      return jsonResponse({ error: 'recordingUrl, apiKey 필수' }, 400)
    }

    // 1. 녹음/녹화 파일 다운로드
    const fileRes = await fetch(recordingUrl)
    if (!fileRes.ok) {
      return jsonResponse({ error: `파일 다운로드 실패: ${fileRes.status}` }, 400)
    }

    const contentType = fileRes.headers.get('content-type') || 'audio/webm'
    const arrayBuffer = await fileRes.arrayBuffer()

    if (arrayBuffer.byteLength > MAX_FILE_SIZE) {
      return jsonResponse({
        error: `파일 크기가 ${Math.round(arrayBuffer.byteLength / 1024 / 1024)}MB입니다. 최대 20MB까지 지원합니다.`,
      }, 400)
    }

    // 2. Base64 인코딩
    const base64Data = arrayBufferToBase64(arrayBuffer)

    // 3. Gemini 멀티모달 API 호출
    const typeLabel = interviewType === 'video' ? '화상면접' : '대면면접'
    const contextPrompt = `지원자: ${candidateName}\n면접 유형: ${typeLabel}\n\n${ANALYSIS_PROMPT}`

    // MIME 타입 매핑 (Gemini 호환)
    let mimeType = contentType
    if (mimeType.includes('webm')) mimeType = 'audio/webm'
    else if (mimeType.includes('mp4') || mimeType.includes('m4a')) mimeType = 'audio/mp4'
    else if (mimeType.includes('mpeg') || mimeType.includes('mp3')) mimeType = 'audio/mpeg'
    else if (mimeType.includes('wav')) mimeType = 'audio/wav'
    else if (mimeType.includes('ogg')) mimeType = 'audio/ogg'

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType, data: base64Data } },
            { text: contextPrompt },
          ],
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 16384,
          responseMimeType: 'application/json',
        },
      }),
    })

    if (!geminiRes.ok) {
      const errData = await geminiRes.json().catch(() => ({})) as any
      return jsonResponse({
        error: `Gemini API 오류: ${errData?.error?.message || geminiRes.status}`,
      }, geminiRes.status)
    }

    let geminiData: any
    try {
      const geminiText = await geminiRes.text()
      geminiData = geminiText ? JSON.parse(geminiText) : {}
    } catch {
      return jsonResponse({ error: 'Gemini 응답 파싱 실패. 파일 형식이나 크기를 확인하세요.' }, 500)
    }

    // 차단된 응답 체크
    const finishReason = geminiData.candidates?.[0]?.finishReason
    if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
      return jsonResponse({ error: `Gemini 안전 필터에 의해 차단되었습니다 (${finishReason}). 다른 파일로 시도해주세요.` }, 400)
    }

    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    if (!rawText.trim()) {
      return jsonResponse({ error: 'Gemini가 빈 응답을 반환했습니다. 파일이 올바른 오디오/비디오 형식인지 확인하세요.' }, 500)
    }

    // 4. JSON 파싱 (responseMimeType=application/json이면 바로 파싱 가능)
    let parsed: unknown

    // 1차: 직접 파싱 시도 (responseMimeType=application/json 응답)
    try {
      parsed = JSON.parse(rawText)
    } catch {
      // 2차: 마크다운 코드블록 제거 후 재시도
      let cleaned = rawText
        .replace(/```(?:json)?\s*/gi, '')
        .replace(/```/g, '')
        .trim()

      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        return jsonResponse({ error: '분석 결과 파싱 실패', raw: rawText.slice(0, 500) }, 500)
      }

      let jsonStr = jsonMatch[0]
        .replace(/,\s*([\]}])/g, '$1')  // trailing comma 제거
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')  // 제어 문자 제거 (탭/줄바꿈 유지)

      try {
        parsed = JSON.parse(jsonStr)
      } catch {
        // 3차: JSON 문자열 값 내부의 이스케이프 안 된 줄바꿈 처리
        try {
          jsonStr = jsonStr.replace(/"((?:[^"\\]|\\.)*)"/g, (match) => {
            return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
          })
          parsed = JSON.parse(jsonStr)
        } catch (e3: unknown) {
          const msg = e3 instanceof Error ? e3.message : 'JSON parse failed'
          return jsonResponse({ error: `분석 결과 JSON 파싱 실패: ${msg}`, raw: rawText.slice(0, 500) }, 500)
        }
      }
    }

    return jsonResponse({ success: true, analysis: parsed })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return jsonResponse({ error: message }, 500)
  }
}
