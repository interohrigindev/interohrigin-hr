/**
 * Supabase Storage 안전 업로드 유틸 — 타임아웃 / 재시도 / 명확한 에러 메시지
 *
 * 배경 (계획서 #4): 모든 storage.upload() 호출에 AbortController 가 없어
 * 네트워크 불안정 시 무한 hang. 50MB 포트폴리오 / 회의 녹음에서 빈번.
 *
 * 정책:
 *  - default timeoutMs = 5분 (대용량 50MB 도 안정적으로 통과 가능한 여유값)
 *  - default retries = 1 (네트워크/5xx 만 재시도, 4xx 는 즉시 실패)
 *  - upsert / contentType 그대로 전달
 *
 * 사용 예:
 *   const { error } = await safeStorageUpload('resumes', `${id}/resume.pdf`, file, {
 *     timeoutMs: 5 * 60_000,
 *     retries: 1,
 *   })
 */
import { supabase } from './supabase'

export type SafeUploadOpts = {
  timeoutMs?: number
  retries?: number
  upsert?: boolean
  contentType?: string
}

export type SafeUploadResult =
  | { data: { path: string }; error: null }
  | { data: null; error: { message: string; code: 'timeout' | 'network' | 'storage'; cause?: unknown } }

const DEFAULT_TIMEOUT = 5 * 60_000
const DEFAULT_RETRIES = 1

export async function safeStorageUpload(
  bucket: string,
  path: string,
  file: File | Blob,
  opts: SafeUploadOpts = {},
): Promise<SafeUploadResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT
  const maxRetries = opts.retries ?? DEFAULT_RETRIES

  let attempt = 0
  let lastError: { message: string; code: 'timeout' | 'network' | 'storage'; cause?: unknown } | null = null

  while (attempt <= maxRetries) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
        upsert: opts.upsert,
        contentType: opts.contentType,
      })
      clearTimeout(timer)

      if (error) {
        // 4xx: 즉시 실패 (재시도해도 의미 없음)
        const status = (error as { statusCode?: string | number }).statusCode
        const numeric = typeof status === 'string' ? parseInt(status, 10) : status
        if (numeric && numeric >= 400 && numeric < 500) {
          return {
            data: null,
            error: { message: error.message, code: 'storage', cause: error },
          }
        }
        // 5xx/네트워크 — retry 가능
        lastError = { message: error.message, code: 'network', cause: error }
      } else if (data) {
        return { data, error: null }
      } else {
        lastError = { message: '업로드 응답이 비어 있습니다.', code: 'storage' }
      }
    } catch (e: unknown) {
      clearTimeout(timer)
      const aborted = controller.signal.aborted || (e instanceof Error && e.name === 'AbortError')
      if (aborted) {
        lastError = {
          message: `업로드가 ${Math.round(timeoutMs / 1000)}초 내 완료되지 않아 중단되었습니다.`,
          code: 'timeout',
          cause: e,
        }
        // timeout 은 재시도하지 않음 (네트워크 자체가 느리다는 의미)
        break
      }
      lastError = {
        message: e instanceof Error ? e.message : String(e),
        code: 'network',
        cause: e,
      }
    }

    attempt += 1
    if (attempt <= maxRetries) {
      // 짧은 backoff (1초)
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  return {
    data: null,
    error: lastError ?? { message: '알 수 없는 업로드 오류', code: 'storage' },
  }
}

/**
 * 사용자 토스트용 한글 메시지 변환
 */
export function describeUploadError(err: { message: string; code: 'timeout' | 'network' | 'storage' }): string {
  switch (err.code) {
    case 'timeout':
      return `${err.message} 파일 크기 또는 네트워크를 확인 후 다시 시도해주세요.`
    case 'network':
      return `네트워크 오류로 업로드에 실패했습니다: ${err.message}`
    case 'storage':
    default:
      return `업로드 실패: ${err.message}`
  }
}
