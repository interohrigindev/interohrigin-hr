import { readFileSync } from 'fs'

const SERVICE_URL = 'https://jlgdbofwlmhjayyjtyxv.supabase.co'
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

async function main() {
  console.log('=== InterOhrigin HR — 마이그레이션 실행 v2 ===\n')

  // 전체 SQL 파일을 하나의 EXECUTE로 실행
  console.log('1. 마이그레이션 014 실행 (전체 한 번에)...')
  const sql014 = readFileSync('supabase/migrations/014_recruitment_and_lifecycle_tables.sql', 'utf-8')
  const result014 = await execSQL(sql014)
  console.log('   결과:', JSON.stringify(result014))

  if (result014?.success === false) {
    console.log('   ❌ 014 실패. 분할 실행 시도...\n')
    // 주요 섹션별로 분할
    await runSections(sql014, '014')
  } else {
    console.log('   ✅ 014 성공!\n')
  }

  console.log('2. 마이그레이션 015 실행 (전체 한 번에)...')
  const sql015 = readFileSync('supabase/migrations/015_work_management_tables.sql', 'utf-8')
  const result015 = await execSQL(sql015)
  console.log('   결과:', JSON.stringify(result015))

  if (result015?.success === false) {
    console.log('   ❌ 015 실패. 분할 실행 시도...\n')
    await runSections(sql015, '015')
  } else {
    console.log('   ✅ 015 성공!\n')
  }

  // 검증
  console.log('3. 테이블 검증...')
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

  let ok = 0
  for (const t of tables) {
    const res = await fetch(`${SERVICE_URL}/rest/v1/${t}?select=id&limit=1`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` },
    })
    if (res.ok) { ok++; } else { console.log(`   ❌ ${t}`) }
  }
  console.log(`   ✅ ${ok}/${tables.length} 테이블 확인`)
  if (ok === tables.length) console.log('\n🎉 모든 마이그레이션 성공!')
}

async function runSections(sql, label) {
  // 빈 줄 2개 이상으로 섹션 구분하여 실행
  // CREATE TABLE ... ; 단위로 분리
  const sections = []
  let buf = ''
  let inDollar = false

  for (const line of sql.split('\n')) {
    if (line.includes('$$')) {
      const cnt = (line.match(/\$\$/g) || []).length
      if (cnt % 2 === 1) inDollar = !inDollar
    }
    buf += line + '\n'

    if (!inDollar && line.trim().endsWith(';')) {
      const clean = buf.replace(/--.*$/gm, '').trim()
      if (clean && clean.length > 5) {
        sections.push(buf.trim())
      }
      buf = ''
    }
  }
  if (buf.trim()) sections.push(buf.trim())

  console.log(`   ${sections.length}개 섹션으로 분할 실행`)
  let ok = 0, fail = 0
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]
    const r = await execSQL(s)
    if (r?.success === false) {
      if (r.error?.includes('already exists') || r.error?.includes('duplicate')) {
        ok++
      } else {
        fail++
        if (fail <= 5) console.log(`   ⚠ [${i+1}] ${r.error?.substring(0, 100)}`)
      }
    } else {
      ok++
    }
  }
  console.log(`   ${label} 분할 결과: 성공 ${ok}, 실패 ${fail}`)
}

main().catch(console.error)
