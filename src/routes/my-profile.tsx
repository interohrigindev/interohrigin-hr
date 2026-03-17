import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { ROLE_LABELS } from '@/lib/constants'
import type { EmployeeRole } from '@/types/database'
import { User, Save, Lock } from 'lucide-react'

const MBTI_OPTIONS = [
  '','ISTJ','ISFJ','INFJ','INTJ','ISTP','ISFP','INFP','INTP',
  'ESTP','ESFP','ENFP','ENTP','ESTJ','ESFJ','ENFJ','ENTJ',
].map(v => ({ value: v, label: v || '선택 안 함' }))

const BLOOD_TYPE_OPTIONS = [
  { value: '', label: '선택 안 함' },
  { value: 'A', label: 'A형' },
  { value: 'B', label: 'B형' },
  { value: 'O', label: 'O형' },
  { value: 'AB', label: 'AB형' },
]

export default function MyProfile() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)

  // 직원 기본 정보 (본인 수정 가능 필드)
  const [form, setForm] = useState({
    phone: '',
    address: '',
    birth_date: '',
    emergency_contact: '',
  })

  // employee_profiles 정보
  const [profileForm, setProfileForm] = useState({
    mbti: '',
    blood_type: '',
    hanja_name: '',
    birth_time: '',
    lunar_birth: false,
  })

  // 비밀번호 변경
  const [pwForm, setPwForm] = useState({
    newPassword: '',
    confirmPassword: '',
  })

  // 회사가 입력한 읽기 전용 정보
  const [readOnly, setReadOnly] = useState({
    name: '',
    email: '',
    employee_number: '',
    department: '',
    role: '',
    position: '',
    hire_date: '',
  })

  useEffect(() => {
    if (!profile) return
    async function load() {
      // employees 테이블
      const { data: emp } = await supabase
        .from('employees')
        .select('*, department:departments(name)')
        .eq('id', profile!.id)
        .single()

      if (emp) {
        setForm({
          phone: emp.phone || '',
          address: emp.address || '',
          birth_date: emp.birth_date || '',
          emergency_contact: emp.emergency_contact || '',
        })
        setReadOnly({
          name: emp.name || '',
          email: emp.email || '',
          employee_number: emp.employee_number || '',
          department: (emp as any).department?.name || '미지정',
          role: ROLE_LABELS[emp.role as EmployeeRole] || emp.role,
          position: emp.position || '',
          hire_date: emp.hire_date || '',
        })
      }

      // employee_profiles 테이블
      const { data: ep } = await supabase
        .from('employee_profiles')
        .select('*')
        .eq('employee_id', profile!.id)
        .limit(1)
        .single()

      if (ep) {
        setProfileForm({
          mbti: ep.mbti || '',
          blood_type: ep.blood_type || '',
          hanja_name: ep.hanja_name || '',
          birth_time: ep.birth_time || '',
          lunar_birth: ep.lunar_birth || false,
        })
      }
    }
    load()
  }, [profile])

  async function handleSave() {
    if (!profile) return
    setSaving(true)

    // employees 업데이트
    const { error: empErr } = await supabase
      .from('employees')
      .update({
        phone: form.phone || null,
        address: form.address || null,
        birth_date: form.birth_date || null,
        emergency_contact: form.emergency_contact || null,
      })
      .eq('id', profile.id)

    if (empErr) {
      toast('저장 실패: ' + empErr.message, 'error')
      setSaving(false)
      return
    }

    // employee_profiles upsert
    const { error: epErr } = await supabase
      .from('employee_profiles')
      .upsert({
        employee_id: profile.id,
        mbti: profileForm.mbti || null,
        blood_type: profileForm.blood_type || null,
        hanja_name: profileForm.hanja_name || null,
        birth_time: profileForm.birth_time || null,
        lunar_birth: profileForm.lunar_birth,
        birth_date: form.birth_date || null,
      }, { onConflict: 'employee_id' })

    if (epErr) {
      toast('프로필 저장 실패: ' + epErr.message, 'error')
    } else {
      toast('내 정보가 저장되었습니다.', 'success')
    }
    setSaving(false)
  }

  async function handlePasswordChange() {
    if (pwForm.newPassword.length < 6) {
      toast('비밀번호는 6자 이상이어야 합니다.', 'error')
      return
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      toast('비밀번호가 일치하지 않습니다.', 'error')
      return
    }

    setPasswordSaving(true)
    const { error } = await supabase.auth.updateUser({ password: pwForm.newPassword })
    if (error) {
      toast('비밀번호 변경 실패: ' + error.message, 'error')
    } else {
      toast('비밀번호가 변경되었습니다.', 'success')
      setPwForm({ newPassword: '', confirmPassword: '' })
    }
    setPasswordSaving(false)
  }

  if (!profile) return null

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <User className="h-6 w-6 text-brand-600" />
        <h1 className="text-2xl font-bold text-gray-900">내 정보</h1>
      </div>

      {/* 회사 등록 정보 (읽기 전용) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">기본 정보 (회사 등록)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500 text-xs mb-0.5">이름</p>
              <p className="font-medium text-gray-900">{readOnly.name}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-0.5">이메일</p>
              <p className="font-medium text-gray-900">{readOnly.email}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-0.5">사원번호</p>
              <p className="font-medium text-gray-900">{readOnly.employee_number || '-'}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-0.5">부서</p>
              <p className="font-medium text-gray-900">{readOnly.department}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-0.5">역할</p>
              <Badge variant="primary">{readOnly.role}</Badge>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-0.5">직급</p>
              <p className="font-medium text-gray-900">{readOnly.position || '-'}</p>
            </div>
            {readOnly.hire_date && (
              <div>
                <p className="text-gray-500 text-xs mb-0.5">입사일</p>
                <p className="font-medium text-gray-900">{readOnly.hire_date}</p>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-4">
            위 정보는 관리자만 수정할 수 있습니다. 변경이 필요하면 관리자에게 문의하세요.
          </p>
        </CardContent>
      </Card>

      {/* 개인 정보 (본인 수정 가능) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">개인 정보 (직접 수정 가능)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="연락처"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              placeholder="010-0000-0000"
            />
            <Input
              label="생년월일"
              type="date"
              value={form.birth_date}
              onChange={(e) => setForm((p) => ({ ...p, birth_date: e.target.value }))}
            />
          </div>

          <Input
            label="주소"
            value={form.address}
            onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
            placeholder="서울특별시 강남구..."
          />

          <Input
            label="비상연락처"
            value={form.emergency_contact}
            onChange={(e) => setForm((p) => ({ ...p, emergency_contact: e.target.value }))}
            placeholder="관계: 배우자, 010-0000-0000"
          />

          <div className="grid grid-cols-3 gap-4">
            <Select
              label="MBTI"
              value={profileForm.mbti}
              onChange={(e) => setProfileForm((p) => ({ ...p, mbti: e.target.value }))}
              options={MBTI_OPTIONS}
            />
            <Select
              label="혈액형"
              value={profileForm.blood_type}
              onChange={(e) => setProfileForm((p) => ({ ...p, blood_type: e.target.value }))}
              options={BLOOD_TYPE_OPTIONS}
            />
            <Input
              label="한자이름"
              value={profileForm.hanja_name}
              onChange={(e) => setProfileForm((p) => ({ ...p, hanja_name: e.target.value }))}
              placeholder="洪吉東"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="출생시간 (선택)"
              type="time"
              value={profileForm.birth_time}
              onChange={(e) => setProfileForm((p) => ({ ...p, birth_time: e.target.value }))}
            />
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={profileForm.lunar_birth}
                  onChange={(e) => setProfileForm((p) => ({ ...p, lunar_birth: e.target.checked }))}
                  className="rounded text-brand-600"
                />
                <span className="text-sm text-gray-700">음력 생일</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-1" />
              {saving ? '저장 중...' : '정보 저장'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 비밀번호 변경 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4" /> 비밀번호 변경
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="새 비밀번호"
            type="password"
            value={pwForm.newPassword}
            onChange={(e) => setPwForm((p) => ({ ...p, newPassword: e.target.value }))}
            placeholder="6자 이상"
            autoComplete="new-password"
          />
          <Input
            label="비밀번호 확인"
            type="password"
            value={pwForm.confirmPassword}
            onChange={(e) => setPwForm((p) => ({ ...p, confirmPassword: e.target.value }))}
            placeholder="비밀번호를 다시 입력"
            autoComplete="new-password"
          />
          <div className="flex justify-end">
            <Button variant="outline" onClick={handlePasswordChange} disabled={passwordSaving}>
              {passwordSaving ? '변경 중...' : '비밀번호 변경'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
