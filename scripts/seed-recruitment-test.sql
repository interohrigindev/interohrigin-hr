-- =====================================================================
-- 채용관리 테스트 데이터 (페르소나 2명)
-- Supabase Dashboard > SQL Editor 에서 실행하세요
--
-- 페르소나 1: 박민수 (풀스택 개발자) - yong7903@gmail.com
-- 페르소나 2: 김서연 (UI/UX 디자이너) - koreabylocal@gmail.com
-- =====================================================================

DO $$
DECLARE
  v_posting_id   UUID;
  v_dept_id      UUID;
  v_cand1_id     UUID;
  v_cand2_id     UUID;
  v_template_id  UUID;
BEGIN

  -- 부서 ID 조회 (첫 번째 부서 사용)
  SELECT id INTO v_dept_id FROM public.departments ORDER BY name LIMIT 1;

  -- ═══════════════════════════════════════════════════════════════
  -- 1. 테스트 채용공고 생성
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO public.job_postings (
    title, department_id, position, employment_type, experience_level,
    description, requirements, preferred, salary_range,
    status, deadline, ai_questions
  ) VALUES (
    '풀스택 개발자 (React + Node.js)',
    v_dept_id,
    '개발팀 시니어',
    'full_time',
    'mid',
    E'• React/TypeScript 기반 웹 프론트엔드 개발\n• Node.js/Express 백엔드 API 개발\n• Supabase(PostgreSQL) 데이터베이스 설계 및 운영\n• CI/CD 파이프라인 구축 및 관리\n• AI 기능 연동 개발 (Gemini, OpenAI 등)',
    E'• React + TypeScript 3년 이상 경력\n• REST API 설계 및 구현 경험\n• SQL 데이터베이스 운용 경험\n• Git 기반 협업 경험',
    E'• Supabase/Firebase 사용 경험\n• Tailwind CSS 사용 경험\n• AI/ML 관련 프로젝트 참여 경험\n• 스타트업 근무 경험\n• UI/UX 디자인 감각',
    '4,000만원 ~ 6,000만원',
    'open',
    '2026-05-31',
    '["이전 프로젝트에서 가장 도전적이었던 기술적 문제와 해결 방법을 설명해주세요.", "React와 TypeScript를 사용한 프로젝트에서 상태 관리를 어떻게 했는지 설명해주세요.", "팀 내 코드 리뷰 경험과 본인의 코드 품질 관리 방법을 알려주세요."]'::jsonb
  )
  RETURNING id INTO v_posting_id;

  RAISE NOTICE '채용공고 생성: 풀스택 개발자 (id=%)', v_posting_id;

  -- ═══════════════════════════════════════════════════════════════
  -- 2. 사전 질의서 템플릿 생성
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO public.pre_survey_templates (
    name, job_type, experience_type, questions, is_active
  ) VALUES (
    '경력직 개발자 사전 질의서',
    '개발',
    'experienced',
    '[
      {"id": "q1", "question": "이전 직장에서 맡았던 주요 프로젝트와 본인의 역할을 설명해주세요.", "type": "text", "required": true},
      {"id": "q2", "question": "가장 자신 있는 기술 스택 3가지와 각각의 숙련도를 알려주세요.", "type": "text", "required": true},
      {"id": "q3", "question": "팀에서 갈등이 생겼을 때 어떻게 해결하시나요?", "type": "text", "required": true},
      {"id": "q4", "question": "인터오리진에 지원하게 된 계기는 무엇인가요?", "type": "text", "required": true},
      {"id": "q5", "question": "희망 연봉 범위를 알려주세요.", "type": "choice", "options": ["3,000~4,000만원", "4,000~5,000만원", "5,000~6,000만원", "6,000만원 이상", "협의"], "required": true},
      {"id": "q6", "question": "원격 근무에 대한 선호도를 알려주세요.", "type": "scale", "required": false}
    ]'::jsonb,
    true
  )
  RETURNING id INTO v_template_id;

  RAISE NOTICE '질의서 템플릿 생성 (id=%)', v_template_id;

  -- ═══════════════════════════════════════════════════════════════
  -- 3. 페르소나 1: 박민수 (풀스택 개발자, 5년 경력, 지인추천)
  --    이메일: yong7903@gmail.com
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO public.candidates (
    job_posting_id, name, email, phone,
    source_channel, source_detail,
    cover_letter_text, status, invite_token
  ) VALUES (
    v_posting_id,
    '박민수',
    'yong7903@gmail.com',
    '010-1234-5678',
    'referral',
    '개발팀 김대리 추천',
    E'안녕하세요. 5년차 풀스택 개발자 박민수입니다.\n\nReact와 Node.js를 주력으로 사용하며, 최근 3년간 SaaS 스타트업에서 프론트엔드 리드를 맡고 있습니다. Supabase와 Firebase를 활용한 서버리스 아키텍처에 관심이 많으며, AI 기반 서비스 개발에 참여한 경험이 있습니다.\n\n주요 경력:\n- (현) TechFlow Inc. 프론트엔드 리드 (2023~현재)\n- ZeroBase 풀스택 개발자 (2021~2023)\n- StartupHub 주니어 개발자 (2020~2021)\n\n기술 스택: React, TypeScript, Node.js, PostgreSQL, Supabase, Tailwind CSS, Docker\n\n인터오리진의 HR 플랫폼은 AI와 HR을 결합한 혁신적인 프로젝트라고 생각하며, 제 기술력으로 기여하고 싶습니다.',
    'applied',
    'recruit_test_minsoo_20260402'
  )
  RETURNING id INTO v_cand1_id;

  RAISE NOTICE '페르소나 1 생성: 박민수 / yong7903@gmail.com (id=%)', v_cand1_id;

  -- ═══════════════════════════════════════════════════════════════
  -- 4. 페르소나 2: 김서연 (UI/UX 디자이너 겸 프론트엔드, 3년 경력, 잡코리아)
  --    이메일: koreabylocal@gmail.com
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO public.candidates (
    job_posting_id, name, email, phone,
    source_channel, source_detail,
    cover_letter_text, status, invite_token
  ) VALUES (
    v_posting_id,
    '김서연',
    'koreabylocal@gmail.com',
    '010-9876-5432',
    'job_korea',
    NULL,
    E'안녕하세요. 3년차 UI/UX 디자이너 겸 프론트엔드 개발자 김서연입니다.\n\nFigma와 Framer를 활용한 프로토타이핑에 강점이 있으며, 최근에는 React 기반 프론트엔드 개발도 병행하고 있습니다. 사용자 리서치부터 디자인 시스템 구축, 프론트엔드 구현까지 풀사이클 디자인이 가능합니다.\n\n주요 경력:\n- (현) DesignLab 시니어 디자이너 (2024~현재)\n- CreativeWorks UI/UX 디자이너 (2023~2024)\n- 프리랜서 웹디자이너 (2022~2023)\n\n기술 스택: Figma, React, TypeScript, Tailwind CSS, Framer Motion, Storybook\n\n인터오리진 HR 플랫폼의 사용자 경험을 한층 더 발전시킬 수 있는 디자인 역량을 갖추고 있습니다. 개발 능력을 겸비한 디자이너로서 효율적인 협업이 가능합니다.',
    'applied',
    'recruit_test_seoyeon_20260402'
  )
  RETURNING id INTO v_cand2_id;

  RAISE NOTICE '페르소나 2 생성: 김서연 / koreabylocal@gmail.com (id=%)', v_cand2_id;

  -- ═══════════════════════════════════════════════════════════════
  -- 완료 안내
  -- ═══════════════════════════════════════════════════════════════
  RAISE NOTICE '';
  RAISE NOTICE '====================================================';
  RAISE NOTICE '채용 테스트 데이터 생성 완료!';
  RAISE NOTICE '====================================================';
  RAISE NOTICE '채용공고: 풀스택 개발자 (React + Node.js)';
  RAISE NOTICE '';
  RAISE NOTICE '페르소나 1: 박민수';
  RAISE NOTICE '  이메일:    yong7903@gmail.com';
  RAISE NOTICE '  경로:      지인추천 (개발팀 김대리)';
  RAISE NOTICE '  질의서 URL: /survey/recruit_test_minsoo_20260402';
  RAISE NOTICE '';
  RAISE NOTICE '페르소나 2: 김서연';
  RAISE NOTICE '  이메일:    koreabylocal@gmail.com';
  RAISE NOTICE '  경로:      잡코리아';
  RAISE NOTICE '  질의서 URL: /survey/recruit_test_seoyeon_20260402';
  RAISE NOTICE '====================================================';

END $$;
