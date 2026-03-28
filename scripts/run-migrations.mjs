import { readFileSync } from 'fs'

const SERVICE_URL = 'https://ckzbzumycmgkcpyhlclb.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsZ2Rib2Z3bG1oamF5eWp0eXh2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE4MDk4MywiZXhwIjoyMDg3NzU2OTgzfQ.GUL2AqA0FzarDMTQzCSCZ6QlSmbYNvUie3Ja4hgG4Bg'

async function execSQL(sql) {
  const res = await fetch(`${SERVICE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  })
  return await res.json()
}

// SQL을 개별 문(statement) 단위로 분리
function splitSQL(sql) {
  // 주석 제거하지 않고, 세미콜론 기준으로 분리
  // 함수 정의($$..$$) 안의 세미콜론은 보존
  const statements = []
  let current = ''
  let inDollarQuote = false

  const lines = sql.split('\n')
  for (const line of lines) {
    // 주석 라인 스킵
    if (line.trim().startsWith('--')) {
      current += line + '\n'
      continue
    }

    if (line.includes('$$')) {
      inDollarQuote = !inDollarQuote
      // $$ 두 번 나오면 다시 토글
      const count = (line.match(/\$\$/g) || []).length
      if (count >= 2) inDollarQuote = false
    }

    current += line + '\n'

    if (!inDollarQuote && line.trim().endsWith(';')) {
      const trimmed = current.trim()
      if (trimmed && !trimmed.match(/^--/)) {
        statements.push(trimmed)
      }
      current = ''
    }
  }

  if (current.trim()) {
    statements.push(current.trim())
  }

  return statements
}

async function main() {
  console.log('=== InterOhrigin HR — 마이그레이션 자동 실행 ===\n')

  // 1. exec_sql 함수 테스트
  console.log('1. exec_sql 함수 테스트...')
  const test = await execSQL('SELECT 1 as test')
  console.log('   결과:', JSON.stringify(test))
  if (test?.success === false) {
    console.log('   ❌ exec_sql 함수가 작동하지 않습니다.')
    process.exit(1)
  }
  console.log('   ✅ exec_sql 작동 확인\n')

  // 2. 마이그레이션 014 실행
  console.log('2. 마이그레이션 014 실행 (채용+OJT+수습+사주+신뢰도)...')
  const sql014 = readFileSync('supabase/migrations/014_recruitment_and_lifecycle_tables.sql', 'utf-8')
  const stmts014 = splitSQL(sql014)
  console.log(`   ${stmts014.length}개 SQL문 감지`)

  let success014 = 0
  let fail014 = 0
  for (let i = 0; i < stmts014.length; i++) {
    const stmt = stmts014[i]
    // 순수 주석만인 경우 스킵
    const noComments = stmt.replace(/--.*$/gm, '').trim()
    if (!noComments) continue

    const result = await execSQL(stmt)
    if (result?.success === false) {
      // 이미 존재하는 에러는 무시
      if (result.error?.includes('already exists') || result.error?.includes('duplicate')) {
        success014++
      } else {
        console.log(`   ⚠ [${i+1}] ${result.error?.substring(0, 80)}`)
        fail014++
      }
    } else {
      success014++
    }
  }
  console.log(`   ✅ 014 완료: 성공 ${success014}, 실패 ${fail014}\n`)

  // 3. 마이그레이션 015 실행
  console.log('3. 마이그레이션 015 실행 (업무 관리)...')
  const sql015 = readFileSync('supabase/migrations/015_work_management_tables.sql', 'utf-8')
  const stmts015 = splitSQL(sql015)
  console.log(`   ${stmts015.length}개 SQL문 감지`)

  let success015 = 0
  let fail015 = 0
  for (let i = 0; i < stmts015.length; i++) {
    const stmt = stmts015[i]
    const noComments = stmt.replace(/--.*$/gm, '').trim()
    if (!noComments) continue

    const result = await execSQL(stmt)
    if (result?.success === false) {
      if (result.error?.includes('already exists') || result.error?.includes('duplicate')) {
        success015++
      } else {
        console.log(`   ⚠ [${i+1}] ${result.error?.substring(0, 80)}`)
        fail015++
      }
    } else {
      success015++
    }
  }
  console.log(`   ✅ 015 완료: 성공 ${success015}, 실패 ${fail015}\n`)

  // 4. 테이블 존재 확인
  console.log('4. 테이블 존재 확인...')
  const tables = [
    'job_postings', 'candidates', 'resume_analysis', 'pre_survey_templates',
    'interview_schedules', 'interview_recordings', 'face_to_face_evals',
    'voice_analysis', 'transcriptions', 'recruitment_reports',
    'hiring_decisions', 'talent_profiles',
    'ai_accuracy_log', 'ai_trust_metrics', 'ai_phase_transitions',
    'employee_profiles', 'personality_analysis', 'profile_visibility_settings',
    'ojt_programs', 'ojt_enrollments', 'mentor_assignments', 'mentor_daily_reports',
    'probation_evaluations', 'special_notes', 'exit_surveys', 'work_metrics',
    'projects', 'tasks', 'daily_reports', 'chat_messages',
  ]

  let existCount = 0
  for (const t of tables) {
    const res = await fetch(`${SERVICE_URL}/rest/v1/${t}?select=id&limit=1`, {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
    })
    if (res.ok) {
      existCount++
    } else {
      console.log(`   ❌ ${t} 누락`)
    }
  }
  console.log(`   ✅ ${existCount}/${tables.length} 테이블 확인\n`)

  if (existCount === tables.length) {
    console.log('🎉 모든 마이그레이션이 성공적으로 적용되었습니다!')
  } else {
    console.log(`⚠ ${tables.length - existCount}개 테이블이 누락되었습니다.`)
  }
}

main().catch(console.error)
