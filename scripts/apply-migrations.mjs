import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const SUPABASE_URL = 'https://ckzbzumycmgkcpyhlclb.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsZ2Rib2Z3bG1oamF5eWp0eXh2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE4MDk4MywiZXhwIjoyMDg3NzU2OTgzfQ.GUL2AqA0FzarDMTQzCSCZ6QlSmbYNvUie3Ja4hgG4Bg'

// Use Supabase Management API to execute SQL
const PROJECT_REF = 'ckzbzumycmgkcpyhlclb'

async function executeSQLViaAPI(sql) {
  // Try the database query endpoint
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  })
  return response
}

// Alternative: Use the pg protocol via supabase-js
// supabase-js doesn't support raw DDL, so we'll use fetch to the SQL API endpoint
async function executeSQLDirect(sql) {
  const response = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  })
  return response
}

async function main() {
  console.log('=== InterOhrigin HR — 마이그레이션 적용 ===\n')

  // Read migration files
  const sql014 = readFileSync('supabase/migrations/014_recruitment_and_lifecycle_tables.sql', 'utf-8')
  const sql015 = readFileSync('supabase/migrations/015_work_management_tables.sql', 'utf-8')

  // Try multiple SQL execution methods
  const methods = [
    { name: 'SQL API', fn: () => executeSQLDirect(sql014 + '\n' + sql015) },
  ]

  for (const method of methods) {
    console.log(`시도: ${method.name}...`)
    try {
      const res = await method.fn()
      console.log(`  Status: ${res.status}`)
      const text = await res.text()
      if (res.ok) {
        console.log(`  ✅ 성공!`)
        console.log(text.substring(0, 200))
        return
      } else {
        console.log(`  ❌ 실패: ${text.substring(0, 300)}`)
      }
    } catch (err) {
      console.log(`  ❌ 에러: ${err.message}`)
    }
  }

  console.log('\n--- 자동 실행 실패. Supabase SQL Editor에서 수동 실행이 필요합니다. ---')
  console.log('1. https://supabase.com/dashboard 접속')
  console.log('2. 프로젝트 선택 → SQL Editor')
  console.log('3. scripts/apply-all-migrations.sql 내용을 붙여넣고 실행')
}

main().catch(console.error)
