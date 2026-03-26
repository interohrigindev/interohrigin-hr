import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Edit2, Trash2, Pin, Star,
  Eye, Clock, MessageSquare, CornerDownRight,
  Send, Download, FileText,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Textarea } from '@/components/ui/Textarea'
import { PageSpinner } from '@/components/ui/Spinner'
import { Dialog } from '@/components/ui/Dialog'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import {
  useBulletin,
  CATEGORY_MAP,
  type BulletinPost,
  type BulletinComment,
  type BulletinCategory,
} from '@/hooks/useBulletin'

export default function BulletinDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, hasRole } = useAuth()
  const { toast } = useToast()
  const { deletePost, incrementView, fetchComments, addComment, deleteComment, updatePost } = useBulletin()

  const [post, setPost] = useState<BulletinPost | null>(null)
  const [comments, setComments] = useState<BulletinComment[]>([])
  const [loading, setLoading] = useState(true)
  const [commentText, setCommentText] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState(false)

  const isAuthor = post?.author_id === profile?.id
  const isAdmin = hasRole('director')
  const canEdit = isAuthor || isAdmin

  // ─── Fetch post ──────────────────────────────────────────────
  const fetchPost = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('bulletin_posts')
        .select('*, author:employees!author_id(name, position)')
        .eq('id', id)
        .single()

      if (error) throw error

      setPost({
        ...data,
        author_name: (data as any).author?.name || '알 수 없음',
        author_position: (data as any).author?.position || '',
        attachments: data.attachments || [],
      } as BulletinPost)

      // Increment view
      incrementView(id)

      // Fetch comments
      const cmts = await fetchComments(id)
      setComments(cmts)
    } catch {
      toast('게시글을 찾을 수 없습니다', 'error')
      navigate('/bulletin')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchPost()
  }, [fetchPost])

  // ─── Submit comment ──────────────────────────────────────────
  const handleSubmitComment = async () => {
    if (!commentText.trim() || !id) return
    setSubmitting(true)
    try {
      await addComment(id, commentText.trim())
      setCommentText('')
      const cmts = await fetchComments(id)
      setComments(cmts)
      toast('댓글이 등록되었습니다')
    } catch {
      toast('댓글 등록 실패', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Submit reply ────────────────────────────────────────────
  const handleSubmitReply = async (parentId: string) => {
    if (!replyText.trim() || !id) return
    setSubmitting(true)
    try {
      await addComment(id, replyText.trim(), parentId)
      setReplyText('')
      setReplyTo(null)
      const cmts = await fetchComments(id)
      setComments(cmts)
      toast('답글이 등록되었습니다')
    } catch {
      toast('답글 등록 실패', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Delete post ─────────────────────────────────────────────
  const handleDeletePost = async () => {
    if (!id) return
    try {
      await deletePost(id)
      toast('게시글이 삭제되었습니다')
      navigate('/bulletin')
    } catch {
      toast('삭제 실패', 'error')
    }
  }

  // ─── Toggle pin ──────────────────────────────────────────────
  const handleTogglePin = async () => {
    if (!post || !id) return
    try {
      await updatePost(id, { is_pinned: !post.is_pinned })
      setPost(prev => prev ? { ...prev, is_pinned: !prev.is_pinned } : null)
      toast(post.is_pinned ? '고정 해제됨' : '상단 고정됨')
    } catch {
      toast('변경 실패', 'error')
    }
  }

  // ─── Delete comment ──────────────────────────────────────────
  const handleDeleteComment = async (commentId: string) => {
    if (!id) return
    try {
      await deleteComment(commentId, id)
      const cmts = await fetchComments(id)
      setComments(cmts)
      toast('댓글이 삭제되었습니다')
    } catch {
      toast('삭제 실패', 'error')
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).replace(/\. /g, '.').replace('.', '')
  }

  if (loading) return <PageSpinner />
  if (!post) return null

  const catInfo = CATEGORY_MAP[post.category as BulletinCategory]

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* 뒤로가기 */}
      <Button variant="ghost" size="sm" onClick={() => navigate('/bulletin')}>
        <ArrowLeft className="h-4 w-4 mr-1" />
        목록으로
      </Button>

      {/* 게시글 */}
      <Card>
        <CardContent className="p-6">
          {/* 헤더 */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn(
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                catInfo?.bgColor, catInfo?.color,
              )}>
                {catInfo?.label}
              </span>
              {post.is_pinned && (
                <Badge variant="primary" className="gap-1">
                  <Pin className="h-3 w-3" />고정
                </Badge>
              )}
              {post.is_important && (
                <Badge variant="warning" className="gap-1">
                  <Star className="h-3 w-3" />중요
                </Badge>
              )}
            </div>

            <h1 className="text-xl font-bold text-gray-900">{post.title}</h1>

            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <span className="font-medium text-gray-700">{post.author_name}</span>
                {post.author_position && <span>{post.author_position}</span>}
                {post.department && <span>· {post.department}</span>}
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatDate(post.created_at)}</span>
                <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{post.view_count}</span>
              </div>
            </div>
          </div>

          {/* 구분선 */}
          <div className="my-5 border-t border-gray-200" />

          {/* 본문 */}
          <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap leading-relaxed">
            {post.content}
          </div>

          {/* 첨부파일 */}
          {post.attachments.length > 0 && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <p className="text-xs font-medium text-gray-500 mb-2">첨부파일 ({post.attachments.length})</p>
              <div className="space-y-1.5">
                {post.attachments.map((file, i) => (
                  <a
                    key={i}
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-brand-600 hover:text-brand-800 hover:underline"
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="truncate">{file.name}</span>
                    <Download className="h-3.5 w-3.5 shrink-0 ml-auto" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* 액션 버튼 */}
          {canEdit && (
            <div className="mt-6 flex items-center gap-2 border-t border-gray-200 pt-4">
              <Button variant="outline" size="sm" onClick={() => navigate(`/bulletin/write?edit=${post.id}`)}>
                <Edit2 className="h-3.5 w-3.5 mr-1" />수정
              </Button>
              {isAdmin && (
                <Button variant="outline" size="sm" onClick={handleTogglePin}>
                  <Pin className="h-3.5 w-3.5 mr-1" />{post.is_pinned ? '고정 해제' : '상단 고정'}
                </Button>
              )}
              <Button variant="outline" size="sm" className="text-red-500 hover:text-red-700" onClick={() => setDeleteDialog(true)}>
                <Trash2 className="h-3.5 w-3.5 mr-1" />삭제
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 댓글 영역 */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4" />
            댓글 {comments.reduce((sum, c) => sum + 1 + (c.replies?.length || 0), 0)}개
          </h3>

          {/* 댓글 목록 */}
          <div className="space-y-4">
            {comments.map((comment) => (
              <div key={comment.id}>
                {/* 부모 댓글 */}
                <CommentItem
                  comment={comment}
                  profileId={profile?.id}
                  isAdmin={isAdmin}
                  onReply={() => { setReplyTo(comment.id); setReplyText('') }}
                  onDelete={() => handleDeleteComment(comment.id)}
                  formatDate={formatDate}
                />

                {/* 대댓글 */}
                {comment.replies && comment.replies.length > 0 && (
                  <div className="ml-8 mt-2 space-y-2">
                    {comment.replies.map((reply) => (
                      <CommentItem
                        key={reply.id}
                        comment={reply}
                        profileId={profile?.id}
                        isAdmin={isAdmin}
                        isReply
                        onDelete={() => handleDeleteComment(reply.id)}
                        formatDate={formatDate}
                      />
                    ))}
                  </div>
                )}

                {/* 답글 입력 */}
                {replyTo === comment.id && (
                  <div className="ml-8 mt-2 flex gap-2">
                    <CornerDownRight className="h-4 w-4 text-gray-300 shrink-0 mt-2.5" />
                    <div className="flex-1 flex gap-2">
                      <Textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="답글을 작성하세요..."
                        className="min-h-[60px] text-sm"
                        rows={2}
                      />
                      <div className="flex flex-col gap-1">
                        <Button
                          size="sm"
                          onClick={() => handleSubmitReply(comment.id)}
                          disabled={!replyText.trim() || submitting}
                        >
                          <Send className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setReplyTo(null)}
                          className="text-xs"
                        >
                          취소
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {comments.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">
                아직 댓글이 없습니다. 첫 댓글을 남겨주세요!
              </p>
            )}
          </div>

          {/* 댓글 입력 */}
          <div className="mt-6 border-t border-gray-200 pt-4">
            <div className="flex gap-2">
              <Textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="댓글을 작성하세요..."
                className="min-h-[80px] text-sm"
                rows={3}
              />
              <Button
                onClick={handleSubmitComment}
                disabled={!commentText.trim() || submitting}
                className="shrink-0 self-end"
              >
                <Send className="h-4 w-4 mr-1" />
                등록
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 삭제 확인 */}
      <Dialog open={deleteDialog} onClose={() => setDeleteDialog(false)} title="게시글 삭제">
        <p className="text-sm text-gray-600">이 게시글을 정말 삭제하시겠습니까? 댓글도 함께 삭제됩니다.</p>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setDeleteDialog(false)}>취소</Button>
          <Button variant="danger" onClick={handleDeletePost}>삭제</Button>
        </div>
      </Dialog>
    </div>
  )
}

// ─── Comment Item Component ────────────────────────────────────

function CommentItem({
  comment,
  profileId,
  isAdmin,
  isReply,
  onReply,
  onDelete,
  formatDate,
}: {
  comment: BulletinComment
  profileId?: string
  isAdmin: boolean
  isReply?: boolean
  onReply?: () => void
  onDelete: () => void
  formatDate: (d: string) => string
}) {
  const canDelete = comment.author_id === profileId || isAdmin

  return (
    <div className={cn(
      'p-3 rounded-lg',
      isReply ? 'bg-gray-50' : 'bg-white border border-gray-100',
    )}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-gray-800">{comment.author_name}</span>
          {comment.author_position && (
            <span className="text-xs text-gray-400">{comment.author_position}</span>
          )}
        </div>
        <span className="text-xs text-gray-400">{formatDate(comment.created_at)}</span>
      </div>
      <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.content}</p>
      <div className="flex items-center gap-2 mt-2">
        {onReply && (
          <button onClick={onReply} className="text-xs text-gray-400 hover:text-brand-600 transition-colors">
            답글
          </button>
        )}
        {canDelete && (
          <button onClick={onDelete} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
            삭제
          </button>
        )}
      </div>
    </div>
  )
}
