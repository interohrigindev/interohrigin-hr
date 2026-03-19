-- =====================================================================
-- 031: 부서별 프로젝트 템플릿 + 파이프라인
-- - project_templates에 department 컬럼 추가
-- - 마케팅영업본부, 경영지원본부 템플릿 추가
-- - 경영지원본부 departments 확보
-- =====================================================================

-- ─── 0. 경영지원본부 departments 확보 ────────────────────────────────
INSERT INTO public.departments (name) VALUES ('경영지원본부')
ON CONFLICT (name) DO NOTHING;

-- ─── 1. project_templates에 department 컬럼 추가 ────────────────────
ALTER TABLE public.project_templates
  ADD COLUMN IF NOT EXISTS department text;

-- 기존 템플릿을 브랜드사업본부로 지정
UPDATE public.project_templates SET department = '브랜드사업본부'
  WHERE department IS NULL;

CREATE INDEX IF NOT EXISTS idx_project_templates_department
  ON public.project_templates(department);

-- ─── 2. 마케팅영업본부 템플릿 ────────────────────────────────────────
INSERT INTO public.project_templates (name, template_type, department, stages, avg_total_days) VALUES
  ('프로모션 캠페인', 'promotion_campaign', '마케팅영업본부', '[
    {"name":"시장분석","order":1,"default_duration_days":7},
    {"name":"전략기획","order":2,"default_duration_days":10},
    {"name":"콘텐츠제작","order":3,"default_duration_days":14},
    {"name":"채널세팅","order":4,"default_duration_days":7},
    {"name":"캠페인실행","order":5,"default_duration_days":14},
    {"name":"성과분석","order":6,"default_duration_days":7}
  ]', 59),
  ('영업제안', 'sales_proposal', '마케팅영업본부', '[
    {"name":"고객분석","order":1,"default_duration_days":5},
    {"name":"제안서작성","order":2,"default_duration_days":10},
    {"name":"가격협상","order":3,"default_duration_days":10},
    {"name":"계약체결","order":4,"default_duration_days":5}
  ]', 30),
  ('신규채널 입점', 'channel_entry', '마케팅영업본부', '[
    {"name":"채널조사","order":1,"default_duration_days":7},
    {"name":"입점제안","order":2,"default_duration_days":10},
    {"name":"조건협의","order":3,"default_duration_days":10},
    {"name":"상품등록","order":4,"default_duration_days":10},
    {"name":"런칭","order":5,"default_duration_days":7}
  ]', 44)
ON CONFLICT DO NOTHING;

-- ─── 3. 경영지원본부 템플릿 ──────────────────────────────────────────
INSERT INTO public.project_templates (name, template_type, department, stages, avg_total_days) VALUES
  ('사내 제도 개선', 'policy_improvement', '경영지원본부', '[
    {"name":"현황분석","order":1,"default_duration_days":10},
    {"name":"개선안수립","order":2,"default_duration_days":14},
    {"name":"검토승인","order":3,"default_duration_days":14},
    {"name":"시행공지","order":4,"default_duration_days":7}
  ]', 45),
  ('예산 편성', 'budget_planning', '경영지원본부', '[
    {"name":"부서요청취합","order":1,"default_duration_days":10},
    {"name":"예산안작성","order":2,"default_duration_days":14},
    {"name":"경영진검토","order":3,"default_duration_days":14},
    {"name":"조정확정","order":4,"default_duration_days":14},
    {"name":"배분통보","order":5,"default_duration_days":7}
  ]', 59),
  ('계약/법무', 'contract_legal', '경영지원본부', '[
    {"name":"요건정리","order":1,"default_duration_days":5},
    {"name":"계약서작성","order":2,"default_duration_days":10},
    {"name":"법무검토","order":3,"default_duration_days":10},
    {"name":"체결완료","order":4,"default_duration_days":5}
  ]', 30)
ON CONFLICT DO NOTHING;
