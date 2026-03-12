#!/usr/bin/env node
/**
 * 인터오리진 HR 테스트 계정 생성 스크립트
 *
 * 사용법:
 *   SUPABASE_SERVICE_ROLE_KEY=your_key node scripts/create-test-accounts.mjs
 *
 * service_role key는 Supabase Dashboard > Settings > API > service_role 에서 확인
 *
 * 4역할 구조: employee / leader / director / ceo
 * 공통 비밀번호: Test1234!
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://jlgdbofwlmhjayyjtyxv.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY 환경변수를 설정해주세요.\n')
  console.error('사용법:')
  console.error('  SUPABASE_SERVICE_ROLE_KEY=your_key node scripts/create-test-accounts.mjs\n')
  console.error('service_role key 확인:')
  console.error('  Supabase Dashboard > Settings > API > service_role (secret)')
  process.exit(1)
}

// service_role key는 RLS를 우회하고 admin API 사용 가능
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const PASSWORD = 'Test1234!'

const TEST_ACCOUNTS = [
  { email: 'test-employee@interohrigin.com', name: '테스트 직원',     role: 'employee' },
  { email: 'test-leader@interohrigin.com',   name: '테스트 리더',     role: 'leader' },
  { email: 'test-director@interohrigin.com', name: '테스트 이사',     role: 'director' },
  { email: 'test-ceo@interohrigin.com',      name: '테스트 대표이사', role: 'ceo' },
]

async function main() {
  console.log('=== 인터오리진 HR 테스트 계정 생성 ===\n')

  // 1. 부서 조회
  const { data: depts } = await supabase
    .from('departments')
    .select('id, name')
    .order('name')
    .limit(1)

  const departmentId = depts?.[0]?.id ?? null
  console.log(departmentId ? `부서: ${depts[0].name}` : '부서: 없음 (미지정)')

  // 2. 평가 기간 조회
  const { data: periods } = await supabase
    .from('evaluation_periods')
    .select('id, year, quarter')
    .eq('status', 'in_progress')
    .limit(1)

  const periodId = periods?.[0]?.id ?? null
  if (periodId) {
    console.log(`평가 기간: ${periods[0].year}년 ${periods[0].quarter}분기`)
  }
  console.log('')

  // 3. 계정 생성
  const results = []

  for (const account of TEST_ACCOUNTS) {
    process.stdout.write(`[${account.role.padEnd(10)}] ${account.name} ... `)

    // 3-1. Admin API로 사용자 생성 (이메일 확인 건너뜀, rate limit 없음)
    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      email: account.email,
      password: PASSWORD,
      email_confirm: true,
    })

    if (userError) {
      if (userError.message.includes('already been registered')) {
        console.log('이미 존재 (스킵)')
        results.push({ ...account, status: 'exists' })
      } else {
        console.log(`실패: ${userError.message}`)
        results.push({ ...account, status: 'failed' })
      }
      continue
    }

    const userId = userData.user.id

    // 3-2. employees 테이블에 등록
    const { error: empError } = await supabase.from('employees').insert({
      id: userId,
      email: account.email,
      name: account.name,
      department_id: departmentId,
      role: account.role,
    })

    if (empError) {
      console.log(`Auth OK, employees 실패: ${empError.message}`)
      results.push({ ...account, status: 'partial' })
      continue
    }

    // 3-3. 평가 대상 등록 (employee/leader만)
    if (periodId && (account.role === 'employee' || account.role === 'leader')) {
      await supabase.from('evaluation_targets').insert({
        period_id: periodId,
        employee_id: userId,
        status: 'pending',
      })
    }

    console.log('완료')
    results.push({ ...account, status: 'created' })
  }

  // 4. 결과 요약
  console.log('\n=== 로그인 정보 ===\n')
  console.log('┌────────────┬──────────────────────────────────────────┬────────────┐')
  console.log('│ 역할       │ 이메일                                   │ 비밀번호   │')
  console.log('├────────────┼──────────────────────────────────────────┼────────────┤')
  for (const acc of TEST_ACCOUNTS) {
    const r = acc.role.padEnd(10)
    const e = acc.email.padEnd(40)
    console.log(`│ ${r} │ ${e} │ ${PASSWORD} │`)
  }
  console.log('└────────────┴──────────────────────────────────────────┴────────────┘')
  console.log(`\n자기평가 테스트: test-employee@interohrigin.com / ${PASSWORD}`)
  console.log(`관리자 테스트:   test-director@interohrigin.com / ${PASSWORD}`)
}

main().catch(console.error)
