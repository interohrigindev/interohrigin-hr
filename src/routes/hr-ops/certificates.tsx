import { useState, useEffect, useMemo } from 'react'
import {
  FileText, Download, Search, Plus,
  Award, Calendar, Printer,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Dialog } from '@/components/ui/Dialog'
import { PageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'

interface Employee {
  id: string
  name: string
  department_id: string | null
  position: string | null
  hire_date: string | null
}

interface Department {
  id: string
  name: string
}

interface Certificate {
  id: string
  employee_id: string
  certificate_type: string
  issued_at: string
  issued_data: Record<string, unknown> | null
  pdf_url: string | null
  created_at: string
}

const CERTIFICATE_TYPES: Record<string, string> = {
  employment: '재직증명서',
  career: '경력증명서',
  retirement: '퇴직증명서',
}

const CERTIFICATE_TYPE_COLORS: Record<string, string> = {
  employment: 'bg-blue-100 text-blue-700',
  career: 'bg-violet-100 text-violet-700',
  retirement: 'bg-amber-100 text-amber-700',
}

export default function CertificatesPage() {
  const { toast } = useToast()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState('')
  const [showIssueDialog, setShowIssueDialog] = useState(false)
  const [issuing, setIssuing] = useState(false)

  // 발급 폼
  const [issueEmployeeId, setIssueEmployeeId] = useState('')
  const [issueCertType, setIssueCertType] = useState('employment')
  const [issuePurpose, setIssuePurpose] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    const [empRes, deptRes, certRes] = await Promise.all([
      supabase.from('employees').select('id, name, department_id, position, hire_date').eq('is_active', true).order('name'),
      supabase.from('departments').select('id, name').order('name'),
      supabase.from('certificates').select('*').order('issued_at', { ascending: false }).limit(200),
    ])
    setEmployees((empRes.data || []) as Employee[])
    setDepartments((deptRes.data || []) as Department[])
    setCertificates((certRes.data || []) as Certificate[])
    setLoading(false)
  }

  const getDeptName = (deptId: string | null) => departments.find((d) => d.id === deptId)?.name || '-'
  const getEmpName = (empId: string) => employees.find((e) => e.id === empId)?.name || '-'
  const getEmpDept = (empId: string) => {
    const emp = employees.find((e) => e.id === empId)
    return emp ? getDeptName(emp.department_id) : '-'
  }

  // 필터링
  const filteredCertificates = useMemo(() => {
    let result = certificates
    if (filterType) result = result.filter((c) => c.certificate_type === filterType)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter((c) => getEmpName(c.employee_id).toLowerCase().includes(q))
    }
    return result
  }, [certificates, filterType, searchQuery, employees])

  // 통계
  const totalIssued = certificates.length
  const thisMonthIssued = useMemo(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()
    return certificates.filter((c) => {
      const d = new Date(c.issued_at)
      return d.getFullYear() === year && d.getMonth() === month
    }).length
  }, [certificates])

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { employment: 0, career: 0, retirement: 0 }
    certificates.forEach((c) => {
      if (counts[c.certificate_type] !== undefined) counts[c.certificate_type]++
    })
    return counts
  }, [certificates])

  // 증명서 발급
  async function handleIssueCertificate() {
    if (!issueEmployeeId) {
      toast('직원을 선택하세요', 'error')
      return
    }
    setIssuing(true)

    const emp = employees.find((e) => e.id === issueEmployeeId)
    const issuedData = {
      employee_name: emp?.name || '',
      department: emp ? getDeptName(emp.department_id) : '',
      position: emp?.position || '',
      hire_date: emp?.hire_date || '',
      purpose: issuePurpose || '제출용',
      certificate_type_label: CERTIFICATE_TYPES[issueCertType],
    }

    const { error } = await supabase.from('certificates').insert({
      employee_id: issueEmployeeId,
      certificate_type: issueCertType,
      issued_at: new Date().toISOString(),
      issued_data: issuedData,
    })
    setIssuing(false)

    if (error) {
      toast('발급 실패: ' + error.message, 'error')
      return
    }
    toast(`${CERTIFICATE_TYPES[issueCertType]} 발급이 완료되었습니다`, 'success')
    setShowIssueDialog(false)
    setIssueEmployeeId('')
    setIssueCertType('employment')
    setIssuePurpose('')
    fetchData()
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">증명서 발급</h1>
          <p className="text-sm text-gray-500 mt-0.5">재직증명서, 경력증명서 등을 발급·관리합니다</p>
        </div>
        <Button onClick={() => setShowIssueDialog(true)}>
          <Plus className="h-4 w-4 mr-1" /> 증명서 발급
        </Button>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-blue-500" />
              <span className="text-[11px] text-gray-500">총 발급 건수</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">{totalIssued}건</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="h-4 w-4 text-emerald-500" />
              <span className="text-[11px] text-gray-500">이번 달 발급</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{thisMonthIssued}건</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-violet-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Award className="h-4 w-4 text-violet-500" />
              <span className="text-[11px] text-gray-500">재직증명서</span>
            </div>
            <p className="text-2xl font-bold text-violet-600">{typeCounts.employment}건</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-amber-500" />
              <span className="text-[11px] text-gray-500">경력증명서</span>
            </div>
            <p className="text-2xl font-bold text-amber-600">{typeCounts.career}건</p>
          </CardContent>
        </Card>
      </div>

      {/* 필터 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="직원 검색..."
              className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-48 focus:outline-none focus:border-blue-400"
            />
          </div>
          <Select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            options={[
              { value: '', label: '전체 유형' },
              ...Object.entries(CERTIFICATE_TYPES).map(([k, v]) => ({ value: k, label: v })),
            ]}
          />
        </div>
      </div>

      {/* 발급 이력 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle>발급 이력</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  <th className="text-left py-3 px-4 font-medium text-gray-500 text-xs">직원</th>
                  <th className="text-left py-3 px-3 font-medium text-gray-500 text-xs">부서</th>
                  <th className="text-center py-3 px-3 font-medium text-gray-500 text-xs">증명서 유형</th>
                  <th className="text-left py-3 px-3 font-medium text-gray-500 text-xs">발급일</th>
                  <th className="text-left py-3 px-3 font-medium text-gray-500 text-xs">용도</th>
                  <th className="text-center py-3 px-3 font-medium text-gray-500 text-xs">관리</th>
                </tr>
              </thead>
              <tbody>
                {filteredCertificates.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-gray-400">발급 이력이 없습니다</td></tr>
                ) : (
                  filteredCertificates.map((cert) => (
                    <tr key={cert.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-700">
                            {getEmpName(cert.employee_id)[0]}
                          </div>
                          <span className="font-medium text-gray-900">{getEmpName(cert.employee_id)}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-gray-600">{getEmpDept(cert.employee_id)}</td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge className={`text-[10px] ${CERTIFICATE_TYPE_COLORS[cert.certificate_type] || 'bg-gray-100 text-gray-700'}`}>
                          {CERTIFICATE_TYPES[cert.certificate_type] || cert.certificate_type}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-gray-600">
                        {new Date(cert.issued_at).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-gray-500">
                        {(cert.issued_data as Record<string, unknown>)?.purpose as string || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex gap-1 justify-center">
                          <button
                            onClick={() => toast('PDF 다운로드 기능 준비중', 'info')}
                            className="px-2 py-1 text-[10px] font-medium bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                          >
                            <Download className="h-3 w-3 inline mr-0.5" />
                            PDF
                          </button>
                          <button
                            onClick={() => toast('인쇄 기능 준비중', 'info')}
                            className="px-2 py-1 text-[10px] font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                          >
                            <Printer className="h-3 w-3 inline mr-0.5" />
                            인쇄
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 증명서 발급 다이얼로그 */}
      <Dialog open={showIssueDialog} onClose={() => setShowIssueDialog(false)} title="증명서 발급" className="max-w-md">
        <div className="space-y-4">
          <Select
            label="직원 *"
            value={issueEmployeeId}
            onChange={(e) => setIssueEmployeeId(e.target.value)}
            options={[{ value: '', label: '선택하세요' }, ...employees.map((e) => ({ value: e.id, label: e.name }))]}
          />
          <Select
            label="증명서 유형 *"
            value={issueCertType}
            onChange={(e) => setIssueCertType(e.target.value)}
            options={Object.entries(CERTIFICATE_TYPES).map(([k, v]) => ({ value: k, label: v }))}
          />
          <Input
            label="용도 (선택)"
            value={issuePurpose}
            onChange={(e) => setIssuePurpose(e.target.value)}
            placeholder="예: 은행 제출용, 비자 신청용"
          />

          {/* 미리보기 */}
          {issueEmployeeId && (
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
              <p className="font-medium text-gray-700 text-sm mb-2">발급 정보 미리보기</p>
              {(() => {
                const emp = employees.find((e) => e.id === issueEmployeeId)
                if (!emp) return null
                return (
                  <>
                    <p>성명: <span className="font-medium text-gray-900">{emp.name}</span></p>
                    <p>부서: <span className="font-medium text-gray-900">{getDeptName(emp.department_id)}</span></p>
                    <p>직위: <span className="font-medium text-gray-900">{emp.position || '-'}</span></p>
                    <p>입사일: <span className="font-medium text-gray-900">{emp.hire_date || '-'}</span></p>
                    <p>증명서 유형: <span className="font-medium text-gray-900">{CERTIFICATE_TYPES[issueCertType]}</span></p>
                  </>
                )
              })()}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowIssueDialog(false)}>취소</Button>
            <Button onClick={handleIssueCertificate} disabled={issuing}>
              {issuing ? '발급중...' : '발급'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
