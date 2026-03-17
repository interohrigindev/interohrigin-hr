/**
 * Insert sample data for work management (projects, tasks, daily_reports)
 */

const SUPABASE_URL = 'https://jlgdbofwlmhjayyjtyxv.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsZ2Rib2Z3bG1oamF5eWp0eXh2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE4MDk4MywiZXhwIjoyMDg3NzU2OTgzfQ.GUL2AqA0FzarDMTQzCSCZ6QlSmbYNvUie3Ja4hgG4Bg'

const headers = {
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
}

async function query(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`
  const res = await fetch(url, { headers, ...options })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status} ${res.statusText}: ${text}`)
  }
  return res.json()
}

async function main() {
  console.log('=== Fetching existing departments and employees ===')

  // Get departments
  const departments = await query('departments?select=id,name')
  console.log(`Found ${departments.length} departments`)
  if (departments.length === 0) {
    console.error('No departments found. Cannot proceed.')
    process.exit(1)
  }

  // Get employees
  const employees = await query('employees?select=id,name,department_id&limit=20')
  console.log(`Found ${employees.length} employees`)
  if (employees.length === 0) {
    console.error('No employees found. Cannot proceed.')
    process.exit(1)
  }

  // Find departments by name (or fallback)
  function findDept(nameFragment) {
    const d = departments.find(d => d.name.includes(nameFragment))
    return d ? d.id : departments[0].id
  }

  const brandDeptId = findDept('브랜드')
  const itDeptId = findDept('IT') || findDept('마케팅')
  const mgmtDeptId = findDept('경영')

  // Pick some employees for assignments
  const emp0 = employees[0]
  const emp1 = employees[1] || employees[0]
  const emp2 = employees[2] || employees[0]
  const emp3 = employees[3] || employees[0]
  const emp4 = employees[4] || employees[0]

  console.log('\n=== Inserting Projects ===')
  const projects = await query('projects', {
    method: 'POST',
    body: JSON.stringify([
      {
        name: '2026 Q1 브랜드 리뉴얼 프로젝트',
        description: '브랜드 아이덴티티 리뉴얼 및 마케팅 자료 전면 개편',
        department_id: brandDeptId,
        owner_id: emp0.id,
        status: 'active',
        start_date: '2026-01-15',
        end_date: '2026-03-31',
      },
      {
        name: 'HR 플랫폼 고도화',
        description: 'InterOhrigin HR 시스템 2차 고도화 - AI 평가 연동 및 업무관리 모듈',
        department_id: itDeptId,
        owner_id: emp1.id,
        status: 'active',
        start_date: '2026-02-01',
        end_date: '2026-06-30',
      },
      {
        name: '2026 상반기 채용 캠페인',
        description: '상반기 신입/경력 채용 캠페인 기획 및 실행',
        department_id: mgmtDeptId,
        owner_id: emp2.id,
        status: 'planning',
        start_date: '2026-04-01',
        end_date: '2026-06-30',
      },
    ]),
  })
  console.log(`Inserted ${projects.length} projects`)

  const [projBrand, projHR, projRecruit] = projects

  console.log('\n=== Inserting Tasks ===')
  const taskData = [
    // Brand project tasks
    {
      project_id: projBrand.id,
      title: '브랜드 가이드라인 초안 작성',
      description: '새로운 브랜드 컬러, 타이포그래피, 로고 사용 규정 초안',
      assignee_id: emp0.id,
      priority: 'high',
      status: 'done',
      due_date: '2026-02-15',
      estimated_hours: 40,
      actual_hours: 38,
    },
    {
      project_id: projBrand.id,
      title: '마케팅 자료 디자인 리뉴얼',
      description: '브로셔, 명함, 프레젠테이션 템플릿 리뉴얼',
      assignee_id: emp1.id,
      priority: 'normal',
      status: 'in_progress',
      due_date: '2026-03-20',
      estimated_hours: 60,
      actual_hours: null,
    },
    {
      project_id: projBrand.id,
      title: '웹사이트 리뉴얼 기획',
      description: '회사 웹사이트 디자인 및 콘텐츠 개편 기획',
      assignee_id: emp3.id,
      priority: 'normal',
      status: 'in_progress',
      due_date: '2026-03-25',
      estimated_hours: 30,
      actual_hours: null,
    },
    {
      project_id: projBrand.id,
      title: 'SNS 채널 리브랜딩',
      description: '인스타그램, 링크드인 프로필 및 콘텐츠 전략 수립',
      assignee_id: emp4.id,
      priority: 'low',
      status: 'todo',
      due_date: '2026-03-31',
      estimated_hours: 20,
      actual_hours: null,
    },
    // HR Platform tasks
    {
      project_id: projHR.id,
      title: 'AI 평가 리포트 API 연동',
      description: 'GPT-4o 기반 평가 요약 및 리포트 생성 API 구축',
      assignee_id: emp1.id,
      priority: 'urgent',
      status: 'in_progress',
      due_date: '2026-03-15',
      estimated_hours: 80,
      actual_hours: 45,
    },
    {
      project_id: projHR.id,
      title: '업무관리 대시보드 UI 개발',
      description: '프로젝트/작업 현황 대시보드 프론트엔드 구현',
      assignee_id: emp2.id,
      priority: 'high',
      status: 'in_progress',
      due_date: '2026-03-20',
      estimated_hours: 50,
      actual_hours: 30,
    },
    {
      project_id: projHR.id,
      title: '일일 보고서 자동 요약 기능',
      description: 'AI를 활용한 일일 보고서 자동 요약 및 인사이트 생성',
      assignee_id: emp3.id,
      priority: 'normal',
      status: 'todo',
      due_date: '2026-04-10',
      estimated_hours: 40,
      actual_hours: null,
    },
    {
      project_id: projHR.id,
      title: 'DB 마이그레이션 스크립트 정리',
      description: '기존 마이그레이션 파일 정리 및 문서화',
      assignee_id: emp1.id,
      priority: 'low',
      status: 'done',
      due_date: '2026-02-28',
      estimated_hours: 16,
      actual_hours: 12,
    },
    // Recruitment campaign tasks
    {
      project_id: projRecruit.id,
      title: '채용 포지션 정의서 작성',
      description: '상반기 채용 포지션별 직무기술서(JD) 작성',
      assignee_id: emp2.id,
      priority: 'high',
      status: 'todo',
      due_date: '2026-04-15',
      estimated_hours: 24,
      actual_hours: null,
    },
    {
      project_id: projRecruit.id,
      title: '채용 공고 플랫폼 선정',
      description: '사람인, 잡코리아, 원티드 등 채용 플랫폼 비교 및 선정',
      assignee_id: emp4.id,
      priority: 'normal',
      status: 'todo',
      due_date: '2026-04-20',
      estimated_hours: 8,
      actual_hours: null,
    },
    {
      project_id: projRecruit.id,
      title: '면접관 교육 프로그램 준비',
      description: '구조화 면접 및 AI 면접 도구 사용법 교육 자료 준비',
      assignee_id: emp0.id,
      priority: 'normal',
      status: 'todo',
      due_date: '2026-04-25',
      estimated_hours: 16,
      actual_hours: null,
    },
  ]
  const tasks = await query('tasks', {
    method: 'POST',
    body: JSON.stringify(taskData),
  })
  console.log(`Inserted ${tasks.length} tasks`)

  console.log('\n=== Inserting Daily Reports ===')
  const dailyReports = await query('daily_reports', {
    method: 'POST',
    body: JSON.stringify([
      {
        employee_id: emp0.id,
        report_date: '2026-03-14',
        tasks_completed: [
          { title: '브랜드 가이드라인 최종 검토', hours: 3 },
          { title: '팀 미팅 참석', hours: 1 },
        ],
        tasks_in_progress: [
          { title: '마케팅 자료 리뷰', progress: 60 },
        ],
        tasks_planned: [
          { title: '웹사이트 리뉴얼 기획 검토' },
        ],
        carryover_tasks: [],
        blockers: null,
        satisfaction_score: 8,
        satisfaction_comment: '브랜드 가이드라인 작업이 마무리되어 보람있는 하루였습니다.',
        ai_priority_suggestion: null,
      },
      {
        employee_id: emp1.id,
        report_date: '2026-03-14',
        tasks_completed: [
          { title: 'AI 평가 API 엔드포인트 구현', hours: 5 },
          { title: '코드 리뷰', hours: 1.5 },
        ],
        tasks_in_progress: [
          { title: 'AI 리포트 UI 연동', progress: 40 },
          { title: '마케팅 자료 디자인 수정', progress: 70 },
        ],
        tasks_planned: [
          { title: 'AI 리포트 테스트 작성' },
        ],
        carryover_tasks: [],
        blockers: 'GPT-4o API rate limit 이슈로 배치 처리 방식 검토 필요',
        satisfaction_score: 7,
        satisfaction_comment: 'API 개발이 순조롭게 진행 중이나 rate limit 이슈 해결이 필요합니다.',
        ai_priority_suggestion: null,
      },
      {
        employee_id: emp2.id,
        report_date: '2026-03-15',
        tasks_completed: [
          { title: '업무관리 대시보드 차트 컴포넌트 개발', hours: 4 },
          { title: '일일 보고서 UI 버그 수정', hours: 2 },
        ],
        tasks_in_progress: [
          { title: '대시보드 필터링 기능 구현', progress: 30 },
        ],
        tasks_planned: [
          { title: '채용 포지션 정의서 초안 작성' },
          { title: '대시보드 반응형 레이아웃 적용' },
        ],
        carryover_tasks: [],
        blockers: null,
        satisfaction_score: 9,
        satisfaction_comment: '계획했던 작업을 모두 완료하고 추가 버그 수정까지 진행했습니다.',
        ai_priority_suggestion: null,
      },
    ]),
  })
  console.log(`Inserted ${dailyReports.length} daily reports`)

  console.log('\n=== Done! Sample data inserted successfully. ===')
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
