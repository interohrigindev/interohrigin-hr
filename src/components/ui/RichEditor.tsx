import { useRef, useCallback } from 'react'
import {
  Bold, Italic, Underline, List, ListOrdered,
  Link2, Image, Paperclip, AtSign, Heading2,
  Quote, Code, Minus,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface RichEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: string
  onFileUpload?: (files: { url: string; name: string; size: number; type: string }[]) => void
}

export function RichEditor({ value, onChange, placeholder = '내용을 입력하세요...', minHeight = '120px', onFileUpload }: RichEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const execCommand = useCallback((command: string, val?: string) => {
    document.execCommand(command, false, val)
    editorRef.current?.focus()
    if (editorRef.current) onChange(editorRef.current.innerHTML)
  }, [onChange])

  // 이미지 붙여넣기 (Ctrl+V)
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue
        const url = await uploadFile(file)
        if (url) {
          execCommand('insertHTML', `<img src="${url}" alt="pasted" class="max-w-full rounded-lg my-2" style="max-width:100%;border-radius:8px;margin:8px 0" />`)
        }
        return
      }
    }
    // 일반 텍스트는 기본 동작
  }, [execCommand])

  // 파일 업로드 공통
  async function uploadFile(file: File): Promise<string | null> {
    const ext = file.name.split('.').pop() || 'bin'
    const path = `project-files/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from('chat-attachments').upload(path, file)
    if (error) return null
    const { data } = supabase.storage.from('chat-attachments').getPublicUrl(path)
    return data.publicUrl
  }

  // 이미지 삽입
  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    for (const file of Array.from(files)) {
      const url = await uploadFile(file)
      if (url) {
        execCommand('insertHTML', `<img src="${url}" alt="${file.name}" class="max-w-full rounded-lg my-2" style="max-width:100%;border-radius:8px;margin:8px 0" />`)
      }
    }
    e.target.value = ''
  }, [execCommand])

  // 파일 첨부
  const handleFileAttach = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const uploaded: { url: string; name: string; size: number; type: string }[] = []
    for (const file of Array.from(files)) {
      const url = await uploadFile(file)
      if (url) {
        uploaded.push({ url, name: file.name, size: file.size, type: file.type })
        // 에디터에 파일 링크 삽입
        execCommand('insertHTML', `<a href="${url}" target="_blank" class="text-blue-600 underline" style="color:#2563eb;text-decoration:underline">📎 ${file.name}</a>&nbsp;`)
      }
    }
    if (uploaded.length > 0 && onFileUpload) {
      onFileUpload(uploaded)
    }
    e.target.value = ''
  }, [execCommand, onFileUpload])

  // 링크 삽입
  const insertLink = useCallback(() => {
    const url = prompt('URL을 입력하세요:')
    if (url) {
      execCommand('createLink', url)
    }
  }, [execCommand])

  // 드래그 앤 드롭
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    const files = e.dataTransfer.files
    for (const file of Array.from(files)) {
      const url = await uploadFile(file)
      if (!url) continue
      if (file.type.startsWith('image/')) {
        execCommand('insertHTML', `<img src="${url}" alt="${file.name}" style="max-width:100%;border-radius:8px;margin:8px 0" />`)
      } else {
        execCommand('insertHTML', `<a href="${url}" target="_blank" style="color:#2563eb;text-decoration:underline">📎 ${file.name}</a>&nbsp;`)
        onFileUpload?.([{ url, name: file.name, size: file.size, type: file.type }])
      }
    }
  }, [execCommand, onFileUpload])

  const toolbarBtnClass = 'p-1.5 rounded hover:bg-gray-200 text-gray-600 hover:text-gray-900 transition-colors'

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-100">
      {/* 툴바 */}
      <div className="flex items-center gap-0.5 flex-wrap px-2 py-1.5 bg-gray-50 border-b border-gray-200">
        <button type="button" onClick={() => execCommand('bold')} className={toolbarBtnClass} title="굵게">
          <Bold className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => execCommand('italic')} className={toolbarBtnClass} title="기울임">
          <Italic className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => execCommand('underline')} className={toolbarBtnClass} title="밑줄">
          <Underline className="h-4 w-4" />
        </button>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <button type="button" onClick={() => execCommand('formatBlock', '<h2>')} className={toolbarBtnClass} title="제목">
          <Heading2 className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => execCommand('formatBlock', '<blockquote>')} className={toolbarBtnClass} title="인용">
          <Quote className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => execCommand('formatBlock', '<pre>')} className={toolbarBtnClass} title="코드 블록">
          <Code className="h-4 w-4" />
        </button>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <button type="button" onClick={() => execCommand('insertUnorderedList')} className={toolbarBtnClass} title="목록">
          <List className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => execCommand('insertOrderedList')} className={toolbarBtnClass} title="번호 목록">
          <ListOrdered className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => execCommand('insertHorizontalRule')} className={toolbarBtnClass} title="구분선">
          <Minus className="h-4 w-4" />
        </button>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <button type="button" onClick={insertLink} className={toolbarBtnClass} title="링크">
          <Link2 className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => imageInputRef.current?.click()} className={toolbarBtnClass} title="이미지">
          <Image className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => fileInputRef.current?.click()} className={toolbarBtnClass} title="파일 첨부">
          <Paperclip className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => execCommand('insertHTML', '<span class="text-blue-600">@</span>')} className={toolbarBtnClass} title="멘션">
          <AtSign className="h-4 w-4" />
        </button>
      </div>

      {/* 에디터 본문 */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={() => { if (editorRef.current) onChange(editorRef.current.innerHTML) }}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        dangerouslySetInnerHTML={{ __html: value }}
        className="px-3 py-2.5 text-sm text-gray-900 outline-none overflow-y-auto prose prose-sm max-w-none [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-1 [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:text-gray-500 [&_pre]:bg-gray-100 [&_pre]:p-2 [&_pre]:rounded [&_pre]:text-xs [&_img]:rounded-lg [&_img]:max-w-full [&_a]:text-blue-600 [&_a]:underline"
        style={{ minHeight }}
        data-placeholder={placeholder}
      />

      {/* Hidden file inputs */}
      <input ref={imageInputRef} type="file" accept="image/*" multiple hidden onChange={handleImageUpload} />
      <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileAttach} />

      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
      `}</style>
    </div>
  )
}
