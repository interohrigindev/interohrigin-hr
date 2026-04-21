-- 052_approval_template_scope.sql
-- 목적: 결재선 템플릿이 본부/팀 단위로 분기되도록 department_id / team_id 컬럼 추가
-- 매칭 우선순위: team_id = 신청자 team > department_id = 신청자 본부 > 기본 (null)

ALTER TABLE approval_templates ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE approval_templates ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_approval_templates_dept_team
  ON approval_templates(doc_type, department_id, team_id);

-- 기존 템플릿은 department_id / team_id = NULL 유지 → '전체 적용' fallback 으로 동작
