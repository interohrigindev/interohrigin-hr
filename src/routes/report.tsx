import React, { useState, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useReport } from '@/hooks/useReport'
import { useAIReport, buildReportData } from '@/hooks/useAIReport'
import { PageSpinner } from '@/components/ui/Spinner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { GradeBadge } from '@/components/evaluation/GradeBadge'
import { ROLE_LABELS, EVALUATION_TYPE_LABELS, EVALUATION_TYPE_COLORS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { ArrowLeft, Printer, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Award, AlertTriangle, Bot, RefreshCw, Sparkles, FileDown } from 'lucide-react'
import { generatePdfReport, type PdfReportInput } from '@/lib/pdf-report'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

// ─── Score cell color helper ────────────────────────────────────
function scoreCellClass(score: number | null): string {
  if (score == null) return ''
  if (score >= 8) return 'bg-blue-50 text-blue-700 font-medium'
  if (score <= 4) return 'bg-red-50 text-red-700 font-medium'
  return ''
}

// ─── Simple Markdown renderer ───────────────────────────────────
function renderMarkdown(text: string) {
  const lines = text.split('\n')
  const elements: React.ReactElement[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('## ')) {
      elements.push(<h3 key={i} className="text-base font-semibold text-gray-900 mt-4 mb-2">{line.slice(3)}</h3>)
    } else if (line.startsWith('### ')) {
      elements.push(<h4 key={i} className="text-sm font-semibold text-gray-800 mt-3 mb-1">{line.slice(4)}</h4>)
    } else if (line.startsWith('# ')) {
      elements.push(<h2 key={i} className="text-lg font-bold text-gray-900 mt-4 mb-2">{line.slice(2)}</h2>)
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <li key={i} className="text-sm text-gray-700 ml-4 list-disc">
          {renderInline(line.slice(2))}
        </li>
      )
    } else if (/^\d+\.\s/.test(line)) {
      const content = line.replace(/^\d+\.\s/, '')
      elements.push(
        <li key={i} className="text-sm text-gray-700 ml-4 list-decimal">
          {renderInline(content)}
        </li>
      )
    } else if (line.startsWith('---')) {
      elements.push(<hr key={i} className="my-3 border-gray-200" />)
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />)
    } else {
      elements.push(<p key={i} className="text-sm text-gray-700 leading-relaxed">{renderInline(line)}</p>)
    }
  }

  return <div className="space-y-0.5">{elements}</div>
}

function renderInline(text: string): string {
  // Simple bold handling for display — just strip ** markers
  return text.replace(/\*\*(.*?)\*\*/g, '$1')
}

export default function Report() {
  const { employeeId } = useParams<{ employeeId: string }>()
  const { profile, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const targetEmployeeId = employeeId ?? profile?.id
  const periodParam = searchParams.get('period')

  const {
    periods,
    selectedPeriod,
    employee,
    departmentName,
    target,
    categories,
    items,
    selfEvals,
    allScores,
    allComments,
    weights,
    summaryRow,
    itemComparisons,
    deptRank,
    quarterlyTrend,
    loading,
  } = useReport(targetEmployeeId, periodParam)

  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({})

  // Build AI report data
  const aiReportData = useMemo(() => {
    if (!employee || !selectedPeriod || !items.length) return null
    return buildReportData(
      employee.name,
      departmentName,
      employee.role,
      `${selectedPeriod.year}년 ${selectedPeriod.quarter}분기`,
      items.map((i) => ({ id: i.id, name: i.name })),
      selfEvals,
      allScores,
      allComments,
      target?.final_score ?? null,
      target?.grade ?? null,
      deptRank
    )
  }, [employee, selectedPeriod, items, selfEvals, allScores, allComments, target, departmentName, deptRank])

  const {
    existingReport,
    generating,
    error: aiError,
    generate: generateReport,
    hasAIConfig,
    configLoading,
  } = useAIReport(
    target?.id ?? null,
    selectedPeriod?.id ?? null,
    employee?.id ?? null,
    aiReportData
  )

  if (loading) return <PageSpinner />

  if (!selectedPeriod || !employee) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          뒤로가기
        </Button>
        <div className="flex h-64 flex-col items-center justify-center gap-2">
          <p className="text-lg font-medium text-gray-600">정보를 찾을 수 없습니다</p>
        </div>
      </div>
    )
  }

  // ─── Grouped items by category ────────────────────────────────
  const groupedItems = categories
    .map((cat) => ({
      category: cat,
      items: items.filter((item) => item.category_id === cat.id),
    }))
    .filter((g) => g.items.length > 0)

  // ─── Item score lookup ────────────────────────────────────────
  function getItemComparison(itemName: string) {
    return itemComparisons.find((ic) => ic.item_name === itemName)
  }

  function getSelfScore(itemId: string): number | null {
    return selfEvals.find((se) => se.item_id === itemId)?.score ?? null
  }

  function getEvalScore(itemId: string, role: string): number | null {
    return allScores.find((s) => s.item_id === itemId && s.evaluator_role === role)?.score ?? null
  }

  // ─── Weighted average per item ────────────────────────────────
  function getItemWeightedAvg(itemId: string): number | null {
    const selfScore = getSelfScore(itemId)
    const roles = ['leader', 'director', 'ceo'] as const
    const scoreMap: Record<string, number | null> = { self: selfScore }
    roles.forEach((r) => { scoreMap[r] = getEvalScore(itemId, r) })

    let weightedSum = 0
    let weightSum = 0
    for (const w of weights) {
      const s = scoreMap[w.evaluator_role]
      if (s != null) {
        weightedSum += s * w.weight
        weightSum += w.weight
      }
    }
    return weightSum > 0 ? Math.round((weightedSum / weightSum) * 10) / 10 : null
  }

  // ─── Strength / Improvement TOP3 ─────────────────────────────
  const itemScoreDetails = items.map((item) => {
    const avg = getItemWeightedAvg(item.id)
    return { item, avg }
  }).filter((d) => d.avg != null)

  const sorted = [...itemScoreDetails].sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0))
  const top3 = sorted.slice(0, 3)
  const bottom3 = sorted.slice(-3).reverse()

  // ─── PDF Download handler ─────────────────────────────────────
  async function handleDownloadPdf() {
    if (!employee || !selectedPeriod) return

    const pdfInput: PdfReportInput = {
      employee: {
        name: employee.name,
        role: ROLE_LABELS[employee.role] ?? employee.role,
      },
      departmentName: departmentName ?? null,
      period: { year: selectedPeriod.year, quarter: selectedPeriod.quarter },
      finalScore: target?.final_score ?? null,
      grade: target?.grade ?? null,
      deptRank: deptRank ?? null,
      weightFormula: weights
        .map((w) => {
          const label = w.evaluator_role === 'self' ? '자기' : ROLE_LABELS[w.evaluator_role as keyof typeof ROLE_LABELS] ?? w.evaluator_role
          return `${label}(${Math.round(w.weight * 100)}%)`
        })
        .join(' + '),
      groupedItems: categories
        .map((cat) => {
          const catItems = items.filter((item) => item.category_id === cat.id)
          return {
            categoryName: cat.name,
            weight: cat.weight,
            items: catItems.map((item) => ({
              name: item.name,
              selfScore: getSelfScore(item.id),
              leaderScore: getEvalScore(item.id, 'leader'),
              directorScore: getEvalScore(item.id, 'director'),
              ceoScore: getEvalScore(item.id, 'ceo'),
              weightedAvg: getItemWeightedAvg(item.id),
            })),
          }
        })
        .filter((g) => g.items.length > 0),
      top3: top3.map((d) => ({ name: d.item.name, score: d.avg! })),
      bottom3: bottom3.map((d) => ({ name: d.item.name, score: d.avg! })),
      comments: allComments
        .filter((c) => c.strength || c.improvement || c.overall)
        .map((c) => ({
          role: c.evaluator_role,
          roleLabel: ROLE_LABELS[c.evaluator_role as keyof typeof ROLE_LABELS] ?? c.evaluator_role,
          strength: c.strength,
          improvement: c.improvement,
          overall: c.overall,
        })),
      aiReport: existingReport
        ? {
            content: existingReport.report_content,
            provider: existingReport.provider,
            model: existingReport.model,
            createdAt: existingReport.created_at,
          }
        : null,
    }

    await generatePdfReport(pdfInput)
  }

  // ─── Weight formula display ───────────────────────────────────
  const weightFormula = weights
    .map((w) => {
      const label = w.evaluator_role === 'self' ? '자기' : ROLE_LABELS[w.evaluator_role as keyof typeof ROLE_LABELS] ?? w.evaluator_role
      return `${label}(${Math.round(w.weight * 100)}%)`
    })
    .join(' + ')

  // ─── Comment accordion toggle ─────────────────────────────────
  function toggleComment(role: string) {
    setExpandedComments((prev) => ({ ...prev, [role]: !prev[role] }))
  }

  // ─── Score table header cols ──────────────────────────────────
  const evalCols = [
    { key: 'self', label: '자기' },
    { key: 'leader', label: '리더' },
    { key: 'director', label: '이사' },
    { key: 'ceo', label: '대표' },
  ]

  function renderScoreTable(group: typeof groupedItems[number]) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left">
              <th className="sticky left-0 bg-white px-4 py-3 font-medium text-gray-500">항목</th>
              <th className="px-3 py-3 font-medium text-gray-500 text-center whitespace-nowrap">구분</th>
              {evalCols.map((col) => (
                <th key={col.key} className="px-3 py-3 font-medium text-gray-500 text-center whitespace-nowrap">
                  {col.label}
                </th>
              ))}
              <th className="px-3 py-3 font-medium text-gray-500 text-center whitespace-nowrap">가중평균</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {group.items.map((item) => {
              const ic = getItemComparison(item.name)
              const selfScore = ic?.self_score ?? getSelfScore(item.id)
              const leaderScore = ic?.leader_score ?? getEvalScore(item.id, 'leader')
              const directorScore = ic?.director_score ?? getEvalScore(item.id, 'director')
              const ceoScore = ic?.ceo_score ?? getEvalScore(item.id, 'ceo')
              const wAvg = getItemWeightedAvg(item.id)
              const scores = [selfScore, leaderScore, directorScore, ceoScore]

              return (
                <tr key={item.id} className="hover:bg-gray-50/50">
                  <td className="sticky left-0 bg-white px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                    {item.name}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {item.evaluation_type && (
                      <span className={cn('inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium', EVALUATION_TYPE_COLORS[item.evaluation_type])}>
                        {EVALUATION_TYPE_LABELS[item.evaluation_type]}
                      </span>
                    )}
                  </td>
                  {scores.map((s, idx) => (
                    <td key={idx} className={cn('px-3 py-3 text-center tabular-nums', scoreCellClass(s))}>
                      {s != null ? s : <span className="text-gray-300">&mdash;</span>}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-center tabular-nums font-semibold text-brand-600">
                    {wAvg != null ? wAvg : <span className="text-gray-300">&mdash;</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Navigation — hide in print */}
      <div className="flex items-center justify-between print:hidden">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          뒤로가기
        </Button>
        {periods.length > 1 && (
          <select
            value={selectedPeriod.id}
            onChange={(e) => navigate(`/report/${targetEmployeeId}?period=${e.target.value}`)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.year}년 {p.quarter}분기
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Print header — only visible in print */}
      <div className="hidden print:block print:mb-6">
        <h1 className="text-xl font-bold">인터오리진 인사평가 리포트</h1>
        <p className="text-sm text-gray-500">
          {selectedPeriod.year}년 {selectedPeriod.quarter}분기 · {employee.name} · {departmentName ?? ''}
        </p>
      </div>

      {/* ─── Section 1: 종합 결과 카드 ──────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>
            {employee.name} 종합 평가 결과
            <span className="ml-2 text-sm font-normal text-gray-500">
              {ROLE_LABELS[employee.role]} · {selectedPeriod.year}년 {selectedPeriod.quarter}분기
              {departmentName && ` · ${departmentName}`}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {target?.final_score != null ? (
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <p className="text-5xl font-extrabold text-gray-900 tabular-nums">
                    {target.final_score}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">최종 점수</p>
                </div>
                <GradeBadge grade={target.grade} showLabel className="text-xl px-5 py-2" />
              </div>
              <div className="space-y-2 text-sm">
                {weightFormula && (
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 shrink-0">산출 근거:</span>
                    <span className="text-gray-700">{weightFormula}</span>
                  </div>
                )}
                {deptRank && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">부서 내 순위:</span>
                    <Badge variant="primary">
                      {deptRank.rank}위 / {deptRank.total}명
                    </Badge>
                  </div>
                )}
                {summaryRow && (
                  <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                    {summaryRow.self_total != null && <span>자기: {summaryRow.self_total}</span>}
                    {summaryRow.leader_total != null && <span>리더: {summaryRow.leader_total}</span>}
                    {summaryRow.director_total != null && <span>이사: {summaryRow.director_total}</span>}
                    {summaryRow.ceo_total != null && <span>대표: {summaryRow.ceo_total}</span>}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">최종 점수가 아직 산출되지 않았습니다</p>
          )}
        </CardContent>
      </Card>

      {/* ─── Section 2 & 3: 카테고리별 점수 테이블 ──────────────── */}
      {groupedItems.map((group) => {
        const icon = group.category.name.includes('업적') ? '📊' : '📈'
        return (
          <Card key={group.category.id} className="print:break-inside-avoid">
            <CardHeader>
              <CardTitle>
                {icon} {group.category.name}
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({Math.round(group.category.weight * 100)}%)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {renderScoreTable(group)}
            </CardContent>
          </Card>
        )
      })}

      {/* ─── Section 4: 강점 TOP3 / 개선필요 TOP3 ───────────────── */}
      {itemScoreDetails.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 print:grid-cols-2 print:break-inside-avoid">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-500" />
                강점 TOP 3
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {top3.map((d, idx) => (
                <div key={d.item.id} className="flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Award className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm font-medium text-gray-900">
                      {idx + 1}. {d.item.name}
                    </span>
                  </div>
                  <Badge variant="success">{d.avg}점</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-red-500" />
                개선 필요 TOP 3
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {bottom3.map((d, idx) => (
                <div key={d.item.id} className="flex items-center justify-between rounded-lg bg-red-50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <span className="text-sm font-medium text-gray-900">
                      {idx + 1}. {d.item.name}
                    </span>
                  </div>
                  <Badge variant="danger">{d.avg}점</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Section 5: 분기별 추이 LineChart ───────────────────── */}
      {quarterlyTrend.some((q) => q.score != null) && (
        <Card className="print:break-inside-avoid">
          <CardHeader>
            <CardTitle>분기별 추이</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div className="min-w-[400px]">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={quarterlyTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value) => [`${value}점`]}
                      labelFormatter={(label) => `${label}`}
                    />
                    <ReferenceLine y={90} stroke="#9333ea" strokeDasharray="3 3" label={{ value: 'S', position: 'right', fill: '#9333ea', fontSize: 10 }} />
                    <ReferenceLine y={80} stroke="#2563eb" strokeDasharray="3 3" label={{ value: 'A', position: 'right', fill: '#2563eb', fontSize: 10 }} />
                    <ReferenceLine y={70} stroke="#16a34a" strokeDasharray="3 3" label={{ value: 'B', position: 'right', fill: '#16a34a', fontSize: 10 }} />
                    <ReferenceLine y={60} stroke="#ca8a04" strokeDasharray="3 3" label={{ value: 'C', position: 'right', fill: '#ca8a04', fontSize: 10 }} />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="#6B3FA0"
                      strokeWidth={2.5}
                      dot={{ fill: '#6B3FA0', r: 5 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Section 6: 평가자 코멘트 아코디언 ──────────────────── */}
      {allComments.length > 0 && (
        <Card className="print:break-inside-avoid">
          <CardHeader>
            <CardTitle>평가자 코멘트</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-0">
            {allComments.map((c) => {
              const role = c.evaluator_role
              const label = ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role
              const expanded = expandedComments[role] ?? false
              const hasContent = c.strength || c.improvement || c.overall
              if (!hasContent) return null

              return (
                <div key={c.id} className="border-b border-gray-100 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => toggleComment(role)}
                    className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-900">{label} 평가</span>
                    {expanded ? (
                      <ChevronUp className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                  {expanded && (
                    <div className="px-6 pb-4 space-y-3 text-sm print:block">
                      {c.strength && (
                        <div>
                          <p className="text-xs font-medium text-emerald-600 mb-1">▶ 강점</p>
                          <p className="text-gray-700 rounded-lg bg-gray-50 px-4 py-3">{c.strength}</p>
                        </div>
                      )}
                      {c.improvement && (
                        <div>
                          <p className="text-xs font-medium text-amber-600 mb-1">▶ 개선 필요</p>
                          <p className="text-gray-700 rounded-lg bg-gray-50 px-4 py-3">{c.improvement}</p>
                        </div>
                      )}
                      {c.overall && (
                        <div>
                          <p className="text-xs font-medium text-brand-600 mb-1">▶ 종합 평가</p>
                          <p className="text-gray-700 rounded-lg bg-gray-50 px-4 py-3">{c.overall}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* ─── Section 7: AI 분석 리포트 ────────────────────────────── */}
      {isAdmin && !configLoading && (
        <Card className="print:break-inside-avoid">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-500" />
                AI 분석 리포트
              </CardTitle>
              {existingReport && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">
                    {existingReport.provider === 'gemini' ? 'Gemini' : 'OpenAI'} · {existingReport.model}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={generateReport}
                    disabled={generating || !hasAIConfig}
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5 mr-1', generating && 'animate-spin')} />
                    재생성
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!hasAIConfig ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Bot className="h-10 w-10 text-gray-300 mb-3" />
                <p className="text-sm text-gray-500 mb-2">AI 설정이 필요합니다</p>
                <p className="text-xs text-gray-400 mb-4">설정 → AI 설정에서 API 키를 등록해주세요</p>
              </div>
            ) : existingReport ? (
              <div className="prose prose-sm max-w-none">
                {renderMarkdown(existingReport.report_content)}
                <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-400">
                  생성일: {new Date(existingReport.created_at).toLocaleString('ko-KR')}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Sparkles className="h-10 w-10 text-purple-300 mb-3" />
                <p className="text-sm text-gray-500 mb-4">AI가 평가 데이터를 분석하여 종합 리포트를 생성합니다</p>
                <Button onClick={generateReport} disabled={generating}>
                  <Bot className="h-4 w-4 mr-1.5" />
                  {generating ? 'AI 분석 중...' : 'AI 분석 생성'}
                </Button>
                {aiError && (
                  <p className="mt-3 text-xs text-red-500">{aiError}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Bottom: Actions ─────────────────────────────────────── */}
      <div className="flex items-center justify-between print:hidden">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          목록으로
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1" />
            인쇄
          </Button>
          <Button onClick={handleDownloadPdf}>
            <FileDown className="h-4 w-4 mr-1" />
            PDF 다운로드
          </Button>
        </div>
      </div>
    </div>
  )
}
