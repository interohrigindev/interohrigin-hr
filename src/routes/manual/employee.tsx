/**
 * /manual/employee — 직원 기본 매뉴얼 챕터 목록
 */
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Play, Clock, Home, FileText, Calendar, PenSquare, Stamp, MessageCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EMPLOYEE_CHAPTERS } from '@/lib/manual/chapters'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Home, FileText, Calendar, PenSquare, Stamp, MessageCircle,
}

export default function ManualEmployee() {
  const navigate = useNavigate()

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/manual')}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
          aria-label="뒤로"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">직원 기본 매뉴얼</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            아래 챕터를 클릭하면 실제 화면으로 이동해서 단계별 안내가 시작됩니다.
          </p>
        </div>
        <Badge variant="success">{EMPLOYEE_CHAPTERS.length}개 챕터</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {EMPLOYEE_CHAPTERS.map((chapter, idx) => {
          const Icon = ICON_MAP[chapter.icon] ?? Home
          return (
            <Card
              key={chapter.id}
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => navigate(`/manual/tour/${chapter.id}`)}
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-3 mb-3">
                  <div className="rounded-lg bg-brand-100 p-2.5 shrink-0">
                    <Icon className="h-5 w-5 text-brand-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs text-gray-400 font-medium">CHAPTER {idx + 1}</span>
                    </div>
                    <h3 className="text-base font-bold text-gray-900">{chapter.title}</h3>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-4 line-clamp-2">{chapter.description}</p>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    약 {chapter.estimatedMinutes}분
                  </span>
                  <span>{chapter.steps.length}단계</span>
                  <Button size="sm" variant="outline">
                    <Play className="h-3.5 w-3.5 mr-1" /> 시작
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
