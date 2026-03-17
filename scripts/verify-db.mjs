import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://kndziepsoejbqrbrcxmt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtuZHppZXBzb2VqYnFyYnJjeG10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyODEzMzksImV4cCI6MjA4ODg1NzMzOX0.Qd97o0WzRuBaFepZIwETdoMLeTxPrXj9bt9gGeojeX0'
)

console.log('=== InterOhrigin HR DB 검증 ===\n')

// 1. 관리자 로그인 테스트
console.log('1. 관리자 로그인 테스트')
const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
  email: 'admin@interohrigin.com',
  password: 'AdminPassword123!'
})
if (authErr) {
  console.log(`   ❌ 실패: ${authErr.message}`)
  console.log('   → 관리자 계정이 생성되지 않았을 수 있습니다.\n')
} else {
  console.log(`   ✅ 성공: ${auth.user.email} (id: ${auth.user.id})\n`)
}

// 2. 부서 데이터
console.log('2. 부서 (departments)')
const { data: depts, error: deptErr } = await supabase.from('departments').select('name')
if (deptErr) console.log(`   ❌ ${deptErr.message}`)
else if (depts.length === 0) console.log('   ⚠️  데이터 없음')
else depts.forEach(d => console.log(`   ✅ ${d.name}`))
console.log()

// 3. 평가 카테고리
console.log('3. 평가 카테고리 (evaluation_categories)')
const { data: cats } = await supabase.from('evaluation_categories').select('name, weight')
if (!cats?.length) console.log('   ⚠️  데이터 없음')
else cats.forEach(c => console.log(`   ✅ ${c.name} (가중치: ${c.weight})`))
console.log()

// 4. 평가 항목 + evaluation_type
console.log('4. 평가 항목 (evaluation_items)')
const { data: items } = await supabase.from('evaluation_items').select('name, evaluation_type, sort_order, category:evaluation_categories(name)').order('sort_order')
if (!items?.length) console.log('   ⚠️  데이터 없음')
else items.forEach(i => console.log(`   ✅ [${i.category?.name}] ${i.name} (${i.evaluation_type})`))
console.log()

// 5. 평가 기간
console.log('5. 평가 기간 (evaluation_periods)')
const { data: periods } = await supabase.from('evaluation_periods').select('year, quarter, status')
if (!periods?.length) console.log('   ⚠️  데이터 없음')
else periods.forEach(p => console.log(`   ✅ ${p.year}년 ${p.quarter}분기 (${p.status})`))
console.log()

// 6. 등급 기준
console.log('6. 등급 기준 (grade_criteria)')
const { data: grades } = await supabase.from('grade_criteria').select('grade, min_score, max_score, label').order('min_score', { ascending: false })
if (!grades?.length) console.log('   ⚠️  데이터 없음')
else grades.forEach(g => console.log(`   ✅ ${g.grade}등급: ${g.min_score}~${g.max_score}점 (${g.label})`))
console.log()

// 7. 평가 가중치
console.log('7. 평가 가중치 (evaluation_weights)')
const { data: weights } = await supabase.from('evaluation_weights').select('evaluator_role, weight')
if (!weights?.length) console.log('   ⚠️  데이터 없음')
else weights.forEach(w => console.log(`   ✅ ${w.evaluator_role}: ${w.weight}`))
console.log()

// 8. 직원 목록
console.log('8. 직원 (employees)')
const { data: emps } = await supabase.from('employees').select('name, email, role')
if (!emps?.length) console.log('   ⚠️  데이터 없음')
else emps.forEach(e => console.log(`   ✅ ${e.name} (${e.email}) - ${e.role}`))
console.log()

// 9. AI 설정 테이블
console.log('9. AI 설정 테이블 (ai_settings)')
const { error: aiErr } = await supabase.from('ai_settings').select('id').limit(1)
if (aiErr) console.log(`   ❌ 테이블 없음: ${aiErr.message}`)
else console.log('   ✅ 테이블 존재')
console.log()

console.log('=== 검증 완료 ===')
