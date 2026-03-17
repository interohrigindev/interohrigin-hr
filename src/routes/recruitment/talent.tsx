import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Star } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Dialog } from '@/components/ui/Dialog'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { TalentProfile } from '@/types/recruitment'
import type { Department } from '@/types/database'

export default function TalentProfiles() {
  const { profile: authProfile } = useAuth()
  const { toast } = useToast()
  const [profiles, setProfiles] = useState<TalentProfile[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '',
    department_id: '',
    description: '',
    traits: '',
    skills: '',
    values: '',
  })

  async function fetchData() {
    setLoading(true)
    const [profilesRes, deptRes] = await Promise.all([
      supabase.from('talent_profiles').select('*').eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('departments').select('*'),
    ])
    if (profilesRes.data) setProfiles(profilesRes.data as TalentProfile[])
    if (deptRes.data) setDepartments(deptRes.data)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  function openNew() {
    setEditingId(null)
    setForm({ name: '', department_id: '', description: '', traits: '', skills: '', values: '' })
    setDialogOpen(true)
  }

  function openEdit(p: TalentProfile) {
    setEditingId(p.id)
    setForm({
      name: p.name,
      department_id: p.department_id || '',
      description: p.description || '',
      traits: (p.traits || []).join(', '),
      skills: (p.skills || []).join(', '),
      values: (p.values || []).join(', '),
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { toast('이름을 입력하세요.', 'error'); return }

    const payload = {
      name: form.name,
      department_id: form.department_id || null,
      description: form.description || null,
      traits: form.traits.split(',').map((s) => s.trim()).filter(Boolean),
      skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
      values: form.values.split(',').map((s) => s.trim()).filter(Boolean),
      created_by: authProfile?.id,
    }

    if (editingId) {
      const { error } = await supabase.from('talent_profiles').update(payload).eq('id', editingId)
      if (error) { toast('수정 실패', 'error'); return }
    } else {
      const { error } = await supabase.from('talent_profiles').insert(payload)
      if (error) { toast('저장 실패', 'error'); return }
    }

    toast('저장되었습니다.', 'success')
    setDialogOpen(false)
    fetchData()
  }

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    await supabase.from('talent_profiles').update({ is_active: false }).eq('id', id)
    toast('삭제되었습니다.', 'success')
    fetchData()
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">인재상 설정</h1>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> 새 인재상</Button>
      </div>

      {profiles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Star className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 mb-4">등록된 인재상이 없습니다.</p>
            <Button onClick={openNew}>첫 인재상 만들기</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {profiles.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {p.description && <p className="text-sm text-gray-600">{p.description}</p>}
                {p.traits.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {p.traits.map((t, i) => (
                      <Badge key={i} variant="primary">{t}</Badge>
                    ))}
                  </div>
                )}
                {p.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {p.skills.map((s, i) => (
                      <Badge key={i} variant="info">{s}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editingId ? '인재상 수정' : '새 인재상'} className="max-w-lg">
        <div className="space-y-4">
          <Input label="인재상 이름 *" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="예: A급 마케터" />
          <Select
            label="부서"
            value={form.department_id}
            onChange={(e) => setForm((p) => ({ ...p, department_id: e.target.value }))}
            options={[{ value: '', label: '전사 공통' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
          />
          <Textarea label="설명" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={2} />
          <Input label="핵심 특성 (쉼표 구분)" value={form.traits} onChange={(e) => setForm((p) => ({ ...p, traits: e.target.value }))} placeholder="성실함, 창의성, 리더십" />
          <Input label="스킬 (쉼표 구분)" value={form.skills} onChange={(e) => setForm((p) => ({ ...p, skills: e.target.value }))} placeholder="디자인, 기획, 데이터분석" />
          <Input label="가치관 (쉼표 구분)" value={form.values} onChange={(e) => setForm((p) => ({ ...p, values: e.target.value }))} placeholder="팀워크, 성장, 도전" />
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSave}>저장</Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
