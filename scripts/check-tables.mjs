import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://jlgdbofwlmhjayyjtyxv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsZ2Rib2Z3bG1oamF5eWp0eXh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxODA5ODMsImV4cCI6MjA4Nzc1Njk4M30.H8Rj4rbmyuONYP9EBdQNeXNkUxS_OXci2v8JEsENLKU'
)

// Check which new tables exist
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
  // existing
  'employees', 'departments', 'evaluation_periods', 'ai_settings',
]

for (const table of tables) {
  const { data, error } = await supabase.from(table).select('id').limit(1)
  if (error) {
    console.log(`❌ ${table}: ${error.message}`)
  } else {
    console.log(`✅ ${table}: exists (${data.length} rows sample)`)
  }
}
