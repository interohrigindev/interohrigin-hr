import { useState, lazy, Suspense } from 'react'
import { cn } from '@/lib/utils'
import {
  Users,
  Bot,
  Database,
} from 'lucide-react'
import TabEmployees from '@/components/settings/TabEmployees'
import TabAI from '@/components/settings/TabAI'
import { PageSpinner } from '@/components/ui/Spinner'

// Lazy load DataMigration (기존 urgent/migration 페이지 재사용)
const DataMigration = lazy(() => import('@/routes/urgent/migration'))

const TABS = [
  { key: 'employees', label: '직원/부서', icon: Users },
  { key: 'ai', label: 'AI 설정', icon: Bot },
  { key: 'integration', label: '외부 연동', icon: Database },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function GeneralSettings() {
  const [activeTab, setActiveTab] = useState<TabKey>('employees')

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">일반 설정</h2>
        <p className="text-sm text-gray-500 mt-1">직원/부서 관리, AI 설정, 외부 연동을 관리합니다</p>
      </div>

      {/* 탭 네비게이션 */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="일반 설정 탭">
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
        {activeTab === 'employees' && <TabEmployees />}
        {activeTab === 'ai' && <TabAI />}
        {activeTab === 'integration' && (
          <Suspense fallback={<PageSpinner />}>
            <DataMigration />
          </Suspense>
        )}
      </div>
    </div>
  )
}
