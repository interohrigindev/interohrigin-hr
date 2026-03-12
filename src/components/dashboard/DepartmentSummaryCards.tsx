import { Card, CardContent } from '@/components/ui/Card'
import type { DepartmentStats } from '@/hooks/useDepartmentFilter'

interface DepartmentSummaryCardsProps {
  current: DepartmentStats
  company: DepartmentStats
  isDepartmentSelected: boolean
}

const GRADE_COLORS: Record<string, string> = {
  S: 'bg-purple-500',
  A: 'bg-blue-500',
  B: 'bg-green-500',
  C: 'bg-yellow-500',
  D: 'bg-red-500',
}

function DeltaIndicator({ value, suffix = '' }: { value: number; suffix?: string }) {
  if (value === 0) return null
  const isPositive = value > 0
  return (
    <span className={`ml-1.5 text-xs font-medium ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
      {isPositive ? '\u25B2' : '\u25BC'} {Math.abs(value)}{suffix}
    </span>
  )
}

export function DepartmentSummaryCards({ current, company, isDepartmentSelected }: DepartmentSummaryCardsProps) {
  const gradeTotal = Object.values(current.gradeDistribution).reduce((a, b) => a + b, 0)

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {/* 인원수 */}
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-gray-500">인원수</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {current.count}<span className="text-base font-normal text-gray-400">명</span>
          </p>
          {isDepartmentSelected && (
            <p className="mt-0.5 text-xs text-gray-400">전체 {company.count}명 중</p>
          )}
        </CardContent>
      </Card>

      {/* 평균점수 */}
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-gray-500">평균 점수</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {current.avgScore != null ? current.avgScore : '—'}
            {current.avgScore != null && <span className="text-base font-normal text-gray-400">점</span>}
          </p>
          {isDepartmentSelected && company.avgScore != null && current.avgScore != null && (
            <DeltaIndicator value={Math.round((current.avgScore - company.avgScore) * 10) / 10} suffix="점" />
          )}
        </CardContent>
      </Card>

      {/* 완료율 */}
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-gray-500">완료율</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {current.completionRate}<span className="text-base font-normal text-gray-400">%</span>
          </p>
          {isDepartmentSelected && (
            <DeltaIndicator value={current.completionRate - company.completionRate} suffix="%" />
          )}
        </CardContent>
      </Card>

      {/* 등급분포 미니바 */}
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-gray-500">등급 분포</p>
          {gradeTotal === 0 ? (
            <p className="mt-3 text-sm text-gray-300">데이터 없음</p>
          ) : (
            <>
              <div className="mt-2 flex h-4 w-full overflow-hidden rounded-full">
                {['S', 'A', 'B', 'C', 'D'].map((grade) => {
                  const count = current.gradeDistribution[grade] ?? 0
                  if (count === 0) return null
                  const pct = (count / gradeTotal) * 100
                  return (
                    <div
                      key={grade}
                      className={`${GRADE_COLORS[grade]} transition-all`}
                      style={{ width: `${pct}%` }}
                      title={`${grade}: ${count}명`}
                    />
                  )
                })}
              </div>
              <div className="mt-1.5 flex gap-2 text-xs text-gray-500">
                {['S', 'A', 'B', 'C', 'D'].map((grade) => {
                  const count = current.gradeDistribution[grade] ?? 0
                  if (count === 0) return null
                  return (
                    <span key={grade}>
                      {grade}:{count}
                    </span>
                  )
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
