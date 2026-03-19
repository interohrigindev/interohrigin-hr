/**
 * integration_settings 테이블 CRUD 훅
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface IntegrationSetting {
  id: string
  provider: 'slack' | 'notion' | 'naver_works'
  access_token: string
  workspace_name: string | null
  workspace_id: string | null
  is_active: boolean
  config: Record<string, any>
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

export function useIntegrationSettings() {
  const [settings, setSettings] = useState<Record<string, IntegrationSetting | null>>({
    slack: null,
    notion: null,
    naver_works: null,
  })
  const [loading, setLoading] = useState(true)

  const loadSettings = useCallback(async () => {
    const { data } = await supabase
      .from('integration_settings')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    const mapped: Record<string, IntegrationSetting | null> = {
      slack: null,
      notion: null,
      naver_works: null,
    }

    if (data) {
      for (const row of data as IntegrationSetting[]) {
        if (!mapped[row.provider]) {
          mapped[row.provider] = row
        }
      }
    }

    setSettings(mapped)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const saveSettings = useCallback(async (
    provider: 'slack' | 'notion' | 'naver_works',
    accessToken: string,
    workspaceName?: string,
    workspaceId?: string,
  ) => {
    // 기존 활성 설정 비활성화
    await supabase
      .from('integration_settings')
      .update({ is_active: false })
      .eq('provider', provider)
      .eq('is_active', true)

    const { data, error } = await supabase
      .from('integration_settings')
      .insert({
        provider,
        access_token: accessToken,
        workspace_name: workspaceName || null,
        workspace_id: workspaceId || null,
        is_active: true,
        config: {},
      })
      .select()
      .single()

    if (error) throw error

    setSettings((prev) => ({
      ...prev,
      [provider]: data as IntegrationSetting,
    }))

    return data as IntegrationSetting
  }, [])

  const deleteSettings = useCallback(async (id: string, provider: string) => {
    const { error } = await supabase
      .from('integration_settings')
      .delete()
      .eq('id', id)

    if (error) throw error

    setSettings((prev) => ({
      ...prev,
      [provider]: null,
    }))
  }, [])

  const updateLastSynced = useCallback(async (id: string, provider: string) => {
    const now = new Date().toISOString()
    await supabase
      .from('integration_settings')
      .update({ last_synced_at: now, updated_at: now })
      .eq('id', id)

    setSettings((prev) => {
      const existing = prev[provider]
      if (!existing) return prev
      return {
        ...prev,
        [provider]: { ...existing, last_synced_at: now, updated_at: now },
      }
    })
  }, [])

  return {
    settings,
    loading,
    loadSettings,
    saveSettings,
    deleteSettings,
    updateLastSynced,
  }
}
