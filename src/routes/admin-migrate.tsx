import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

// 마이그레이션 SQL 조각들 (service_role로 실행)
// ⚠️ Service Role Key는 절대 코드에 하드코딩하지 마세요
const SERVICE_URL = import.meta.env.VITE_SUPABASE_URL
const SERVICE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || ''

// Supabase REST로 테이블 존재 여부 확인하는 헬퍼
async function tableExists(tableName: string): Promise<boolean> {
  const res = await fetch(`${SERVICE_URL}/rest/v1/${tableName}?select=id&limit=1`, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
  })
  return res.ok
}

export default function AdminMigrate() {
  const [status, setStatus] = useState<string[]>([])
  const [checking, setChecking] = useState(false)

  function log(msg: string) {
    setStatus(prev => [...prev, msg])
  }

  async function checkTables() {
    setChecking(true)
    setStatus([])

    const tables = [
      // 014 마이그레이션 테이블
      'job_postings', 'candidates', 'resume_analysis', 'pre_survey_templates',
      'interview_schedules', 'interview_recordings', 'face_to_face_evals',
      'voice_analysis', 'transcriptions', 'recruitment_reports',
      'hiring_decisions', 'talent_profiles',
      'ai_accuracy_log', 'ai_trust_metrics', 'ai_phase_transitions',
      'employee_profiles', 'personality_analysis', 'profile_visibility_settings',
      'ojt_programs', 'ojt_enrollments', 'mentor_assignments', 'mentor_daily_reports',
      'probation_evaluations', 'special_notes', 'exit_surveys', 'work_metrics',
      // 015 마이그레이션 테이블
      'projects', 'tasks', 'daily_reports', 'chat_messages',
      // 기존 테이블
      'employees', 'departments', 'evaluation_periods', 'ai_settings',
    ]

    let existCount = 0
    let missingCount = 0
    for (const t of tables) {
      const exists = await tableExists(t)
      if (exists) {
        log(`✅ ${t}`)
        existCount++
      } else {
        log(`❌ ${t} — 생성 필요`)
        missingCount++
      }
    }
    log(`\n--- 결과: ${existCount}개 존재, ${missingCount}개 누락 ---`)
    if (missingCount === 0) {
      log('🎉 모든 테이블이 이미 존재합니다!')
    } else {
      log('⚠ Supabase SQL Editor에서 마이그레이션을 실행하세요.')
    }
    setChecking(false)
  }


  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900">DB 마이그레이션 관리</h1>

      <Card>
        <CardHeader>
          <CardTitle>테이블 상태 확인</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            현재 Supabase 프로젝트에 필요한 테이블들이 존재하는지 확인합니다.
          </p>
          <Button onClick={checkTables} disabled={checking}>
            {checking ? '확인 중...' : '테이블 상태 확인'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>마이그레이션 실행 안내</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800 space-y-2">
            <p className="font-medium">Supabase SQL Editor에서 실행해주세요:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li><a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-brand-600 underline">Supabase Dashboard</a> 접속</li>
              <li>프로젝트 선택 → <strong>SQL Editor</strong></li>
              <li><strong>New Query</strong> 클릭</li>
              <li>아래 SQL 파일 내용을 순서대로 붙여넣기:</li>
            </ol>
            <div className="bg-white/80 rounded p-2 mt-2 font-mono text-xs">
              <p>📄 supabase/migrations/014_recruitment_and_lifecycle_tables.sql</p>
              <p>📄 supabase/migrations/015_work_management_tables.sql</p>
            </div>
            <p className="mt-2">각 파일을 별도로 실행하거나, <code>scripts/apply-all-migrations.sql</code> 통합 파일을 사용하세요.</p>
          </div>
        </CardContent>
      </Card>

      {status.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>결과</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs text-green-400 max-h-96 overflow-y-auto space-y-0.5">
              {status.map((s, i) => (
                <div key={i}>{s}</div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
