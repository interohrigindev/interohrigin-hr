import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Save, Pin, Star } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useBulletin, CATEGORY_MAP, type BulletinCategory } from '@/hooks/useBulletin'

const CATEGORY_OPTIONS = Object.entries(CATEGORY_MAP).map(([key, val]) => ({
  value: key,
  label: val.label,
}))

export default function BulletinWrite() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('edit')
  const { profile, hasRole } = useAuth()
  const { toast } = useToast()
  const { createPost, updatePost } = useBulletin()

  const isAdmin = hasRole('director')

  const [loading, setLoading] = useState(!!editId)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    category: 'general' as BulletinCategory,
    title: '',
    content: '',
    is_pinned: false,
    is_important: false,
  })

  // ─── Load existing post for edit ─────────────────────────────
  useEffect(() => {
    if (!editId) return

    async function loadPost() {
      const { data, error } = await supabase
        .from('bulletin_posts')
        .select('*')
        .eq('id', editId)
        .single()

      if (error || !data) {
        toast('게시글을 찾을 수 없습니다', 'error')
        navigate('/bulletin')
        return
      }

      // 본인 글 또는 관리자만 수정 가능
      if (data.author_id !== profile?.id && !isAdmin) {
        toast('수정 권한이 없습니다', 'error')
        navigate('/bulletin')
        return
      }

      setForm({
        category: data.category as BulletinCategory,
        title: data.title,
        content: data.content,
        is_pinned: data.is_pinned,
        is_important: data.is_important,
      })
      setLoading(false)
    }

    loadPost()
  }, [editId])

  // ─── Submit ──────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.title.trim()) {
      toast('제목을 입력해주세요', 'error')
      return
    }
    if (!form.content.trim()) {
      toast('내용을 입력해주세요', 'error')
      return
    }

    setSubmitting(true)
    try {
      if (editId) {
        await updatePost(editId, form)
        toast('게시글이 수정되었습니다')
        navigate(`/bulletin/${editId}`)
      } else {
        const result = await createPost(form)
        toast('게시글이 등록되었습니다')
        navigate(`/bulletin/${result?.id || ''}`)
      }
    } catch {
      toast(editId ? '수정 실패' : '등록 실패', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* 뒤로가기 */}
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4 mr-1" />
        돌아가기
      </Button>

      {/* 페이지 헤더 */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          {editId ? '게시글 수정' : '새 게시글 작성'}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {editId ? '게시글 내용을 수정합니다' : '새로운 게시글을 작성합니다'}
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-5">
          {/* 카테고리 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">카테고리</label>
            <Select
              value={form.category}
              onChange={(e) => setForm(prev => ({ ...prev, category: e.target.value as BulletinCategory }))}
              options={CATEGORY_OPTIONS}
            />
          </div>

          {/* 제목 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">제목</label>
            <Input
              value={form.title}
              onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
              placeholder="게시글 제목을 입력하세요"
              maxLength={200}
            />
          </div>

          {/* 내용 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">내용</label>
            <Textarea
              value={form.content}
              onChange={(e) => setForm(prev => ({ ...prev, content: e.target.value }))}
              placeholder="내용을 작성하세요..."
              rows={15}
              className="min-h-[300px]"
            />
          </div>

          {/* 관리자 옵션 */}
          {isAdmin && (
            <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_pinned}
                  onChange={(e) => setForm(prev => ({ ...prev, is_pinned: e.target.checked }))}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <Pin className="h-4 w-4 text-brand-600" />
                <span className="text-sm text-gray-700">상단 고정</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_important}
                  onChange={(e) => setForm(prev => ({ ...prev, is_important: e.target.checked }))}
                  className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                />
                <Star className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-gray-700">중요 표시</span>
              </label>
            </div>
          )}

          {/* 제출 */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => navigate(-1)}>
              취소
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              <Save className="h-4 w-4 mr-1.5" />
              {submitting ? '저장 중...' : (editId ? '수정' : '등록')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
