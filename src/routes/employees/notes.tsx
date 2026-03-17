import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Dialog } from '@/components/ui/Dialog'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { Employee } from '@/types/database'

interface NoteRow {
  id: string
  employee_id: string
  author_id: string
  note_type: 'positive' | 'negative'
  content: string
  severity: 'minor' | 'moderate' | 'major'
  created_at: string
}

export default function SpecialNotes() {
  const { toast } = useToast()
  const { profile } = useAuth()
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterSeverity, setFilterSeverity] = useState('')

  // Add dialog
  const [showAdd, setShowAdd] = useState(false)
  const [formEmployee, setFormEmployee] = useState('')
  const [formType, setFormType] = useState<'positive' | 'negative'>('positive')
  const [formSeverity, setFormSeverity] = useState<'minor' | 'moderate' | 'major'>('minor')
  const [formContent, setFormContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [notesRes, empRes] = await Promise.all([
        supabase
          .from('special_notes')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase.from('employees').select('*').eq('is_active', true).order('name'),
      ])
      setNotes((notesRes.data ?? []) as any)
      setEmployees((empRes.data ?? []) as any)
    } catch {
      toast('데이터 로딩 실패', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const filteredNotes = notes.filter((n) => {
    if (filterEmployee && n.employee_id !== filterEmployee) return false
    if (filterType && n.note_type !== filterType) return false
    if (filterSeverity && n.severity !== filterSeverity) return false
    return true
  })

  const employeeMap = new Map(employees.map((e) => [e.id, e]))

  async function handleAdd() {
    if (!formEmployee) {
      toast('직원을 선택해주세요', 'error')
      return
    }
    if (!formContent.trim()) {
      toast('내용을 입력해주세요', 'error')
      return
    }
    setSubmitting(true)
    try {
      const { error } = await supabase.from('special_notes').insert({
        employee_id: formEmployee,
        author_id: profile?.id ?? '',
        note_type: formType,
        severity: formSeverity,
        content: formContent.trim(),
      })
      if (error) throw error
      toast('특이사항이 등록되었습니다', 'success')
      setShowAdd(false)
      setFormContent('')
      setFormEmployee('')
      fetchData()
    } catch {
      toast('등록 실패', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">특이사항 관리</h1>
        <Button onClick={() => setShowAdd(true)}>기록 추가</Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Select
              label="직원"
              placeholder="전체"
              options={employees.map((e) => ({ value: e.id, label: e.name }))}
              value={filterEmployee}
              onChange={(e) => setFilterEmployee(e.target.value)}
            />
            <Select
              label="유형"
              placeholder="전체"
              options={[
                { value: 'positive', label: '긍정' },
                { value: 'negative', label: '부정' },
              ]}
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            />
            <Select
              label="심각도"
              placeholder="전체"
              options={[
                { value: 'minor', label: '경미' },
                { value: 'moderate', label: '보통' },
                { value: 'major', label: '중대' },
              ]}
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Notes List */}
      <Card>
        <CardHeader>
          <CardTitle>특이사항 목록 ({filteredNotes.length}건)</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredNotes.length === 0 ? (
            <p className="text-sm text-gray-500">특이사항이 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {filteredNotes.map((n) => {
                const emp = employeeMap.get(n.employee_id)
                return (
                  <div key={n.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{emp?.name ?? '알 수 없음'}</span>
                        <Badge variant={n.note_type === 'positive' ? 'success' : 'danger'}>
                          {n.note_type === 'positive' ? '긍정' : '부정'}
                        </Badge>
                        <Badge
                          variant={
                            n.severity === 'major' ? 'danger' : n.severity === 'moderate' ? 'warning' : 'default'
                          }
                        >
                          {n.severity === 'major' ? '중대' : n.severity === 'moderate' ? '보통' : '경미'}
                        </Badge>
                      </div>
                      <span className="text-xs text-gray-400">
                        {new Date(n.created_at).toLocaleDateString('ko-KR')}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-gray-700">{n.content}</p>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={showAdd} onClose={() => setShowAdd(false)} title="특이사항 기록 추가">
        <div className="space-y-4">
          <Select
            label="직원 선택"
            placeholder="직원을 선택하세요"
            options={employees.map((e) => ({ value: e.id, label: e.name }))}
            value={formEmployee}
            onChange={(e) => setFormEmployee(e.target.value)}
          />
          <Select
            label="유형"
            options={[
              { value: 'positive', label: '긍정' },
              { value: 'negative', label: '부정' },
            ]}
            value={formType}
            onChange={(e) => setFormType(e.target.value as 'positive' | 'negative')}
          />
          <Select
            label="심각도"
            options={[
              { value: 'minor', label: '경미' },
              { value: 'moderate', label: '보통' },
              { value: 'major', label: '중대' },
            ]}
            value={formSeverity}
            onChange={(e) => setFormSeverity(e.target.value as 'minor' | 'moderate' | 'major')}
          />
          <Textarea
            label="내용"
            placeholder="특이사항 내용을 입력하세요"
            value={formContent}
            onChange={(e) => setFormContent(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowAdd(false)}>
              취소
            </Button>
            <Button onClick={handleAdd} disabled={submitting}>
              {submitting ? '저장 중...' : '저장'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
