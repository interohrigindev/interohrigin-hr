import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Types ───────────────────────────────────────────────────────

export type ImportSource = 'slack' | 'notion' | 'naver_works'

export interface ImportedRecord {
  id: string
  employee_name: string | null
  source: ImportSource
  content_type: string
  content: string
  original_date: string | null
  metadata: Record<string, any> | null
  ai_analyzed: boolean
  created_at: string
}

export interface ImportStats {
  total: number
  bySource: Record<string, number>
  byChannel: { name: string; count: number }[]
  byEmployee: { name: string; count: number }[]
}

// ─── Hook ────────────────────────────────────────────────────────

export function useImportedData() {
  const [records, setRecords] = useState<ImportedRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState<ImportSource | 'all'>('all')
  const [search, setSearch] = useState('')
  const [channel, setChannel] = useState('')
  const [employee, setEmployee] = useState('')
  const [dateRange, setDateRange] = useState({ from: '', to: '' })

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('imported_work_data')
        .select('*')
        .order('original_date', { ascending: false })
        .limit(500)

      if (source !== 'all') {
        query = query.eq('source', source)
      }

      if (search.trim()) {
        query = query.ilike('content', `%${search.trim()}%`)
      }

      if (employee.trim()) {
        query = query.ilike('employee_name', `%${employee.trim()}%`)
      }

      if (dateRange.from) {
        query = query.gte('original_date', dateRange.from)
      }
      if (dateRange.to) {
        query = query.lte('original_date', dateRange.to)
      }

      const { data, error } = await query

      if (error) throw error
      let filtered = (data || []) as ImportedRecord[]

      // Channel filter (from metadata)
      if (channel.trim()) {
        filtered = filtered.filter(r =>
          r.metadata?.channel_name?.toLowerCase().includes(channel.toLowerCase())
        )
      }

      setRecords(filtered)
    } catch (err) {
      console.error('외부 데이터 조회 실패:', err)
    } finally {
      setLoading(false)
    }
  }, [source, search, employee, channel, dateRange])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  // ─── Stats ─────────────────────────────────────────────────
  const stats: ImportStats = {
    total: records.length,
    bySource: records.reduce((acc, r) => {
      acc[r.source] = (acc[r.source] || 0) + 1
      return acc
    }, {} as Record<string, number>),
    byChannel: Object.entries(
      records
        .filter(r => r.metadata?.channel_name)
        .reduce((acc, r) => {
          const ch = r.metadata!.channel_name as string
          acc[ch] = (acc[ch] || 0) + 1
          return acc
        }, {} as Record<string, number>)
    )
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    byEmployee: Object.entries(
      records
        .filter(r => r.employee_name)
        .reduce((acc, r) => {
          acc[r.employee_name!] = (acc[r.employee_name!] || 0) + 1
          return acc
        }, {} as Record<string, number>)
    )
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  }

  return {
    records,
    loading,
    source,
    setSource,
    search,
    setSearch,
    channel,
    setChannel,
    employee,
    setEmployee,
    dateRange,
    setDateRange,
    stats,
    fetchRecords,
  }
}
