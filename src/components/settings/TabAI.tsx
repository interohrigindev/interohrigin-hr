import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { validateApiKey, GEMINI_MODELS, OPENAI_MODELS, CLAUDE_MODELS, DEEPGRAM_MODELS } from '@/lib/ai-client'
import { Bot, Key, CheckCircle, XCircle, Plus, Trash2, Settings2, Sparkles } from 'lucide-react'

interface AISettingsRow {
  id: string
  provider: 'gemini' | 'openai' | 'claude' | 'deepgram'
  api_key: string
  model: string
  is_active: boolean
  module: string
  created_at: string
  updated_at: string
}

interface AIFeatureSettingRow {
  id: string
  feature_key: string
  feature_label: string
  ai_setting_id: string | null
  created_at: string
  updated_at: string
}

// 기능별 추천 AI 엔진
const RECOMMENDED_PROVIDER: Record<string, 'gemini' | 'openai' | 'claude' | 'deepgram'> = {
  resume_analysis: 'gemini',
  comprehensive_analysis: 'gemini',
  survey_generation: 'gemini',
  schedule_optimization: 'gemini',
  job_posting_ai: 'gemini',
  interview_transcription: 'gemini',
  meeting_stt: 'deepgram',
  evaluation_report: 'gemini',
  personality_analysis: 'gemini',
  employee_profile_ai: 'gemini',
  ojt_mission: 'gemini',
  probation_eval: 'gemini',
  work_chat: 'claude',
  daily_report: 'gemini',
  exit_analysis: 'gemini',
  messenger_ai: 'claude',
  ai_agent: 'claude',
}

const PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  claude: 'Claude',
  deepgram: 'Deepgram',
}

const PROVIDER_COLORS: Record<string, string> = {
  gemini: 'bg-blue-100 text-blue-700',
  openai: 'bg-green-100 text-green-700',
  claude: 'bg-purple-100 text-purple-700',
  deepgram: 'bg-teal-100 text-teal-700',
}

export default function TabAI() {
  const { toast } = useToast()
  const [settings, setSettings] = useState<AISettingsRow[]>([])
  const [featureSettings, setFeatureSettings] = useState<AIFeatureSettingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingFeatures, setSavingFeatures] = useState(false)

  // Add/edit form
  const [provider, setProvider] = useState<'gemini' | 'openai' | 'claude' | 'deepgram'>('gemini')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(GEMINI_MODELS[0].value)
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<{ valid: boolean; error?: string } | null>(null)

  const fetchSettings = useCallback(async () => {
    const [settingsRes, featuresRes] = await Promise.all([
      supabase.from('ai_settings').select('*').eq('module', 'hr').order('created_at', { ascending: false }),
      supabase.from('ai_feature_settings').select('*').order('feature_key'),
    ])

    setSettings((settingsRes.data as AISettingsRow[] | null) ?? [])
    setFeatureSettings((featuresRes.data as AIFeatureSettingRow[] | null) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // Update model list when provider changes
  useEffect(() => {
    const models = provider === 'gemini' ? GEMINI_MODELS : provider === 'claude' ? CLAUDE_MODELS : provider === 'deepgram' ? DEEPGRAM_MODELS : OPENAI_MODELS
    setModel(models[0].value)
    setValidationResult(null)
  }, [provider])

  async function handleValidate() {
    if (!apiKey.trim()) {
      toast('API 키를 입력해주세요', 'error')
      return
    }
    setValidating(true)
    setValidationResult(null)

    const result = await validateApiKey({ provider, apiKey, model })
    setValidationResult(result)
    setValidating(false)

    if (result.valid) {
      toast('API 키 검증 성공', 'success')
    } else {
      toast('API 키 검증 실패: ' + (result.error ?? ''), 'error')
    }
  }

  async function handleSave() {
    if (!apiKey.trim()) {
      toast('API 키를 입력해주세요', 'error')
      return
    }
    setSaving(true)

    // 같은 provider의 기존 설정만 비활성화 (다른 provider는 그대로 유지)
    await supabase
      .from('ai_settings')
      .update({ is_active: false })
      .eq('module', 'hr')
      .eq('provider', provider)

    const { error } = await supabase
      .from('ai_settings')
      .insert({
        provider,
        api_key: apiKey,
        model,
        is_active: true,
        module: 'hr',
      })

    if (error) {
      toast('저장 실패: ' + error.message, 'error')
    } else {
      toast('AI 설정이 저장되었습니다')
      setApiKey('')
      setValidationResult(null)
      fetchSettings()
    }
    setSaving(false)
  }

  async function handleToggleActive(id: string) {
    const target = settings.find((s) => s.id === id)
    if (!target) return

    const newActive = !target.is_active

    // 같은 provider 내에서 다른 설정이 있으면 비활성화 (동일 provider 중복 방지)
    if (newActive) {
      await supabase.from('ai_settings').update({ is_active: false }).eq('module', 'hr').eq('provider', target.provider)
    }

    const { error } = await supabase.from('ai_settings').update({ is_active: newActive }).eq('id', id)
    if (error) {
      toast('변경 실패: ' + error.message, 'error')
    } else {
      toast(newActive ? '활성화되었습니다' : '비활성화되었습니다')
      fetchSettings()
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('이 AI 설정을 삭제하시겠습니까?')) return
    const { error } = await supabase.from('ai_settings').delete().eq('id', id)
    if (error) {
      toast('삭제 실패: ' + error.message, 'error')
    } else {
      toast('AI 설정이 삭제되었습니다')
      fetchSettings()
    }
  }

  async function handleFeatureAIChange(featureId: string, aiSettingId: string) {
    const val = aiSettingId === '' ? null : aiSettingId
    setFeatureSettings((prev) =>
      prev.map((f) => (f.id === featureId ? { ...f, ai_setting_id: val } : f))
    )
    const { error } = await supabase
      .from('ai_feature_settings')
      .update({ ai_setting_id: val })
      .eq('id', featureId)
    if (error) toast('변경 실패: ' + error.message, 'error')
  }

  async function handleAutoAssignRecommended() {
    setSavingFeatures(true)
    let updated = 0
    for (const fs of featureSettings) {
      const recommended = RECOMMENDED_PROVIDER[fs.feature_key]
      if (!recommended) continue
      const matchingSetting = settings.find((s) => s.provider === recommended)
      if (matchingSetting) {
        const { error } = await supabase
          .from('ai_feature_settings')
          .update({ ai_setting_id: matchingSetting.id })
          .eq('id', fs.id)
        if (!error) updated++
      }
    }
    toast(`${updated}개 기능에 추천 AI 엔진이 배정되었습니다.`, 'success')
    await fetchSettings()
    setSavingFeatures(false)
  }

  async function handleClearAllAssignments() {
    if (!confirm('모든 기능별 AI 배정을 초기화하시겠습니까?\n초기화 후 모든 기능이 기본 활성 설정을 사용합니다.')) return
    setSavingFeatures(true)
    await supabase
      .from('ai_feature_settings')
      .update({ ai_setting_id: null })
      .neq('feature_key', '')
    toast('모든 기능별 배정이 초기화되었습니다.')
    await fetchSettings()
    setSavingFeatures(false)
  }

  function maskApiKey(key: string): string {
    if (key.length <= 8) return '••••••••'
    return key.slice(0, 4) + '••••' + key.slice(-4)
  }

  if (loading) return <PageSpinner />

  const modelOptions = provider === 'gemini' ? GEMINI_MODELS : provider === 'claude' ? CLAUDE_MODELS : provider === 'deepgram' ? DEEPGRAM_MODELS : OPENAI_MODELS

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">AI 분석 리포트 생성을 위한 API 설정을 관리합니다.</p>

      {/* ─── 새 설정 추가 ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-gray-400" />
            <CardTitle>AI Provider 설정</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select
              id="ai-provider"
              label="Provider"
              options={[
                { value: 'gemini', label: 'Google Gemini' },
                { value: 'openai', label: 'OpenAI' },
                { value: 'claude', label: 'Anthropic Claude' },
                { value: 'deepgram', label: 'Deepgram (STT)' },
              ]}
              value={provider}
              onChange={(e) => setProvider(e.target.value as 'gemini' | 'openai' | 'claude' | 'deepgram')}
            />
            <Select
              id="ai-model"
              label="모델"
              options={modelOptions}
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>
          <div>
            <Input
              id="ai-apikey"
              label="API 키"
              type="password"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setValidationResult(null) }}
              placeholder={provider === 'gemini' ? 'AIza...' : provider === 'claude' ? 'sk-ant-...' : provider === 'deepgram' ? 'Deepgram API Key' : 'sk-...'}
            />
            {validationResult && (
              <div className={`mt-1.5 flex items-center gap-1.5 text-xs ${validationResult.valid ? 'text-emerald-600' : 'text-red-600'}`}>
                {validationResult.valid ? (
                  <><CheckCircle className="h-3.5 w-3.5" /> 검증 성공</>
                ) : (
                  <><XCircle className="h-3.5 w-3.5" /> {validationResult.error}</>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleValidate} disabled={validating || !apiKey.trim()}>
              <Key className="h-3.5 w-3.5 mr-1" />
              {validating ? '검증 중...' : 'API 키 검증'}
            </Button>
            <Button onClick={handleSave} disabled={saving || !apiKey.trim()}>
              {saving ? '저장 중...' : '저장 및 활성화'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ─── 기존 설정 목록 ──────────────────────────────────── */}
      {settings.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-gray-400" />
              <CardTitle>등록된 AI 설정</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {settings.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {s.provider === 'gemini' ? 'Google Gemini' : s.provider === 'claude' ? 'Anthropic Claude' : s.provider === 'deepgram' ? 'Deepgram (STT)' : 'OpenAI'}
                        </span>
                        <Badge variant={s.is_active ? 'success' : 'default'}>
                          {s.is_active ? '활성' : '비활성'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-gray-500">모델: {s.model}</span>
                        <span className="text-xs text-gray-400">키: {maskApiKey(s.api_key)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* 토글 스위치 */}
                    <button
                      onClick={() => handleToggleActive(s.id)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${s.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`}
                      title={s.is_active ? '비활성화' : '활성화'}
                    >
                      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${s.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      title="삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      {/* ─── 기능별 AI 엔진 배정 ────────────────────────────── */}
      {featureSettings.length > 0 && settings.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-gray-400" />
                <CardTitle>기능별 AI 엔진 배정</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={handleClearAllAssignments} disabled={savingFeatures}>
                  초기화
                </Button>
                <Button size="sm" onClick={handleAutoAssignRecommended} disabled={savingFeatures}>
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  {savingFeatures ? '배정 중...' : '추천 자동배정'}
                </Button>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              각 기능에 최적화된 AI 엔진을 선택하세요. "기본 설정 사용"은 위에서 활성화된 엔진을 사용합니다.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {featureSettings.map((fs) => {
                const currentSetting = settings.find((s) => s.id === fs.ai_setting_id)
                const recommended = RECOMMENDED_PROVIDER[fs.feature_key]
                const recommendedSetting = settings.find((s) => s.provider === recommended)
                const isRecommended = currentSetting?.provider === recommended

                return (
                  <div key={fs.id} className="flex items-center justify-between px-6 py-3 gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 truncate">{fs.feature_label}</span>
                        {recommended && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            isRecommended ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            추천: {PROVIDER_LABELS[recommended]}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {currentSetting && (
                        <Badge variant="default" className={PROVIDER_COLORS[currentSetting.provider] || ''}>
                          {PROVIDER_LABELS[currentSetting.provider]} — {currentSetting.model}
                        </Badge>
                      )}
                      <select
                        className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none"
                        value={fs.ai_setting_id || ''}
                        onChange={(e) => handleFeatureAIChange(fs.id, e.target.value)}
                      >
                        <option value="">기본 설정 사용</option>
                        {settings.map((s) => (
                          <option key={s.id} value={s.id}>
                            {PROVIDER_LABELS[s.provider] || s.provider} — {s.model}
                            {recommendedSetting?.id === s.id ? ' ⭐' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {featureSettings.length > 0 && settings.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-gray-400">AI Provider를 먼저 등록하면 기능별 엔진 배정이 가능합니다.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
