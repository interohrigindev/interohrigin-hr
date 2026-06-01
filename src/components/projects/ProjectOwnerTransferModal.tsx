/**
 * 프로젝트 담당자 변경 요청 모달 (2026-06-01)
 *
 * 워크플로 (옵션 A — 기존 결재 시스템 재활용):
 *   1. 양도자(현 담당자)가 인수자 선택 + 사유 입력
 *   2. approval_documents (doc_type='project_owner_transfer') + approval_steps 3행 insert
 *      - step 1: 인수자 (assignee role)
 *      - step 2: 부서 리더 + 부서 임원 (병렬 — 둘 다 approved 시에만 final approved)
 *   3. 최종 승인 시 DB 트리거(146_project_owner_transfer.sql)가
 *      project_boards.manager_id 자동 변경
 *
 * 관리자(admin/ceo) 우회는 호출자가 책임 — 이 모달은 결재 경로 전용.
 *
 * 가드:
 *   - leader_id 또는 executive_id 가 비어있으면 요청 자체 차단
 *   - 인수자가 현 담당자와 같으면 차단
 *   - 진행 중 transfer 요청이 이미 있으면 차단 (중복 방지)
 */
import { useState, useMemo } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { notifyApprovalSubmitted } from '@/lib/approval-notification'
import { ArrowRight, AlertCircle, UserCircle2 } from 'lucide-react'

interface EmployeeOption {
  id: string
  name: string
  department_id?: string | null
  position?: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  /** 변경 대상 프로젝트 */
  project: {
    id: string
    project_name: string
    manager_id: string | null
    leader_id: string | null
    executive_id: string | null
  }
  /** 양도자(현 담당자) 정보 — manager_id 가 NULL 인 케이스 차단용 */
  currentManager: EmployeeOption | null
  /** 인수자 후보 목록 (필터된 전사 직원) */
  employees: EmployeeOption[]
  /** 결재 신청 완료 후 부모에 알림 (목록 새로고침 등) */
  onSubmitted: () => void
}

export function ProjectOwnerTransferModal({
  open, onClose, project, currentManager, employees, onSubmitted,
}: Props) {
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [toManagerId, setToManagerId] = useState<string>('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 가드: 리더/임원 누락
  const missingLeader = !project.leader_id
  const missingExec = !project.executive_id
  const canSubmit = !missingLeader && !missingExec && !!toManagerId && !!currentManager?.id

  const leader = useMemo(() => employees.find((e) => e.id === project.leader_id) || null, [employees, project.leader_id])
  const executive = useMemo(() => employees.find((e) => e.id === project.executive_id) || null, [employees, project.executive_id])
  const toEmp = useMemo(() => employees.find((e) => e.id === toManagerId) || null, [employees, toManagerId])

  const filteredCandidates = useMemo(() => {
    const q = search.trim().toLowerCase()
    return employees
      .filter((e) => e.id !== currentManager?.id) // 자기 자신 제외
      .filter((e) => !q || e.name.toLowerCase().includes(q))
      .slice(0, 30)
  }, [employees, currentManager, search])

  async function handleSubmit() {
    if (!canSubmit || !currentManager) return
    setSubmitting(true)
    try {
      // 1. 중복 진행 중 요청 체크 (in_review 또는 submitted)
      const { data: existing } = await supabase
        .from('approval_documents')
        .select('id, status')
        .eq('doc_type', 'project_owner_transfer')
        .in('status', ['submitted', 'in_review'])
        // content jsonb 검색 — project_id 일치
        .filter('content->>project_id', 'eq', project.id)
      if (existing && existing.length > 0) {
        toast('이미 진행 중인 담당자 변경 요청이 있습니다. 회수 후 재요청하세요.', 'error')
        setSubmitting(false)
        return
      }

      // 2. approval_documents insert
      const content = {
        project_id: project.id,
        project_name: project.project_name,
        from_manager_id: currentManager.id,
        from_manager_name: currentManager.name,
        to_manager_id: toManagerId,
        to_manager_name: toEmp?.name || '',
        reason: reason.trim() || null,
      }
      const { data: doc, error: docErr } = await supabase
        .from('approval_documents')
        .insert({
          doc_type: 'project_owner_transfer',
          title: `프로젝트 담당자 변경: ${project.project_name} (${currentManager.name} → ${toEmp?.name || '?'})`,
          content,
          requester_id: currentManager.id,
          status: 'submitted',
          current_step: 1,
          total_steps: 2,
          submitted_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (docErr || !doc) {
        toast('결재 문서 생성 실패: ' + (docErr?.message || '알 수 없는 오류'), 'error')
        setSubmitting(false)
        return
      }

      // 3. approval_steps 3행 insert
      //    step 1: 인수자 (assignee role)
      //    step 2: 리더 + 임원 (병렬 결재 — 둘 다 approved 시에만 다음 step 으로)
      const { error: stepsErr } = await supabase.from('approval_steps').insert([
        {
          document_id: doc.id,
          step_order: 1,
          approver_id: toManagerId,
          approver_role: 'assignee', // 인수자
          action: 'pending',
        },
        {
          document_id: doc.id,
          step_order: 2,
          approver_id: project.leader_id!,
          approver_role: 'leader',
          action: 'pending',
        },
        {
          document_id: doc.id,
          step_order: 2,
          approver_id: project.executive_id!,
          approver_role: 'executive',
          action: 'pending',
        },
      ])
      if (stepsErr) {
        // rollback document
        await supabase.from('approval_documents').delete().eq('id', doc.id)
        toast('결재선 생성 실패: ' + stepsErr.message, 'error')
        setSubmitting(false)
        return
      }

      // 4. 알림 발송 (silent fail)
      notifyApprovalSubmitted(doc.id).catch(() => {})

      toast('담당자 변경 요청이 제출되었습니다. 결재 진행 상황은 전자결재에서 확인하세요.', 'success')
      onSubmitted()
      onClose()
      setSearch(''); setToManagerId(''); setReason('')
    } catch (err) {
      toast('처리 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="프로젝트 담당자 변경 요청" className="max-w-xl">
      <div className="space-y-4">
        {/* 가드 안내 */}
        {(missingLeader || missingExec) && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">결재 진행 불가</p>
              <p className="text-xs mt-1">
                {missingLeader && '리더가 지정되지 않음. '}
                {missingExec && '임원이 지정되지 않음. '}
                프로젝트 설정에서 리더·임원을 먼저 지정해주세요.
              </p>
            </div>
          </div>
        )}

        {/* 프로젝트 정보 */}
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">대상 프로젝트</p>
          <p className="font-semibold text-gray-900 text-sm">{project.project_name}</p>
        </div>

        {/* 변경 전/후 시각화 */}
        <div className="flex items-center gap-3 p-3 bg-brand-50 border border-brand-200 rounded-lg">
          <div className="flex-1">
            <p className="text-[10px] text-gray-500 mb-0.5">현 담당자</p>
            <p className="text-sm font-semibold text-gray-800">{currentManager?.name || '-'}</p>
          </div>
          <ArrowRight className="h-5 w-5 text-brand-500 shrink-0" />
          <div className="flex-1">
            <p className="text-[10px] text-gray-500 mb-0.5">인수 담당자</p>
            <p className="text-sm font-semibold text-brand-700">{toEmp?.name || '— 선택 필요 —'}</p>
          </div>
        </div>

        {/* 인수자 검색 + 선택 */}
        <div>
          <label className="text-xs font-medium text-gray-700">인수 담당자 검색 *</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름 입력..."
            disabled={submitting}
            className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500"
          />
          <div className="mt-2 max-h-44 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
            {filteredCandidates.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400 text-center">검색 결과 없음</p>
            ) : (
              filteredCandidates.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setToManagerId(e.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 ${
                    toManagerId === e.id ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-gray-700'
                  }`}
                >
                  <UserCircle2 className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="flex-1 truncate">{e.name}</span>
                  {e.position && <span className="text-[10px] text-gray-400">{e.position}</span>}
                  {toManagerId === e.id && <span className="text-brand-500 text-[10px] ml-auto">✓</span>}
                </button>
              ))
            )}
          </div>
        </div>

        {/* 사유 */}
        <Textarea
          label="변경 사유 (선택)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="예: 담당 분야 이관, 부서 이동, 업무 재편 등"
          rows={3}
          disabled={submitting}
        />

        {/* 결재선 미리보기 */}
        {!missingLeader && !missingExec && (
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
            <p className="text-xs font-bold text-indigo-900 mb-2">📋 결재선 미리보기</p>
            <ol className="space-y-1.5 text-xs text-indigo-800">
              <li><span className="font-semibold">1단계 (인수자 승낙)</span> — {toEmp?.name || '— 인수자 선택 후 표시'}</li>
              <li>
                <span className="font-semibold">2단계 (부서 합의 — 병렬)</span>
                <div className="ml-3 mt-1 space-y-0.5">
                  <div>• 리더: {leader?.name || '미지정'}</div>
                  <div>• 임원: {executive?.name || '미지정'}</div>
                </div>
                <p className="text-[10px] text-indigo-500 ml-3 mt-1">※ 두 분이 모두 승인해야 최종 승인. 한 분이라도 반려 시 즉시 반려.</p>
              </li>
            </ol>
            <p className="text-[10px] text-indigo-600 mt-2 border-t border-indigo-200 pt-1.5">
              ✓ 최종 승인 시 담당자가 자동으로 변경됩니다. 회수는 전자결재 페이지에서 가능합니다.
            </p>
          </div>
        )}

        {/* 액션 버튼 */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? '제출 중...' : '결재 요청'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
