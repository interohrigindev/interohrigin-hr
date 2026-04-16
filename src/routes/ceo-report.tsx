import { useState, useEffect } from 'react'
import {
  Users, Briefcase, TrendingUp, AlertCircle, Clock,
  Mic, RefreshCw, FileDown, Link, Folder, ArrowRight,
  Sparkles, Loader2,
} from 'lucide-react'
import { generateCEOBriefing, type CEOBriefingData } from '@/lib/ai-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

interface ReportData {
  totalEmployees: number
  probationEmployees: { id: string; name: string; position: string | null; hire_date: string | null }[]
  activePostings: number
  candidateCount: number
  candidatesByStatus: Record<string, number>
  projectStats: Record<string, number>
  recentMeetings: { title: string; status: string; duration_min: number | null; date: string }[]
  probationEvals: any[]
  projects: { id: string; project_name: string; status: string; priority: number; stages: any[] }[]
  allCandidates: { status: string; job_posting_id: string | null; name: string }[]
  allPostings: { id: string; title: string; status: string }[]
}

const SIGNAL_CONFIG = {
  green: { label: '우수', color: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  yellow: { label: '보통', color: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' },
  red: { label: '주의', color: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50' },
  black: { label: '위험', color: 'bg-gray-800', text: 'text-gray-700', bg: 'bg-gray-100' },
}

function formatMarkdown(md: string): string {
  return md
    .replace(/^## (.+)$/gm, '<h3 class="text-base font-bold text-gray-900 mt-5 mb-2 pb-1 border-b border-gray-200">$1</h3>')
    .replace(/^### (.+)$/gm, '<h4 class="text-sm font-bold text-gray-800 mt-3 mb-1">$1</h4>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 text-sm text-gray-700 py-0.5">• $1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 text-sm text-gray-700 py-0.5"><span class="font-semibold text-brand-600">$1.</span> $2</li>')
    .replace(/\n\n/g, '<br/>')
}

function formatAnalysisSection(md: string, sectionTitle: string): string {
  const regex = new RegExp(`## ${sectionTitle}\\n([\\s\\S]*?)(?=\\n## |$)`)
  const match = md.match(regex)
  return match ? formatMarkdown(match[1].trim()) : ''
}

export default function CEOReport() {
  const { hasRole } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ReportData | null>(null)
  const [signals, setSignals] = useState<any[]>([])
  const [aiAnalysis, setAiAnalysis] = useState('')
  const [aiAnalyzing, setAiAnalyzing] = useState(false)

  // CEO 또는 admin만 접근
  const canAccess = hasRole('ceo') || hasRole('admin')

  useEffect(() => {
    if (canAccess) fetchReport()
  }, [canAccess])

  // localStorage에서 오늘자 AI 분석 캐시 복원
  useEffect(() => {
    const todayKey = new Date().toISOString().slice(0, 10)
    const cached = localStorage.getItem(`ceo-ai-analysis-${todayKey}`)
    if (cached) setAiAnalysis(cached)
  }, [])

  async function fetchReport() {
    setLoading(true)
    try {
      const [empRes, probRes, postRes, candRes, projRes, meetRes] = await Promise.all([
        supabase.from('employees').select('id, name, role, position, department_id, employment_type, hire_date').eq('is_active', true),
        supabase.from('probation_evaluations').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('job_postings').select('id, title, status'),
        supabase.from('candidates').select('id, status, job_posting_id, name').order('created_at', { ascending: false }).limit(200),
        supabase.from('project_boards').select('id, project_name, status, priority, pipeline_stages(id, stage_name, status, deadline)').order('created_at', { ascending: false }).limit(20),
        supabase.from('meeting_records').select('id, title, status, duration_seconds, created_at').order('created_at', { ascending: false }).limit(5),
      ])

      const employees = empRes.data || []
      const probationEmps = employees.filter((e) => e.employment_type === 'probation' || (e.position ?? '').includes('수습'))

      const allProjects = (projRes.data || []).map((p: any) => ({
        id: p.id,
        project_name: p.project_name,
        status: p.status,
        priority: p.priority ?? 0,
        stages: p.pipeline_stages || [],
      }))

      const projectStats: Record<string, number> = {}
      for (const p of allProjects) {
        projectStats[p.status] = (projectStats[p.status] || 0) + 1
      }

      const allCandidates = (candRes.data || []).map((c: any) => ({
        status: c.status,
        job_posting_id: c.job_posting_id,
        name: c.name,
      }))

      const candidatesByStatus: Record<string, number> = {}
      for (const c of allCandidates) {
        candidatesByStatus[c.status] = (candidatesByStatus[c.status] || 0) + 1
      }

      const allPostings = (postRes.data || []).map((p: any) => ({
        id: p.id,
        title: p.title,
        status: p.status,
      }))

      setData({
        totalEmployees: employees.length,
        probationEmployees: probationEmps,
        activePostings: allPostings.filter((p) => p.status === 'published').length,
        candidateCount: allCandidates.length,
        candidatesByStatus,
        projectStats,
        recentMeetings: (meetRes.data || []).map((m: any) => ({
          title: m.title,
          status: m.status,
          duration_min: m.duration_seconds ? Math.round(m.duration_seconds / 60) : null,
          date: m.created_at,
        })),
        probationEvals: probRes.data || [],
        projects: allProjects,
        allCandidates,
        allPostings,
      })

      // 신호등 간이 계산
      const sigs = employees.map((emp) => {
        const evals = (probRes.data || []).filter((e: any) => e.employee_id === emp.id)
        const scores = evals.map((e: any) => {
          const s = e.scores || {}
          return Object.values(s).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0)
        })
        const avg = scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : null

        let signal: keyof typeof SIGNAL_CONFIG = 'yellow'
        if (avg !== null) {
          if (avg >= 80) signal = 'green'
          else if (avg >= 60) signal = 'yellow'
          else if (avg >= 40) signal = 'red'
          else signal = 'black'
        }

        return { ...emp, signal, avgScore: avg ? Math.round(avg) : null, evalCount: evals.length }
      })
      setSignals(sigs)
    } catch (err) {
      console.error('CEO Report fetch error:', err)
    }
    setLoading(false)
  }

  async function handlePrintPdf() {
    if (!data) return
    try {
      const { default: jsPDF } = await import('jspdf')
      const { registerKoreanFonts } = await import('@/lib/pdf-fonts')
      const pdf = new jsPDF()
      registerKoreanFonts(pdf)
      const fontFamily = 'NotoSansKR'
      const pageWidth = pdf.internal.pageSize.getWidth()
      const margin = 20
      let y = 25

      // 제목
      pdf.setFont(fontFamily, 'bold')
      pdf.setFontSize(18)
      pdf.text('CEO 경영 리포트', pageWidth / 2, y, { align: 'center' })
      y += 8
      pdf.setFontSize(10)
      pdf.setFont(fontFamily, 'normal')
      pdf.setTextColor(128, 128, 128)
      pdf.text(`인터오리진 | ${today}`, pageWidth / 2, y, { align: 'center' })
      pdf.setTextColor(0, 0, 0)
      y += 12

      // KPI 카드 데이터
      const kpis = [
        `전체 직원: ${data.totalEmployees}명`,
        `수습: ${data.probationEmployees.length}명`,
        `진행 공고: ${data.activePostings}건`,
        `지원자: ${data.candidateCount}명`,
        `프로젝트: ${data.projects.length}건`,
      ]
      pdf.setFontSize(10)
      pdf.setFont(fontFamily, 'normal')
      pdf.text(kpis.join('  |  '), pageWidth / 2, y, { align: 'center' })
      y += 10

      pdf.setDrawColor(200, 200, 200)
      pdf.line(margin, y, pageWidth - margin, y)
      y += 8

      // AI 분석 결과
      if (aiAnalysis) {
        pdf.setFont(fontFamily, 'bold')
        pdf.setFontSize(13)
        pdf.text('AI 경영 분석', margin, y)
        y += 8

        pdf.setFont(fontFamily, 'normal')
        pdf.setFontSize(9)
        // 마크다운 제거 후 줄바꿈 처리
        const plainText = aiAnalysis
          .replace(/#{1,4}\s/g, '')
          .replace(/\*\*/g, '')
          .replace(/\*/g, '')
          .replace(/- /g, '• ')
        const lines = pdf.splitTextToSize(plainText, pageWidth - margin * 2)
        for (const line of lines) {
          if (y > 275) { pdf.addPage(); y = 20 }
          pdf.text(line, margin, y)
          y += 4.5
        }
      }

      // 프로젝트 현황
      if (data.projects.length > 0) {
        if (y > 250) { pdf.addPage(); y = 20 }
        y += 5
        pdf.setFont(fontFamily, 'bold')
        pdf.setFontSize(13)
        pdf.text('프로젝트 현황', margin, y)
        y += 8
        pdf.setFont(fontFamily, 'normal')
        pdf.setFontSize(9)
        for (const p of data.projects.slice(0, 15)) {
          if (y > 275) { pdf.addPage(); y = 20 }
          const stagesDone = p.stages?.filter((s: any) => s.status === 'completed').length || 0
          const stagesTotal = p.stages?.length || 0
          const pct = stagesTotal > 0 ? Math.round((stagesDone / stagesTotal) * 100) : 0
          pdf.text(`• ${p.project_name} — ${p.status} (${pct}% 완료)`, margin + 2, y)
          y += 5
        }
      }

      pdf.save(`CEO_리포트_${today.replace(/\./g, '')}.pdf`)
      toast('PDF가 다운로드되었습니다.', 'success')
    } catch (err) {
      console.error('PDF 생성 실패:', err)
      // 폴백: 브라우저 인쇄
      window.print()
    }
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href)
    toast('링크가 복사되었습니다.', 'success')
  }

  async function handleGenerateAnalysis() {
    if (!data || aiAnalyzing) return
    setAiAnalyzing(true)
    try {
      const todayStr = new Date().toISOString().slice(0, 10)

      // 신호등 집계
      const sigCounts = {
        green: signals.filter((s) => s.signal === 'green').length,
        yellow: signals.filter((s) => s.signal === 'yellow').length,
        red: signals.filter((s) => s.signal === 'red').length,
        black: signals.filter((s) => s.signal === 'black').length,
        riskNames: signals.filter((s) => s.signal === 'red' || s.signal === 'black').map((s) => s.name),
      }

      // 프로젝트 + 지연 단계
      const todayDate = new Date()
      const projectsForAI = data.projects.map((p) => ({
        name: p.project_name,
        status: p.status,
        priority: p.priority,
        delayedStages: (p.stages || [])
          .filter((s: any) => s.deadline && new Date(s.deadline) < todayDate && s.status !== '완료')
          .map((s: any) => `${s.stage_name} (마감: ${s.deadline})`),
      }))

      // 수습직원 + 평가 점수
      const probationForAI = data.probationEmployees.map((emp) => {
        const evals = data.probationEvals.filter((e: any) => e.employee_id === emp.id)
        const evalScores = evals.map((e: any) => {
          const s = e.scores || {}
          const total = Object.values(s).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0)
          const count = Object.keys(s).length || 1
          return { stage: e.stage || e.eval_type || '평가', avg: Math.round(total / count), recommendation: e.recommendation || '' }
        })
        return { name: emp.name, hireDate: emp.hire_date || '', scores: evalScores }
      })

      // 회의 기록에서 결정사항/액션아이템 가져오기
      let recentDecisions: string[] = []
      let recentActionItems: string[] = []
      try {
        const { data: meetingData } = await supabase
          .from('meeting_records')
          .select('decisions, action_items')
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(5)
        for (const m of (meetingData || [])) {
          if (Array.isArray(m.decisions)) recentDecisions.push(...m.decisions)
          if (Array.isArray(m.action_items)) recentActionItems.push(...m.action_items)
        }
      } catch { /* 회의 기록 없으면 무시 */ }

      const s = data.candidatesByStatus
      const briefingData: CEOBriefingData = {
        date: todayStr,
        totalEmployees: data.totalEmployees,
        signals: sigCounts,
        projects: projectsForAI,
        probation: probationForAI,
        pipeline: {
          applied: s['applied'] || 0,
          screening: (s['resume_reviewed'] || 0) + (s['survey_sent'] || 0) + (s['survey_done'] || 0),
          interview: (s['interview_scheduled'] || 0) + (s['video_done'] || 0) + (s['face_to_face_scheduled'] || 0) + (s['face_to_face_done'] || 0),
          hired: s['hired'] || 0,
          totalPostings: data.allPostings.length,
        },
        recentDecisions: recentDecisions.slice(0, 10),
        recentActionItems: recentActionItems.slice(0, 10),
      }

      const result = await generateCEOBriefing(briefingData)
      setAiAnalysis(result)
      localStorage.setItem(`ceo-ai-analysis-${todayStr}`, result)
      toast('AI 경영 분석이 완료되었습니다.', 'success')
    } catch (err) {
      console.error('AI 분석 오류:', err)
      toast('AI 분석 중 오류가 발생했습니다.', 'error')
    }
    setAiAnalyzing(false)
  }

  if (!canAccess) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
          <p className="text-gray-500">CEO 또는 관리자만 접근할 수 있습니다.</p>
        </div>
      </div>
    )
  }

  if (loading) return <PageSpinner />

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
  const signalCounts = {
    green: signals.filter((s) => s.signal === 'green').length,
    yellow: signals.filter((s) => s.signal === 'yellow').length,
    red: signals.filter((s) => s.signal === 'red').length,
    black: signals.filter((s) => s.signal === 'black').length,
  }

  // 채용 파이프라인 집계
  const pipeline = data ? (() => {
    const s = data.candidatesByStatus
    return [
      { label: '지원', count: s['applied'] || 0, color: 'bg-gray-400' },
      { label: '서류/설문', count: (s['resume_reviewed'] || 0) + (s['survey_sent'] || 0) + (s['survey_done'] || 0), color: 'bg-blue-400' },
      { label: '면접', count: (s['interview_scheduled'] || 0) + (s['video_done'] || 0) + (s['face_to_face_scheduled'] || 0) + (s['face_to_face_done'] || 0), color: 'bg-amber-400' },
      { label: '합격', count: s['hired'] || 0, color: 'bg-emerald-500' },
    ]
  })() : []
  const pipelineMax = Math.max(...pipeline.map((p) => p.count), 1)

  // 프로젝트 상태 라벨
  const PROJECT_STATUS_MAP: Record<string, { label: string; color: string }> = {
    active: { label: '진행중', color: 'text-blue-600' },
    completed: { label: '완료', color: 'text-emerald-600' },
    holding: { label: '보류', color: 'text-amber-600' },
    cancelled: { label: '취소', color: 'text-red-500' },
  }

  return (
    <div className="space-y-4 ceo-report-container">
      {/* 프린트용 스타일 */}
      <style>{`
        @media print {
          nav, aside, header, .sidebar, [data-print-hide] { display: none !important; }
          .ceo-report-container { padding: 0; }
          @page { size: A4; margin: 15mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CEO 리포트</h1>
          <p className="text-sm text-gray-500 mt-1">{today}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2" data-print-hide>
          <Button size="sm" onClick={handleGenerateAnalysis} disabled={aiAnalyzing || !data}>
            {aiAnalyzing ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> 분석 중...</> : <><Sparkles className="h-3.5 w-3.5 mr-1" /> <span className="hidden sm:inline">AI 경영 </span>분석</>}
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrintPdf}>
            <FileDown className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">PDF 다운로드</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopyLink}>
            <Link className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">링크 복사</span>
          </Button>
          <Button variant="outline" size="sm" onClick={fetchReport}>
            <RefreshCw className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">새로고침</span>
          </Button>
        </div>
      </div>

      {/* AI 핵심 요약 */}
      {aiAnalysis && (
        <Card className="border-brand-200 bg-gradient-to-r from-brand-50 to-purple-50">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-5 w-5 text-brand-600" />
              <span className="text-sm font-bold text-brand-700">AI 핵심 요약</span>
            </div>
            <div className="text-sm text-gray-800 leading-relaxed" dangerouslySetInnerHTML={{ __html: formatAnalysisSection(aiAnalysis, '핵심 요약') }} />
          </CardContent>
        </Card>
      )}

      {/* 핵심 지표 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center">
                <Users className="h-4 w-4 text-violet-600" />
              </div>
              <div>
                <p className="text-[11px] text-gray-500">전체 직원</p>
                <p className="text-xl font-bold text-gray-900">{data?.totalEmployees}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
                <Clock className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-[11px] text-gray-500">수습 직원</p>
                <p className="text-xl font-bold text-amber-600">{data?.probationEmployees.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                <Briefcase className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-[11px] text-gray-500">채용 공고</p>
                <p className="text-xl font-bold text-blue-600">{data?.activePostings}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-[11px] text-gray-500">지원자</p>
                <p className="text-xl font-bold text-emerald-600">{data?.candidateCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 핵심 지표 row: 직원 신호등 + 프로젝트 현황 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* 직원 신호등 (compact) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">직원 신호등</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-around">
              {(Object.entries(SIGNAL_CONFIG) as [keyof typeof SIGNAL_CONFIG, typeof SIGNAL_CONFIG[keyof typeof SIGNAL_CONFIG]][]).map(([key, cfg]) => (
                <div key={key} className="flex flex-col items-center gap-1">
                  <div className={`w-5 h-5 rounded-full ${cfg.color}`} />
                  <p className={`text-lg font-bold ${cfg.text}`}>{signalCounts[key]}</p>
                  <p className="text-[10px] text-gray-500">{cfg.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 프로젝트 현황 */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Folder className="h-4 w-4 text-gray-400" />
              <CardTitle className="text-sm">프로젝트 현황</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-around">
              {Object.entries(PROJECT_STATUS_MAP).map(([status, { label, color }]) => (
                <div key={status} className="flex flex-col items-center gap-1">
                  <p className={`text-lg font-bold ${color}`}>{data?.projectStats[status] || 0}</p>
                  <p className="text-[10px] text-gray-500">{label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 채용 파이프라인 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-gray-400" />
            <CardTitle className="text-sm">채용 파이프라인</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-1">
            {pipeline.map((step, i) => (
              <div key={step.label} className="flex items-center flex-1 min-w-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-600 truncate">{step.label}</span>
                    <span className="text-xs font-bold text-gray-800 ml-1">{step.count}</span>
                  </div>
                  <div className="h-6 bg-gray-100 rounded overflow-hidden">
                    <div
                      className={`h-full ${step.color} rounded transition-all`}
                      style={{ width: `${Math.max((step.count / pipelineMax) * 100, 4)}%` }}
                    />
                  </div>
                </div>
                {i < pipeline.length - 1 && (
                  <ArrowRight className="h-3.5 w-3.5 text-gray-300 mx-1 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* AI 경영 분석 리포트 */}
      {aiAnalysis && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-600" /> AI 경영 분석 리포트
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: formatMarkdown(aiAnalysis) }} />
          </CardContent>
        </Card>
      )}

      {/* 수습 직원 현황 */}
      {data && data.probationEmployees.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">수습 직원 현황</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.probationEmployees.map((emp) => {
                const hireDate = emp.hire_date ? new Date(emp.hire_date) : null
                const endDate = hireDate ? new Date(hireDate.getTime() + 90 * 24 * 60 * 60 * 1000) : null
                const daysLeft = endDate ? Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null
                const evals = data.probationEvals.filter((e) => e.employee_id === emp.id)

                return (
                  <div key={emp.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{emp.name}</p>
                      <p className="text-[11px] text-gray-500">
                        {hireDate?.toLocaleDateString('ko-KR')} 입사
                        {daysLeft !== null && ` · 수습 종료까지 ${daysLeft > 0 ? `${daysLeft}일` : '만료'}`}
                      </p>
                    </div>
                    <Badge variant={evals.length >= 3 ? 'success' : evals.length > 0 ? 'warning' : 'default'}>
                      {evals.length}회 평가
                    </Badge>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 최근 회의 */}
      {data && data.recentMeetings.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Mic className="h-4 w-4 text-gray-400" />
              <CardTitle className="text-sm">최근 회의</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.recentMeetings.map((m, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{m.title}</p>
                    <p className="text-[11px] text-gray-500">
                      {new Date(m.date).toLocaleDateString('ko-KR')}
                      {m.duration_min && ` · ${m.duration_min}분`}
                    </p>
                  </div>
                  <Badge variant={m.status === 'completed' ? 'success' : m.status === 'error' ? 'danger' : 'default'}>
                    {m.status === 'completed' ? '완료' : m.status === 'error' ? '오류' : m.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
