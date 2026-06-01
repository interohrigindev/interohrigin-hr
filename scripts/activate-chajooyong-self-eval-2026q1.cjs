/**
 * 차주용 직원 2026년 1분기 자기평가 활성화 (1회용 시연 준비)
 *
 * 흐름:
 *   1. 차주용 employee_id 조회 (name 매칭)
 *   2. evaluation_periods (2026, 1) — 없으면 INSERT, draft 면 in_progress 로 UPDATE
 *   3. evaluation_targets (period_id, 차주용 id) — 없으면 INSERT
 *   4. self_evaluations 행 init (active evaluation_items 각각에 대해)
 *   5. 검증 출력
 *
 * 실행: node scripts/activate-chajooyong-self-eval-2026q1.cjs
 *
 * idempotent — 여러 번 실행해도 안전 (ON CONFLICT DO NOTHING / UPDATE)
 * 다른 직원에는 영향 없음 — 차주용만 target 생성
 */
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const PROJECT_ROOT = '/Users/project.adv/Library/CloudStorage/GoogleDrive-interohrigin.dev@gmail.com/내 드라이브/IO HR Paltform'
const EMP_NAME = '차주용'
const YEAR = 2026
const QUARTER = 1

function loadEnv(file) {
  const content = fs.readFileSync(file, 'utf8')
  const env = {}
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.+)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return env
}

async function main() {
  const env = loadEnv(path.join(PROJECT_ROOT, '.env.local'))
  const dbUrl = env.SUPABASE_DB_URL
  if (!dbUrl) throw new Error('SUPABASE_DB_URL not found')

  const client = new Client({ connectionString: dbUrl })
  await client.connect()
  console.log('[activate] DB connected.')

  try {
    // 1. 차주용 employee_id
    const empRes = await client.query(
      `SELECT id, name, role, department_id FROM employees WHERE name = $1 AND is_active = true LIMIT 1`,
      [EMP_NAME],
    )
    if (empRes.rows.length === 0) throw new Error(`'${EMP_NAME}' 직원을 찾을 수 없습니다`)
    const emp = empRes.rows[0]
    console.log(`[activate] employee: ${emp.name} (id=${emp.id}, role=${emp.role})`)

    // 2. 2026 Q1 period
    await client.query(
      `INSERT INTO evaluation_periods (year, quarter, status, start_date, end_date)
       VALUES ($1, $2, 'in_progress', $3, $4)
       ON CONFLICT (year, quarter) DO UPDATE SET status = 'in_progress'`,
      [YEAR, QUARTER, `${YEAR}-01-01`, `${YEAR}-03-31`],
    )
    const periodRes = await client.query(
      `SELECT id, status FROM evaluation_periods WHERE year = $1 AND quarter = $2`,
      [YEAR, QUARTER],
    )
    const period = periodRes.rows[0]
    console.log(`[activate] period: ${YEAR} Q${QUARTER} (id=${period.id}, status=${period.status})`)

    // 3. evaluation_targets — 차주용만
    await client.query(
      `INSERT INTO evaluation_targets (period_id, employee_id, status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT (period_id, employee_id) DO UPDATE SET status =
         CASE WHEN evaluation_targets.status IN ('pending','self_done') THEN evaluation_targets.status
              ELSE 'pending' END`,
      [period.id, emp.id],
    )
    const targetRes = await client.query(
      `SELECT id, status FROM evaluation_targets WHERE period_id = $1 AND employee_id = $2`,
      [period.id, emp.id],
    )
    const target = targetRes.rows[0]
    console.log(`[activate] target: id=${target.id}, status=${target.status}`)

    // 4. self_evaluations init
    const initRes = await client.query(
      `INSERT INTO self_evaluations (target_id, item_id)
       SELECT $1, i.id FROM evaluation_items i WHERE i.is_active = true
       ON CONFLICT (target_id, item_id) DO NOTHING
       RETURNING id`,
      [target.id],
    )
    console.log(`[activate] self_evaluations new rows: ${initRes.rows.length}`)

    // 5. 검증
    const verifyRes = await client.query(
      `SELECT
         p.year, p.quarter, p.status as period_status, p.start_date, p.end_date,
         t.status as target_status,
         (SELECT count(*) FROM self_evaluations WHERE target_id = t.id) as self_eval_total,
         (SELECT count(*) FROM evaluation_items WHERE is_active = true) as items_total
       FROM evaluation_targets t
       JOIN evaluation_periods p ON p.id = t.period_id
       WHERE t.employee_id = $1 AND p.year = $2 AND p.quarter = $3`,
      [emp.id, YEAR, QUARTER],
    )
    console.log('[activate] 검증 결과:')
    console.table(verifyRes.rows)

    console.log('\n[activate] ✅ 완료 — 차주용 직원으로 로그인 → 자기평가 메뉴 접근 가능')
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('[activate] FAIL:', err.message)
  process.exit(1)
})
