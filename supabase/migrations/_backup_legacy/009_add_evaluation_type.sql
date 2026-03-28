-- 009: evaluation_items에 evaluation_type 컬럼 추가 + 항목 이름/설명 업데이트
-- evaluation_type: 'quantitative' (정량), 'qualitative' (정성), 'mixed' (정량+정성)

-- 1. evaluation_type 컬럼 추가
ALTER TABLE public.evaluation_items
  ADD COLUMN IF NOT EXISTS evaluation_type text DEFAULT 'qualitative'
  CHECK (evaluation_type IN ('quantitative', 'qualitative', 'mixed'));

-- 2. 업적평가 항목 업데이트 (sort_order 1~7)
-- 항목 1: 상품 이익률 및 원가 관리 (정량)
UPDATE public.evaluation_items
SET name = '상품 이익률 및 원가 관리',
    description = '상품별 이익률 목표 달성도 및 원가 절감 노력을 평가합니다.',
    evaluation_type = 'quantitative'
WHERE sort_order = 1
  AND category_id = (SELECT id FROM public.evaluation_categories WHERE name = '업적평가');

-- 항목 2: 신제품 기획 및 라인업 전략 (정성)
UPDATE public.evaluation_items
SET name = '신제품 기획 및 라인업 전략',
    description = '신규 상품 기획력과 브랜드 라인업 확장 전략의 적절성을 평가합니다.',
    evaluation_type = 'qualitative'
WHERE sort_order = 2
  AND category_id = (SELECT id FROM public.evaluation_categories WHERE name = '업적평가');

-- 항목 3: 프로모션 기획 및 마케팅 효율 (정량+정성)
UPDATE public.evaluation_items
SET name = '프로모션 기획 및 마케팅 효율',
    description = '프로모션 성과(매출, ROI)와 마케팅 기획의 창의성을 종합 평가합니다.',
    evaluation_type = 'mixed'
WHERE sort_order = 3
  AND category_id = (SELECT id FROM public.evaluation_categories WHERE name = '업적평가');

-- 항목 4: 수요 예측 및 재고 관리 (정량)
UPDATE public.evaluation_items
SET name = '수요 예측 및 재고 관리',
    description = '수요 예측 정확도와 적정 재고 수준 유지 능력을 평가합니다.',
    evaluation_type = 'quantitative'
WHERE sort_order = 4
  AND category_id = (SELECT id FROM public.evaluation_categories WHERE name = '업적평가');

-- 항목 5: 브랜드 톤앤매너 및 품질 관리 (정성)
UPDATE public.evaluation_items
SET name = '브랜드 톤앤매너 및 품질 관리',
    description = '브랜드 일관성 유지 및 상품 품질 관리 역량을 평가합니다.',
    evaluation_type = 'qualitative'
WHERE sort_order = 5
  AND category_id = (SELECT id FROM public.evaluation_categories WHERE name = '업적평가');

-- 항목 6: 트렌드 분석 및 경쟁사 대응 (정성)
UPDATE public.evaluation_items
SET name = '트렌드 분석 및 경쟁사 대응',
    description = '시장 트렌드 파악 능력과 경쟁사 동향 대응 전략을 평가합니다.',
    evaluation_type = 'qualitative'
WHERE sort_order = 6
  AND category_id = (SELECT id FROM public.evaluation_categories WHERE name = '업적평가');

-- 항목 7: 일정 준수 및 유관 부서 리딩 (정량+정성)
UPDATE public.evaluation_items
SET name = '일정 준수 및 유관 부서 리딩',
    description = '프로젝트 일정 준수율과 유관 부서 간 협업 리더십을 평가합니다.',
    evaluation_type = 'mixed'
WHERE sort_order = 7
  AND category_id = (SELECT id FROM public.evaluation_categories WHERE name = '업적평가');

-- 3. 역량평가 항목 업데이트 (sort_order 1~3)
-- 항목 8: 근태 및 사내 규정 준수 (정량)
UPDATE public.evaluation_items
SET name = '근태 및 사내 규정 준수',
    description = '출결 관리, 근태 기록 및 사내 규정 준수 여부를 평가합니다.',
    evaluation_type = 'quantitative'
WHERE sort_order = 1
  AND category_id = (SELECT id FROM public.evaluation_categories WHERE name = '역량평가');

-- 항목 9: 커뮤니케이션 및 보고 태도 (정성)
UPDATE public.evaluation_items
SET name = '커뮤니케이션 및 보고 태도',
    description = '업무 보고의 적시성, 정확성 및 동료 간 소통 능력을 평가합니다.',
    evaluation_type = 'qualitative'
WHERE sort_order = 2
  AND category_id = (SELECT id FROM public.evaluation_categories WHERE name = '역량평가');

-- 항목 10: 업무 적극성 및 조직 적응 (정성)
UPDATE public.evaluation_items
SET name = '업무 적극성 및 조직 적응',
    description = '업무에 대한 적극적인 태도와 조직 문화 적응력을 평가합니다.',
    evaluation_type = 'qualitative'
WHERE sort_order = 3
  AND category_id = (SELECT id FROM public.evaluation_categories WHERE name = '역량평가');
