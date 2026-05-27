/**
 * 지원자 파일 단일 진입점 — 업로드/다운로드 모두 이 모듈만 사용
 *
 * 핵심 원칙:
 *  1. 업로드는 항상 'resumes' 버킷 + 상대 path
 *  2. 다운로드는 어떤 형식이든 자동 분기 (resumes / recruitment-files / 외부 URL)
 *  3. 새 화면 추가 시 이 함수만 호출하면 됨
 *
 * Storage 경로 정책:
 *  - resume:        {candidate_id}/resume_{timestamp}.{ext}
 *  - cover_letter:  {candidate_id}/cover_letter_{timestamp}.{ext}
 *  - portfolio:     {candidate_id}/portfolio_{timestamp}_{n}.{ext}
 */
import { supabase } from './supabase'
import { safeStorageUpload, describeUploadError } from './storage-upload'

export type CandidateFileKind = 'resume' | 'cover_letter' | 'portfolio'

const PRIMARY_BUCKET = 'resumes'
const FALLBACK_BUCKETS = ['recruitment-files']  // 레거시 fallback (방어용)

/** 외부 사전질의서 PDF 업로드 제약 (Design §4 — 토큰 한계 + UX) */
export const EXTERNAL_SURVEY_PDF_MAX_BYTES = 20 * 1024 * 1024  // 20MB

/**
 * Supabase Storage 키 안전 변환 — 한글/특수문자 → ASCII safe
 *
 * 배경 (2026-05-27): 포트폴리오 첨부 시 "Invalid key" 에러. Supabase Storage 는
 * 객체 키에 ASCII safe set 만 허용하는데 기존 호출처가 한글을 포함한 정규식
 * `[^\w가-힣ㄱ-ㅎㅏ-ㅣ.\-]` 를 써서 한글 파일명이 그대로 키에 박혔음.
 *
 * 본 헬퍼는 *키* 만 ASCII 로 변환. 원본 파일명은 호출처가 DB filename 컬럼에
 * 별도 보존해서 화면 표시/다운로드명에 사용하므로 사용자 입장에서는 한글 그대로 보임.
 *
 * 변환 규칙:
 *   - 확장자는 lowercase 로 보존 (한글 확장자는 거의 없음, 안전 가정)
 *   - base 는 [A-Za-z0-9._-] 만 남기고 나머지(한글/공백/특수문자) 는 _ 로 치환
 *   - 연속 _ 압축, 양끝 _ 제거, 80자 길이 제한
 *   - 빈 base 방지 (한글 100% 파일명 케이스) → `file` fallback
 */
export function sanitizeStorageKey(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  const rawBase = lastDot > 0 ? filename.slice(0, lastDot) : filename
  const rawExt = lastDot > 0 ? filename.slice(lastDot + 1) : ''
  const ext = rawExt.replace(/[^A-Za-z0-9]/g, '').toLowerCase() || 'bin'
  const safeBase = rawBase
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[_.]+|[_.]+$/g, '')
    .slice(0, 80)
  const finalBase = safeBase || 'file'
  return `${finalBase}.${ext}`
}

/**
 * 업로드 — 신규 업로드는 모두 이 함수만 사용
 * @returns 저장된 상대 path (DB candidates.resume_url 등에 그대로 저장)
 */
export async function uploadCandidateFile(
  candidateId: string,
  kind: CandidateFileKind,
  file: File,
  options?: { index?: number },
): Promise<{ path: string; error?: string }> {
  const ext = file.name.split('.').pop() || 'bin'
  const ts = Date.now()
  const idx = options?.index ?? 0
  const fname = kind === 'portfolio' ? `portfolio_${ts}_${idx}.${ext}` : `${kind}_${ts}.${ext}`
  const path = `${candidateId}/${fname}`

  const { error } = await safeStorageUpload(PRIMARY_BUCKET, path, file, { upsert: false })
  if (error) return { path: '', error: describeUploadError(error) }
  return { path }
}

/**
 * 다운로드 URL 생성 — 어떤 형식이든 자동 해석
 *
 * 지원 형식:
 *  - 상대 path: '{id}/resume.pdf'      → resumes 버킷 시도, 실패 시 recruitment-files
 *  - public/sign URL: bucket 추출 후 재서명
 *  - 외부 URL (다른 ATS 등): 그대로 반환
 */
export async function getCandidateFileUrl(raw: string | null | undefined): Promise<string | null> {
  if (!raw) return null

  // 1) http(s) URL 인 경우 — Supabase storage URL 패턴 시도
  if (raw.startsWith('http')) {
    const m = raw.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/?]+)\/(.+?)(?:\?.*)?$/)
    if (m) {
      const bucket = m[1]
      const innerPath = m[2]
      const signed = await signInBucket(bucket, innerPath)
      if (signed) return signed
      // bucket 명시되었으나 서명 실패 시 fallback 다른 버킷도 시도
      for (const b of [PRIMARY_BUCKET, ...FALLBACK_BUCKETS]) {
        if (b === bucket) continue
        const s = await signInBucket(b, innerPath)
        if (s) return s
      }
      // 그래도 실패하면 원본 그대로 (public URL 이면 작동할 수 있음)
      return raw
    }
    // Supabase 외부 URL (다른 ATS 등) — 그대로 반환
    return raw
  }

  // 2) 상대 path — PRIMARY 시도 후 fallback
  for (const bucket of [PRIMARY_BUCKET, ...FALLBACK_BUCKETS]) {
    const url = await signInBucket(bucket, raw)
    if (url) return url
  }
  return null
}

async function signInBucket(bucket: string, path: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
    if (error || !data?.signedUrl) return null
    return data.signedUrl
  } catch {
    return null
  }
}

/**
 * 여러 파일을 한 번에 해석 (포트폴리오 등)
 */
export async function getCandidateFileUrls(
  rawList: (string | null | undefined)[],
): Promise<(string | null)[]> {
  return Promise.all(rawList.map((r) => getCandidateFileUrl(r)))
}

/**
 * 삭제 — 상대 path 만 지원 (외부 URL 은 삭제 불가)
 */
export async function deleteCandidateFile(path: string): Promise<{ ok: boolean; error?: string }> {
  if (!path || path.startsWith('http')) return { ok: false, error: '상대 path 만 삭제 가능' }
  // 양쪽 버킷에서 모두 삭제 시도 (어디에 있든 정리)
  for (const bucket of [PRIMARY_BUCKET, ...FALLBACK_BUCKETS]) {
    await supabase.storage.from(bucket).remove([path]).catch(() => {})
  }
  return { ok: true }
}

/**
 * 외부 사전질의서 PDF 업로드 (PDCA #2 external-pre-survey-import)
 *
 * Design Ref: §7 Storage Design — resumes 버킷 재사용, 신규 path 패턴.
 * Plan SC: SC-04 (출처/원본 PDF 추적 가능). CLAUDE.md 절대 규칙 (candidate-storage 진입점).
 *
 * Path 규칙:
 *   pre-survey-uploads/{candidate_id}/{timestamp}_{sanitized_filename}.pdf
 *
 * 가드:
 *   - mime: application/pdf 또는 .pdf 확장자
 *   - size: <= EXTERNAL_SURVEY_PDF_MAX_BYTES (20MB)
 *
 * @returns { path: 저장된 상대 path, error?: 한국어 에러 메시지 }
 *          path 는 entry.source_meta.original_pdf_path 에 저장. 다운로드는 getCandidateFileUrl 사용.
 */
export async function uploadExternalSurveyPdf(
  candidateId: string,
  file: File,
): Promise<{ path: string; error?: string }> {
  // 1) 입력 가드
  if (!candidateId) return { path: '', error: '지원자 ID 가 필요합니다.' }
  const isPdfMime = file.type === 'application/pdf'
  const isPdfExt = file.name.toLowerCase().endsWith('.pdf')
  if (!isPdfMime && !isPdfExt) {
    return { path: '', error: 'PDF 파일만 업로드 가능합니다.' }
  }
  if (file.size > EXTERNAL_SURVEY_PDF_MAX_BYTES) {
    const mb = Math.round(EXTERNAL_SURVEY_PDF_MAX_BYTES / 1024 / 1024)
    return { path: '', error: `PDF 크기는 ${mb}MB 이하여야 합니다.` }
  }
  if (file.size === 0) {
    return { path: '', error: '빈 파일은 업로드할 수 없습니다.' }
  }

  // 2) path 생성 — sanitizeStorageKey 로 ASCII safe 변환 후 timestamp prefix
  const sanitized = sanitizeStorageKey(file.name)
  const lastDot = sanitized.lastIndexOf('.')
  const baseAscii = lastDot > 0 ? sanitized.slice(0, lastDot) : sanitized
  const ts = Date.now()
  // 확장자는 .pdf 로 고정 (mime/확장자 검증 통과 후)
  const path = `pre-survey-uploads/${candidateId}/${ts}_${baseAscii}.pdf`

  // 3) 업로드 — 기존 safeStorageUpload 재사용 (RLS / 타임아웃 / 에러 표준화)
  const { error } = await safeStorageUpload(PRIMARY_BUCKET, path, file, { upsert: false })
  if (error) return { path: '', error: describeUploadError(error) }
  return { path }
}

/**
 * 외부 사전질의서 PDF 삭제 — manual_upload entry 제거 시 함께 호출.
 *
 * Design §10.6 — Storage 정합성: entry 삭제와 Storage 파일 정리를 호출자가 함께 수행.
 * 본 함수는 PRIMARY_BUCKET + FALLBACK_BUCKETS 모두 시도해 어디 있든 정리 (deleteCandidateFile 위임).
 *
 * @param path uploadExternalSurveyPdf 가 반환한 상대 path. 외부 URL 은 미지원.
 */
export async function deleteExternalSurveyPdf(path: string): Promise<{ ok: boolean; error?: string }> {
  if (!path) return { ok: false, error: 'path 가 비어 있습니다.' }
  // 기존 deleteCandidateFile 재사용 — 양쪽 버킷 best-effort 정리
  return deleteCandidateFile(path)
}

/**
 * URL/path 가 어느 버킷의 파일인지 진단 (디버그용)
 */
export function diagnoseFilePath(raw: string | null | undefined): {
  kind: 'null' | 'relative' | 'supabase_url' | 'external_url'
  bucket?: string
  innerPath?: string
} {
  if (!raw) return { kind: 'null' }
  if (raw.startsWith('http')) {
    const m = raw.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/?]+)\/(.+?)(?:\?.*)?$/)
    if (m) return { kind: 'supabase_url', bucket: m[1], innerPath: m[2] }
    return { kind: 'external_url' }
  }
  return { kind: 'relative', bucket: PRIMARY_BUCKET, innerPath: raw }
}
