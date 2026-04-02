import { useState, useEffect, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Color from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Save, Loader2, Mail, RotateCcw, Eye,
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Link as LinkIcon, Image as ImageIcon,
  Heading1, Heading2, Quote, Code, Undo, Redo, Minus,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Dialog } from '@/components/ui/Dialog'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'

// ─── 기본 템플릿 정의 ───────────────────────────────────────────

interface EmailTemplate {
  key: string
  label: string
  subject: string
  body_html: string
  variables: string[]
}

const DEFAULT_TEMPLATES: EmailTemplate[] = [
  {
    key: 'survey_invite',
    label: '사전 질의서 발송',
    subject: '[인터오리진] {{이름}}님, 사전 질의서 작성 요청',
    body_html: `<p><strong>{{이름}}</strong>님, 안녕하세요.</p><p>인터오리진에 관심을 가져주셔서 감사합니다.</p><p>지원하신 <strong>{{직무}}</strong> 포지션 관련하여 사전 질의서를 보내드립니다.</p><p>면접 준비를 위해 아래 버튼을 클릭하여 사전 질의서를 작성해 주시기 바랍니다.</p><p><a href="{{질의서링크}}">사전 질의서 작성하기</a></p><p style="color:#6b7280;font-size:13px;">버튼이 작동하지 않는 경우, 아래 링크를 브라우저에 직접 입력해 주세요:<br>{{질의서링크}}</p>`,
    variables: ['이름', '직무', '질의서링크'],
  },
  {
    key: 'interview_invite',
    label: '면접 일정 안내',
    subject: '[인터오리진] {{이름}}님, 면접 일정 안내',
    body_html: `<p><strong>{{이름}}</strong>님, 안녕하세요.</p><p>인터오리진 채용 면접 일정을 안내드립니다.</p><table><tr><td><strong>일시</strong></td><td>{{면접일시}}</td></tr><tr><td><strong>소요시간</strong></td><td>약 {{소요시간}}분</td></tr><tr><td><strong>형태</strong></td><td>{{면접유형}}</td></tr><tr><td><strong>장소/링크</strong></td><td>{{장소링크}}</td></tr></table><p style="color:#92400e;background:#fef3c7;padding:12px;border-radius:8px;"><strong>📌 안내사항</strong><br>채용 관련 모든 안내는 이메일로 발송됩니다. 수신함을 자주 확인해 주세요.</p>`,
    variables: ['이름', '면접일시', '소요시간', '면접유형', '장소링크'],
  },
  {
    key: 'hiring_accept',
    label: '합격 통보',
    subject: '[인터오리진] {{이름}}님, 합격을 축하드립니다',
    body_html: `<p><strong>{{이름}}</strong>님, 안녕하세요.</p><p>인터오리진에 관심을 가져주시고 채용 과정에 참여해 주셔서 진심으로 감사드립니다.</p><p style="color:#16a34a;font-size:18px;font-weight:bold;">🎉 합격을 축하드립니다!</p><p>심사숙고 끝에 {{이름}}님을 인터오리진의 새로운 구성원으로 모시게 되었습니다.</p><table><tr><td><strong>직무</strong></td><td>{{직무}}</td></tr><tr><td><strong>연봉</strong></td><td>{{연봉}}만원</td></tr><tr><td><strong>수습급여</strong></td><td>{{수습급여}}만원</td></tr><tr><td><strong>입사예정일</strong></td><td>{{입사일}}</td></tr></table><p>아래 링크에서 합격 조건을 확인하고 수락해 주세요.</p><p><a href="{{수락링크}}">합격 조건 확인 및 수락</a></p>`,
    variables: ['이름', '직무', '연봉', '수습급여', '입사일', '수락링크'],
  },
  {
    key: 'hiring_reject',
    label: '불합격 통보',
    subject: '[인터오리진] {{이름}}님, 채용 결과 안내',
    body_html: `<p><strong>{{이름}}</strong>님, 안녕하세요.</p><p>인터오리진에 관심을 가져주시고 채용 과정에 참여해 주셔서 진심으로 감사드립니다.</p><p>신중한 검토 끝에 아쉽게도 이번에는 함께하기 어렵게 되었음을 알려드립니다.</p><p>{{이름}}님의 역량과 가능성을 높이 평가하며, 향후 적합한 포지션이 생기면 다시 연락드리겠습니다.</p><p>앞으로의 모든 여정에 좋은 결과가 있기를 진심으로 응원합니다.</p>`,
    variables: ['이름'],
  },
  {
    key: 'hiring_reject_conditions',
    label: '조건 불합격 통보',
    subject: '[인터오리진] {{이름}}님, 최종 채용 결과 안내',
    body_html: `<p><strong>{{이름}}</strong>님, 안녕하세요.</p><p>인터오리진에 관심을 가져주시고 채용 과정에 참여해 주셔서 진심으로 감사드립니다.</p><p>제시드린 합격 조건에 대해 검토해 주신 점 감사드립니다.</p><p>안타깝게도 제시된 조건이 상호 부합하지 않아 <strong style="color:#dc2626;">최종 불합격 처리</strong>되었음을 알려드립니다.</p><p>{{이름}}님의 역량과 경험을 높이 평가하고 있으며, 향후 적합한 기회가 있을 때 다시 연락드리겠습니다.</p><p>앞으로의 모든 여정에 좋은 결과가 있기를 진심으로 응원합니다.</p>`,
    variables: ['이름'],
  },
  {
    key: 'interviewer_notification',
    label: '면접관 안내',
    subject: '[인터오리진 채용] {{이름}} 면접 안내 ({{면접일시}})',
    body_html: `<p>안녕하세요, 면접 일정을 안내드립니다.</p><table><tr><td><strong>지원자</strong></td><td>{{이름}}</td></tr><tr><td><strong>일시</strong></td><td>{{면접일시}}</td></tr><tr><td><strong>유형</strong></td><td>{{면접유형}}</td></tr><tr><td><strong>장소/링크</strong></td><td>{{장소링크}}</td></tr></table><p>면접 전 지원자의 이력서와 사전 질의서 응답을 확인해 주세요.</p>`,
    variables: ['이름', '면접일시', '면접유형', '장소링크'],
  },
]

// ─── 에디터 툴바 ────────────────────────────────────────────────

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null

  const addImage = () => {
    const url = window.prompt('이미지 URL을 입력하세요')
    if (url) editor.chain().focus().setImage({ src: url }).run()
  }

  const setLink = () => {
    const url = window.prompt('링크 URL을 입력하세요')
    if (url) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    } else {
      editor.chain().focus().unsetLink().run()
    }
  }

  const btn = (active: boolean, onClick: () => void, icon: React.ReactNode, title: string) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${active ? 'bg-brand-100 text-brand-700' : 'text-gray-600'}`}
    >
      {icon}
    </button>
  )

  const s = 'h-4 w-4'

  return (
    <div className="flex flex-wrap gap-0.5 p-2 border-b bg-gray-50 rounded-t-lg">
      {btn(false, () => editor.chain().focus().undo().run(), <Undo className={s} />, '실행 취소')}
      {btn(false, () => editor.chain().focus().redo().run(), <Redo className={s} />, '다시 실행')}
      <div className="w-px h-6 bg-gray-300 mx-1" />
      {btn(editor.isActive('heading', { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), <Heading1 className={s} />, '제목 1')}
      {btn(editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), <Heading2 className={s} />, '제목 2')}
      <div className="w-px h-6 bg-gray-300 mx-1" />
      {btn(editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), <Bold className={s} />, '굵게')}
      {btn(editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), <Italic className={s} />, '기울임')}
      {btn(editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), <UnderlineIcon className={s} />, '밑줄')}
      {btn(editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), <Strikethrough className={s} />, '취소선')}
      <div className="w-px h-6 bg-gray-300 mx-1" />
      {btn(editor.isActive({ textAlign: 'left' }), () => editor.chain().focus().setTextAlign('left').run(), <AlignLeft className={s} />, '왼쪽 정렬')}
      {btn(editor.isActive({ textAlign: 'center' }), () => editor.chain().focus().setTextAlign('center').run(), <AlignCenter className={s} />, '가운데 정렬')}
      {btn(editor.isActive({ textAlign: 'right' }), () => editor.chain().focus().setTextAlign('right').run(), <AlignRight className={s} />, '오른쪽 정렬')}
      <div className="w-px h-6 bg-gray-300 mx-1" />
      {btn(editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), <List className={s} />, '글머리 기호')}
      {btn(editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered className={s} />, '번호 목록')}
      {btn(editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run(), <Quote className={s} />, '인용')}
      {btn(editor.isActive('codeBlock'), () => editor.chain().focus().toggleCodeBlock().run(), <Code className={s} />, '코드 블록')}
      {btn(false, () => editor.chain().focus().setHorizontalRule().run(), <Minus className={s} />, '구분선')}
      <div className="w-px h-6 bg-gray-300 mx-1" />
      {btn(editor.isActive('link'), setLink, <LinkIcon className={s} />, '링크')}
      {btn(false, addImage, <ImageIcon className={s} />, '이미지')}
      <div className="w-px h-6 bg-gray-300 mx-1" />
      <input
        type="color"
        onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
        title="글자 색상"
        className="w-6 h-6 rounded cursor-pointer border-0 p-0"
      />
    </div>
  )
}

// ─── 메인 컴포넌트 ──────────────────────────────────────────────

export default function RecruitmentSettings() {
  const { toast } = useToast()
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [editSubject, setEditSubject] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [dbAvailable, setDbAvailable] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Image,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Color,
      TextStyle,
      Placeholder.configure({ placeholder: '이메일 본문을 작성하세요...' }),
    ],
    content: '',
  })

  // 데이터 로드: DB 우선, 없으면 기본 템플릿
  const loadTemplates = useCallback(async () => {
    setLoading(true)

    // DB 테이블 존재 여부 확인
    const { data: dbRows, error } = await supabase
      .from('recruitment_email_templates')
      .select('*')
      .order('created_at')

    if (!error && dbRows && dbRows.length > 0) {
      setDbAvailable(true)
      setTemplates(dbRows.map((r: any) => ({
        key: r.template_key,
        label: r.label,
        subject: r.subject,
        body_html: r.body_html,
        variables: r.variables || [],
      })))
    } else {
      setDbAvailable(false)
      setTemplates(DEFAULT_TEMPLATES)
    }

    setLoading(false)
  }, [])

  useEffect(() => { loadTemplates() }, [loadTemplates])

  // 템플릿 선택
  function selectTemplate(key: string) {
    const tmpl = templates.find(t => t.key === key)
    if (!tmpl) return
    setSelectedKey(key)
    setEditSubject(tmpl.subject)
    editor?.commands.setContent(tmpl.body_html)
  }

  // 저장
  async function handleSave() {
    if (!selectedKey || !editor) return
    setSaving(true)

    const html = editor.getHTML()
    const tmpl = templates.find(t => t.key === selectedKey)!

    // DB에 저장 시도
    if (dbAvailable) {
      const { error } = await supabase
        .from('recruitment_email_templates')
        .update({ subject: editSubject, body_html: html, updated_at: new Date().toISOString() })
        .eq('template_key', selectedKey)

      if (error) {
        toast('저장 실패: ' + error.message, 'error')
        setSaving(false)
        return
      }
    } else {
      // DB 없으면 insert 시도
      const { error } = await supabase
        .from('recruitment_email_templates')
        .upsert({
          template_key: selectedKey,
          label: tmpl.label,
          subject: editSubject,
          body_html: html,
          variables: tmpl.variables,
        }, { onConflict: 'template_key' })

      if (!error) setDbAvailable(true)
    }

    // 로컬 상태 업데이트
    setTemplates(prev => prev.map(t =>
      t.key === selectedKey ? { ...t, subject: editSubject, body_html: html } : t
    ))
    toast('템플릿이 저장되었습니다.', 'success')
    setSaving(false)
  }

  // 기본값 복원
  function handleReset() {
    if (!selectedKey) return
    const def = DEFAULT_TEMPLATES.find(t => t.key === selectedKey)
    if (!def) return
    if (!confirm('기본 템플릿으로 복원하시겠습니까? 수정한 내용이 사라집니다.')) return
    setEditSubject(def.subject)
    editor?.commands.setContent(def.body_html)
  }

  // 미리보기 HTML 생성
  function getPreviewHtml() {
    const html = editor?.getHTML() || ''
    const vars: Record<string, string> = {
      '이름': '홍길동', '직무': '마케팅 기획', '질의서링크': 'https://example.com/survey/abc123',
      '면접일시': '2026년 4월 10일 14:00', '소요시간': '30', '면접유형': 'Google Meet 화상면접',
      '장소링크': 'https://meet.google.com/abc-defg-hij', '연봉': '4,000', '수습급여': '3,600',
      '입사일': '2026년 5월 1일', '수락링크': 'https://example.com/offer/abc123',
    }
    let preview = html
    for (const [k, v] of Object.entries(vars)) {
      preview = preview.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v)
    }
    return `
      <div style="max-width:600px;margin:0 auto;background:#fff;font-family:sans-serif;">
        <div style="background:linear-gradient(135deg,#6B3FA0,#4A2C6F);padding:28px 24px;text-align:center;">
          <h1 style="color:#fff;font-size:20px;margin:0;">INTEROHRIGIN</h1>
          <p style="color:#d8b4fe;font-size:12px;margin:4px 0 0;">Human Resources</p>
        </div>
        <div style="padding:32px 28px;">${preview}</div>
        <div style="background:#f9fafb;padding:20px 28px;border-top:1px solid #e5e7eb;">
          <p style="font-size:12px;color:#9ca3af;text-align:center;">인터오리진 채용 시스템</p>
        </div>
      </div>`
  }

  if (loading) return <PageSpinner />

  const selected = templates.find(t => t.key === selectedKey)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">채용 설정</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* 좌측: 템플릿 목록 */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-700 mb-3">이메일 템플릿</p>
          {templates.map(t => (
            <button
              key={t.key}
              onClick={() => selectTemplate(t.key)}
              className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                selectedKey === t.key
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-gray-200 hover:bg-gray-50 text-gray-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0" />
                <span className="text-sm font-medium">{t.label}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1 truncate">{t.subject}</p>
            </button>
          ))}

          {!dbAvailable && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-700">
                DB 테이블 미생성 — 기본 템플릿을 표시 중입니다.
                Supabase SQL Editor에서 마이그레이션 041을 실행하세요.
              </p>
            </div>
          )}
        </div>

        {/* 우측: 에디터 */}
        <div className="lg:col-span-3">
          {!selectedKey ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Mail className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400">왼쪽에서 편집할 이메일 템플릿을 선택하세요</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="h-4 w-4" /> {selected?.label}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={handleReset}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> 기본값
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> 미리보기
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={saving}>
                      {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                      저장
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 사용 가능 변수 */}
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-xs text-gray-500 mr-1">변수:</span>
                  {selected?.variables.map(v => (
                    <Badge key={v} variant="default" className="bg-brand-50 text-brand-700 text-[10px] cursor-pointer hover:bg-brand-100"
                      onClick={() => {
                        editor?.chain().focus().insertContent(`{{${v}}}`).run()
                      }}
                    >
                      {'{{' + v + '}}'}
                    </Badge>
                  ))}
                </div>

                {/* 제목 */}
                <Input
                  label="이메일 제목"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                />

                {/* Tiptap 에디터 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">이메일 본문</label>
                  <div className="border rounded-lg overflow-hidden">
                    <EditorToolbar editor={editor} />
                    <EditorContent
                      editor={editor}
                      className="prose prose-sm max-w-none p-4 min-h-[300px] focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[280px]"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* 미리보기 다이얼로그 */}
      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} title="이메일 미리보기" className="max-w-2xl">
        <div className="space-y-3">
          <div className="bg-gray-100 rounded-lg p-2 text-xs text-gray-600">
            <strong>제목:</strong> {editSubject.replace(/\{\{이름\}\}/g, '홍길동')}
          </div>
          <div
            className="border rounded-lg overflow-hidden bg-[#f3f4f6] p-4"
            dangerouslySetInnerHTML={{ __html: getPreviewHtml() }}
          />
          <p className="text-xs text-gray-400 text-center">
            {'{{변수}}'} 자리에 실제 값이 치환된 미리보기입니다.
          </p>
        </div>
      </Dialog>
    </div>
  )
}
