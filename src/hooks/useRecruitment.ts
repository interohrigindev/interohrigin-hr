import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { JobPosting, Candidate } from '@/types/recruitment'

// ─── 채용공고 목록 ──────────────────────────────────────────────
export function useJobPostings() {
  const [postings, setPostings] = useState<JobPosting[]>([])
  const [loading, setLoading] = useState(true)

  const fetchPostings = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('job_postings')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data) setPostings(data as JobPosting[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchPostings() }, [fetchPostings])

  return { postings, loading, refetch: fetchPostings }
}

// ─── 채용공고 상세 ──────────────────────────────────────────────
export function useJobPosting(id: string | undefined) {
  const [posting, setPosting] = useState<JobPosting | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    async function fetch() {
      setLoading(true)
      const { data, error } = await supabase
        .from('job_postings')
        .select('*')
        .eq('id', id)
        .single()
      if (!error && data) setPosting(data as JobPosting)
      setLoading(false)
    }
    fetch()
  }, [id])

  return { posting, loading }
}

// ─── 지원자 목록 (공고별) ───────────────────────────────────────
export function useCandidates(jobPostingId?: string) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)

  const fetchCandidates = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('candidates')
      .select('*')
      .order('created_at', { ascending: false })

    if (jobPostingId) {
      query = query.eq('job_posting_id', jobPostingId)
    }

    const { data, error } = await query
    if (!error && data) setCandidates(data as Candidate[])
    setLoading(false)
  }, [jobPostingId])

  useEffect(() => { fetchCandidates() }, [fetchCandidates])

  return { candidates, loading, refetch: fetchCandidates }
}

// ─── 채용 대시보드 통계 ─────────────────────────────────────────
export interface RecruitmentStats {
  openPostings: number
  totalCandidates: number
  analyzedCandidates: number
  hiredCandidates: number
  sourceBreakdown: Record<string, number>
}

export function useRecruitmentStats() {
  const [stats, setStats] = useState<RecruitmentStats>({
    openPostings: 0,
    totalCandidates: 0,
    analyzedCandidates: 0,
    hiredCandidates: 0,
    sourceBreakdown: {},
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      setLoading(true)

      const [postingsRes, candidatesRes] = await Promise.all([
        supabase.from('job_postings').select('id, status'),
        supabase.from('candidates').select('id, status, source_channel'),
      ])

      const postings = postingsRes.data || []
      const candidates = candidatesRes.data || []

      const sourceBreakdown: Record<string, number> = {}
      candidates.forEach((c: { source_channel: string }) => {
        sourceBreakdown[c.source_channel] = (sourceBreakdown[c.source_channel] || 0) + 1
      })

      setStats({
        openPostings: postings.filter((p: { status: string }) => p.status === 'open').length,
        totalCandidates: candidates.length,
        analyzedCandidates: candidates.filter((c: { status: string }) => ['analyzed', 'decided', 'hired', 'rejected'].includes(c.status)).length,
        hiredCandidates: candidates.filter((c: { status: string }) => c.status === 'hired').length,
        sourceBreakdown,
      })
      setLoading(false)
    }
    fetch()
  }, [])

  return { stats, loading }
}

// ─── 공고 CRUD ──────────────────────────────────────────────────
export function useJobPostingMutations() {
  async function createPosting(data: Partial<JobPosting>) {
    const { data: result, error } = await supabase
      .from('job_postings')
      .insert(data)
      .select()
      .single()
    return { data: result, error }
  }

  async function updatePosting(id: string, data: Partial<JobPosting>) {
    const { data: result, error } = await supabase
      .from('job_postings')
      .update(data)
      .eq('id', id)
      .select()
      .single()
    return { data: result, error }
  }

  async function deletePosting(id: string) {
    const { error } = await supabase
      .from('job_postings')
      .delete()
      .eq('id', id)
    return { error }
  }

  return { createPosting, updatePosting, deletePosting }
}
