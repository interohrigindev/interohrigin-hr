/**
 * 채용 대시보드 지원자 검색 바
 *  - 이름/이메일/전화/공고명/상태 매칭
 *  - 디바운스 200ms
 *  - 클릭 시 지원자 상세로 이동
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, User, Mail, Phone, Briefcase } from 'lucide-react'
import type { Candidate, JobPosting } from '@/types/recruitment'
import { CANDIDATE_STATUS_LABELS } from '@/lib/recruitment-constants'

interface Props {
  candidates: Candidate[]
  postings: JobPosting[]
  onSelect: (candidateId: string) => void
}

export function CandidateSearchBar({ candidates, postings, onSelect }: Props) {
  const [raw, setRaw] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // 디바운스 200ms
  useEffect(() => {
    const t = setTimeout(() => setQ(raw.trim().toLowerCase()), 200)
    return () => clearTimeout(t)
  }, [raw])

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const postingMap = useMemo(() => {
    const m = new Map<string, string>()
    postings.forEach((p) => m.set(p.id, p.title))
    return m
  }, [postings])

  const results = useMemo(() => {
    if (!q) return []
    return candidates
      .filter((c) => {
        const name = c.name.toLowerCase()
        const email = (c.email || '').toLowerCase()
        const phone = (c.phone || '').toLowerCase()
        const jobTitle = (c.job_posting_id ? postingMap.get(c.job_posting_id) || '' : '').toLowerCase()
        const status = (CANDIDATE_STATUS_LABELS[c.status] || c.status || '').toLowerCase()
        return (
          name.includes(q)
          || email.includes(q)
          || phone.includes(q)
          || jobTitle.includes(q)
          || status.includes(q)
        )
      })
      .slice(0, 20)
  }, [candidates, postingMap, q])

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={raw}
          onChange={(e) => { setRaw(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="지원자 이름·이메일·전화·공고명·상태로 검색..."
          className="w-full pl-9 pr-9 py-2.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
        {raw && (
          <button
            onClick={() => { setRaw(''); setQ(''); setOpen(false) }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            title="지우기"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && q && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-20 max-h-[60vh] overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              '<span className="text-gray-600 font-medium">{raw}</span>' 에 해당하는 지원자가 없습니다
            </div>
          ) : (
            <>
              <div className="px-3 py-1.5 text-[11px] text-gray-500 bg-gray-50 border-b border-gray-100">
                {results.length}건 (최대 20건 표시)
              </div>
              {results.map((c) => {
                const jobTitle = c.job_posting_id ? postingMap.get(c.job_posting_id) || '' : ''
                const statusLabel = CANDIDATE_STATUS_LABELS[c.status] || c.status
                return (
                  <button
                    key={c.id}
                    onClick={() => { onSelect(c.id); setOpen(false); setRaw(''); setQ('') }}
                    className="block w-full text-left px-3 py-2 border-b border-gray-50 hover:bg-brand-50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-7 w-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold shrink-0">
                          {c.name.slice(0, 1)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900">{c.name}</span>
                            {statusLabel && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                                {statusLabel}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-gray-500 mt-0.5 flex-wrap">
                            {c.email && <span className="flex items-center gap-0.5"><Mail className="h-2.5 w-2.5" />{c.email}</span>}
                            {c.phone && <span className="flex items-center gap-0.5"><Phone className="h-2.5 w-2.5" />{c.phone}</span>}
                            {jobTitle && <span className="flex items-center gap-0.5"><Briefcase className="h-2.5 w-2.5" />{jobTitle}</span>}
                          </div>
                        </div>
                      </div>
                      <User className="h-4 w-4 text-gray-300 shrink-0" />
                    </div>
                  </button>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}
