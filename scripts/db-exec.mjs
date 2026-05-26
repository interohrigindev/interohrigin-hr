#!/usr/bin/env node
/**
 * 직접 SQL 실행 헬퍼 — .env.local 의 SUPABASE_DB_URL 사용
 *
 * 사용:
 *   node scripts/db-exec.mjs <migration-file.sql>      → SQL 파일 실행
 *   node scripts/db-exec.mjs --query "SELECT 1"         → 인라인 SQL 실행
 *   node scripts/db-exec.mjs --query-file <file.sql>    → 인라인 SQL 파일 실행 (트랜잭션 단일)
 *
 * 결과: 행이 있으면 console.table, 없으면 status 만 출력
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config({ path: '.env.local', quiet: true })

const { Client } = pg
const DB_URL = process.env.SUPABASE_DB_URL

if (!DB_URL) {
  console.error('❌ SUPABASE_DB_URL not set in .env.local')
  process.exit(1)
}

const args = process.argv.slice(2)
let mode = 'file'
let target = args[0]

if (args[0] === '--query') {
  mode = 'inline'
  target = args.slice(1).join(' ')
}
if (args[0] === '--query-file') {
  mode = 'inline'
  target = readFileSync(resolve(args[1]), 'utf8')
}

if (!target) {
  console.error('❌ Usage: node scripts/db-exec.mjs <file.sql>')
  console.error('       node scripts/db-exec.mjs --query "SELECT ..."')
  process.exit(1)
}

const sql = mode === 'file' ? readFileSync(resolve(target), 'utf8') : target

const client = new Client({ connectionString: DB_URL })

try {
  await client.connect()
  console.log(`▶ Executing ${mode === 'file' ? `file: ${target}` : 'inline query'}`)
  console.log(`  ${sql.length} chars, ${sql.split('\n').length} lines`)
  console.log('─'.repeat(70))

  const result = await client.query(sql)

  if (Array.isArray(result)) {
    // Multiple statements
    result.forEach((r, i) => {
      console.log(`\n[Stmt ${i + 1}] ${r.command} — ${r.rowCount ?? 0} rows`)
      if (r.rows && r.rows.length > 0) console.table(r.rows)
    })
  } else {
    console.log(`✓ ${result.command} — ${result.rowCount ?? 0} rows affected`)
    if (result.rows && result.rows.length > 0) {
      console.table(result.rows)
    }
  }

  console.log('─'.repeat(70))
  console.log('✅ DONE')
} catch (err) {
  console.error('❌ SQL Error:')
  console.error(`   ${err.message}`)
  if (err.position) console.error(`   Position: ${err.position}`)
  if (err.hint) console.error(`   Hint: ${err.hint}`)
  process.exit(1)
} finally {
  await client.end()
}
