-- =====================================================================
-- InterOhrigin HR — 초기 데이터 시드
-- 002_new_schema.sql 실행 후 Supabase SQL Editor에서 실행하세요
-- =====================================================================

-- 기존 시드 데이터 정리 (재실행 시 충돌 방지)
DELETE FROM public.evaluation_weights;
DELETE FROM public.evaluation_items;
DELETE FROM public.evaluation_categories;
DELETE FROM public.evaluation_periods;
DELETE FROM public.departments;

DO $$
DECLARE
  v_dept_id         uuid;
  v_cat_performance uuid := '20000000-0000-0000-0000-000000000001';
  v_cat_competency  uuid := '20000000-0000-0000-0000-000000000002';
  v_period_id       uuid;
BEGIN

  -- ═════════════════════════════════════════════════════════════════
  -- 1. 부서
  -- ═════════════════════════════════════════════════════════════════
  INSERT INTO public.departments (name)
  VALUES ('브랜드사업본부')
  RETURNING id INTO v_dept_id;

  RAISE NOTICE '부서 생성 완료: 브랜드사업본부 (id=%)', v_dept_id;

  -- ═════════════════════════════════════════════════════════════════
  -- 2. 평가 카테고리 (고정 ID 사용 — 다른 스크립트와 충돌 방지)
  -- ═════════════════════════════════════════════════════════════════
  INSERT INTO public.evaluation_categories (id, name, weight, sort_order)
  VALUES (v_cat_performance, '업적평가', 0.7, 1)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.evaluation_categories (id, name, weight, sort_order)
  VALUES (v_cat_competency, '역량평가', 0.3, 2)
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE '카테고리 생성 완료: 업적평가(id=%), 역량평가(id=%)', v_cat_performance, v_cat_competency;

  -- ═════════════════════════════════════════════════════════════════
  -- 3. 평가 항목 — 업적평가 (7개)
  -- ═════════════════════════════════════════════════════════════════
  INSERT INTO public.evaluation_items (category_id, name, description, max_score, sort_order) VALUES
    (v_cat_performance,
     '상품 이익률 및 원가 관리',
     '기획 단계에서 목표 원가율을 준수하고, 불필요한 비용을 절감하여 목표 상품 마진 확보',
     10, 1),
    (v_cat_performance,
     '신제품 기획 및 라인업 전략',
     '시장 니즈와 자사 강점을 반영한 신제품 기획 및 전략적 라인업 구성',
     10, 2),
    (v_cat_performance,
     '프로모션 및 판매 전략',
     '효과적인 프로모션 기획·실행으로 매출 목표 달성 및 브랜드 인지도 제고',
     10, 3),
    (v_cat_performance,
     '재고 관리',
     '적정 재고 수준 유지, 과잉/부족 재고 최소화를 통한 운영 효율성 확보',
     10, 4),
    (v_cat_performance,
     '톤앤매너 및 품질 관리',
     '브랜드 톤앤매너 일관성 유지 및 제품 품질 기준 충족',
     10, 5),
    (v_cat_performance,
     '트렌드 분석 및 시장 대응',
     '시장 트렌드를 선제적으로 분석하고 적시에 사업 전략에 반영',
     10, 6),
    (v_cat_performance,
     '일정 준수',
     '프로젝트 일정 계획을 수립하고 핵심 마일스톤을 기한 내 달성',
     10, 7);

  -- ═════════════════════════════════════════════════════════════════
  -- 4. 평가 항목 — 역량평가 (3개)
  -- ═════════════════════════════════════════════════════════════════
  INSERT INTO public.evaluation_items (category_id, name, description, max_score, sort_order) VALUES
    (v_cat_competency,
     '근태 및 조직 적응력',
     '출퇴근 및 근무 규정 준수, 조직 문화에 대한 적응과 협업 자세',
     10, 1),
    (v_cat_competency,
     '커뮤니케이션 능력',
     '팀 내외부 이해관계자와의 원활한 소통 및 정보 공유',
     10, 2),
    (v_cat_competency,
     '자기 개발 및 성장 의지',
     '직무 역량 향상을 위한 자기 학습 노력 및 피드백 수용 태도',
     10, 3);

  -- ═════════════════════════════════════════════════════════════════
  -- 5. 2026년 1분기 평가 기간
  -- ═════════════════════════════════════════════════════════════════
  INSERT INTO public.evaluation_periods (year, quarter, status, start_date, end_date)
  VALUES (2026, 1, 'in_progress', '2026-01-01', '2026-03-31')
  RETURNING id INTO v_period_id;

  RAISE NOTICE '평가 기간 생성 완료: 2026 Q1 (id=%)', v_period_id;

  -- ═════════════════════════════════════════════════════════════════
  -- 6. 평가자별 가중치
  -- ═════════════════════════════════════════════════════════════════
  INSERT INTO public.evaluation_weights (period_id, evaluator_role, weight) VALUES
    (v_period_id, 'self',          0.10),
    (v_period_id, 'leader',        0.20),
    (v_period_id, 'director_kim',  0.15),
    (v_period_id, 'director_kang', 0.15),
    (v_period_id, 'executive',     0.20),
    (v_period_id, 'ceo',           0.20);

  RAISE NOTICE '가중치 설정 완료 (합계=1.00)';
  RAISE NOTICE '====================================';
  RAISE NOTICE '시드 데이터 입력 완료!';
  RAISE NOTICE '====================================';

END $$;
