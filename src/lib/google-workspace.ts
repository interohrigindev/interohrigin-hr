/**
 * Google Workspace API 프론트엔드 클라이언트
 * Cloudflare Functions 프록시를 통해 호출
 */

export type DocumentType = 'slides' | 'docs'

export interface DocumentResult {
  type: DocumentType
  id: string
  url: string
  title: string
}

export interface SlideData {
  title: string
  bullets?: string[]
  layout?: 'TITLE' | 'TITLE_AND_BODY' | 'SECTION_HEADER'
}

// ─── Google Slides ──────────────────────────────────────────────

export async function createPresentation(title: string, slides: SlideData[]): Promise<DocumentResult> {
  const res = await fetch('/api/google-slides', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', title, slides }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any
    throw new Error(err?.error || `Slides API error: ${res.status}`)
  }

  const data = await res.json() as any
  return {
    type: 'slides',
    id: data.presentationId,
    url: data.presentationUrl,
    title,
  }
}

// ─── Google Docs ────────────────────────────────────────────────

export async function createDocument(title: string, content: string): Promise<DocumentResult> {
  const res = await fetch('/api/google-docs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', title, content }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any
    throw new Error(err?.error || `Docs API error: ${res.status}`)
  }

  const data = await res.json() as any
  return {
    type: 'docs',
    id: data.documentId,
    url: data.documentUrl,
    title,
  }
}
