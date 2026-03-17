import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  Calendar,
  ListChecks,
  Scale,
  Award,
} from 'lucide-react'
import TabPeriods from '@/components/settings/TabPeriods'
import TabItems from '@/components/settings/TabItems'
import TabWeights from '@/components/settings/TabWeights'
import TabGrades from '@/components/settings/TabGrades'

const TABS = [
  { key: 'periods', label: '평가 기간', icon: Calendar },
  { key: 'items', label: '평가 항목', icon: ListChecks },
  { key: 'weights', label: '가중치', icon: Scale },
  { key: 'grades', label: '등급 기준', icon: Award },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function EvaluationSettings() {
  const [activeTab, setActiveTab] = useState<TabKey>('periods')

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">평가 설정</h2>
        <p className="text-sm text-gray-500 mt-1">인사평가 관련 설정을 관리합니다</p>
      </div>

      {/* 탭 네비게이션 */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="평가 설정 탭">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* 탭 컨텐츠 */}
      <div>
        {activeTab === 'periods' && <TabPeriods />}
        {activeTab === 'items' && <TabItems />}
        {activeTab === 'weights' && <TabWeights />}
        {activeTab === 'grades' && <TabGrades />}
      </div>
    </div>
  )
}
