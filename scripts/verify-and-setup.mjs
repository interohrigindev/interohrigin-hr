import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://ckzbzumycmgkcpyhlclb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsZ2Rib2Z3bG1oamF5eWp0eXh2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE4MDk4MywiZXhwIjoyMDg3NzU2OTgzfQ.GUL2AqA0FzarDMTQzCSCZ6QlSmbYNvUie3Ja4hgG4Bg'
)

async function execSQL(sql) {
  const res = await fetch('https://ckzbzumycmgkcpyhlclb.supabase.co/rest/v1/rpc/exec_sql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsZ2Rib2Z3bG1oamF5eWp0eXh2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE4MDk4MywiZXhwIjoyMDg3NzU2OTgzfQ.GUL2AqA0FzarDMTQzCSCZ6QlSmbYNvUie3Ja4hgG4Bg',
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsZ2Rib2Z3bG1oamF5eWp0eXh2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE4MDk4MywiZXhwIjoyMDg3NzU2OTgzfQ.GUL2AqA0FzarDMTQzCSCZ6QlSmbYNvUie3Ja4hgG4Bg',
    },
    body: JSON.stringify({ query: sql }),
  })
  return await res.json()
}

console.log('=== 데이터 확인 & 초기 설정 ===\n')

// 1. 테이블별 건수 확인
const tables = ['employees','departments','evaluation_periods','ai_settings',
  'job_postings','candidates','projects','tasks','daily_reports']
for (const t of tables) {
  const { count } = await supabase.from(t).select('*', { count: 'exact', head: true })
  console.log(`${t}: ${count ?? 0}건`)
}

// 2. Storage 버킷 확인 및 생성
console.log('\n--- Storage 버킷 ---')
const { data: buckets } = await supabase.storage.listBuckets()
const bucketNames = (buckets || []).map(b => b.name)
console.log('기존 버킷:', bucketNames.join(', ') || '없음')

for (const name of ['resumes', 'interview-recordings']) {
  if (!bucketNames.includes(name)) {
    const { error } = await supabase.storage.createBucket(name, { public: false })
    if (error) console.log(`❌ ${name} 생성 실패: ${error.message}`)
    else console.log(`✅ ${name} 버킷 생성`)
  } else {
    console.log(`✅ ${name} 이미 존재`)
  }
}

// 3. 관리자 계정 확인
console.log('\n--- 관리자 계정 ---')
const { data: admins } = await supabase
  .from('employees')
  .select('id, name, email, role')
  .in('role', ['admin', 'ceo', 'executive', 'director'])
console.log('관리자급 계정:', admins?.length || 0, '명')
if (admins?.length) {
  admins.forEach(a => console.log(`  ${a.name} (${a.email}) - ${a.role}`))
}

// 4. 관리자 계정이 없으면 생성 안내
if (!admins?.length) {
  console.log('\n⚠ 관리자 계정이 없습니다.')
  console.log('  관리자 계정을 생성하려면:')
  console.log('  1. Supabase Auth에서 사용자 생성')
  console.log('  2. employees 테이블에 role="admin" 레코드 추가')

  // 테스트 관리자 계정 자동 생성 시도
  console.log('\n  테스트 관리자 계정 생성 시도...')
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email: 'admin@interohrigin.com',
    password: 'Admin1234!',
    email_confirm: true,
  })

  if (authErr) {
    if (authErr.message.includes('already')) {
      console.log('  ℹ admin@interohrigin.com 이미 존재')
      // 기존 사용자 찾기
      const { data: users } = await supabase.auth.admin.listUsers()
      const adminUser = users?.users?.find(u => u.email === 'admin@interohrigin.com')
      if (adminUser) {
        // employees에 추가
        const { error: empErr } = await supabase.from('employees').upsert({
          id: adminUser.id,
          name: '관리자',
          email: 'admin@interohrigin.com',
          role: 'admin',
          is_active: true,
        }, { onConflict: 'id' })
        if (empErr) console.log('  ⚠ employees 추가 실패:', empErr.message)
        else console.log('  ✅ employees에 관리자 추가/업데이트')
      }
    } else {
      console.log('  ❌ 생성 실패:', authErr.message)
    }
  } else if (authData?.user) {
    console.log('  ✅ Auth 사용자 생성:', authData.user.email)

    // employees에 추가
    const { error: empErr } = await supabase.from('employees').insert({
      id: authData.user.id,
      name: '관리자',
      email: 'admin@interohrigin.com',
      role: 'admin',
      is_active: true,
    })
    if (empErr) console.log('  ⚠ employees 추가 실패:', empErr.message)
    else console.log('  ✅ employees에 관리자 추가')
  }
}

// 5. 부서 시드 데이터 확인
console.log('\n--- 부서 데이터 ---')
const { data: depts } = await supabase.from('departments').select('*')
if (!depts?.length) {
  console.log('부서 데이터가 없습니다. 기본 부서 생성...')
  const { error } = await supabase.from('departments').insert([
    { name: '브랜드사업본부' },
    { name: '경영지원본부' },
    { name: '뉴미디어사업본부' },
    { name: 'IT사업본부' },
  ])
  if (error) console.log('❌ 부서 생성 실패:', error.message)
  else console.log('✅ 4개 부서 생성 완료')
} else {
  console.log(`✅ ${depts.length}개 부서 존재`)
  depts.forEach(d => console.log(`  - ${d.name}`))
}

// 6. 평가 기간 확인
const { data: periods } = await supabase.from('evaluation_periods').select('*')
if (!periods?.length) {
  console.log('\n평가 기간 생성...')
  await supabase.from('evaluation_periods').insert({
    year: 2026,
    quarter: 1,
    status: 'in_progress',
    start_date: '2026-01-01',
    end_date: '2026-03-31',
  })
  console.log('✅ 2026 Q1 평가 기간 생성')
}

console.log('\n=== 초기 설정 완료 ===')
console.log('\n로그인 정보:')
console.log('  이메일: admin@interohrigin.com')
console.log('  비밀번호: Admin1234!')
console.log('  URL: https://interohrigin-hr2.pages.dev/')
