import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

// ─── Types ───────────────────────────────────────────────────────

export type BulletinCategory = 'notice' | 'general' | 'qa' | 'suggestion'

export interface BulletinPost {
  id: string
  category: BulletinCategory
  title: string
  content: string
  author_id: string
  department: string | null
  is_pinned: boolean
  is_important: boolean
  view_count: number
  comment_count: number
  attachments: { name: string; url: string; size: number; type: string }[]
  created_at: string
  updated_at: string
  // joined
  author_name?: string
  author_position?: string
}

export interface BulletinComment {
  id: string
  post_id: string
  author_id: string
  content: string
  parent_comment_id: string | null
  created_at: string
  // joined
  author_name?: string
  author_position?: string
  replies?: BulletinComment[]
}

export const CATEGORY_MAP: Record<BulletinCategory, { label: string; color: string; bgColor: string }> = {
  notice: { label: '공지사항', color: 'text-red-600', bgColor: 'bg-red-50' },
  general: { label: '자유게시판', color: 'text-blue-600', bgColor: 'bg-blue-50' },
  qa: { label: 'Q&A', color: 'text-amber-600', bgColor: 'bg-amber-50' },
  suggestion: { label: '건의함', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
}

// ─── Hook ────────────────────────────────────────────────────────

export function useBulletin() {
  const { profile } = useAuth()
  const [posts, setPosts] = useState<BulletinPost[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState<BulletinCategory | 'all'>('all')
  const [search, setSearch] = useState('')

  // ─── Fetch posts ─────────────────────────────────────────────
  const fetchPosts = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('bulletin_posts')
        .select('*, author:employees!author_id(name, position)')
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })

      if (category !== 'all') {
        query = query.eq('category', category)
      }

      if (search.trim()) {
        query = query.or(`title.ilike.%${search.trim()}%,content.ilike.%${search.trim()}%`)
      }

      const { data, error } = await query

      if (error) throw error

      const mapped = (data || []).map((p: any) => ({
        ...p,
        author_name: p.author?.name || '알 수 없음',
        author_position: p.author?.position || '',
        attachments: p.attachments || [],
      }))

      setPosts(mapped)
    } catch (err) {
      console.error('게시글 조회 실패:', err)
    } finally {
      setLoading(false)
    }
  }, [category, search])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  // ─── Create post ─────────────────────────────────────────────
  const createPost = async (data: {
    category: BulletinCategory
    title: string
    content: string
    is_pinned?: boolean
    is_important?: boolean
    attachments?: any[]
  }) => {
    if (!profile) return null

    const { data: result, error } = await supabase
      .from('bulletin_posts')
      .insert({
        ...data,
        author_id: profile.id,
        department: (profile as any).department || null,
      })
      .select()
      .single()

    if (error) throw error
    return result
  }

  // ─── Update post ─────────────────────────────────────────────
  const updatePost = async (id: string, data: Partial<{
    category: BulletinCategory
    title: string
    content: string
    is_pinned: boolean
    is_important: boolean
    attachments: any[]
  }>) => {
    const { error } = await supabase
      .from('bulletin_posts')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  }

  // ─── Delete post ─────────────────────────────────────────────
  const deletePost = async (id: string) => {
    const { error } = await supabase
      .from('bulletin_posts')
      .delete()
      .eq('id', id)

    if (error) throw error
  }

  // ─── Increment view ──────────────────────────────────────────
  const incrementView = async (id: string) => {
    try {
      // Direct update as fallback (no RPC needed)
      const current = posts.find(p => p.id === id)?.view_count ?? 0
      await supabase
        .from('bulletin_posts')
        .update({ view_count: current + 1 })
        .eq('id', id)
    } catch {
      // Silently fail view count increment
    }
  }

  // ─── Fetch comments ──────────────────────────────────────────
  const fetchComments = async (postId: string): Promise<BulletinComment[]> => {
    const { data, error } = await supabase
      .from('bulletin_comments')
      .select('*, author:employees!author_id(name, position)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })

    if (error) throw error

    const all = (data || []).map((c: any) => ({
      ...c,
      author_name: c.author?.name || '알 수 없음',
      author_position: c.author?.position || '',
    }))

    // Build tree: top-level comments with nested replies
    const topLevel = all.filter((c: BulletinComment) => !c.parent_comment_id)
    topLevel.forEach((parent: BulletinComment) => {
      parent.replies = all.filter((c: BulletinComment) => c.parent_comment_id === parent.id)
    })

    return topLevel
  }

  // ─── Add comment ─────────────────────────────────────────────
  const addComment = async (postId: string, content: string, parentId?: string) => {
    if (!profile) return null

    const { data, error } = await supabase
      .from('bulletin_comments')
      .insert({
        post_id: postId,
        author_id: profile.id,
        content,
        parent_comment_id: parentId || null,
      })
      .select()
      .single()

    if (error) throw error

    // Update comment count cache
    await supabase
      .from('bulletin_posts')
      .update({ comment_count: (posts.find(p => p.id === postId)?.comment_count ?? 0) + 1 } as any)
      .eq('id', postId)

    return data
  }

  // ─── Delete comment ──────────────────────────────────────────
  const deleteComment = async (commentId: string, postId: string) => {
    const { error } = await supabase
      .from('bulletin_comments')
      .delete()
      .eq('id', commentId)

    if (error) throw error

    // Update comment count cache
    const post = posts.find(p => p.id === postId)
    if (post && post.comment_count > 0) {
      await supabase
        .from('bulletin_posts')
        .update({ comment_count: post.comment_count - 1 } as any)
        .eq('id', postId)
    }
  }

  return {
    posts,
    loading,
    category,
    setCategory,
    search,
    setSearch,
    fetchPosts,
    createPost,
    updatePost,
    deletePost,
    incrementView,
    fetchComments,
    addComment,
    deleteComment,
  }
}
