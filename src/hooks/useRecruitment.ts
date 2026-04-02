import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { JobPosting, Candidate } from '@/types/recruitment'

// ─── 부서 목록 ──────────────────────────────────────────────────
export function useDepartments() {
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('departments').select('id, name').order('name')
      .then(({ data }) => { setDepartments(data || []); setLoading(false) })
  }, [])

  return { departments, loading }
}

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
    // 지원자 하위 테이블 먼저 정리 (CASCADE 누락 대비 안전장치)
    const { data: candidates } = await supabase
      .from('candidates')
      .select('id')
      .eq('job_posting_id', id)

    if (candidates && candidates.length > 0) {
      const candIds = candidates.map(c => c.id)
      // 하위 테이블 순서대로 삭제
      await supabase.from('ai_accuracy_log').delete().in('candidate_id', candIds)
      await supabase.from('hiring_decisions').delete().in('candidate_id', candIds)
      await supabase.from('recruitment_reports').delete().in('candidate_id', candIds)
      await supabase.from('face_to_face_evals').delete().in('candidate_id', candIds)
      await supabase.from('voice_analysis').delete().in('candidate_id', candIds)
      await supabase.from('transcriptions').delete().in('candidate_id', candIds)
      await supabase.from('interview_recordings').delete().in('candidate_id', candIds)
      await supabase.from('interview_schedules').delete().in('candidate_id', candIds)
      await supabase.from('resume_analysis').delete().in('candidate_id', candIds)
      await supabase.from('candidates').delete().eq('job_posting_id', id)
    }

    const { data, error } = await supabase
      .from('job_postings')
      .delete()
      .eq('id', id)
      .select()

    if (error) return { error }
    if (!data || data.length === 0) {
      return { error: { message: '삭제 권한이 없거나 이미 삭제된 공고입니다.' } as any }
    }
    return { error: null }
  }

  return { createPosting, updatePosting, deletePosting }
}
