import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { validateApiKey, GEMINI_MODELS, OPENAI_MODELS, CLAUDE_MODELS } from '@/lib/ai-client'
import { Bot, Key, CheckCircle, XCircle, Plus, Trash2 } from 'lucide-react'

interface AISettingsRow {
  id: string
  provider: 'gemini' | 'openai' | 'claude'
  api_key: string
  model: string
  is_active: boolean
  module: string
  created_at: string
  updated_at: string
}

export default function TabAI() {
  const { toast } = useToast()
  const [settings, setSettings] = useState<AISettingsRow[]>([])
  const [loading, setLoading] = useState(true)

  // Add/edit form
  const [provider, setProvider] = useState<'gemini' | 'openai' | 'claude'>('gemini')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(GEMINI_MODELS[0].value)
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<{ valid: boolean; error?: string } | null>(null)

  const fetchSettings = useCallback(async () => {
    const { data } = await supabase
      .from('ai_settings')
      .select('*')
      .eq('module', 'hr')
      .order('created_at', { ascending: false })

    setSettings((data as AISettingsRow[] | null) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // Update model list when provider changes
  useEffect(() => {
    const models = provider === 'gemini' ? GEMINI_MODELS : provider === 'claude' ? CLAUDE_MODELS : OPENAI_MODELS
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

    // Deactivate existing settings for this module
    await supabase
      .from('ai_settings')
      .update({ is_active: false })
      .eq('module', 'hr')

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

  async function handleSetActive(id: string) {
    // Deactivate all, then activate the selected one
    await supabase.from('ai_settings').update({ is_active: false }).eq('module', 'hr')
    const { error } = await supabase.from('ai_settings').update({ is_active: true }).eq('id', id)
    if (error) {
      toast('활성화 실패: ' + error.message, 'error')
    } else {
      toast('활성 설정이 변경되었습니다')
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

  function maskApiKey(key: string): string {
    if (key.length <= 8) return '••••••••'
    return key.slice(0, 4) + '••••' + key.slice(-4)
  }

  if (loading) return <PageSpinner />

  const modelOptions = provider === 'gemini' ? GEMINI_MODELS : provider === 'claude' ? CLAUDE_MODELS : OPENAI_MODELS

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
              ]}
              value={provider}
              onChange={(e) => setProvider(e.target.value as 'gemini' | 'openai' | 'claude')}
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
              placeholder={provider === 'gemini' ? 'AIza...' : provider === 'claude' ? 'sk-ant-...' : 'sk-...'}
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
                          {s.provider === 'gemini' ? 'Google Gemini' : s.provider === 'claude' ? 'Anthropic Claude' : 'OpenAI'}
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
                  <div className="flex items-center gap-2">
                    {!s.is_active && (
                      <Button size="sm" variant="outline" onClick={() => handleSetActive(s.id)}>
                        활성화
                      </Button>
                    )}
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
    </div>
  )
}
