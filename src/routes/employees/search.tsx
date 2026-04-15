import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import type { Employee } from '@/types/database'

export default function EmployeeSearch() {
  const { toast } = useToast()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Employee[]>([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSearch() {
    const q = query.trim()
    if (!q) {
      toast('검색어를 입력해주세요', 'error')
      return
    }
    setLoading(true)
    setSearched(true)
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .ilike('name', `%${q}%`)
        .order('name')
        .limit(50)
      if (error) throw error
      setResults(data ?? [])
    } catch {
      toast('검색 실패', 'error')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSearch()
  }

  const roleLabels: Record<string, string> = {
    employee: '사원',
    leader: '팀장',
    director: '이사',
    division_head: '본부장',
    ceo: '대표',
    admin: '관리자',
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">통합 프로필 검색</h1>
      <p className="text-sm text-gray-500">
        직원 이름을 검색하면 모든 이력이 한 화면에 나옵니다.
      </p>

      {/* Search Bar */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-2">
            <Input
              className="flex-1 min-w-0"
              placeholder="직원 이름을 입력하세요"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <Button className="shrink-0" onClick={handleSearch} disabled={loading}>
              {loading ? '검색 중...' : '검색'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : searched && results.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-gray-500">검색 결과가 없습니다.</p>
          </CardContent>
        </Card>
      ) : results.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>검색 결과 ({results.length}명)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {results.map((emp) => (
                <div
                  key={emp.id}
                  className="flex cursor-pointer items-center justify-between rounded-lg border p-3 hover:bg-gray-50 transition-colors"
                  onClick={() => navigate(`/admin/employees/${emp.id}/profile`)}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-medium text-brand-700">
                      {emp.name.slice(0, 1)}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{emp.name}</p>
                      <p className="text-xs text-gray-500">{emp.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={emp.is_active ? 'success' : 'default'}>
                      {emp.is_active ? '재직' : '퇴직'}
                    </Badge>
                    <Badge variant="info">{roleLabels[emp.role] ?? emp.role}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
