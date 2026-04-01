import { useState, useEffect } from 'react'
import { Database, Bot, Mail, Mic, TrendingUp, AlertTriangle, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { supabase } from '@/lib/supabase'

interface UsageStats {
  // DB에서 집계
  totalCandidates: number
  totalAnalyses: number
  totalInterviewAnalyses: number
  totalMeetings: number
  meetingMinutes: number
  totalEmails: number
  storageUsedMB: number
}

// 서비스별 과금 정보
const SERVICES = [
  {
    id: 'supabase',
    name: 'Supabase Pro',
    icon: Database,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    type: 'fixed' as const,
    monthlyCost: 25,
    unit: '월',
    description: 'PostgreSQL DB + Auth + Storage',
    includes: ['DB 8GB', 'Storage 100GB', 'Auth 무제한', 'Edge Functions'],
  },
  {
    id: 'claude_max',
    name: 'Claude Max Plan',
    icon: Bot,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    type: 'fixed' as const,
    monthlyCost: 100,
    unit: '월',
    description: '개발용 AI 구독 (HR + 전체 사이트)',
    includes: ['무제한 대화', 'Claude Code CLI', '전 프로젝트 공용'],
  },
  {
    id: 'gemini',
    name: 'Google Gemini API',
    icon: Bot,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    type: 'usage' as const,
    monthlyCost: 0,
    unit: '요청당',
    pricePerUnit: 0,
    description: 'AI 분석 (이력서, 면접, 종합 분석)',
    includes: ['무료 플랜 사용 중', '분당 15건 제한', '한도 초과 시 과금'],
    note: '현재 무료 한도 내 사용',
  },
  {
    id: 'whisper',
    name: 'OpenAI Whisper API',
    icon: Mic,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    type: 'usage' as const,
    monthlyCost: 0,
    unit: '분당',
    pricePerUnit: 0.006,
    description: '회의 녹음 음성→텍스트 변환 (STT)',
    includes: ['$0.006/분', '선결제 $50 차감 중', '전 사이트 공용'],
  },
  {
    id: 'openai',
    name: 'OpenAI API (GPT)',
    icon: Bot,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    type: 'usage' as const,
    monthlyCost: 0,
    unit: '토큰',
    pricePerUnit: 0,
    description: 'AI 에이전트, 챗봇 (선택적)',
    includes: ['선결제 $50 차감 중', '전 사이트 공용'],
    note: 'HR 외 다른 사이트도 공용 사용',
  },
  {
    id: 'claude_api',
    name: 'Claude API',
    icon: Bot,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    type: 'usage' as const,
    monthlyCost: 0,
    unit: '토큰',
    pricePerUnit: 0,
    description: 'AI 에이전트, 메신저 AI',
    includes: ['선결제 $55 차감 중', '전 사이트 공용'],
  },
  {
    id: 'workspace',
    name: 'Google Workspace',
    icon: Mail,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    type: 'fixed' as const,
    monthlyCost: 8.4,
    unit: '사용자/월',
    description: 'Gmail + Calendar + Meet + Drive',
    includes: ['이메일 발송', 'Meet 화상면접', 'Calendar 일정', 'Drive 녹화'],
    note: 'Business Starter 기준 $8.40/user/month (1계정)',
  },
]

export default function BillingDashboard() {
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  async function fetchStats() {
    setLoading(true)
    const [candRes, analysisRes, ivAnalysisRes, meetingRes, emailRes] = await Promise.all([
      supabase.from('candidates').select('id', { count: 'exact', head: true }),
      supabase.from('resume_analysis').select('id', { count: 'exact', head: true }),
      supabase.from('interview_analyses').select('id', { count: 'exact', head: true }),
      supabase.from('meeting_records').select('id, duration_seconds', { count: 'exact' }),
      // 이메일 발송 카운트 (hiring_decisions + candidates survey_sent 기준 추정)
      supabase.from('candidates').select('id', { count: 'exact', head: true }).neq('status', 'applied'),
    ])

    const meetings = meetingRes.data || []
    const meetingMinutes = meetings.reduce((sum: number, m: any) => sum + (m.duration_seconds || 0), 0) / 60

    setStats({
      totalCandidates: candRes.count || 0,
      totalAnalyses: (analysisRes.count || 0),
      totalInterviewAnalyses: ivAnalysisRes.count || 0,
      totalMeetings: meetingRes.count || 0,
      meetingMinutes: Math.round(meetingMinutes),
      totalEmails: emailRes.count || 0,
      storageUsedMB: 0, // Supabase Storage API로 조회 가능하지만 별도 구현 필요
    })
    setLoading(false)
  }

  if (loading) return <PageSpinner />

  const fixedCosts = SERVICES.filter((s) => s.type === 'fixed')
  const usageCosts = SERVICES.filter((s) => s.type === 'usage')
  const totalFixed = fixedCosts.reduce((sum, s) => sum + s.monthlyCost, 0)

  // 예상 종량제 비용
  const whisperCost = (stats?.meetingMinutes || 0) * 0.006
  const estimatedUsage = whisperCost // Gemini 무료, OpenAI/Claude는 선결제

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">비용 관리</h1>
          <p className="text-sm text-gray-500 mt-1">HR 플랫폼 운영에 필요한 서비스별 비용을 확인합니다.</p>
        </div>
        <Button variant="outline" onClick={fetchStats}>
          <RefreshCw className="h-4 w-4 mr-1" /> 새로고침
        </Button>
      </div>

      {/* 총 비용 요약 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="py-4 px-5">
            <p className="text-xs text-gray-500">월 고정 비용</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">${totalFixed.toFixed(0)}</p>
            <p className="text-[11px] text-gray-400 mt-1">Supabase + Claude Max + Workspace</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="py-4 px-5">
            <p className="text-xs text-gray-500">이번 달 종량제 (예상)</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">${estimatedUsage.toFixed(2)}</p>
            <p className="text-[11px] text-gray-400 mt-1">Whisper STT {stats?.meetingMinutes || 0}분</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="py-4 px-5">
            <p className="text-xs text-gray-500">월 총 예상 비용</p>
            <p className="text-3xl font-bold text-blue-600 mt-1">${(totalFixed + estimatedUsage).toFixed(0)}</p>
            <p className="text-[11px] text-gray-400 mt-1">≈ ₩{Math.round((totalFixed + estimatedUsage) * 1380).toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* 사용량 통계 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-brand-600" /> 이번 달 사용량
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-gray-900">{stats?.totalCandidates || 0}</p>
              <p className="text-xs text-gray-500 mt-1">총 지원자</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-gray-900">{(stats?.totalAnalyses || 0) + (stats?.totalInterviewAnalyses || 0)}</p>
              <p className="text-xs text-gray-500 mt-1">AI 분석 횟수</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-gray-900">{stats?.totalMeetings || 0}</p>
              <p className="text-xs text-gray-500 mt-1">회의 녹음</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-gray-900">{stats?.totalEmails || 0}</p>
              <p className="text-xs text-gray-500 mt-1">이메일 발송 (추정)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 고정 비용 서비스 */}
      <Card>
        <CardHeader>
          <CardTitle>고정 비용 서비스</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {fixedCosts.map((s) => (
            <div key={s.id} className={`flex items-start gap-4 p-4 rounded-lg ${s.bgColor}`}>
              <div className={`p-2 rounded-lg bg-white shadow-sm`}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-gray-900">{s.name}</p>
                  <p className="text-lg font-bold text-gray-900">${s.monthlyCost}/{s.unit}</p>
                </div>
                <p className="text-sm text-gray-600 mt-0.5">{s.description}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {s.includes.map((item, i) => (
                    <Badge key={i} variant="default" className="bg-white/80 text-gray-600 text-[10px]">{item}</Badge>
                  ))}
                </div>
                {s.note && (
                  <p className="text-[11px] text-gray-500 mt-1.5">{s.note}</p>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 종량제 서비스 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            종량제 서비스
            <Badge variant="default" className="bg-amber-100 text-amber-700 text-[10px]">사용량 기반</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {usageCosts.map((s) => (
            <div key={s.id} className={`flex items-start gap-4 p-4 rounded-lg ${s.bgColor}`}>
              <div className={`p-2 rounded-lg bg-white shadow-sm`}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-gray-900">{s.name}</p>
                  {s.id === 'whisper' && stats ? (
                    <p className="text-lg font-bold text-amber-600">${(stats.meetingMinutes * 0.006).toFixed(2)}</p>
                  ) : (
                    <p className="text-sm font-medium text-gray-500">선결제 차감 중</p>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-0.5">{s.description}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {s.includes.map((item, i) => (
                    <Badge key={i} variant="default" className="bg-white/80 text-gray-600 text-[10px]">{item}</Badge>
                  ))}
                </div>
                {s.note && (
                  <p className="text-[11px] text-amber-600 mt-1.5 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> {s.note}
                  </p>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 비용 절감 팁 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">비용 절감 팁</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-600">
          <p>• Gemini API 무료 플랜 한도(분당 15건)를 초과하지 않도록 대량 분석은 분산 실행</p>
          <p>• 회의 녹음은 1시간 단위로 분할하면 STT 비용 추적이 용이</p>
          <p>• 면접 녹화 파일은 14일 보관 후 자동 삭제 (Storage 용량 절감)</p>
          <p>• OpenAI/Claude API 선결제 잔액 소진 시 추가 충전 필요</p>
        </CardContent>
      </Card>
    </div>
  )
}
