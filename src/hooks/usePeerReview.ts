import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { PeerReview, PeerReviewAssignment } from '@/types/employee-lifecycle'

export function usePeerReview(periodId?: string) {
  const { profile } = useAuth()

  const [assignments, setAssignments] = useState<PeerReviewAssignment[]>([])
  const [myReviews, setMyReviews] = useState<PeerReview[]>([])
  const [reviewsForMe, setReviewsForMe] = useState<PeerReview[]>([])
  const [allReviews, setAllReviews] = useState<PeerReview[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)

    // Build queries with conditional period filter
    const buildAssignQuery = () => {
      let q = supabase.from('peer_review_assignments').select('*').eq('reviewer_id', profile.id)
      if (periodId) q = q.eq('period_id', periodId)
      return q
    }
    const buildMyRevQuery = () => {
      let q = supabase.from('peer_reviews').select('*').eq('reviewer_id', profile.id)
      if (periodId) q = q.eq('period_id', periodId)
      return q
    }
    const buildForMeQuery = () => {
      let q = supabase.from('peer_reviews').select('*').eq('reviewee_id', profile.id)
      if (periodId) q = q.eq('period_id', periodId)
      return q
    }
    // 관리자/리더만 전체 평가 열람 가능, 일반 직원은 빈 배열
    const isPrivileged = profile.role && ['ceo', 'admin', 'director', 'division_head', 'leader'].includes(profile.role)
    const buildAllQuery = () => {
      let q = supabase.from('peer_reviews').select('*')
      if (periodId) q = q.eq('period_id', periodId)
      return q
    }

    const [assignRes, myRevRes, forMeRes, allRes] = await Promise.all([
      buildAssignQuery(),
      buildMyRevQuery(),
      buildForMeQuery(),
      isPrivileged ? buildAllQuery() : Promise.resolve({ data: [] }),
    ])

    setAssignments((assignRes.data || []) as PeerReviewAssignment[])
    setMyReviews((myRevRes.data || []) as PeerReview[])
    setReviewsForMe((forMeRes.data || []) as PeerReview[])
    setAllReviews((allRes.data || []) as PeerReview[])

    setLoading(false)
  }, [profile?.id, periodId])

  useEffect(() => { fetchData() }, [fetchData])

  async function saveReview(data: {
    reviewee_id: string
    overall_score: number
    strengths: string
    improvements: string
  }): Promise<{ error: string | null }> {
    if (!profile?.id) return { error: '로그인이 필요합니다' }
    setSaving(true)

    const row = {
      period_id: periodId || null,
      reviewer_id: profile.id,
      reviewee_id: data.reviewee_id,
      overall_score: data.overall_score,
      strengths: data.strengths || null,
      improvements: data.improvements || null,
      is_anonymous: true,
      is_submitted: false,
    }

    const { error } = await supabase
      .from('peer_reviews')
      .upsert(row, { onConflict: 'period_id,reviewer_id,reviewee_id' })

    setSaving(false)
    if (error) return { error: error.message }
    await fetchData()
    return { error: null }
  }

  async function submitReview(data: {
    reviewee_id: string
    overall_score: number
    strengths: string
    improvements: string
  }): Promise<{ error: string | null }> {
    if (!profile?.id) return { error: '로그인이 필요합니다' }
    setSaving(true)

    const row = {
      period_id: periodId || null,
      reviewer_id: profile.id,
      reviewee_id: data.reviewee_id,
      overall_score: data.overall_score,
      strengths: data.strengths || null,
      improvements: data.improvements || null,
      is_anonymous: true,
      is_submitted: true,
    }

    const { error } = await supabase
      .from('peer_reviews')
      .upsert(row, { onConflict: 'period_id,reviewer_id,reviewee_id' })

    setSaving(false)
    if (error) return { error: error.message }
    await fetchData()
    return { error: null }
  }

  // Admin: assign peer reviewers
  async function assignReviewer(reviewerId: string, revieweeId: string): Promise<{ error: string | null }> {
    if (!periodId) return { error: '평가 기간을 선택하세요' }
    const { error } = await supabase
      .from('peer_review_assignments')
      .insert({ period_id: periodId, reviewer_id: reviewerId, reviewee_id: revieweeId })

    if (error) return { error: error.message }
    await fetchData()
    return { error: null }
  }

  // Get average score for a reviewee (anonymized - no individual breakdown)
  function getRevieweeAvgScore(revieweeId: string): number | null {
    const reviews = allReviews.filter((r) => r.reviewee_id === revieweeId && r.is_submitted && r.overall_score != null)
    if (reviews.length === 0) return null
    return reviews.reduce((sum, r) => sum + (r.overall_score || 0), 0) / reviews.length
  }

  return {
    assignments,
    myReviews,
    reviewsForMe,
    allReviews,
    loading,
    saving,
    saveReview,
    submitReview,
    assignReviewer,
    getRevieweeAvgScore,
    refresh: fetchData,
  }
}
