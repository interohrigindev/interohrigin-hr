/**
 * 직원 — 연차 포기 각서 전자서명 (/my/leave-waiver/:id)
 *
 * 흐름:
 *  1. 관리자가 발급한 leave_waivers row(:id) 조회
 *  2. 본문(waiver_text) 표시 + 서명 캔버스
 *  3. 서명 완료 시 PNG 업로드 → leave_waivers UPDATE (signature_image_path, signed_at, status='signed')
 *  4. 토스트 + /my/leave-promotion 으로 리다이렉트
 */
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import DOMPurify from 'dompurify'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { safeStorageUpload, describeUploadError } from '@/lib/storage-upload'
import { SignatureCanvas } from '@/components/ui/SignatureCanvas'
import { formatDate } from '@/lib/utils'
import { ArrowLeft, FileSignature, ShieldAlert } from 'lucide-react'

interface WaiverRow {
  id: string
  employee_id: string
  promotion_id: string | null
  waiver_year: number
  waiver_days: number
  waiver_text: string
  signature_image_path: string | null
  signed_at: string | null
  status: 'pending_signature' | 'signed' | 'revoked'
  payout_status: 'pending' | 'waived' | 'partial' | 'revoked'
  created_at: string
}

export default function MyLeaveWaiverPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { toast } = useToast()
  const [waiver, setWaiver] = useState<WaiverRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('leave_waivers')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (cancelled) return
      if (error) {
        setError(error.message)
      } else if (!data) {
        setError('해당 각서를 찾을 수 없습니다.')
      } else {
        setWaiver(data as WaiverRow)
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [id])

  async function handleSign(blob: Blob): Promise<boolean> {
    if (!waiver || !profile?.id) return false
    if (waiver.employee_id !== profile.id) {
      toast('본인의 각서만 서명할 수 있습니다.', 'error')
      return false
    }
    if (waiver.status !== 'pending_signature') {
      toast('이미 서명되었거나 취소된 각서입니다.', 'error')
      return false
    }

    // 1) PNG → Storage 업로드
    const path = `${profile.id}/${waiver.id}.png`
    const { error: uploadErr } = await safeStorageUpload('leave-waivers', path, blob, {
      contentType: 'image/png',
      upsert: false,
      timeoutMs: 60_000, // 작은 PNG — 60초 충분
    })
    if (uploadErr) {
      toast(describeUploadError(uploadErr), 'error')
      return false
    }

    // 2) leave_waivers UPDATE
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : null
    const { error: updErr } = await supabase
      .from('leave_waivers')
      .update({
        signature_image_path: path,
        signed_at: new Date().toISOString(),
        signed_user_agent: ua,
        status: 'signed',
      })
      .eq('id', waiver.id)

    if (updErr) {
      toast('서명 저장 실패: ' + updErr.message, 'error')
      return false
    }

    toast('연차 포기 각서 서명이 완료되었습니다.', 'success')
    setTimeout(() => navigate('/my/leave-promotion'), 800)
    return true
  }

  if (loading) return <PageSpinner />

  if (error || !waiver) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/my/leave-promotion')}>
          <ArrowLeft className="h-4 w-4" /> 돌아가기
        </Button>
        <Card>
          <CardContent className="p-6 text-center text-gray-500">
            <ShieldAlert className="h-8 w-8 text-amber-500 mx-auto mb-2" />
            {error || '각서를 불러올 수 없습니다.'}
          </CardContent>
        </Card>
      </div>
    )
  }

  // 본인 각서가 아니면 안내만 표시
  if (waiver.employee_id !== profile?.id) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/my/leave-promotion')}>
          <ArrowLeft className="h-4 w-4" /> 돌아가기
        </Button>
        <Card>
          <CardContent className="p-6 text-center text-gray-500">
            <ShieldAlert className="h-8 w-8 text-amber-500 mx-auto mb-2" />
            본인의 각서만 열람·서명할 수 있습니다.
          </CardContent>
        </Card>
      </div>
    )
  }

  const isSigned = waiver.status === 'signed'
  const isRevoked = waiver.status === 'revoked'

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate('/my/leave-promotion')}>
        <ArrowLeft className="h-4 w-4" /> 돌아가기
      </Button>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-brand-500" />
            연차 포기 각서 ({waiver.waiver_year}년)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>발급일: {formatDate(waiver.created_at, 'yyyy.MM.dd')}</span>
            <span className="mx-1">·</span>
            <span>포기 일수: <strong className="text-gray-900">{waiver.waiver_days}일</strong></span>
            {isSigned && <Badge variant="success" className="ml-auto">서명 완료</Badge>}
            {isRevoked && <Badge variant="warning" className="ml-auto">취소됨</Badge>}
            {!isSigned && !isRevoked && <Badge variant="warning" className="ml-auto">서명 대기</Badge>}
          </div>

          <div
            className="prose prose-sm max-w-none border rounded-md p-4 bg-gray-50 text-gray-800 leading-relaxed"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(waiver.waiver_text, {
                ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'h3', 'h4', 'blockquote'],
                ALLOWED_ATTR: [],
              }),
            }}
          />

          {!isSigned && !isRevoked && (
            <div className="border-t pt-4 space-y-2">
              <h3 className="text-sm font-semibold text-gray-900">서명</h3>
              <p className="text-xs text-gray-600">
                위 각서 내용에 동의하시면 아래에 서명해주세요.
                서명 후에는 수정·취소할 수 없으며, 법적 증빙으로 보관됩니다.
              </p>
              <SignatureCanvas onConfirm={handleSign} confirmLabel="동의하고 서명 완료" />
            </div>
          )}

          {isSigned && waiver.signed_at && (
            <div className="border-t pt-4 text-sm text-gray-600">
              <p>서명 완료일: <strong>{formatDate(waiver.signed_at, 'yyyy.MM.dd HH:mm')}</strong></p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
