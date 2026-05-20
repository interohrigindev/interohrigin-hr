/**
 * 결재선 편집 컴포넌트 (관리자 전용)
 *  - 옵션 B: 세로 타임라인 + 다중 담당자 + 추천 칩 + 인라인 편집
 *  - 드래그&드롭 순서 변경
 *  - 역할 변경 시 추천 인원 자동 표시
 *  - 다중 담당자 추가/제거
 */
import { useState } from 'react'
import { Plus, X, GripVertical, ChevronDown, Send, User } from 'lucide-react'

// 필요한 필드만 가진 최소 Employee 타입 (호출처마다 자체 Employee 인터페이스를 가져도 호환되도록)
export interface ApprovalEmployee {
  id: string
  name: string
  position?: string | null
  role?: string | null
}

export type ApprovalActionType = 'approve' | 'consult' | 'reference'

export interface EditableStep {
  role: string           // 역할 코드 (leader, executive, ceo, hr_admin, finance 등)
  label: string          // 한글 라벨 (자동 채워짐, 직접 수정 가능)
  approver_ids?: string[]
  action_type?: ApprovalActionType
}

export const ROLE_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'leader',     label: '팀장/리더',     color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'division',   label: '본부장',        color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { value: 'executive',  label: '이사/임원',     color: 'bg-violet-50 text-violet-700 border-violet-200' },
  { value: 'ceo',        label: '대표',          color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'hr_admin',   label: '인사/경영지원', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'finance',    label: '재무회계',      color: 'bg-rose-50 text-rose-700 border-rose-200' },
]

const ROLE_EMPLOYEE_MATCH: Record<string, string[]> = {
  leader:    ['leader'],
  division:  ['division_head', 'director'],
  executive: ['director', 'division_head'],
  ceo:       ['ceo'],
  hr_admin:  ['hr_admin', 'admin'],
  finance:   ['admin'],
}

const ACTION_TYPES: { value: ApprovalActionType; label: string; desc: string }[] = [
  { value: 'approve',   label: '결재', desc: '승인/반려 권한' },
  { value: 'consult',   label: '합의', desc: '동의 표시'      },
  { value: 'reference', label: '참조', desc: '조회만 가능'    },
]

interface Props {
  steps: EditableStep[]
  onChange: (steps: EditableStep[]) => void
  employees: ApprovalEmployee[]
}

export function ApprovalLineEditor({ steps, onChange, employees }: Props) {
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [expandedSearch, setExpandedSearch] = useState<Record<number, boolean>>({})
  const [searchQ, setSearchQ] = useState<Record<number, string>>({})

  function update(idx: number, patch: Partial<EditableStep>) {
    onChange(steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  function changeRole(idx: number, newRole: string) {
    const opt = ROLE_OPTIONS.find((r) => r.value === newRole)
    update(idx, { role: newRole, label: opt?.label || newRole, approver_ids: [] })
  }

  function addStep() {
    onChange([...steps, { role: 'leader', label: '팀장/리더', approver_ids: [], action_type: 'approve' }])
  }

  function removeStep(idx: number) {
    onChange(steps.filter((_, i) => i !== idx))
  }

  function moveStep(from: number, to: number) {
    if (from === to) return
    const next = [...steps]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange(next)
  }

  function toggleApprover(idx: number, empId: string) {
    const current = steps[idx].approver_ids || []
    update(idx, {
      approver_ids: current.includes(empId)
        ? current.filter((id) => id !== empId)
        : [...current, empId],
    })
  }

  function getRecommended(role: string): ApprovalEmployee[] {
    const match = ROLE_EMPLOYEE_MATCH[role] || []
    if (match.length === 0) return []
    return employees.filter((e) => e.role && match.includes(e.role))
  }

  if (steps.length === 0) {
    return (
      <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
        <p className="text-sm text-gray-400 mb-3">아직 결재 단계가 없습니다</p>
        <button onClick={addStep} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 text-white text-sm rounded-md hover:bg-brand-600">
          <Plus className="h-4 w-4" /> 첫 단계 추가
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* 신청자 헤더 */}
      <div className="flex items-center gap-3 px-1">
        <div className="h-8 w-8 rounded-full bg-brand-500 text-white flex items-center justify-center ring-4 ring-brand-100 shrink-0">
          <Send className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="text-xs text-gray-500">신청자</div>
          <div className="text-sm font-semibold text-gray-900">본인</div>
        </div>
      </div>

      {steps.map((step, idx) => {
        const roleOpt = ROLE_OPTIONS.find((r) => r.value === step.role)
        const recommended = getRecommended(step.role)
        const recommendedIds = new Set(recommended.map((e) => e.id))
        const others = employees.filter((e) => !recommendedIds.has(e.id))
        const selectedIds = step.approver_ids || []
        const selectedEmps = selectedIds.map((id) => employees.find((e) => e.id === id)).filter(Boolean) as ApprovalEmployee[]
        const q = (searchQ[idx] || '').toLowerCase()
        const filteredOthers = q ? others.filter((e) => e.name.toLowerCase().includes(q)) : others
        const isLast = idx === steps.length - 1

        return (
          <div key={idx} className="flex gap-3">
            {/* 좌측 도트 + 연결선 */}
            <div className="flex flex-col items-center shrink-0 pt-1">
              <div className="h-8 w-8 rounded-full bg-gray-400 text-white text-xs font-bold flex items-center justify-center ring-4 ring-gray-100">
                {idx + 1}
              </div>
              {!isLast && <div className="w-0.5 flex-1 bg-gray-200 mt-1 min-h-[40px]" />}
            </div>

            {/* 우측 카드 */}
            <div
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragIdx !== null) moveStep(dragIdx, idx); setDragIdx(null) }}
              className={`flex-1 bg-white border rounded-lg p-3 mb-2 shadow-sm hover:border-brand-300 transition-colors ${
                dragIdx === idx ? 'opacity-50' : ''
              }`}
            >
              {/* 1행: 드래그 + 역할 + 액션 타입 + 삭제 */}
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <button className="text-gray-300 hover:text-gray-500 cursor-grab" title="드래그로 순서 변경">
                  <GripVertical className="h-4 w-4" />
                </button>
                <select
                  value={step.role}
                  onChange={(e) => changeRole(idx, e.target.value)}
                  className={`text-xs font-semibold border rounded-md px-2 py-1 ${roleOpt?.color || 'bg-gray-50'}`}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                <div className="flex items-center gap-1 ml-1">
                  {ACTION_TYPES.map((opt) => {
                    const isActive = (step.action_type || 'approve') === opt.value
                    return (
                      <button
                        key={opt.value}
                        title={opt.desc}
                        onClick={() => update(idx, { action_type: opt.value })}
                        className={`text-[10px] px-2 py-0.5 rounded-full border transition ${
                          isActive
                            ? 'bg-brand-500 text-white border-brand-500 font-semibold'
                            : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
                <button
                  onClick={() => removeStep(idx)}
                  className="ml-auto text-rose-400 hover:text-rose-600 p-1"
                  title="단계 삭제"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* 2행: 선택된 담당자 */}
              <div className="flex items-start gap-2 flex-wrap mb-2 min-h-[28px]">
                {selectedEmps.length === 0 ? (
                  <span className="text-[11px] text-amber-600 bg-amber-50 px-2 py-1 rounded">
                    ⚠️ 담당자 미지정 — 역할 기본값 사용 (아래에서 추가 권장)
                  </span>
                ) : (
                  selectedEmps.map((emp: ApprovalEmployee) => (
                    <span key={emp.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-100 text-brand-700 text-xs rounded-full">
                      <User className="h-3 w-3" />
                      {emp.name}
                      {emp.position && <span className="text-[10px] opacity-70">{emp.position}</span>}
                      <button
                        onClick={() => toggleApprover(idx, emp.id)}
                        className="ml-0.5 hover:text-rose-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>

              {/* 3행: 추천 인원 (역할 매칭) */}
              {recommended.length > 0 && (
                <div className="flex items-start gap-2 flex-wrap mt-1">
                  <span className="text-[10px] text-gray-400 mt-1">💡 추천:</span>
                  {recommended.map((emp) => {
                    const isSelected = selectedIds.includes(emp.id)
                    return (
                      <button
                        key={emp.id}
                        onClick={() => toggleApprover(idx, emp.id)}
                        className={`text-[11px] px-2 py-0.5 rounded-full border transition ${
                          isSelected
                            ? 'bg-brand-100 text-brand-700 border-brand-300 line-through opacity-50'
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-brand-50 hover:border-brand-200 hover:text-brand-700'
                        }`}
                        disabled={isSelected}
                      >
                        {isSelected ? '✓ ' : '+ '}{emp.name}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* 4행: 다른 직원 검색 (펼침) */}
              <div className="mt-2">
                <button
                  onClick={() => setExpandedSearch({ ...expandedSearch, [idx]: !expandedSearch[idx] })}
                  className="text-[11px] text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                  <ChevronDown className={`h-3 w-3 transition-transform ${expandedSearch[idx] ? 'rotate-180' : ''}`} />
                  다른 직원에서 선택
                </button>
                {expandedSearch[idx] && (
                  <div className="mt-2 border-t border-gray-100 pt-2">
                    <input
                      type="text"
                      placeholder="이름 검색..."
                      value={searchQ[idx] || ''}
                      onChange={(e) => setSearchQ({ ...searchQ, [idx]: e.target.value })}
                      className="w-full text-xs border border-gray-200 rounded px-2 py-1 mb-1"
                    />
                    <div className="max-h-40 overflow-y-auto flex flex-wrap gap-1">
                      {filteredOthers.slice(0, 50).map((emp) => {
                        const isSelected = selectedIds.includes(emp.id)
                        return (
                          <button
                            key={emp.id}
                            onClick={() => toggleApprover(idx, emp.id)}
                            className={`text-[11px] px-2 py-0.5 rounded border transition ${
                              isSelected
                                ? 'bg-brand-100 text-brand-700 border-brand-300'
                                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            {isSelected ? '✓ ' : ''}{emp.name}
                            {emp.position && <span className="text-[10px] opacity-50 ml-1">{emp.position}</span>}
                          </button>
                        )
                      })}
                      {filteredOthers.length > 50 && (
                        <span className="text-[10px] text-gray-400 px-2 py-0.5">...외 {filteredOthers.length - 50}명</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}

      {/* 단계 추가 버튼 */}
      <button
        onClick={addStep}
        className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50/30 transition-colors flex items-center justify-center gap-1"
      >
        <Plus className="h-4 w-4" /> 단계 추가
      </button>
    </div>
  )
}
