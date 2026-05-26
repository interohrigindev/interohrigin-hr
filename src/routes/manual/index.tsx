/**
 * /manual — 매뉴얼 허브
 *
 * 권한별 카드 노출:
 *  - 직원 기본 매뉴얼 (전 직원)
 *  - 경영지원 매뉴얼 (hr_admin+)
 *  - 임원 매뉴얼 (director+)
 */
import { useNavigate } from 'react-router-dom'
import { Users, Briefcase, Crown, ArrowRight, BookOpen } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { ROLE_HIERARCHY } from '@/lib/constants'

export default function ManualHub() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const roleLevel = profile?.role ? ROLE_HIERARCHY[profile.role as keyof typeof ROLE_HIERARCHY] ?? 0 : 0

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-brand-100 p-3">
          <BookOpen className="h-6 w-6 text-brand-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">온라인 매뉴얼</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            실제 화면에서 단계별로 따라하며 익히는 체험형 가이드입니다.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 직원 기본 — 전 직원 노출 */}
        <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('/manual/employee')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="rounded-lg bg-emerald-100 p-2.5">
                <Users className="h-5 w-5 text-emerald-600" />
              </div>
              <Badge variant="success">전 직원</Badge>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">직원 기본 매뉴얼</h3>
            <p className="text-sm text-gray-600 mb-4">
              대시보드, 일일보고, 연차, 자기평가, 결재, 메신저 등 모든 직원의 기본 메뉴 사용법.
            </p>
            <div className="flex items-center text-sm text-gray-500">
              <span>6개 챕터 · 약 18분</span>
              <ArrowRight className="h-4 w-4 ml-auto text-brand-500" />
            </div>
          </CardContent>
        </Card>

        {/* 경영지원 — hr_admin (level 2) 이상 */}
        <Card
          className={`transition-all ${roleLevel >= 2 ? 'hover:shadow-lg cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
          onClick={() => roleLevel >= 2 && navigate('/manual/hr-admin')}
        >
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="rounded-lg bg-sky-100 p-2.5">
                <Briefcase className="h-5 w-5 text-sky-600" />
              </div>
              <Badge variant={roleLevel >= 2 ? 'info' : 'default'}>
                {roleLevel >= 2 ? '경영지원 이상' : '권한 필요'}
              </Badge>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">경영지원 매뉴얼</h3>
            <p className="text-sm text-gray-600 mb-4">
              결재선 관리, 직원 등록, 연차 촉진, 평가 기간 설정 등 인사담당 메뉴.
            </p>
            <div className="flex items-center text-sm text-gray-500">
              <span>준비 중 · 다음 사이클</span>
              <ArrowRight className="h-4 w-4 ml-auto text-gray-300" />
            </div>
          </CardContent>
        </Card>

        {/* 임원 — director (level 3) 이상 */}
        <Card
          className={`transition-all ${roleLevel >= 3 ? 'hover:shadow-lg cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
          onClick={() => roleLevel >= 3 && navigate('/manual/executive')}
        >
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="rounded-lg bg-amber-100 p-2.5">
                <Crown className="h-5 w-5 text-amber-600" />
              </div>
              <Badge variant={roleLevel >= 3 ? 'warning' : 'default'}>
                {roleLevel >= 3 ? '임원 이상' : '권한 필요'}
              </Badge>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">임원 매뉴얼</h3>
            <p className="text-sm text-gray-600 mb-4">
              임원 대시보드, AI 평가 리포트, 조직도, 긴급 업무 등 의사결정 메뉴.
            </p>
            <div className="flex items-center text-sm text-gray-500">
              <span>준비 중 · 다음 사이클</span>
              <ArrowRight className="h-4 w-4 ml-auto text-gray-300" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 안내 */}
      <Card className="bg-brand-50/50 border-brand-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3 text-sm text-brand-900">
            <Sparkles />
            <div>
              <p className="font-semibold mb-1">💡 매뉴얼 활용 팁</p>
              <ul className="space-y-1 text-xs text-brand-800">
                <li>· 챕터를 시작하면 실제 화면으로 자동 이동합니다</li>
                <li>· 화면에 강조된 영역을 보면서 단계별로 따라하세요</li>
                <li>· 언제든 <kbd className="px-1.5 py-0.5 bg-white border border-brand-300 rounded text-[10px]">Esc</kbd> 키로 종료할 수 있습니다</li>
                <li>· 모르는 기능은 매뉴얼을 통해 직접 익히고 활용해보세요</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Sparkles() {
  return (
    <svg className="h-5 w-5 text-brand-500 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.5 5L19 9.5l-5.5 1.5L12 16l-1.5-5L5 9.5l5.5-1.5z" />
    </svg>
  )
}
