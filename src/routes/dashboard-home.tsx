import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useEvaluationPeriods, useMyTarget, useTargetsList } from '@/hooks/useEvaluation'
import { useDashboard } from '@/hooks/useDashboard'
import { useDepartmentFilter } from '@/hooks/useDepartmentFilter'
import { EvaluationProgressSection } from '@/components/dashboard/EvaluationProgressSection'
import { ScoreComparisonTable } from '@/components/dashboard/ScoreComparisonTable'
import { ItemRadarChart } from '@/components/dashboard/ItemRadarChart'
import { DeviationAlerts } from '@/components/dashboard/DeviationAlerts'
import { GradeDistributionChart } from '@/components/dashboard/GradeDistributionChart'
import { DepartmentSummaryCards } from '@/components/dashboard/DepartmentSummaryCards'
import { DepartmentProgressSection } from '@/components/dashboard/DepartmentProgressSection'
import { DepartmentScoreRanking } from '@/components/dashboard/DepartmentScoreRanking'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { GradeBadge } from '@/components/evaluation/GradeBadge'
import { PageSpinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import { EVALUATION_STATUS_LABELS, EVALUATION_STATUS_COLORS } from '@/lib/constants'
import { MethodologyFooter } from '@/components/layout/MethodologyFooter'

export default function DashboardHome() {
  const { profile, hasRole } = useAuth()
  const { periods, activePeriod, loading: periodsLoading } = useEvaluationPeriods()
  const navigate = useNavigate()

  // Period selector state — defaults to active period
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null)
  const effectivePeriodId = selectedPeriodId ?? activePeriod?.id ?? null

  const { progress, summaryRows, deviations, allItemScores, gradeDistribution, loading: dashLoading } =
    useDashboard(effectivePeriodId)

  const { target, loading: targetLoading } = useMyTarget(
    profile?.id ?? null,
    effectivePeriodId
  )

  // leader: only show team members
  const { targets: allTargets } = useTargetsList(effectivePeriodId)
  const isLeaderOnly = hasRole('leader') && !hasRole('director')
  const isAdmin = hasRole('director')

  if (periodsLoading || dashLoading || targetLoading) {
    return <PageSpinner />
  }

  // No periods at all
  if (periods.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-lg font-medium text-gray-600">평가 기간이 없습니다</p>
        <p className="text-sm text-gray-400">관리자가 평가 기간을 설정하면 시작됩니다</p>
      </div>
    )
  }

  const selectedPeriod = periods.find((p) => p.id === effectivePeriodId) ?? activePeriod

  // ─── Period Selector ────────────────────────────────────────
  function renderPeriodSelect() {
    return (
      <select
        value={effectivePeriodId ?? ''}
        onChange={(e) => setSelectedPeriodId(e.target.value || null)}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
      >
        {periods.map((p) => (
          <option key={p.id} value={p.id}>
            {p.year}년 {p.quarter}분기
            {p.status === 'in_progress' ? ' (진행 중)' : p.status === 'completed' ? ' (종료)' : ' (준비 중)'}
          </option>
        ))}
      </select>
    )
  }

  // ─── Employee view ──────────────────────────────────────────
  if (!isAdmin && !isLeaderOnly) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">내 평가 현황</h2>
            <p className="text-sm text-gray-500 mt-1">
              {selectedPeriod?.year}년 {selectedPeriod?.quarter}분기
            </p>
          </div>
          {renderPeriodSelect()}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>평가 진행 상태</CardTitle>
          </CardHeader>
          <CardContent>
            {target ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">현재 단계</span>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      EVALUATION_STATUS_COLORS[target.status] ?? ''
                    }`}
                  >
                    {EVALUATION_STATUS_LABELS[target.status] ?? target.status}
                  </span>
                </div>
                {target.final_score != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">최종 점수</span>
                    <span className="font-semibold">{target.final_score}점</span>
                  </div>
                )}
                {target.grade && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">등급</span>
                    <GradeBadge grade={target.grade} showLabel />
                  </div>
                )}
                {target.status === 'pending' && (
                  <Button className="w-full mt-2" onClick={() => navigate('/self-evaluation')}>
                    자기평가 시작하기
                  </Button>
                )}
                {target.status !== 'pending' && target.status !== 'completed' && (
                  <p className="text-sm text-gray-500">
                    평가가 진행 중입니다. 완료 시 결과를 확인할 수 있습니다.
                  </p>
                )}
                {target.status === 'completed' && (
                  <Button
                    variant="outline"
                    className="w-full mt-2"
                    onClick={() => navigate(`/report/${profile?.id}`)}
                  >
                    결과 리포트 보기
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">아직 평가 대상으로 등록되지 않았습니다</p>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Filter for leader: same department only ────────────────
  const baseSummary = isLeaderOnly
    ? summaryRows.filter((r) => {
        const teamTarget = allTargets.find((t) => t.employee_id === r.employee_id)
        return teamTarget?.employee?.department_id === profile?.department_id
      })
    : summaryRows

  return (
    <AdminDashboard
      baseSummary={baseSummary}
      allItemScores={allItemScores}
      deviations={deviations}
      gradeDistribution={gradeDistribution}
      progress={progress}
      isLeaderOnly={isLeaderOnly}
      selectedPeriod={selectedPeriod}
      renderPeriodSelect={renderPeriodSelect}
    />
  )
}

// ─── Admin / Leader Dashboard (extracted for hook usage) ──────────

interface AdminDashboardProps {
  baseSummary: import('@/hooks/useDashboard').EvaluationSummaryRow[]
  allItemScores: import('@/hooks/useDashboard').ItemScoreComparison[]
  deviations: import('@/hooks/useDashboard').ItemScoreComparison[]
  gradeDistribution: import('@/hooks/useDashboard').GradeDistributionItem[]
  progress: import('@/hooks/useDashboard').EvaluationProgress | null
  isLeaderOnly: boolean
  selectedPeriod: { year: number; quarter: number } | undefined | null
  renderPeriodSelect: () => React.ReactNode
}

function AdminDashboard({
  baseSummary,
  allItemScores,
  deviations,
  gradeDistribution,
  progress,
  isLeaderOnly,
  selectedPeriod,
  renderPeriodSelect,
}: AdminDashboardProps) {
  const {
    departments,
    selectedDepartment,
    setSelectedDepartment,
    departmentStats,
    companyStats,
    currentStats,
    filteredRows,
  } = useDepartmentFilter(baseSummary)

  // Filter item scores and deviations by department
  const filteredItemScores = selectedDepartment
    ? allItemScores.filter((d) =>
        filteredRows.some((s) => s.employee_name === d.employee_name)
      )
    : allItemScores

  const filteredDeviations = selectedDepartment
    ? deviations.filter((d) =>
        filteredRows.some((s) => s.employee_name === d.employee_name)
      )
    : deviations

  // Grade distribution for selected department
  const filteredGrades = selectedDepartment
    ? (() => {
        const gradeMap: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 }
        filteredRows.forEach((r) => {
          if (r.grade && gradeMap[r.grade] !== undefined) gradeMap[r.grade]++
        })
        return Object.entries(gradeMap).map(([grade, count]) => ({ grade, count }))
      })()
    : gradeDistribution

  return (
    <div className="space-y-6">
      {/* 1. Header + period select */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {isLeaderOnly ? '팀 평가 현황' : '대시보드'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {selectedPeriod?.year}년 {selectedPeriod?.quarter}분기
            {isLeaderOnly && ` · 팀원 ${baseSummary.length}명`}
          </p>
        </div>
        {renderPeriodSelect()}
      </div>

      {/* 2. Department filter pills (admin only, skip for leader) */}
      {!isLeaderOnly && departments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedDepartment(null)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              selectedDepartment == null
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            전체
            <span className={`ml-1.5 text-xs ${selectedDepartment == null ? 'text-brand-200' : 'text-gray-400'}`}>
              {baseSummary.length}
            </span>
          </button>
          {departments.map((dept) => {
            const stats = departmentStats.get(dept)
            const isActive = selectedDepartment === dept
            return (
              <button
                key={dept}
                onClick={() => setSelectedDepartment(isActive ? null : dept)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {dept}
                <span className={`ml-1.5 text-xs ${isActive ? 'text-brand-200' : 'text-gray-400'}`}>
                  {stats?.count ?? 0}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* 3. Department Summary KPI Cards */}
      <DepartmentSummaryCards
        current={currentStats}
        company={companyStats}
        isDepartmentSelected={selectedDepartment != null}
      />

      {/* 4. Department Progress */}
      {!isLeaderOnly ? (
        <DepartmentProgressSection
          rows={baseSummary}
          selectedDepartment={selectedDepartment}
          departments={departments}
        />
      ) : (
        progress && <EvaluationProgressSection progress={progress} />
      )}

      {/* 5. Score Comparison Table */}
      <ScoreComparisonTable
        rows={filteredRows}
        groupByDepartment={!isLeaderOnly && selectedDepartment == null && departments.length > 1}
      />

      {/* 6. Radar Chart + Grade Distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ItemRadarChart
          data={filteredItemScores}
          summaryRows={baseSummary}
          selectedDepartment={selectedDepartment}
          departments={departments}
        />
        <GradeDistributionChart
          data={filteredGrades}
          rows={baseSummary}
          departments={departments}
          selectedDepartment={selectedDepartment}
        />
      </div>

      {/* 7. Department Score Ranking + Deviation Alerts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {!isLeaderOnly && departments.length > 1 && (
          <DepartmentScoreRanking
            departmentStats={departmentStats}
            selectedDepartment={selectedDepartment}
          />
        )}
        <div className={!isLeaderOnly && departments.length > 1 ? '' : 'lg:col-span-2'}>
          <DeviationAlerts data={filteredDeviations} />
        </div>
      </div>

      {/* 평가 방법론 안내 — 인사평가 화면에서만 표시 */}
      <MethodologyFooter mode="expanded" />
    </div>
  )
}
