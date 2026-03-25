import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { generateAIContent, getAIConfigForFeature, buildEvalReportPrompt, type AIConfig, type EvalReportData } from '@/lib/ai-client'
import { ROLE_LABELS } from '@/lib/constants'

interface AIReportRow {
  id: string
  target_id: string
  period_id: string
  employee_id: string
  provider: string
  model: string
  report_content: string
  report_type: string
  created_at: string
}

export function useAIReport(
  targetId: string | null,
  periodId: string | null,
  employeeId: string | null,
  reportData: EvalReportData | null
) {
  const [aiConfig, setAiConfig] = useState<AIConfig | null>(null)
  const [existingReport, setExistingReport] = useState<AIReportRow | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [configLoading, setConfigLoading] = useState(true)

  // Load active AI config
  useEffect(() => {
    async function loadConfig() {
      const config = await getAIConfigForFeature('evaluation_report')
      if (config) {
        setAiConfig(config)
      }
      setConfigLoading(false)
    }
    loadConfig()
  }, [])

  // Load existing report
  useEffect(() => {
    if (!targetId) return
    async function loadReport() {
      const { data } = await supabase
        .from('ai_reports')
        .select('*')
        .eq('target_id', targetId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      setExistingReport(data as AIReportRow | null)
    }
    loadReport()
  }, [targetId])

  const generate = useCallback(async () => {
    if (!aiConfig || !reportData || !targetId || !periodId || !employeeId) {
      setError('AI 설정 또는 평가 데이터가 없습니다')
      return
    }

    setGenerating(true)
    setError(null)

    try {
      const prompt = buildEvalReportPrompt(reportData)
      const result = await generateAIContent(aiConfig, prompt)

      // Save to DB
      const { data: saved, error: saveErr } = await supabase
        .from('ai_reports')
        .insert({
          target_id: targetId,
          period_id: periodId,
          employee_id: employeeId,
          provider: result.provider,
          model: result.model,
          report_content: result.content,
          report_type: 'individual',
          module: 'hr',
        })
        .select()
        .single()

      if (saveErr) {
        // Even if save fails, show the report
        setExistingReport({
          id: '',
          target_id: targetId,
          period_id: periodId,
          employee_id: employeeId,
          provider: result.provider,
          model: result.model,
          report_content: result.content,
          report_type: 'individual',
          created_at: new Date().toISOString(),
        })
      } else {
        setExistingReport(saved as AIReportRow)
      }
    } catch (err: any) {
      setError(err.message || 'AI 리포트 생성 실패')
    } finally {
      setGenerating(false)
    }
  }, [aiConfig, reportData, targetId, periodId, employeeId])

  return {
    aiConfig,
    existingReport,
    generating,
    error,
    configLoading,
    generate,
    hasAIConfig: !!aiConfig,
  }
}

/**
 * Build EvalReportData from report page data
 */
export function buildReportData(
  employeeName: string,
  departmentName: string | null,
  role: string,
  periodLabel: string,
  items: { id: string; name: string }[],
  selfEvals: { item_id: string; score: number | null }[],
  allScores: { item_id: string; evaluator_role: string; score: number | null }[],
  allComments: { evaluator_role: string; strength?: string | null; improvement?: string | null; overall?: string | null }[],
  finalScore: number | null,
  grade: string | null,
  deptRank: { rank: number; total: number } | null
): EvalReportData {
  return {
    employeeName,
    departmentName,
    role: ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role,
    periodLabel,
    selfScores: items.map((item) => ({
      itemName: item.name,
      score: selfEvals.find((se) => se.item_id === item.id)?.score ?? null,
    })),
    leaderScores: items.map((item) => ({
      itemName: item.name,
      score: allScores.find((s) => s.item_id === item.id && s.evaluator_role === 'leader')?.score ?? null,
    })),
    directorScores: items.map((item) => ({
      itemName: item.name,
      score: allScores.find((s) => s.item_id === item.id && s.evaluator_role === 'director')?.score ?? null,
    })),
    ceoScores: items.map((item) => ({
      itemName: item.name,
      score: allScores.find((s) => s.item_id === item.id && s.evaluator_role === 'ceo')?.score ?? null,
    })),
    finalScore,
    grade,
    comments: allComments.map((c) => ({
      role: ROLE_LABELS[c.evaluator_role as keyof typeof ROLE_LABELS] ?? c.evaluator_role,
      strength: c.strength ?? undefined,
      improvement: c.improvement ?? undefined,
      overall: c.overall ?? undefined,
    })),
    deptRank: deptRank ?? undefined,
  }
}
