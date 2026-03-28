-- =====================================================================
-- Phase 3: 데이터 마이그레이션 Part 2 (FREE -> PRO)
-- PRO DB SQL Editor에서 실행
--
-- Part 1에서 departments, employees 삽입 완료 전제
-- FK 체크 임시 비활성화 후 삽입
-- =====================================================================

-- FK 체크 비활성화 (같은 세션에서 실행해야 유효)
SET session_replication_role = 'replica';

BEGIN;

-- =====================================================================
-- 1. ai_settings (3개)
-- =====================================================================
DELETE FROM ai_settings WHERE id IN (
  'acbca939-c326-4bb9-acfc-f4f7c707dc3b',
  'b1e787ba-1fa3-4fb7-b1a6-a7ae035d1492',
  '4dcf18bb-44a7-4b58-84d8-35bab114d2b1'
);

INSERT INTO ai_settings (id, provider, api_key, model, is_active, module, created_at, updated_at) VALUES
('acbca939-c326-4bb9-acfc-f4f7c707dc3b', 'gemini', 'AIzaSyCLdabmtARPrahVZ4kqYeq1MZ9RRGIJ9oc', 'gemini-2.5-flash', false, 'hr', '2026-03-08T06:15:51.689877+00:00', '2026-03-08T06:15:51.689877+00:00'),
('b1e787ba-1fa3-4fb7-b1a6-a7ae035d1492', 'claude', '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', 'claude-haiku-4-5-20251001', false, 'hr', '2026-03-17T05:08:54.299513+00:00', '2026-03-17T05:08:54.299513+00:00'),
('4dcf18bb-44a7-4b58-84d8-35bab114d2b1', 'openai', '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', 'gpt-4o', true, 'hr', '2026-03-23T06:58:58.624597+00:00', '2026-03-23T06:58:58.624597+00:00');

-- =====================================================================
-- 2. pre_survey_templates (5개)
-- =====================================================================
DELETE FROM pre_survey_templates WHERE id IN (
  '3e4d2759-025e-41fd-87b2-184a037a1749',
  '914abec7-d8c1-46e5-95d4-b7abd99bb6a6',
  '2262e677-2bf6-40a6-ab42-a623702ed2b8',
  '2131aee0-949e-497d-b904-6716465d0e15',
  'd22d1d79-1d59-42e5-9675-2013b04aa275'
);

INSERT INTO pre_survey_templates (id, name, job_type, experience_type, questions, is_active, created_by, created_at, updated_at) VALUES
(
  '3e4d2759-025e-41fd-87b2-184a037a1749',
  '경영지원팀 신입',
  '경영지원',
  'any',
  '[{"id":"q1","type":"text","question":"경영지원 직무에 지원하신 동기는 무엇이며, 해당 직무에서 어떤 역량을 발휘하고 싶으신가요?","required":true},{"id":"q2","type":"text","question":"저희 회사에 대해 알고 있는 점이나 지원하게 된 구체적인 계기가 있다면 말씀해주세요.","required":true},{"id":"q3","type":"text","question":"동시에 여러 가지 업무 요청을 받았을 때, 어떤 기준으로 우선순위를 정하고 처리할지 구체적인 방법을 설명해주세요.","required":true},{"id":"q4","type":"text","question":"업무를 처리할 때 꼼꼼함과 정확성을 유지하기 위해 어떤 노력을 하시나요? (경험이 있다면 예시를 들어 설명해 주세요)","required":true},{"id":"q5","type":"choice","options":["하 (기본 기능 이해)","중 (자주 사용하는 기능 활용 가능)","상 (고급 기능 및 활용 능숙)"],"question":"MS Office (워드, 엑셀, 파워포인트) 프로그램 활용 능력은 어느 정도라고 생각하시나요? (해당하는 수준을 선택해주세요)","required":true},{"id":"q6","type":"text","question":"팀 프로젝트, 동아리 활동, 아르바이트 등 협업 경험에서 본인이 주로 어떤 역할을 수행했으며, 팀에 어떤 방식으로 기여했는지 설명해주세요.","required":true},{"id":"q7","type":"text","question":"새로운 업무나 예상치 못한 문제가 발생했을 때, 이를 해결하기 위해 어떤 태도로 임하고 어떻게 학습하거나 대처하는 편이신가요?","required":true},{"id":"q8","type":"text","question":"생년월일을 입력해주세요. (예: YYYY-MM-DD)","required":true},{"id":"q9","type":"text","question":"본인의 MBTI 유형을 입력해주세요. (예: ISTJ)","required":true},{"id":"q10","type":"text","question":"한자 이름을 입력해주세요. (예: 홍길동(洪吉童))","required":true}]'::jsonb,
  true,
  '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b',
  '2026-03-17T04:16:40.563446+00:00',
  '2026-03-17T04:16:40.563446+00:00'
),
(
  '914abec7-d8c1-46e5-95d4-b7abd99bb6a6',
  '브랜드사업본부',
  '뷰티매니저',
  'experienced',
  '[{"id":"q1","type":"text","question":"뷰티매니저로서 가장 최근 근무했던 회사와 담당했던 주요 업무를 구체적으로 설명해주세요.","required":true},{"id":"q2","type":"choice","options":["소규모(1~2개 매장)","중규모(3~5개 매장)","대규모(5개 이상 또는 지역담당)"],"question":"이전 직장에서 관리했던 뷰티 브랜드(매장)의 규모는 어느 정도였나요?","required":true},{"id":"q3","type":"text","question":"뷰티매니저로서 매출 성장, 고객만족도 개선 등에서 달성한 주요 성과를 구체적 수치와 함께 설명해주세요.","required":true},{"id":"q4","max":5,"min":1,"type":"scale","maxLabel":"전문가 수준","minLabel":"기본 수준","question":"뷰티 제품(스킨케어, 메이크업, 헤어 등)에 대한 전문 지식 수준은 어떻게 평가하시나요?","required":true},{"id":"q5","type":"text","question":"직원 교육 및 팀 관리 경험을 설명해주세요. (교육 방식, 팀 규모, 성과 등)","required":true},{"id":"q6","type":"text","question":"고객 클레임이나 매출 부진 상황에서 해결했던 사례를 구체적으로 설명해주세요.","required":true},{"id":"q7","type":"text","question":"뷰티 산업의 최신 트렌드나 신제품 정보 수집 및 활용 경험이 있으신가요?","required":true},{"id":"q8","type":"text","question":"본사 또는 상위 조직과의 소통 경험 중 주요 프로젝트나 협력 사례를 설명해주세요.","required":true},{"id":"q9","type":"text","question":"뷰티매니저 직무에 지원한 가장 큰 이유는 무엇인가요?","required":true},{"id":"q10","type":"text","question":"생년월일을 입력해주세요. (예: 1990.01.15)","required":true},{"id":"q11","type":"choice","options":["ISTJ","ISFJ","INFJ","INTJ","ISTP","ISFP","INFP","INTP","ESTP","ESFP","ENFP","ENTP","ESTJ","ESFJ","ENFJ","ENTJ","모름"],"question":"MBTI 유형을 선택해주세요.","required":true},{"id":"q12","type":"text","question":"한자 이름을 입력해주세요.","required":true}]'::jsonb,
  true,
  '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b',
  '2026-03-17T07:18:25.41702+00:00',
  '2026-03-17T07:18:25.41702+00:00'
),
(
  '2262e677-2bf6-40a6-ab42-a623702ed2b8',
  '경영관리본부(공통)',
  '공통',
  'any',
  '[{"id":"q1774328995310","type":"text","question":"귀하는 채용공고를 어디서 보셨습니까?","required":false},{"id":"q1774329006009","type":"text","question":"귀하가 지원한 분야는 무엇이며, 지원한 직무에 대하여 예상 업무를 간략히 기술해주세요.","required":false},{"id":"q1774329009939","type":"text","question":"(경력) 전직장 담당업무/퇴사일/퇴사사유/직전연봉을 작성해주세요.","required":false},{"id":"q1774329013342","type":"text","question":"(경력) 전직장 전체 인원수 및 소속부서 인원수를 작성해주세요.","required":false},{"id":"q1774329026920","type":"text","question":"귀하의 현재 거주지와 출근시 예상 소요시간을 작성해주세요.","required":false},{"id":"q1774329028673","type":"text","question":"채용 확정시 출근가능일자를 작성해주세요.","required":false},{"id":"q1774329032628","type":"text","question":"채용 확정시 희망연봉을 작성해주세요. (수습 급여는 면접시 협의)","required":false},{"id":"q1774329040222","type":"text","question":"채용 확정 시 최소 1년 이상 근무가 가능하십니까?","required":false},{"id":"q1774329045061","type":"text","question":"회사를 선택하는 기준이 무엇입니까?","required":false},{"id":"q1774329046575","type":"text","question":"필수서류 제출이 가능하신가요? (원천징수영수증, 경력증명서, 사업자등록여부확인서, 범죄경력회보서 등)","required":false},{"id":"q1774329058772","type":"text","question":"업무기간 내 경업을 금지하는 것에 동의하십니까? (아르바이트 및 프리랜서, 이중취업 등)","required":false},{"id":"q1774329063016","type":"text","question":"운전면허증이 있으신가요? 그리고 운전에 능숙하신가요?","required":false},{"id":"q1774329070611","type":"text","question":"당사 홈페이지를 통해 마케팅영업본부 포트폴리오와 브랜드사업본부 자사 브랜드 사이트를 확인하셨나요? www.interohrigininc.com","required":false},{"id":"q1774329075572","type":"text","question":"면접자의 편의를 고려하여 화상회의 방식으로 진행하며, 면접 중 인터뷰 내용이 녹화 및 녹음 될 수 있습니다.  녹음된 내용은 인사담당자의 면접 평가 목적으로만 사용되며, 면접 평가 이후 즉시 안전하게 폐기됩니다.  저희는 면접자의 개인 정보와 사생활은 철저히 보호할것을 확약하며, 면접자는 이 점에 대해 충분히 이해하시고 동의하시겠습니까?","required":false}]'::jsonb,
  true,
  '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b',
  '2026-03-24T05:11:29.362514+00:00',
  '2026-03-24T05:11:29.362514+00:00'
),
(
  '2131aee0-949e-497d-b904-6716465d0e15',
  '마케팅영업본부',
  '공통',
  'any',
  '[{"id":"q1774328803292","type":"text","question":"채용공고를 어디서 보셨습니까?","required":false},{"id":"q1774328834389","type":"text","question":"귀하가 지원한 분야는 무엇이며, 지원한 직무에 대하여 예상 업무를 간략히 기술해주세요.","required":false},{"id":"q1774328861610","type":"text","question":"귀하의 현재 거주지와 출근시 예상 소요시간을 작성해주세요.","required":false},{"id":"q1774328866887","type":"text","question":"(경력) 전직장 담당업무/퇴사일/퇴사사유/직전연봉을 작성해주세요. (신입의 경우, 아르바이트 및 프리랜서 활동 포함)","required":false},{"id":"q1774328872637","type":"text","question":"채용 확정시 출근가능일자를 작성해주세요.","required":false},{"id":"q1774328878305","type":"text","question":"채용 확정시 희망연봉을 작성해주세요. (수습 급여는 면접시 협의)","required":false},{"id":"q1774328882654","type":"text","question":"채용 확정시 최소 1년 이상 근무가 가능하십니까?","required":false},{"id":"q1774328886372","type":"text","question":"회사를 선택하는 기준이 무엇입니까?","required":false},{"id":"q1774328890038","type":"text","question":"필수서류 제출이 가능하신가요? (원천징수영수증, 경력증명서, 사업자등록여부확인서, 범죄경력회보서 등)","required":false},{"id":"q1774328892302","type":"text","question":"업무기간 내 경업을 금지하는 것에 동의하십니까? (아르바이트 및 프리랜서, 이중취업 등)","required":false},{"id":"q1774328899270","type":"text","question":"운전면허증이 있으신가요? 그리고 운전에 능숙하신가요?","required":false},{"id":"q1774328904292","type":"text","question":"당사 홈페이지를 통해 마케팅영업본부 포트폴리오와 브랜드사업본부 자사 브랜드 사이트를 확인하셨나요? www.interohrigin.com","required":false},{"id":"q1774328908465","type":"text","question":"면접자의 편의를 고려하여 화상회의 방식으로 진행하며, 면접 중 인터뷰 내용이 녹화 및 녹음 될 수 있습니다.  녹음된 내용은 인사담당자의 면접 평가 목적으로만 사용되며, 면접 평가 이후 즉시 안전하게 폐기됩니다.  저희는 면접자의 개인 정보와 사생활은 철저히 보호할것을 확약하며, 면접자는 이 점에 대해 충분히 이해하시고 동의하시겠습니까?","required":false}]'::jsonb,
  true,
  '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b',
  '2026-03-24T05:08:33.355409+00:00',
  '2026-03-24T05:11:37.799908+00:00'
),
(
  'd22d1d79-1d59-42e5-9675-2013b04aa275',
  '브랜드사업본부(해외사업)',
  '해외사업',
  'any',
  '[{"id":"q1774329680446","type":"text","question":"귀하는 채용공고를 어디서 보셨습니까?","required":false},{"id":"q1774329685731","type":"text","question":"귀하가 지원한 분야는 무엇이며, 지원한 직무에 대하여 예상 업무를 간략히 기술해주세요.","required":false},{"id":"q1774329689825","type":"text","question":"귀하의 현재 거주지와 출근시 예상 소요시간을 작성해주세요.","required":false},{"id":"q1774329693203","type":"text","question":"귀하의 국적은 어디이며, 외국인일 경우 비자도 작성해주세요.","required":false},{"id":"q1774329697193","type":"text","question":"(경력) 전직장 담당업무/퇴사일/퇴사사유/직전연봉을 작성해주세요. (신입의 경우, 아르바이트 및 프리랜서 활동 포함)","required":false},{"id":"q1774329701139","type":"text","question":"채용 확정 시 출근가능일자를 작성해주세요.","required":false},{"id":"q1774329706590","type":"text","question":"채용 확정시 희망연봉을 작성해주세요. (수습 급여는 면접시 협의)","required":false},{"id":"q1774329711160","type":"text","question":"채용 확정시 최소 1년 이상 근무가 가능하십니까?","required":false},{"id":"q1774329715777","type":"text","question":"회사를 선택하는 기준이 무엇입니까?","required":false},{"id":"q1774329719271","type":"text","question":"필수서류 제출이 가능하신가요? (원천징수영수증, 경력증명서, 사업자등록여부확인서, 범죄경력회보서 등)","required":false},{"id":"q1774329722497","type":"text","question":"업무기간 내 경업을 금지하는 것에 동의하십니까? (아르바이트 및 프리랜서, 이중취업 등)","required":false},{"id":"q1774329725621","type":"text","question":"업무에 활용 가능한 비즈니스 회화가 가능하신가요? * 해당 언어와 능력에 대해 기재 부탁드립니다.","required":false},{"id":"q1774329729174","type":"text","question":"당사 홈페이지를 통해 마케팅영업본부 포트폴리오와 브랜드사업본부 자사 브랜드 사이트를 확인하셨나요? www.interohrigininc.com","required":false},{"id":"q1774329733032","type":"text","question":"면접자의 편의를 고려하여 화상회의 방식으로 진행하며, 면접 중 인터뷰 내용이 녹화 및 녹음 될 수 있습니다.  녹음된 내용은 인사담당자의 면접 평가 목적으로만 사용되며, 면접 평가 이후 즉시 안전하게 폐기됩니다.  저희는 면접자의 개인 정보와 사생활은 철저히 보호할것을 확약하며, 면접자는 이 점에 대해 충분히 이해하시고 동의하시겠습니까?","required":false}]'::jsonb,
  true,
  '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b',
  '2026-03-24T05:22:18.478813+00:00',
  '2026-03-24T05:22:18.478813+00:00'
);

-- =====================================================================
-- 3. job_postings (13개)
-- =====================================================================
DELETE FROM job_postings WHERE id IN (
  'be2b01a8-94bf-42de-877b-2da673444d2a',
  '7f53f2e0-aa61-48ab-ae5d-677ccdb7ed6d',
  '9e978319-5381-4ac2-9607-888833839f34',
  '16a8a303-1e3c-4b2d-ae09-8d479d9c9cb1',
  '91d04395-9ed9-49a3-8702-85cfdc43ab68',
  'd246a805-9de2-4e89-bc5c-730c6bc843e5',
  '1f9e5fff-517d-4c38-a629-05f3191f1108',
  '5008db76-6429-445b-9f76-f6652e6e71e5',
  '9f89d1b5-dd85-48fc-ac5d-28e0044da47f',
  'd6acdf2f-2192-458b-9647-e37b670d074d',
  '6c65518b-b809-4828-9ddd-9c373b23d950',
  '020a1695-4899-4cac-a76c-17a48f6e2556',
  '9b8c3244-f21c-4505-a22c-8122d4c61045'
);

-- 1) [인턴] 경영관리본부 인사/총무 인턴 채용
INSERT INTO job_postings (id, title, department_id, position, employment_type, experience_level, description, requirements, preferred, salary_range, ai_questions, status, deadline, created_by, created_at, updated_at, location, work_hours, headcount, benefits, hiring_process, contact_name, contact_email, contact_phone, company_intro, team_intro, survey_template_id) VALUES (
  'be2b01a8-94bf-42de-877b-2da673444d2a',
  '[인턴] 경영관리본부 인사/총무 인턴 채용',
  'd0000000-0000-0000-0000-000000000002',
  '인사/총무 인턴',
  'intern',
  'entry',
  E'- 인사 서류 관리 및 데이터 입력 보조\n- 채용 프로세스 지원 (면접 일정 조율, 지원자 관리)\n- 복리후생 업무 보조 (경조사, 건강검진 등)\n- 사내 행사 기획 및 운영 지원\n- 일반 총무 업무 (사무용품 관리, 시설 관리 등)',
  E'- 대학교 3학년 이상 또는 졸업(예정)자\n- MS Office (Excel, Word, PowerPoint) 기본 활용 가능\n- 꼼꼼하고 책임감 있는 성격\n- 6개월 이상 근무 가능자\n- 주 5일 풀타임 근무 가능자',
  E'- 경영, 인사/조직, 심리학 관련 전공\n- HR 관련 인턴 경험\n- 인사관리사, 비서 자격증 보유자\n- 밝고 긍정적인 커뮤니케이션 역량',
  '월 210만원 (정규직 전환 시 협의)',
  '["인사/총무 업무에 관심을 갖게 된 계기는 무엇인가요?","팀 프로젝트에서 본인이 주로 맡는 역할은 무엇인가요?","여러 업무가 동시에 주어졌을 때 우선순위를 어떻게 정하시나요?","인터오리진에 대해 알고 있는 것이 있다면 말씀해주세요.","인턴 기간 동안 꼭 배우고 싶은 것은 무엇인가요?"]'::jsonb,
  'open',
  '2026-04-07',
  NULL,
  '2026-03-17T05:15:17.629586+00:00',
  '2026-03-25T10:25:13.97031+00:00',
  '서울 강남구 테헤란로',
  '09:00~18:00 (주 5일)',
  1,
  E'- 4대보험 적용\n- 점심 식대 지원\n- 교통비 지원 (월 10만원)\n- 정규직 전환 기회 (수습 3개월 후 평가)\n- 인사 실무 경험 + 수료증 발급',
  E'1단계: 서류 접수\n2단계: 사전 질의서 (AI 생성, 10분)\n3단계: 화상 면접 (15분)\n4단계: 대면 면접 (30분)\n5단계: 합격 통보\n\n※ 전형 소요: 약 1주',
  '인사담당 차주용',
  'hr@interohrigin.com',
  '02-555-0100',
  '(주)인터오리진은 함께 성장하는 문화를 중시합니다. 인턴도 정직원과 동일한 업무 환경에서 실무를 경험하며, 우수 인턴에게는 정규직 전환 기회를 제공합니다.',
  '경영관리본부는 인사, 재무, 총무를 담당하는 4명 규모의 팀입니다. 소규모 팀이기 때문에 다양한 업무를 경험할 수 있으며, 인사 실무 전반을 배울 수 있는 환경입니다.',
  '3e4d2759-025e-41fd-87b2-184a037a1749'
);

-- 2) [경력] 경영관리본부 재무회계 리더 채용
INSERT INTO job_postings (id, title, department_id, position, employment_type, experience_level, description, requirements, preferred, salary_range, ai_questions, status, deadline, created_by, created_at, updated_at, location, work_hours, headcount, benefits, hiring_process, contact_name, contact_email, contact_phone, company_intro, team_intro, survey_template_id) VALUES (
  '7f53f2e0-aa61-48ab-ae5d-677ccdb7ed6d',
  '[경력] 경영관리본부 재무회계 리더 채용',
  'd0000000-0000-0000-0000-000000000002',
  '재무회계 리더',
  'full_time',
  'senior',
  E'- 전표 작성 및 결산 등 재무회계 전반\n- 자체 기장 및 세무 신고 관리\n- 부가세 ·법인세·원천세 등 각종 세무신고\n- 외부 회계 감사 및 세무 조사 대응\n- 자금 관리 및 경영진 보고\n- 연말 결산 및 조정 업무\n- IR 및 투자사 관리업무\n- 그 외 회계 관련 전반적인 업무',
  E'- 경력 7년 이상 (회계·재무·세무 분야)\n- 관련 업무 팀장 경력 있는 분\n- 꼼꼼하고 책임감 있게 업무를 수행 할 수 있는 분',
  E'- 필수 업무로 자체 기장 및 직접 세무 신고 능숙자\n- 위하고/더존/이카운트ERP 등 회계 프로그램 사용 가능자',
  '4,000~5,000만원',
  '["재무회계 리더로서 가장 복잡한 결산 문제를 해결했던 경험을 설명해 주세요.","세무 신고 과정에서 예상치 못한 문제가 발생했을 때, 어떻게 대응하셨는지 구체적인 사례를 말씀해 주세요.","팀장으로서 팀원들과의 갈등 상황을 어떻게 관리하고 해결하셨는지 이야기해 주세요.","회계·재무 분야에서 앞으로의 경력 목표는 무엇이며, 이를 위해 어떤 노력을 하고 계신가요?","우리 회사의 경영관리본부 문화와 비전에 어떻게 기여할 수 있는지 설명해 주세요."]'::jsonb,
  'open',
  '2026-04-24',
  '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b',
  '2026-03-24T04:16:51.691744+00:00',
  '2026-03-25T10:25:02.208303+00:00',
  '서울시 강남구 선릉로 121길 5, 인터오리진타워',
  '09:00~18:00',
  1,
  E'- 리프레시 여름휴가 제공\n- FRIENDLY DAY(월 1회, 점심 회식)\n- 명절 상품권\n- 경조사 지원(화환, 경조 휴가 및 비용 지원 등)\n- 생일 복지\n- 사내 헬스키퍼 상주\n- 정기 건강검진 제공\n- 멘토멘티 프로그램\n- 자율복장\n-업무용 개인 노트북 지급',
  E'1. 서류 접수\n2. AI 이력서 분석 + 사전질의서\n3. 1차 화상 면접(실무진)\n4. 2차 대면 면접(임원)\n5. 최종 합격 통보',
  '최다예',
  'dy.choi@interohrigin.com',
  '02-783-8138',
  NULL,
  NULL,
  '2262e677-2bf6-40a6-ab42-a623702ed2b8'
);

-- 3) [경력] 경영관리본부 인사총무 리더 채용
INSERT INTO job_postings (id, title, department_id, position, employment_type, experience_level, description, requirements, preferred, salary_range, ai_questions, status, deadline, created_by, created_at, updated_at, location, work_hours, headcount, benefits, hiring_process, contact_name, contact_email, contact_phone, company_intro, team_intro, survey_template_id) VALUES (
  '9e978319-5381-4ac2-9607-888833839f34',
  '[경력] 경영관리본부 인사총무 리더 채용',
  'd0000000-0000-0000-0000-000000000002',
  '인사총무 리더',
  'full_time',
  'mid',
  E'- 채용 및 인력 관리\n- 인사 기획 및 운영\n- 인사 관련 법령 및 규정 준수 관리\n- 사내 교육, 조직문화 프로그램 기획 및 운영\n- 근태, 급여, 복리후생 관리\n- 정부지원사업 및 각종 인증 관련 인사 행정',
  E'- HR 전반 또는 특정 분야(채용, 평가, 보상 등) 경험자\n- 노동법, 근로기준법 등 관련 지식 보유자\n- 커뮤니케이션 및 협업 역량 우수자',
  NULL,
  '경력에 따라 협의',
  '["인사총무 리더로서 경험한 가장 도전적인 프로젝트는 무엇이었으며, 이를 어떻게 해결하셨나요?","채용 및 인력 관리 과정에서 발생할 수 있는 윤리적 딜레마를 어떻게 해결할 것인지 설명해 주세요.","조직 내에서 효과적인 인사 기획 및 운영을 위해 가장 중요하다고 생각하는 요소는 무엇인가요?","사내 교육 프로그램을 설계할 때 어떤 전략을 사용하여 직원들의 참여를 극대화하나요?","근로기준법과 관련하여 최근에 발생한 변화 중 하나를 설명하고, 이 변화를 조직 내에 어떻게 반영하셨는지 말씀해 주세요."]'::jsonb,
  'open',
  NULL,
  '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b',
  '2026-03-24T04:46:18.939069+00:00',
  '2026-03-26T04:07:01.137747+00:00',
  '서울시 강남구 선릉로 121길 5, 인터오리진타워',
  '09:00~18:00',
  1,
  E'- 리프레시 여름휴가 제공\n- FRIENDLY DAY(월 1회, 점심 회식)\n- 명절 상품권\n- 경조사 지원(화환, 경조 휴가 및 비용 지원 등)\n- 생일 복지\n- 사내 헬스키퍼 상주\n- 정기 건강검진 제공\n- 멘토멘티 프로그램\n- 자율복장\n-업무용 개인 노트북 지급',
  E'1. 서류 접수\n2. AI 이력서 분석 + 사전질의서\n3. 1차 화상 면접(실무진)\n4. 2차 대면 면접(임원)\n5. 최종 합격 통보',
  '최다예',
  'dy.choi@interohrigin.com',
  '02-783-8138',
  NULL,
  NULL,
  '2262e677-2bf6-40a6-ab42-a623702ed2b8'
);

-- 4) [경력] 브랜드사업본부 뷰티BM 채용
INSERT INTO job_postings (id, title, department_id, position, employment_type, experience_level, description, requirements, preferred, salary_range, ai_questions, status, deadline, created_by, created_at, updated_at, location, work_hours, headcount, benefits, hiring_process, contact_name, contact_email, contact_phone, company_intro, team_intro, survey_template_id) VALUES (
  '16a8a303-1e3c-4b2d-ae09-8d479d9c9cb1',
  '[경력] 브랜드사업본부 뷰티BM 채용',
  'd0000000-0000-0000-0000-000000000001',
  '뷰티BM 경력',
  'full_time',
  'junior',
  E'- 담당 브랜드 마케팅 및 Sales 관리 총괄\n- 상품 및 패키지 개발, 생산, 재고 관리\n- 자사 브랜드(뷰티·리빙·주얼리 등) 콘텐츠 기획 및 제작 전반 관리\n- CS 고객관리 및 제작 전반 관리\n- 온라인, 오프라인 판매 채널 육성 및 개척\n- 판매 데이터 분석 및 정산 업무\n- 트렌드 조사 및 시장 분석',
  E'- 컴퓨터 활용 능력 우수자\n- 커뮤니케이션 능력 우수자\n- 노션 활용 우수자\n- 해외여행에 결격사유가 없는 자\n* 남성의 경우 병역 필/면제자',
  NULL,
  '경력에 따라 협의',
  '["브랜드 마케팅 및 Sales 관리에서 가장 중요하다고 생각하는 요소는 무엇이며, 이를 성공적으로 수행한 경험이 있다면 말씀해 주세요.","상품 개발 및 패키지 디자인 과정에서 직면했던 가장 큰 도전 과제는 무엇이었고, 이를 어떻게 해결했는지 설명해 주세요.","팀 내에서 발생한 의견 충돌을 효과적으로 해결했던 경험을 공유해 주시고, 그 과정에서 배운 점은 무엇인가요?","뷰티 산업의 최신 트렌드를 어떻게 파악하고 있으며, 이를 업무에 어떻게 적용해 왔는지 구체적으로 말씀해 주세요.","회사의 조직 문화에 잘 적응했던 경험을 이야기해 주시고, 본인의 어떤 성향이 그 적응에 도움이 되었는지 설명해 주세요."]'::jsonb,
  'open',
  '2026-04-24',
  '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b',
  '2026-03-24T04:59:48.409033+00:00',
  '2026-03-24T04:59:48.409033+00:00',
  '서울시 강남구 선릉로 121길 5, 인터오리진타워',
  '09:00~18:00',
  3,
  E'- 리프레시 여름휴가 제공\n- FRIENDLY DAY(월 1회, 점심 회식)\n- 명절 상품권\n- 경조사 지원(화환, 경조 휴가 및 비용 지원 등)\n- 생일 복지\n- 사내 헬스키퍼 상주\n- 정기 건강검진 제공\n- 멘토멘티 프로그램\n- 자율복장\n-업무용 개인 노트북 지급',
  E'1. 서류 접수\n2. AI 이력서 분석 + 사전질의서\n3. 1차 화상 면접(실무진)\n4. 2차 대면 면접(임원)\n5. 최종 합격 통보',
  '최다예',
  'dy.choi@interohrigin.com',
  '02-783-8138',
  NULL,
  NULL,
  NULL
);

-- 5) [인터오리진아이엔씨] 공개채용 마케팅영업본부
INSERT INTO job_postings (id, title, department_id, position, employment_type, experience_level, description, requirements, preferred, salary_range, ai_questions, status, deadline, created_by, created_at, updated_at, location, work_hours, headcount, benefits, hiring_process, contact_name, contact_email, contact_phone, company_intro, team_intro, survey_template_id) VALUES (
  '91d04395-9ed9-49a3-8702-85cfdc43ab68',
  '[인터오리진아이엔씨] 공개채용 마케팅영업본부',
  'd0000000-0000-0000-0000-000000000003',
  '마케터 / 경력 별 협의',
  'full_time',
  'junior',
  E'온라인 퍼포먼스 매체 운영, 분석 및 최적화\n트래킹 툴 활용한 매체별 성과 분석 및 리포트\n광고주 및 매체 커뮤니케이션\n광고 캠페인 수주를 위한 제안서 작업',
  '관련 경력 1년 이상',
  'GA 등 분석 ',
  '경력에 따라 협의',
  '["온라인 퍼포먼스 매체 운영 경험이 있으신데, 가장 성공적이었던 캠페인 사례와 그 성과를 설명해 주세요.","분석 툴을 사용하여 매체별 성과를 최적화한 경험이 있나요? 구체적인 사례와 그 과정에서 직면한 문제 해결 방법을 알려주세요.","광고 캠페인 수주를 위한 제안서 작성 시, 팀원들과 협업한 경험을 공유해 주시고, 그 과정에서 중요한 팀워크 요소는 무엇이라고 생각하십니까?","마케팅 트렌드는 빠르게 변화합니다. 최근에 배우거나 관심을 가지고 있는 마케팅 트렌드가 있다면 무엇이며, 어떻게 적용하고 싶으신가요?","인터오리진아이엔씨의 기업 문화나 가치관이 본인의 일 스타일과 어떻게 맞다고 생각하시나요?"]'::jsonb,
  'open',
  '2026-04-30',
  '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b',
  '2026-03-24T05:02:32.780836+00:00',
  '2026-03-25T10:24:43.140112+00:00',
  '서울 강남구 선릉로 121길 5, 인터오리진타워',
  '09:00~18:00',
  1,
  E'프렌들리데이 : 매월 1회 타부서와 랜덤 회식\n명절 선물\n경조사 지원\n생일 복지\n건강 케어 : 사내 헬스키퍼 상주, 안마의자',
  E'1. 서류 접수\n2. 사전질의서 \n3. 1차 화상 면접\n4. 2차 대면 면접',
  '이민지',
  'mj.lee@interohrigin.com',
  '010-9466-5247',
  '~~~~~~~',
  '~~~~~',
  '2131aee0-949e-497d-b904-6716465d0e15'
);

-- 6) [경력] 마케팅사업본부 포토그래퍼 채용
INSERT INTO job_postings (id, title, department_id, position, employment_type, experience_level, description, requirements, preferred, salary_range, ai_questions, status, deadline, created_by, created_at, updated_at, location, work_hours, headcount, benefits, hiring_process, contact_name, contact_email, contact_phone, company_intro, team_intro, survey_template_id) VALUES (
  'd246a805-9de2-4e89-bc5c-730c6bc843e5',
  '[경력] 마케팅사업본부 포토그래퍼 채용',
  'd0000000-0000-0000-0000-000000000003',
  '포토그래퍼 리더',
  'full_time',
  'junior',
  E'- 제품 이미지 촬영\n- 광고 모델 인물 촬영\n- 스타일링이 포함된 연출 촬영\n- 촬영 후 리터칭 및 보정 작업\n- 촬영 일정 관리 밑 현장 세팅\n- 내부 디자이너, 마케터 등과 협업하여 최적의 결과물 제작',
  '- 포트폴리오 제출 필수',
  E'- 촬영 장비 운용 능력 우수자\n- 쵤영 및 편집 능력 우수자\n- 프리미어, 포토샵 등 편집 프로그램 능력 우수자\n- 스튜디오 및 야외 촬영 경험 보유\n- 빠르게 변화하는 촬영 트렌드와 기술에 관심이 많으신 분\n- 브랜드의 톤앤매너를 이해하고 시각적으로 표현할 수 있으신 분',
  NULL,
  '["최근에 참여한 촬영 프로젝트 중 가장 도전적이었던 작업은 무엇이었으며, 어떻게 문제를 해결하셨나요?","다양한 촬영 스타일을 요구하는 프로젝트에서 브랜드의 톤앤매너를 어떻게 시각적으로 표현하셨는지 설명해 주시겠어요?","팀 내 협업을 통해 성공적으로 완성된 프로젝트 경험을 공유해 주시고, 그 과정에서 본인의 역할은 무엇이었는지 말씀해 주세요.","새로운 촬영 기술이나 트렌드를 파악하고 적용한 경험이 있다면, 그 경험을 통해 얻은 교훈은 무엇이었나요?","포토그래퍼로서 회사의 마케팅 목표를 지원하기 위해 어떤 전략을 제안하실 수 있는지 설명해 주시겠어요?"]'::jsonb,
  'open',
  NULL,
  '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b',
  '2026-03-25T00:54:55.413949+00:00',
  '2026-03-25T10:24:29.820689+00:00',
  '서울시 강남구 선릉로 121길 5, 인터오리진타워 3층',
  '09:00~18:00',
  1,
  E'- 리프레시 여름휴가 제공\n- FRIENDLY DAY(월 1회, 점심 회식)\n- 명절 상품권\n- 경조사 지원(화환, 경조 휴가 및 비용 지원 등)\n- 생일 복지\n- 사내 헬스키퍼 상주\n- 정기 건강검진 제공\n- 멘토멘티 프로그램\n- 자율복장\n-업무용 개인 노트북 지급',
  E'1. 서류 접수\n2. AI 이력서 분석 + 사전질의서\n3. 1차 화상 면접(실무진)\n4. 2차 대면 면접(임원)\n5. 최종 합격 통보',
  '최다예',
  'dy.chpi@interohrigin.com',
  '02-783-8138',
  NULL,
  NULL,
  '2131aee0-949e-497d-b904-6716465d0e15'
);

-- 7) [경력] 브랜드사업본부 디자이너 채용
INSERT INTO job_postings (id, title, department_id, position, employment_type, experience_level, description, requirements, preferred, salary_range, ai_questions, status, deadline, created_by, created_at, updated_at, location, work_hours, headcount, benefits, hiring_process, contact_name, contact_email, contact_phone, company_intro, team_intro, survey_template_id) VALUES (
  '1f9e5fff-517d-4c38-a629-05f3191f1108',
  '[경력] 브랜드사업본부 디자이너 채용',
  'd0000000-0000-0000-0000-000000000001',
  '디자이너',
  'full_time',
  'junior',
  E'- 브랜드 공식 계정 및 상세페이지 디자인\n- 온·오프라인 및 SNS굉고물 디자인\n- 각종 레이아웃 작업 및 용기 디자인\n- 브랜드 이벤트 기획전 디자인\n- 상품 기획 및 개발',
  E'- 디자인 계열 전공자(전문대졸 이상)\n- 포트폴리오 (PDF) 첨부 필수\n- 포토샵/일러스트/HTML 중급 이상 가능자',
  NULL,
  NULL,
  '["브랜드 공식 계정이나 상세페이지 디자인 경험 중 가장 기억에 남는 프로젝트와 그 이유를 설명해 주세요.","디자인 작업 중 예상치 못한 문제를 만났을 때 어떻게 해결했는지 구체적인 사례를 들어 설명해 주세요.","팀 프로젝트에서 다른 팀원들과의 협업을 통해 성공적으로 완료했던 경험을 공유해 주세요.","주어진 디자인 작업에서 새로운 기술이나 도구를 시도했던 경험이 있다면, 그 결과와 배운 점을 이야기해 주세요.","우리 회사의 브랜드 이미지를 기반으로 새로운 디자인 아이디어를 제시한다면 어떤 것이 있을지 설명해 주세요."]'::jsonb,
  'open',
  NULL,
  '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b',
  '2026-03-25T01:14:06.565547+00:00',
  '2026-03-25T10:24:15.795251+00:00',
  '서울시 강남구 선릉로 121길 5',
  '09:00~18:00',
  1,
  E'- 리프레시 여름휴가 제공\n- FRIENDLY DAY(월 1회, 점심 회식)\n- 명절 상품권\n- 경조사 지원(화환, 경조 휴가 및 비용 지원 등)\n- 생일 복지\n- 사내 헬스키퍼 상주\n- 정기 건강검진 제공\n- 멘토멘티 프로그램\n- 자율복장',
  E'1. 서류 접수\n2. AI 이력서 분석 + 사전질의서\n3. 1차 화상 면접(실무진)\n4. 2차 대면 면접(임원)\n5. 최종 합격 통보',
  '최다예',
  'dy.choi@interohrigin.com',
  '02-783-8138',
  NULL,
  NULL,
  '914abec7-d8c1-46e5-95d4-b7abd99bb6a6'
);

-- 8) [경력] 브랜드사업본부 해외사업 채용
INSERT INTO job_postings (id, title, department_id, position, employment_type, experience_level, description, requirements, preferred, salary_range, ai_questions, status, deadline, created_by, created_at, updated_at, location, work_hours, headcount, benefits, hiring_process, contact_name, contact_email, contact_phone, company_intro, team_intro, survey_template_id) VALUES (
  '5008db76-6429-445b-9f76-f6652e6e71e5',
  '[경력] 브랜드사업본부 해외사업 채용',
  'd0000000-0000-0000-0000-000000000001',
  '해외사업',
  'full_time',
  'junior',
  E'- 자사 브랜드의 해외 시장 진출 전략 수립 및 실행\n- 해외 바이어 및 파트너사 발굴 및 관리\n- 글로벌 마케팅 및 프로모션 기획\n- 해외 수출 인허가 등록 및 관리\n- 시장 조사 및 트렌드 분석을 통한 신규 사업 기회 발굴',
  '- 영어 능통자(비즈니스 회화 및 문서 작성 가능자)',
  E'-컴퓨터 활용 능력 우수자\n- 커뮤니케이션 능력 우수자\n- 노션 활용 우수자\n- 해외여행에 결격사유가 없는 자\n* 남성의 경우 병역 필/면제자',
  NULL,
  '["자사 브랜드의 해외 시장 진출 전략을 수립하고 실행한 경험이 있다면, 구체적으로 설명해 주시겠습니까?","해외 바이어나 파트너사를 발굴하고 관리하면서 직면했던 가장 큰 도전 과제는 무엇이었으며, 이를 어떻게 해결하셨나요?","글로벌 마케팅 및 프로모션 기획을 할 때 중요하게 고려하는 요소는 무엇이며, 이를 실제로 적용한 사례가 있으면 말씀해 주세요.","시장 조사 및 트렌드 분석을 통해 신규 사업 기회를 발굴한 경험이 있다면, 어떤 접근 방법을 사용하셨나요?","팀 내에서 갈등 상황이 발생했을 때, 이를 해결하기 위해 어떤 커뮤니케이션 전략을 사용했는지 이야기해 주시겠습니까?"]'::jsonb,
  'open',
  NULL,
  '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b',
  '2026-03-25T01:23:58.197095+00:00',
  '2026-03-25T10:24:04.037335+00:00',
  '서울시 강남구 선릉로 121길 5, 인터오리진타워 3층',
  '09:00~18:00',
  1,
  E'- 리프레시 여름휴가 제공\n- FRIENDLY DAY(월 1회, 점심 회식)\n- 명절 상품권\n- 경조사 지원(화환, 경조 휴가 및 비용 지원 등)\n- 생일 복지\n- 사내 헬스키퍼 상주\n- 정기 건강검진 제공\n- 멘토멘티 프로그램\n- 자율복장\n-업무용 개인 노트북 지급',
  E'1. 서류 접수\n2. AI 이력서 분석 + 사전질의서\n3. 1차 화상 면접(실무진)\n4. 2차 대면 면접(임원)\n5. 최종 합격 통보',
  '최다예',
  'dy.choi@interohrigin.com',
  '02-783-8138',
  NULL,
  NULL,
  'd22d1d79-1d59-42e5-9675-2013b04aa275'
);

-- 9) [준신입] 브랜드사업본부 CS 채용
INSERT INTO job_postings (id, title, department_id, position, employment_type, experience_level, description, requirements, preferred, salary_range, ai_questions, status, deadline, created_by, created_at, updated_at, location, work_hours, headcount, benefits, hiring_process, contact_name, contact_email, contact_phone, company_intro, team_intro, survey_template_id) VALUES (
  '9f89d1b5-dd85-48fc-ac5d-28e0044da47f',
  '[준신입] 브랜드사업본부 CS 채용',
  'd0000000-0000-0000-0000-000000000001',
  NULL,
  'full_time',
  'any',
  E'- CS\n- 고객 문의 대응 및 문제 해결\n- 주문 처리 및 배송 상황 모니터링',
  E'-컴퓨터 활용 능력 우수자\n- 커뮤니케이션 능력 우수자\n- 노션 활용 우수자\n- 해외여행에 결격사유가 없는 자',
  NULL,
  NULL,
  '["고객 문의 대응 시 가장 어려웠던 경험과 그 상황을 어떻게 해결했는지 설명해주세요.","주문 처리 중 발생할 수 있는 문제를 예측하고 미리 대처하기 위한 방법은 무엇이라고 생각하십니까?","팀 내에서 효과적인 커뮤니케이션을 위한 본인의 전략은 무엇인가요?","최근에 배운 컴퓨터 활용 기술 중 가장 유용했던 것을 소개하고, 어떻게 CS 업무에 적용할 수 있을지 설명해주세요.","회사의 브랜드 이미지를 강화하기 위한 CS 부서의 역할은 무엇이라고 생각하시나요?"]'::jsonb,
  'open',
  NULL,
  '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b',
  '2026-03-25T01:30:03.501041+00:00',
  '2026-03-25T10:23:53.393992+00:00',
  '서울시 강남구 선릉로 121길 5, 인터오리진타워 3층',
  '09:00~18:00',
  1,
  E'- 리프레시 여름휴가 제공\n- FRIENDLY DAY(월 1회, 점심 회식)\n- 명절 상품권\n- 경조사 지원(화환, 경조 휴가 및 비용 지원 등)\n- 생일 복지\n- 사내 헬스키퍼 상주\n- 정기 건강검진 제공\n- 멘토멘티 프로그램\n- 자율복장\n-업무용 개인 노트북 지급',
  E'1. 서류 접수\n2. AI 이력서 분석 + 사전질의서\n3. 1차 화상 면접(실무진)\n4. 2차 대면 면접(임원)\n5. 최종 합격 통보',
  '최다예',
  'dy.choi@interohrigin.com',
  '02-783-8138',
  NULL,
  NULL,
  '914abec7-d8c1-46e5-95d4-b7abd99bb6a6'
);

-- 10) [경력] 브랜드사업본부 MD 채용
INSERT INTO job_postings (id, title, department_id, position, employment_type, experience_level, description, requirements, preferred, salary_range, ai_questions, status, deadline, created_by, created_at, updated_at, location, work_hours, headcount, benefits, hiring_process, contact_name, contact_email, contact_phone, company_intro, team_intro, survey_template_id) VALUES (
  'd6acdf2f-2192-458b-9647-e37b670d074d',
  '[경력] 브랜드사업본부 MD 채용',
  'd0000000-0000-0000-0000-000000000001',
  'MD',
  'full_time',
  'junior',
  E'- 인플루언서 기반 커머스 운영\n- 국내외 온라인 유통 채널 운영 및 영업\n- 매출 확대 프로모션 기획 및 운영\n- 매출 계획 운영 및 손익 관리',
  E'- 이커머스 시장과 리빙 카테고리 제품 트렌드에 관심이 많으신 분\n-컴퓨터 활용 능력 우수자\n- 커뮤니케이션 능력 우수자\n- 노션 활용 우수자\n- 해외여행에 결격사유가 없는 자\n* 남성의 경우 병역 필/면제자',
  NULL,
  NULL,
  '["인플루언서 기반 커머스 운영 경험이 있으신가요? 있다면, 어떤 방식으로 운영하셨는지 설명해 주세요.","국내외 온라인 유통 채널을 효과적으로 운영하기 위해 어떤 전략을 세우셨는지 구체적인 사례를 들어 설명해 주실 수 있나요?","매출 확대를 위한 프로모션 기획 시 가장 중요하게 고려하는 요소는 무엇인가요?","팀 내에서 발생한 갈등 상황을 해결한 경험이 있다면, 어떻게 대처했는지 말씀해 주세요.","이커머스 시장과 리빙 카테고리 제품 트렌드에 대한 최신 정보를 어떻게 수집하고 활용하시는지 알려 주세요."]'::jsonb,
  'open',
  NULL,
  '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b',
  '2026-03-25T01:34:54.492242+00:00',
  '2026-03-25T10:23:41.204042+00:00',
  '서울시 강남구 선릉로 121길 5, 인터오리진타워 3층',
  '09:00~18:00',
  1,
  E'- 리프레시 여름휴가 제공\n- FRIENDLY DAY(월 1회, 점심 회식)\n- 명절 상품권\n- 경조사 지원(화환, 경조 휴가 및 비용 지원 등)\n- 생일 복지\n- 사내 헬스키퍼 상주\n- 정기 건강검진 제공\n- 멘토멘티 프로그램\n- 자율복장\n-업무용 개인 노트북 지급',
  E'1. 서류 접수\n2. AI 이력서 분석 + 사전질의서\n3. 1차 화상 면접(실무진)\n4. 2차 대면 면접(임원)\n5. 최종 합격 통보',
  '최다예',
  'dy.choi@interohrigin.com',
  '02-783-8138',
  NULL,
  NULL,
  '914abec7-d8c1-46e5-95d4-b7abd99bb6a6'
);

-- 11) [경력] 마케팅영업본부 마케터 채용
INSERT INTO job_postings (id, title, department_id, position, employment_type, experience_level, description, requirements, preferred, salary_range, ai_questions, status, deadline, created_by, created_at, updated_at, location, work_hours, headcount, benefits, hiring_process, contact_name, contact_email, contact_phone, company_intro, team_intro, survey_template_id) VALUES (
  '6c65518b-b809-4828-9ddd-9c373b23d950',
  '[경력] 마케팅영업본부 마케터 채용',
  'd0000000-0000-0000-0000-000000000003',
  '마케터',
  'full_time',
  'junior',
  E'- 자사 뷰티 브랜드의 마케팅 전략 수립 및 실행\n- SNDS 콘텐츠 기획 및 제작 (인스타그램, 유튜브, 틱톡 등)\n- 인플루언서 및 셀럽 마케팅 기획 및 운영\n- 온라인 및 오프라인 프로모션 기획 및 실행\n- 시장 조사 및 트렌드 분석을 통한 신규 마케팅 기회 발굴',
  E'- SNS 및 디지털 마케팅에 대한 이해와 관심이 높은 분\n- 트렌드에 민감하고 창의적인 콘텐츠 기획이 가능한 분',
  E'-컴퓨터 활용 능력 우수자\n- 커뮤니케이션 능력 우수자\n- 노션 활용 우수자\n- 해외여행에 결격사유가 없는 자\n* 남성의 경우 병역 필/면제자',
  NULL,
  '["자사 뷰티 브랜드의 마케팅 전략을 수립하고 실행한 경험이 있다면, 어떤 방식으로 접근했는지 설명해 주세요.","인스타그램이나 유튜브와 같은 플랫폼에서 성공적으로 진행한 콘텐츠 기획 사례가 있다면 소개해 주시고, 그 과정에서 배운 점은 무엇인지 말씀해 주세요.","예상치 못한 문제나 위기가 발생했을 때, 마케팅 캠페인을 성공적으로 완료하기 위해 어떻게 대처했는지 사례를 들어 설명해 주세요.","팀 내에서 아이디어를 제안하고 협업할 때, 의견 충돌이 발생할 수 있습니다. 이러한 경우 어떻게 팀원들과 효과적으로 소통하고 해결하셨나요?","최근 관심 있게 본 마케팅 트렌드가 있다면 무엇이며, 이를 자사 브랜드에 어떻게 적용할 수 있을지에 대한 본인의 의견을 말씀해 주세요."]'::jsonb,
  'open',
  NULL,
  '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b',
  '2026-03-25T01:41:34.445612+00:00',
  '2026-03-25T10:23:25.812698+00:00',
  '서울시 강남구 선릉로 121길 5, 인터오리진타워 3층',
  '09:00~18:00',
  1,
  E'- 리프레시 여름휴가 제공\n- FRIENDLY DAY(월 1회, 점심 회식)\n- 명절 상품권\n- 경조사 지원(화환, 경조 휴가 및 비용 지원 등)\n- 생일 복지\n- 사내 헬스키퍼 상주\n- 정기 건강검진 제공\n- 멘토멘티 프로그램\n- 자율복장\n-업무용 개인 노트북 지급',
  E'1. 서류 접수\n2. AI 이력서 분석 + 사전질의서\n3. 1차 화상 면접(실무진)\n4. 2차 대면 면접(임원)\n5. 최종 합격 통보',
  '최다예',
  'dy.choi@interohrigin.com',
  '02-783-8138',
  NULL,
  NULL,
  '2131aee0-949e-497d-b904-6716465d0e15'
);

-- 12) [신입] 마케팅영업본부 PPL 채용
INSERT INTO job_postings (id, title, department_id, position, employment_type, experience_level, description, requirements, preferred, salary_range, ai_questions, status, deadline, created_by, created_at, updated_at, location, work_hours, headcount, benefits, hiring_process, contact_name, contact_email, contact_phone, company_intro, team_intro, survey_template_id) VALUES (
  '020a1695-4899-4cac-a76c-17a48f6e2556',
  '[신입] 마케팅영업본부 PPL 채용',
  'd0000000-0000-0000-0000-000000000003',
  'PPL',
  'full_time',
  'entry',
  E'- PPL 광고주 영업 및 관리\n- PPL 매체 및 현장 관리\n- 드라마 마케팅PD 업무\n- 기획서 및 보고서 작성',
  E'- 광고/홍보/마케팅 전공자\n- 운전 가능자(필수)',
  E'-컴퓨터 활용 능력 우수자\n- 커뮤니케이션 능력 우수자\n- 노션 활용 우수자\n- 해외여행에 결격사유가 없는 자\n* 남성의 경우 병역 필/면제자',
  NULL,
  '["PPL 광고주와의 관계를 성공적으로 관리하기 위해 어떤 전략을 사용할 것인지 설명해주시겠습니까?","예상치 못한 문제 상황에서 광고 효과를 극대화하기 위한 창의적인 해결 방법을 제시한 경험이 있으면 공유해 주세요.","팀 프로젝트에서 갈등이 발생했을 때 이를 어떻게 해결했는지 구체적인 사례를 들어 설명해 주시겠습니까?","마케팅 분야에서의 최신 트렌드를 어떻게 습득하고, 이를 업무에 어떻게 적용할 계획인지 말씀해 주시겠습니까?","우리 회사의 기업 문화를 어떻게 이해하고 있으며, 본 포지션에서 어떻게 기여할 수 있을지 설명해 주시겠습니까?"]'::jsonb,
  'open',
  NULL,
  '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b',
  '2026-03-25T01:49:06.485163+00:00',
  '2026-03-25T10:22:29.56875+00:00',
  '서울시 강남구 선릉로 121길 5, 인터오리진타워 3층',
  '09:00~18:00',
  1,
  E'- 리프레시 여름휴가 제공\n- FRIENDLY DAY(월 1회, 점심 회식)\n- 명절 상품권\n- 경조사 지원(화환, 경조 휴가 및 비용 지원 등)\n- 생일 복지\n- 사내 헬스키퍼 상주\n- 정기 건강검진 제공\n- 멘토멘티 프로그램\n- 자율복장\n-업무용 개인 노트북 지급',
  E'1. 서류 접수\n2. AI 이력서 분석 + 사전질의서\n3. 1차 화상 면접(실무진)\n4. 2차 대면 면접(임원)\n5. 최종 합격 통보',
  '최다예',
  'dy.choi@interohrigin.com',
  '02-783-8138',
  NULL,
  NULL,
  '2131aee0-949e-497d-b904-6716465d0e15'
);

-- 13) [경력] 마케팅영업본부 AI 영상 기획 및 제작 담당자 채용
INSERT INTO job_postings (id, title, department_id, position, employment_type, experience_level, description, requirements, preferred, salary_range, ai_questions, status, deadline, created_by, created_at, updated_at, location, work_hours, headcount, benefits, hiring_process, contact_name, contact_email, contact_phone, company_intro, team_intro, survey_template_id) VALUES (
  '9b8c3244-f21c-4505-a22c-8122d4c61045',
  '[경력] 마케팅영업본부 AI 영상 기획 및 제작 담당자 채용',
  'd0000000-0000-0000-0000-000000000003',
  ' AI 영상 기획 및 제작',
  'full_time',
  'junior',
  E'- 주제에 맞는 영상 기획 (AI 캐릭터, 배경, 스토리 등)\n- 생성형 AI 기반 영상·이미지 콘텐츠 제작 (AI 씬 생셩 및 편집)\n- 실제 촬영 컷과 AI 컷 믹스 영상 제작\n- AI 영상 고도화 작업 (인페인팅, 카메라 고정 이미지 →영상 변환)\n- 디지털 광고 및 SNS 숏폼 콘텐츠 제작\n- AI 제작 가이드 및 표준화 프로세스 구축',
  E'- 생성형 AI 툴(Midjourney, Runway, Sora, Kling, DALL·E 등) 활용 가능자\n- Adobe 영상 툴 활용 가능자\n- 3D 툴(Blender, Cinema 4D, Maya 등) 활용 가능자\n- 영상 포트폴리오 제출 필수(AI 활용 작업물 우대)\n- 숏폼 콘텐츠(릴스, 틱톡, 쇼츠) 제작 경험자',
  E'-컴퓨터 활용 능력 우수자\n- 커뮤니케이션 능력 우수자\n- 노션 활용 우수자\n- 해외여행에 결격사유가 없는 자\n* 남성의 경우 병역 필/면제자',
  NULL,
  '["생성형 AI 툴을 활용한 영상 기획 및 제작 경험에서 가장 도전적이었던 프로젝트는 무엇이었으며, 그 프로젝트를 어떻게 성공적으로 이끌었는지 설명해 주세요.","AI 영상 고도화 작업 중 예상치 못한 문제가 발생했을 때, 이를 해결하기 위해 어떤 접근 방식을 사용했는지 구체적인 사례를 들어 설명해 주세요.","팀 내에서 협업하며 AI 영상 프로젝트를 진행할 때, 다른 팀원과의 갈등을 효과적으로 해결했던 경험이 있다면 공유해 주세요.","빠르게 변화하는 AI 영상 기술 트렌드에 대응하여 자신의 역량을 어떻게 발전시켜 왔는지, 그리고 앞으로의 성장 계획에 대해 설명해 주세요.","인터오리진타워에서의 업무 환경이 당신의 경력 목표와 어떻게 부합하는지, 이 회사에서 어떤 가치를 창출할 수 있을지 말씀해 주세요."]'::jsonb,
  'open',
  NULL,
  '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b',
  '2026-03-25T02:07:24.896034+00:00',
  '2026-03-25T11:38:15.426259+00:00',
  '서울시 강남구 선릉로 121길 5, 인터오리진타워 3층',
  '09:00~18:00',
  1,
  E'- 리프레시 여름휴가 제공\n- FRIENDLY DAY(월 1회, 점심 회식)\n- 명절 상품권\n- 경조사 지원(화환, 경조 휴가 및 비용 지원 등)\n- 생일 복지\n- 사내 헬스키퍼 상주\n- 정기 건강검진 제공\n- 멘토멘티 프로그램\n- 자율복장\n-업무용 개인 노트북 지급',
  E'1. 서류 접수\n2. AI 이력서 분석 + 사전질의서\n3. 1차 화상 면접(실무진)\n4. 2차 대면 면접(임원)\n5. 최종 합격 통보',
  '최다예',
  'dy.choi@interohrigin.com',
  '02-783-8138',
  NULL,
  NULL,
  '2131aee0-949e-497d-b904-6716465d0e15'
);

-- =====================================================================
-- 4. candidates (5개)
-- =====================================================================
DELETE FROM candidates WHERE id IN (
  'bb7231b2-4af9-440d-8272-66be4e0494ec',
  '1a99edc5-925f-42c0-80b9-69c43e753cdf',
  '6a8a7857-1b9f-42f6-82a6-862595c4e0ca',
  '22bfcf68-4e3c-46aa-a30f-b7f49bd6bfe8',
  'f801b37d-f4d5-4b2c-bb10-26295ea3c6e4'
);

INSERT INTO candidates (id, job_posting_id, name, email, phone, source_channel, source_detail, resume_url, cover_letter_url, cover_letter_text, status, metadata, invite_token, pre_survey_data, pre_survey_analysis, talent_match_score, similar_employees, processing_step, created_at, updated_at) VALUES
(
  'bb7231b2-4af9-440d-8272-66be4e0494ec',
  '9b8c3244-f21c-4505-a22c-8122d4c61045',
  '차주용',
  'yong7903@gmail.com',
  '010-8847-7903',
  'direct', NULL,
  'https://jlgdbofwlmhjayyjtyxv.supabase.co/storage/v1/object/public/resumes/9b8c3244-f21c-4505-a22c-8122d4c61045/1774429523020_resume.pdf',
  'https://jlgdbofwlmhjayyjtyxv.supabase.co/storage/v1/object/public/resumes/9b8c3244-f21c-4505-a22c-8122d4c61045/1774429523583_cover_letter.pdf',
  NULL,
  'rejected',
  '{"mbti":"ISTP","birth_date":"1979-03-26","blood_type":"A","hanja_name":""}'::jsonb,
  'c4e94423f0044c888c249be6dbf14631',
  '{"meta":{"mbti":"ISTP","birth_date":"1979-03-26","blood_type":"A","hanja_name":null},"answers":{"q1774328803292":"온라인","q1774328834389":"Ai영상 기획제작","q1774328861610":"고양시 덕양구 1시간 30분","q1774328866887":"Ai콘텐츠 기획/2026.01/개인사유/6000만원","q1774328872637":"즉시가능","q1774328878305":"6500만원","q1774328882654":"네","q1774328886372":"업무자유도","q1774328890038":"네","q1774328892302":"네","q1774328899270":"네","q1774328904292":"네","q1774328908465":"네"},"completed_at":"2026-03-25T10:56:07.240Z"}'::jsonb,
  '{"analyzed_at":"2026-03-25T10:56:58.417Z","survey_insights":"사전 질의서 응답에서 퇴사 예정일과 출근 가능일이 상충되는 심각한 오류가 발견되어 지원자의 정보 정확성과 신뢰성에 대한 중대한 의문을 제기하며, 이에 대한 명확한 소명이 필요합니다. 회사를 선택하는 기준으로 ''업무자유도''를 언급하여 자율적인 업무 환경을 선호하는 성향으로 보이나, 장거리 출퇴근은 현실적인 걸림돌이 될 수 있습니다."}'::jsonb,
  45, NULL, NULL,
  '2026-03-25T09:05:24.424987+00:00',
  '2026-03-25T12:48:33.680562+00:00'
),
(
  '1a99edc5-925f-42c0-80b9-69c43e753cdf',
  '6c65518b-b809-4828-9ddd-9c373b23d950',
  '이수아',
  'koreabylocal@gmail.com',
  NULL,
  'direct', NULL,
  'https://jlgdbofwlmhjayyjtyxv.supabase.co/storage/v1/object/public/resumes/6c65518b-b809-4828-9ddd-9c373b23d950/1774429576870_resume.pdf',
  'https://jlgdbofwlmhjayyjtyxv.supabase.co/storage/v1/object/public/resumes/6c65518b-b809-4828-9ddd-9c373b23d950/1774429577446_cover_letter.pdf',
  NULL,
  'interview_scheduled',
  '{"mbti":"ESTP","birth_date":"1990-06-06","blood_type":"O","hanja_name":""}'::jsonb,
  '32167c43587845a9ac79193f873c354b',
  '{"meta":{"mbti":"ESTP","birth_date":"1990-06-06","blood_type":"O","hanja_name":null},"answers":{"q1774328803292":"잡코리아","q1774328834389":"마케팅 영업","q1774328861610":"서울시 관악구 40분","q1774328866887":"마케팅 기획/2025.12/개인사유/4000만원","q1774328872637":"2026.04.01","q1774328878305":"5000만원","q1774328882654":"네","q1774328886372":"집과의거리","q1774328890038":"네","q1774328892302":"네","q1774328899270":"아니오","q1774328904292":"네","q1774328908465":"네"},"completed_at":"2026-03-25T10:59:45.071Z"}'::jsonb,
  '{"analyzed_at":"2026-03-25T11:00:27.984Z","survey_insights":"사전 질의서 응답에서 이력서와 상이한 퇴사일 및 출근 가능일 정보가 기재되어 지원 정보의 신뢰성에 대한 검토가 필요합니다. 또한, 회사를 선택하는 주된 기준으로 ''집과의 거리''를 언급하여 직무 및 회사에 대한 열정이나 비전 공유 의지가 약하게 비춰질 수 있습니다."}'::jsonb,
  NULL, NULL, NULL,
  '2026-03-25T09:06:17.81317+00:00',
  '2026-03-25T11:01:37.631375+00:00'
),
(
  '6a8a7857-1b9f-42f6-82a6-862595c4e0ca',
  'd6acdf2f-2192-458b-9647-e37b670d074d',
  '최은지',
  'jycha@brainco.kr',
  NULL,
  'direct', NULL,
  'https://jlgdbofwlmhjayyjtyxv.supabase.co/storage/v1/object/public/resumes/d6acdf2f-2192-458b-9647-e37b670d074d/1774429634428_resume.pdf',
  'https://jlgdbofwlmhjayyjtyxv.supabase.co/storage/v1/object/public/resumes/d6acdf2f-2192-458b-9647-e37b670d074d/1774429634683_cover_letter.pdf',
  NULL,
  'resume_reviewed',
  '{}'::jsonb,
  '5b1ca568922941b483f6022183edfaa9',
  NULL, NULL, NULL, NULL, NULL,
  '2026-03-25T09:07:15.205402+00:00',
  '2026-03-26T04:12:38.996778+00:00'
),
(
  '22bfcf68-4e3c-46aa-a30f-b7f49bd6bfe8',
  '1f9e5fff-517d-4c38-a629-05f3191f1108',
  '정우진',
  'localholic.life@gmail.com',
  NULL,
  'direct', NULL,
  'https://jlgdbofwlmhjayyjtyxv.supabase.co/storage/v1/object/public/resumes/1f9e5fff-517d-4c38-a629-05f3191f1108/1774429694152_resume.pdf',
  'https://jlgdbofwlmhjayyjtyxv.supabase.co/storage/v1/object/public/resumes/1f9e5fff-517d-4c38-a629-05f3191f1108/1774429694695_cover_letter.pdf',
  NULL,
  'survey_sent',
  '{}'::jsonb,
  'a795d6cd214049d68bb8a50bdc0baf09',
  NULL, NULL, NULL, NULL, NULL,
  '2026-03-25T09:08:15.02138+00:00',
  '2026-03-26T04:10:22.690346+00:00'
),
(
  'f801b37d-f4d5-4b2c-bb10-26295ea3c6e4',
  '9e978319-5381-4ac2-9607-888833839f34',
  '차주용',
  'yong7903@gmail.com',
  '010-8847-7903',
  'direct', NULL,
  '9e978319-5381-4ac2-9607-888833839f34/1774498078116_resume.pdf',
  '9e978319-5381-4ac2-9607-888833839f34/1774498078781_cover_letter.pdf',
  NULL,
  'hired',
  '{"mbti":"INTP","birth_date":"1997-03-14","blood_type":"A","hanja_name":""}'::jsonb,
  '92ec84a1f35d429588203b91bfcbb971',
  '{"meta":{"mbti":"INTP","birth_date":"1997-03-14","blood_type":"A","hanja_name":null},"answers":{"q1774328995310":"온라인","q1774329006009":"잘 모르겠습니다.\n","q1774329009939":"퇴사사유는 개인사유/5000만원","q1774329013342":"30명","q1774329026920":"1시간","q1774329028673":"즉시가능","q1774329032628":"5000만원","q1774329040222":"네","q1774329045061":"복지","q1774329046575":"네","q1774329058772":"네","q1774329063016":"네","q1774329070611":"네","q1774329075572":"네"},"completed_at":"2026-03-26T04:15:27.252Z"}'::jsonb,
  '{"analyzed_at":"2026-03-26T04:16:18.035Z","survey_insights":"사전 질의서 응답을 통해 지원자가 지원한 직무에 대한 이해가 전무하며, 다른 부서(마케팅/영업본부)의 역할에 더 관심을 두고 지원했음을 명확히 확인할 수 있습니다. 이는 지원 과정에서의 부주의 또는 직무 오해를 시사하며, 해당 직무에 대한 진정성 있는 지원 동기를 찾기 어렵습니다."}'::jsonb,
  5, NULL, NULL,
  '2026-03-26T04:07:59.388737+00:00',
  '2026-03-26T04:41:43.845059+00:00'
);

-- =====================================================================
-- 5. interview_schedules (5개)
-- =====================================================================
DELETE FROM interview_schedules WHERE id IN (
  '8f3660a6-6a3e-4423-b66f-7cb4a3246601',
  'd2573e2a-8b37-4c9e-bc0f-46799beb8c4f',
  '41b198ca-4fec-4b36-ba33-27fc83d14bb2',
  'ccc0a4fa-2cba-4870-9e32-21da6a92d8a3',
  '57055d6a-3276-488c-8895-8eed6dba017d'
);

INSERT INTO interview_schedules (id, candidate_id, interviewer_ids, interview_type, scheduled_at, duration_minutes, priority, pre_materials_sent, pre_materials_sent_at, meeting_link, location_info, status, created_at, updated_at, google_event_id) VALUES
('8f3660a6-6a3e-4423-b66f-7cb4a3246601', '1a99edc5-925f-42c0-80b9-69c43e753cdf', '{}', 'video', '2026-03-25T11:15:00+00:00', 30, 'normal', true, '2026-03-25T11:01:44.343+00:00', 'https://meet.google.com/wnq-gzka-jhd', NULL, 'scheduled', '2026-03-25T11:01:37.469418+00:00', '2026-03-25T11:01:44.37523+00:00', NULL),
('d2573e2a-8b37-4c9e-bc0f-46799beb8c4f', 'bb7231b2-4af9-440d-8272-66be4e0494ec', '{}', 'video', '2026-03-25T11:10:00+00:00', 30, 'normal', true, '2026-03-25T11:01:41.586+00:00', 'https://meet.google.com/yod-fyai-vgi', NULL, 'completed', '2026-03-25T11:01:22.571489+00:00', '2026-03-25T12:21:14.837522+00:00', NULL),
('41b198ca-4fec-4b36-ba33-27fc83d14bb2', 'bb7231b2-4af9-440d-8272-66be4e0494ec', '{}', 'face_to_face', '2026-03-26T01:00:00+00:00', 30, 'normal', true, '2026-03-25T12:44:51.768+00:00', NULL, '인터오리진 타워', 'completed', '2026-03-25T12:44:38.721762+00:00', '2026-03-25T12:47:24.974463+00:00', NULL),
('ccc0a4fa-2cba-4870-9e32-21da6a92d8a3', 'f801b37d-f4d5-4b2c-bb10-26295ea3c6e4', '{}', 'video', '2026-03-26T04:30:00+00:00', 30, 'normal', true, '2026-03-26T04:17:27.733+00:00', 'https://meet.google.com/siw-drvv-tfs', NULL, 'completed', '2026-03-26T04:16:53.355964+00:00', '2026-03-26T04:21:39.041224+00:00', '20lostn47gpkq0fdiqu1k5t3g4'),
('57055d6a-3276-488c-8895-8eed6dba017d', 'f801b37d-f4d5-4b2c-bb10-26295ea3c6e4', '{}', 'face_to_face', '2026-03-26T06:00:00+00:00', 30, 'normal', true, '2026-03-26T04:23:52.196+00:00', NULL, '인터오리진타워', 'completed', '2026-03-26T04:23:47.026168+00:00', '2026-03-26T04:24:30.489271+00:00', NULL);

-- =====================================================================
-- 6. resume_analysis (12개)
-- =====================================================================
DELETE FROM resume_analysis WHERE id IN (
  '6d8585ba-d83d-44d3-a548-e82036983a91',
  '377a83d3-8e33-4710-b720-6c748ccafed0',
  'a518733d-8ae9-434e-b5e3-ccf4ff440bed',
  'f92e17d4-047a-4343-ba31-ea3a9b5eeabb',
  '51800859-8410-44c6-af37-82634dbdf4e4',
  '987a8c5d-4872-4f49-a624-7445f9005ab7',
  '75954256-256c-4318-b986-5feb388c1b24',
  'b337fbc8-0134-4002-bae0-871796bea9c0',
  '80bea197-4807-44f5-a24b-5d85ea4d7d85',
  'd0041bc1-1e7f-410d-8342-2e92d9257d2d',
  'fd1e940f-b3db-475c-9114-6d792ab9bb3a',
  '14f544a4-e2a5-4501-b12d-c7cdba320131'
);

INSERT INTO resume_analysis (id, candidate_id, resume_text, ai_summary, strengths, weaknesses, position_fit, organization_fit, suggested_department, suggested_position, suggested_salary_range, red_flags, recommendation, analyzed_at, created_at) VALUES
('6d8585ba-d83d-44d3-a548-e82036983a91', 'bb7231b2-4af9-440d-8272-66be4e0494ec', NULL, '생성형 AI 툴 및 Adobe 영상 툴 활용 가능 여부 확인 불가.', '[]'::jsonb, '["자기소개서 미제출","포트폴리오 정보 부족"]'::jsonb, 20, 30, '지원 부서 불명', '사원', '불명', '["자기소개서 미제출로 인한 정보 부족"]'::jsonb, 'REJECT', '2026-03-25T09:08:35.873382+00:00', '2026-03-25T09:08:35.873382+00:00'),
('377a83d3-8e33-4710-b720-6c748ccafed0', 'bb7231b2-4af9-440d-8272-66be4e0494ec', NULL, '차주용 후보자는 이력서와 자기소개서 파일을 제출하였으나, 자기소개서 내용이 작성되지 않아 직무 관련 역량 및 지원 의지를 파악하기 어렵습니다.', '["기본 서류(이력서, 자기소개서 파일) 제출"]'::jsonb, '["자기소개서 내용 미작성으로 지원 동기 및 직무 역량 파악 불가","필수 제출 요건인 영상 포트폴리오 제출 여부 불분명 (미제출로 추정)","생성형 AI 툴, Adobe 툴, 3D 툴 활용 능력 및 숏폼 콘텐츠 제작 경험 등 핵심 역량 검증 불가"]'::jsonb, 5, 10, '정보 부족', '정보 부족', '정보 부족', '["자기소개서 내용 미작성","필수 제출 서류(포트폴리오) 누락 가능성"]'::jsonb, 'REJECT', '2026-03-25T09:47:34.038782+00:00', '2026-03-25T09:47:34.038782+00:00'),
('a518733d-8ae9-434e-b5e3-ccf4ff440bed', 'bb7231b2-4af9-440d-8272-66be4e0494ec', NULL, '제출된 이력서와 자기소개서 외에 지원자의 직무 역량 및 경험에 대한 정보가 전혀 없어 직무 적합성 판단이 어렵습니다. 특히 자기소개서 내용이 비어있어 지원 의지가 매우 불분명합니다.', '[]'::jsonb, '["자기소개서 내용 미작성으로 지원자의 직무 이해도, 지원 동기, 인성 등 핵심 정보 파악 불가","이력서 내용 미제공으로 생성형 AI 툴, Adobe 툴, 3D 툴 활용 능력 및 영상 포트폴리오(AI 활용 작업물 포함) 등 직무 핵심 요건 충족 여부 확인 불가","숏폼 콘텐츠 제작 경험 등 직무 관련 경험 정보 부재로 직무 요건 충족 여부 판단 불가"]'::jsonb, 0, 0, '해당 없음', '해당 없음', '해당 없음', '["자기소개서 내용 미작성 (지원자의 성의 부족 및 직무 이해도 의심)","핵심 직무 역량 및 필수 제출인 영상 포트폴리오 정보 부재로 서류 심사 불가"]'::jsonb, 'REJECT', '2026-03-25T09:54:02.953152+00:00', '2026-03-25T09:54:02.953152+00:00'),
('f92e17d4-047a-4343-ba31-ea3a9b5eeabb', 'bb7231b2-4af9-440d-8272-66be4e0494ec', NULL, '지원자 차주용은 AI 기반 영상 콘텐츠 기획 및 제작에 특화된 경력직으로, 생성형 AI 툴과 Adobe 영상 편집 툴 활용 능력이 매우 우수합니다.', '["생성형 AI 툴 및 Adobe 영상 편집 툴 활용 능력이 매우 탁월","AI 기반 숏폼 콘텐츠 기획, 제작 및 퍼포먼스 분석 전 과정을 주도한 경험","사내 AI 영상 제작 워크플로우 구축 및 팀원 교육 경험","미디어커뮤니케이션 전공을 기반으로 한 영상 기획력과 스토리텔링 역량","다수의 관련 자격증 및 수상 경력 보유"]'::jsonb, '["3D 툴 활용 경험 미기재","실제 촬영 컷과 AI 컷 믹스 영상 제작 경험 설명 부족"]'::jsonb, 95, 90, '마케팅영업본부 AI 영상 기획 및 제작팀', '대리', '4,500만원 ~ 5,500만원', '["3D 툴 활용 경험 미기재 (면접 시 확인 필요)"]'::jsonb, 'PROCEED', '2026-03-25T09:54:46.296336+00:00', '2026-03-25T09:54:46.296336+00:00'),
('51800859-8410-44c6-af37-82634dbdf4e4', 'bb7231b2-4af9-440d-8272-66be4e0494ec', NULL, '차주용 후보자는 AI 기반 영상 기획 및 제작에 대한 뛰어난 실무 경험과 정량적 성과를 보유하여 직무 적합도가 매우 높습니다. 그러나 사전 질의서의 모든 문항에 ''미응답''으로 일관하여 기본적인 성의와 회사에 대한 관심도에 대한 심각한 우려를 야기합니다.', '["직무 관련 탁월한 전문성 및 경험","정량적 성과 및 프로젝트 리더십","숏폼 콘텐츠 및 디지털 광고 전문성"]'::jsonb, '["사전 질의서 전 문항 미응답","3D 툴 활용 경험 미확인"]'::jsonb, 95, 20, '마케팅영업본부', 'AI 영상 기획 및 제작 담당자', '경력 기반 4,500만원 ~ 6,000만원', '["채용 프로세스에 대한 무성의 또는 이해 부족","핵심 정보 파악 불가"]'::jsonb, 'REVIEW', '2026-03-25T10:26:08.491009+00:00', '2026-03-25T10:26:08.491009+00:00'),
('987a8c5d-4872-4f49-a624-7445f9005ab7', '1a99edc5-925f-42c0-80b9-69c43e753cdf', NULL, '이수아 후보자는 3년간 뷰티 브랜드 디지털 캠페인 런칭 및 운영 경험을 가진 퍼포먼스 마케터로, 데이터 기반의 성과 최적화 역량이 뛰어납니다.', '["신규 뷰티 브랜드 디지털 캠페인 런칭 및 목표 ROAS 250% 달성 경험","GA4, SQL을 활용한 데이터 분석 역량","Meta, Google Ads 등 주요 디지털 매체 운영 경험","타깃 고객 페르소나 발굴 및 광고 소재 최적화 경험"]'::jsonb, '["인플루언서 및 셀럽 마케팅 경험 부족","SNS 콘텐츠 기획 및 제작 상세 경험 부족","자기소개서 내용이 매우 간결"]'::jsonb, 80, 75, '마케팅영업본부', '마케터', '3,600만원 ~ 4,500만원', '["자기소개서 텍스트 필드를 비워두고 제출","지원 회사 및 직무에 대한 맞춤형 고민 부족"]'::jsonb, 'PROCEED', '2026-03-25T10:27:41.42847+00:00', '2026-03-25T10:27:41.42847+00:00'),
('75954256-256c-4318-b986-5feb388c1b24', 'bb7231b2-4af9-440d-8272-66be4e0494ec', NULL, '차주용 지원자는 생성형 AI 영상 기획 및 제작에 대한 탁월한 실무 경험과 정량적 성과를 보유하고 있으며, 직무 전문성이 매우 높습니다.', '["생성형 AI 툴 및 Adobe 영상 툴 활용 능력 탁월","AI 기반 숏폼 콘텐츠 기획 및 정량적 성과 보유","사내 AI 영상 제작 워크플로우 구축 경험","Google AI Essentials Certificate 보유"]'::jsonb, '["필수 제출 서류인 영상 포트폴리오 누락","3D 툴 활용 경험 미기재","사전 질의서 Q4와 Q5의 심각한 모순","사전 질의서 Q2 직무 예상 업무 답변이 매우 간략"]'::jsonb, 85, 40, '마케팅영업본부', '대리~과장', '6,000만원 ~ 6,500만원', '["필수 제출인 영상 포트폴리오 미제출","사전 질의서 퇴사 예정일과 출근 가능일 간의 치명적인 모순","장거리 출퇴근으로 인한 장기근속 우려"]'::jsonb, 'REVIEW', '2026-03-25T10:56:58.292437+00:00', '2026-03-25T10:56:58.292437+00:00'),
('b337fbc8-0134-4002-bae0-871796bea9c0', '1a99edc5-925f-42c0-80b9-69c43e753cdf', NULL, '이수아 지원자는 뷰티 브랜드 디지털 캠페인 총괄 경험과 GA4, SQL 기반의 데이터 분석 역량을 갖춘 퍼포먼스 마케터입니다.', '["뷰티 브랜드 디지털 캠페인 총괄 및 ROAS 목표 초과 달성","GA4, SQL 기반의 데이터 분석 역량","Meta, Google Ads 등 주요 디지털 매체 운영","스타트업 환경에서의 효율적인 예산 운영"]'::jsonb, '["직무 이해도 부족 우려","SNS 콘텐츠 기획 및 인플루언서 마케팅 경험 부족","회사 선택 기준이 집과의 거리"]'::jsonb, 70, 40, '마케팅영업본부', '마케터', '4,500만원 ~ 5,000만원', '["이력서 상의 퇴사일과 사전 질의서의 퇴사일 간 심각한 불일치","지원 직무에 대한 이해도 부족"]'::jsonb, 'REVIEW', '2026-03-25T11:00:27.886074+00:00', '2026-03-25T11:00:27.886074+00:00'),
('80bea197-4807-44f5-a24b-5d85ea4d7d85', 'f801b37d-f4d5-4b2c-bb10-26295ea3c6e4', NULL, '지원자는 AI 영상 콘텐츠 기획 및 제작 분야에서 약 6년간의 경력과 뛰어난 전문성을 보유하고 있으나, 채용 직무인 경영관리본부 인사총무 리더와는 전혀 무관한 이력입니다.', '["AI 기반 영상 콘텐츠 기획 및 제작에 대한 깊은 전문성","Runway, Sora 등 다양한 생성형 AI 툴 활용 능력","미디어 콘텐츠 제작 효율성 증대 성과","팀 내 AI 영상 워크플로우 구축 및 팀원 교육"]'::jsonb, '["채용 직무와 지원자의 모든 경력이 완전히 불일치","인사 기획, 채용, 평가, 보상 등 HR 전반에 대한 경험 부재","노동법, 근로기준법 등 관련 지식 부재","자기소개서 내용이 지원 직무와 무관"]'::jsonb, 0, 10, '마케팅영업본부 (혹은 AI 콘텐츠 관련 부서)', 'AI 영상 콘텐츠 기획/제작 담당', 'N/A - 직무 부적합', '["지원 직무와 지원자의 모든 경력이 완전히 다름","자기소개서 전체가 지원 직무와 무관","HR 관련 기본 지식 및 경험이 전혀 없음"]'::jsonb, 'REJECT', '2026-03-26T04:08:56.304889+00:00', '2026-03-26T04:08:56.304889+00:00'),
('d0041bc1-1e7f-410d-8342-2e92d9257d2d', '22bfcf68-4e3c-46aa-a30f-b7f49bd6bfe8', NULL, '정우진 후보자는 브랜드사업본부 디자이너 직무에 지원했으나, 제출된 이력서와 자기소개서 내용이 인사 담당자(HR 매니저) 직무에 맞춰져 있습니다.', '["5년간의 HR 실무 경력 보유","온보딩 프로그램 개편을 통한 1년차 퇴사율 12% 감소","심리학 전공으로 인재 및 조직 문화에 대한 이해도"]'::jsonb, '["지원 직무(디자이너)와 제출 서류(인사/HR)의 내용이 완전히 불일치","디자인 관련 학력, 경력, 스킬에 대한 언급 없음","필수 제출 서류인 포트폴리오 미첨부","포토샵/일러스트/HTML 활용 능력 정보 없음"]'::jsonb, 0, 10, '해당 없음 (지원 직무와 무관)', '해당 없음', '해당 없음', '["지원 직무와 제출 서류 내용의 심각한 불일치","필수 제출 서류(포트폴리오) 미첨부"]'::jsonb, 'REJECT', '2026-03-26T04:10:18.495749+00:00', '2026-03-26T04:10:18.495749+00:00'),
('fd1e940f-b3db-475c-9114-6d792ab9bb3a', '6a8a7857-1b9f-42f6-82a6-862595c4e0ca', NULL, '지원 직무(MD)와 이력서상 희망 직무(해외영업) 불일치 및 자기소개서 미제출로 직무 적합도와 지원 의지를 판단하기 어렵습니다.', '["뛰어난 어학 능력 (영어 OPIc AL, 스페인어 DELE B2)","4년간의 해외영업 및 무역 실무 경험","북미 지역 신규 바이어 발굴 및 연간 200만 불 수출 계약 성사","글로벌 해외 전시회 기획 및 현장 부스 운영 총괄 경험"]'::jsonb, '["이커머스 운영, 인플루언서 커머스, 리빙 카테고리 경험 부족","노션 활용 능력 정보 부재","자기소개서 미제출"]'::jsonb, 35, 60, '해외영업팀', '주임/대리', '3,800만원 ~ 4,500만원', '["지원 직무가 공고된 MD가 아닌 해외영업인 점","자기소개서 텍스트 미작성"]'::jsonb, 'REJECT', '2026-03-26T04:12:38.526371+00:00', '2026-03-26T04:12:38.526371+00:00'),
('14f544a4-e2a5-4501-b12d-c7cdba320131', 'f801b37d-f4d5-4b2c-bb10-26295ea3c6e4', NULL, '지원자 차주용님은 AI 기반 영상 콘텐츠 기획 및 제작 분야에서 풍부한 경력과 뛰어난 성과를 보유하고 있으나, 당사의 경영관리본부 인사총무 리더 직무와는 전혀 관련 없는 경력을 가지고 있습니다.', '["AI 기반 영상 콘텐츠 기획 및 제작 분야에 대한 높은 전문성","실질적인 성과 창출 경험","기획력, 분석력, 외국어 능력","즉시 출근 가능"]'::jsonb, '["채용 공고 직무와 지원자의 경력이 완전히 불일치","지원 직무에 대한 기본적인 이해 부족","인사 관련 법령 지식 및 HR 리더 직무의 필수 요건 부재","사전 질의서 답변이 매우 간략하고 성의 부족","자기소개서 및 이력서가 마케팅/AI 영상 분야에 맞춰져 있음"]'::jsonb, 0, 20, 'N/A (지원 직무와 무관)', 'N/A', 'N/A', '["사전 질의서에서 지원 직무에 대해 잘 모르겠습니다라고 답변","당사 마케팅영업본부 포트폴리오를 확인했다고 응답","이력서 및 자기소개서가 AI 영상 기획/제작 직무에 초점","인사총무 리더 직무 수행에 필요한 HR 관련 경험이나 지식도 없음"]'::jsonb, 'REJECT', '2026-03-26T04:16:17.950509+00:00', '2026-03-26T04:16:17.950509+00:00');

-- =====================================================================
-- 7. hiring_decisions (2개)
-- =====================================================================
DELETE FROM hiring_decisions WHERE id IN (
  '6c034fe5-5163-4446-b540-1bf4871b7b2e',
  '4cb44097-90e7-4e5e-b4fd-dae701ad7bf1'
);

INSERT INTO hiring_decisions (id, candidate_id, decision, decided_by, reason, offered_salary, offered_department_id, offered_position, start_date, ai_recommendation, ai_score, created_at) VALUES
('6c034fe5-5163-4446-b540-1bf4871b7b2e', 'bb7231b2-4af9-440d-8272-66be4e0494ec', 'rejected', NULL, NULL, NULL, NULL, NULL, NULL, 'REVIEW', 55, '2026-03-25T12:48:33.529008+00:00'),
('4cb44097-90e7-4e5e-b4fd-dae701ad7bf1', 'f801b37d-f4d5-4b2c-bb10-26295ea3c6e4', 'hired', NULL, NULL, NULL, NULL, NULL, NULL, 'NO_HIRE', 5, '2026-03-26T04:41:43.289679+00:00');

-- =====================================================================
-- 8. tasks (17개)
-- =====================================================================
DELETE FROM tasks WHERE id IN (
  'df5fa71c-8da3-423b-8530-4cace91f6cad','131e91d1-7dec-40ac-b18b-b1be1467731a',
  '8ece88c8-ef8e-43da-812c-f0024e070092','47649291-329d-4351-be9b-130fe3b3c02e',
  '05488339-65b1-4c4a-8b4f-5cb294709631','0fd5179d-e54c-4de2-a734-2338fb674753',
  'e896d182-5b91-4d3e-b46e-f9e3c15d996c','5b8aaa16-1ab5-4d50-88f0-c0915e841c99',
  'bf645ee2-b4f1-4614-85a4-3071af661a70','fdd666a4-c416-4943-860d-5ea32dc4fc69',
  '40934901-433b-4fee-bd90-58f25be0879d','21edc6b9-2e74-4885-a2f4-c2310539738a',
  'ae720825-afd4-407b-b967-1b0b8b32c9b8','61bce5e9-6b49-4b52-8331-f0c0cb2f90fb',
  '2f5b34f8-b1e1-4be6-ae10-3bef197812f1','2b3f0ab3-733c-4676-a67d-915e222b6167',
  '8e22fd0c-4215-4347-b909-c5a6b72b83d1'
);

INSERT INTO tasks (id, project_id, title, description, assignee_id, priority, status, due_date, estimated_hours, actual_hours, ai_generated, parent_task_id, sort_order, created_at, updated_at, linked_board_id) VALUES
('df5fa71c-8da3-423b-8530-4cace91f6cad', NULL, '시장조사', NULL, '5973135f-a384-45d8-bbce-31cd73d27099', 'normal', 'done', '2026-03-20', NULL, NULL, false, NULL, 0, '2026-03-19T21:04:42.472384+00:00', '2026-03-23T12:01:46.973692+00:00', NULL),
('131e91d1-7dec-40ac-b18b-b1be1467731a', NULL, '브랜드별 로고 취합', NULL, '225066f4-2842-477f-b9e4-b920e047ad8a', 'normal', 'todo', '2026-03-23', NULL, NULL, false, NULL, 1, '2026-03-19T21:05:05.886025+00:00', '2026-03-23T12:01:46.973692+00:00', NULL),
('8ece88c8-ef8e-43da-812c-f0024e070092', NULL, '김형석 이사님, 테스트, 콘텐츠 업로드 및 수정', NULL, '225066f4-2842-477f-b9e4-b920e047ad8a', 'normal', 'todo', '2026-03-27', NULL, NULL, false, NULL, 0, '2026-03-23T06:13:15.215591+00:00', '2026-03-23T06:13:15.215591+00:00', '8248b8e3-1683-4e11-b1e9-f689588ed577'),
('47649291-329d-4351-be9b-130fe3b3c02e', NULL, '도메인 DNS 서버 확인', NULL, '225066f4-2842-477f-b9e4-b920e047ad8a', 'normal', 'todo', '2026-03-31', NULL, NULL, false, NULL, 1, '2026-03-23T07:15:50.992375+00:00', '2026-03-23T07:15:50.992375+00:00', '8248b8e3-1683-4e11-b1e9-f689588ed577'),
('05488339-65b1-4c4a-8b4f-5cb294709631', NULL, '페이팔 결제 라이브 연결', NULL, '5973135f-a384-45d8-bbce-31cd73d27099', 'high', 'done', '2026-03-23', NULL, NULL, false, NULL, 0, '2026-03-24T02:02:21.18011+00:00', '2026-03-24T02:03:07.709945+00:00', 'b48164af-2c89-4197-8180-ef74bdf8a286'),
('0fd5179d-e54c-4de2-a734-2338fb674753', NULL, E'이메일 설정 작업 진행 - 김푸른 리더 메일로 재가입 후 진행(도메인 인증은 외부업체 확인 후 진행)', NULL, '5973135f-a384-45d8-bbce-31cd73d27099', 'high', 'done', '2026-03-23', NULL, NULL, false, NULL, 1, '2026-03-24T02:03:05.135178+00:00', '2026-03-24T02:03:09.596664+00:00', 'b48164af-2c89-4197-8180-ef74bdf8a286'),
('e896d182-5b91-4d3e-b46e-f9e3c15d996c', NULL, '인사노무 기능 추가', NULL, '5973135f-a384-45d8-bbce-31cd73d27099', 'high', 'done', '2026-03-24', NULL, NULL, false, NULL, 0, '2026-03-24T08:54:32.139047+00:00', '2026-03-24T08:54:35.587303+00:00', '80c97885-5d37-411a-8a74-71dc7e2d0fd2'),
('5b8aaa16-1ab5-4d50-88f0-c0915e841c99', NULL, 'HR플랫폼 개발 환경 마이그레이션 진행', NULL, '5973135f-a384-45d8-bbce-31cd73d27099', 'high', 'done', '2026-03-24', NULL, NULL, false, NULL, 1, '2026-03-24T08:55:06.351191+00:00', '2026-03-24T08:55:07.981334+00:00', '80c97885-5d37-411a-8a74-71dc7e2d0fd2'),
('bf645ee2-b4f1-4614-85a4-3071af661a70', NULL, 'HR플랫폼 데이터베이스 유료화', NULL, '70323171-d1f2-4828-a14e-80896ee4eccf', 'high', 'todo', '2026-03-26', NULL, NULL, false, NULL, 2, '2026-03-24T08:56:48.244493+00:00', '2026-03-24T08:56:48.244493+00:00', '80c97885-5d37-411a-8a74-71dc7e2d0fd2'),
('fdd666a4-c416-4943-860d-5ea32dc4fc69', NULL, '페이팔 연동 작업 수정 업데이트', NULL, '5973135f-a384-45d8-bbce-31cd73d27099', 'urgent', 'done', '2026-03-25', NULL, NULL, false, NULL, 2, '2026-03-25T01:09:27.870147+00:00', '2026-03-25T01:09:32.737913+00:00', 'b48164af-2c89-4197-8180-ef74bdf8a286'),
('40934901-433b-4fee-bd90-58f25be0879d', NULL, '채용관리 메뉴 기능 업데이트', NULL, '5973135f-a384-45d8-bbce-31cd73d27099', 'normal', 'done', '2026-03-25', NULL, NULL, false, NULL, 3, '2026-03-25T04:58:27.513201+00:00', '2026-03-25T06:26:38.218977+00:00', '80c97885-5d37-411a-8a74-71dc7e2d0fd2'),
('21edc6b9-2e74-4885-a2f4-c2310539738a', NULL, '인사노무 메뉴 기능 업데이트', NULL, '5973135f-a384-45d8-bbce-31cd73d27099', 'normal', 'done', '2026-03-25', NULL, NULL, false, NULL, 4, '2026-03-25T04:59:02.980618+00:00', '2026-03-25T04:59:09.415089+00:00', '80c97885-5d37-411a-8a74-71dc7e2d0fd2'),
('ae720825-afd4-407b-b967-1b0b8b32c9b8', NULL, E'OPEN AI API 결제카드 등록(영수증)\U0001F4CE Receipt-2870-1830-9037.pdf ', NULL, '5973135f-a384-45d8-bbce-31cd73d27099', 'normal', 'done', '2026-03-24', NULL, NULL, false, NULL, 5, '2026-03-25T06:25:40.941303+00:00', '2026-03-25T06:40:49.482757+00:00', '80c97885-5d37-411a-8a74-71dc7e2d0fd2'),
('61bce5e9-6b49-4b52-8331-f0c0cb2f90fb', NULL, '프로젝트 관리 (5건)', NULL, '5973135f-a384-45d8-bbce-31cd73d27099', 'normal', 'done', '2026-03-25', NULL, NULL, false, NULL, 6, '2026-03-25T13:42:46.180354+00:00', '2026-03-25T13:43:58.500785+00:00', '80c97885-5d37-411a-8a74-71dc7e2d0fd2'),
('2f5b34f8-b1e1-4be6-ae10-3bef197812f1', NULL, E'인사노무 \u2014 (9건)', NULL, '5973135f-a384-45d8-bbce-31cd73d27099', 'normal', 'done', '2026-03-25', NULL, NULL, false, NULL, 7, '2026-03-25T13:46:25.921848+00:00', '2026-03-25T13:46:31.816695+00:00', '80c97885-5d37-411a-8a74-71dc7e2d0fd2'),
('2b3f0ab3-733c-4676-a67d-915e222b6167', NULL, E'채용관리 \u2014 사전질의서/면접외 (12건)', NULL, '5973135f-a384-45d8-bbce-31cd73d27099', 'normal', 'done', '2026-03-25', NULL, NULL, false, NULL, 8, '2026-03-25T13:47:47.004234+00:00', '2026-03-25T13:47:50.709504+00:00', '80c97885-5d37-411a-8a74-71dc7e2d0fd2'),
('8e22fd0c-4215-4347-b909-c5a6b72b83d1', NULL, '장소섭외', E'경기인근지역 확인 중', '6bafdc64-133c-4e1e-994f-ee57362fd784', 'high', 'done', '2026-03-31', NULL, NULL, false, NULL, 0, '2026-03-26T04:59:42.994984+00:00', '2026-03-26T04:59:52.94146+00:00', '1ebb9cba-2380-4343-b99a-f4399e9da2cd');

-- =====================================================================
-- 9. daily_reports (4개)
-- =====================================================================
DELETE FROM daily_reports WHERE id IN (
  'c22bc053-c539-40b9-977c-2154f25cba27',
  'f29fef48-e492-440c-8a8f-fc7d443cd7f5',
  'a5e756a3-bfd6-4434-add8-3a79fd8ba595',
  '51a774fa-620d-42b0-ae14-cd73277ba4b9'
);

INSERT INTO daily_reports (id, employee_id, report_date, tasks_completed, tasks_in_progress, tasks_planned, carryover_tasks, ai_priority_suggestion, satisfaction_score, satisfaction_comment, blockers, created_at, updated_at) VALUES
('c22bc053-c539-40b9-977c-2154f25cba27', '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b', '2026-03-20', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, NULL, 5, NULL, NULL, '2026-03-20T04:54:29.338976+00:00', '2026-03-20T04:54:29.338976+00:00'),
('f29fef48-e492-440c-8a8f-fc7d443cd7f5', '5973135f-a384-45d8-bbce-31cd73d27099', '2026-03-24', '[{"id":"e896d182-5b91-4d3e-b46e-f9e3c15d996c","title":"[작업 완료] 인사노무 기능 추가","status":"done"},{"id":"5b8aaa16-1ab5-4d50-88f0-c0915e841c99","title":"[작업 완료] HR플랫폼 개발 환경 마이그레이션 진행","status":"done"},{"id":"05488339-65b1-4c4a-8b4f-5cb294709631","title":"[작업 완료] 페이팔 결제 라이브 연결","status":"done"},{"id":"0fd5179d-e54c-4de2-a734-2338fb674753","title":"[작업 완료] 이메일 설정 작업 진행 - 김푸른 리더 메일로 재가입 후 진행(도메인 인증은 외부업체 확인 후 진행)","status":"done"},{"id":"7df2f54d-bdca-4c3c-9076-c0f2c8c36655","title":"[HR 플랫폼 개발] DB 유료구독을 위한 결제카드 입력 3/26(목) 부탁드립니다.","status":"done"}]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, NULL, 7, NULL, NULL, '2026-03-24T09:17:23.101543+00:00', '2026-03-24T09:17:23.101543+00:00'),
('a5e756a3-bfd6-4434-add8-3a79fd8ba595', '5973135f-a384-45d8-bbce-31cd73d27099', '2026-03-23', '[{"id":"df5fa71c-8da3-423b-8530-4cace91f6cad","title":"[작업 완료] 시장조사","status":"done"},{"id":"92c1cbd5-9ad6-4a14-a2b2-848832a1a9a9","title":"[인터오리진 I&C 리뉴얼] 요구사항 분석 및 기획: 시작전 -> 완료","status":"done"},{"id":"16e9fa61-9a5e-49ef-add6-9d1083e0b37b","title":"[인터오리진 I&C 리뉴얼] 요구사항 분석 및 기획: 시작전 -> 완료","status":"done"},{"id":"3be77e81-2671-436f-b6be-e9ef6c886767","title":"[인터오리진 I&C 리뉴얼] 디자인 및 UI/UX 설계: 시작전 -> 완료","status":"done"},{"id":"9633577e-7418-4b7a-adb2-7b3f054534dd","title":"[인터오리진 I&C 리뉴얼] 개발 및 구현: 시작전 -> 완료","status":"done"},{"id":"de13aa74-0b08-4cca-8bd0-fe61d31c5cf6","title":"[인터오리진 I&C 리뉴얼] 품질보증 및 테스트: 시작전 -> 진행중","status":"done"},{"id":"66090c14-579d-4086-9e2e-60e897feab16","title":"[Exhiboot 개발] 요구사항 분석 및 설계: 시작전 -> 완료","status":"done"},{"id":"999e8e5e-128e-42cf-bf15-165ffe83e9d1","title":"[Exhiboot 개발] 시스템 아키텍처 구축: 시작전 -> 완료","status":"done"},{"id":"98c25ae2-a6c9-491d-b7e2-0f4842e61722","title":"[Exhiboot 개발] 핵심 기능 개발: 시작전 -> 완료","status":"done"},{"id":"e15a1c71-66f8-4a78-9de7-11cbd95105ff","title":"[Exhiboot 개발] 상담 운영 기능 개발: 시작전 -> 완료","status":"done"},{"id":"2a221273-4bb0-4b56-8688-6170934e9e43","title":"[Exhiboot 개발] 통합 테스트 및 품질 보증: 시작전 -> 완료","status":"done"},{"id":"47698f44-9aa0-4a8d-b06e-87a539e5cf5e","title":"[Exhiboot 개발] 운영 환경 배포: 시작전 -> 완료","status":"done"},{"id":"713b041d-097e-4189-af0f-dfde8d916b0e","title":"[HR 플랫폼 개발] 요구사항 분석 및 설계: 시작전 -> 완료","status":"done"},{"id":"1948c8a6-6490-43ee-b5a2-57ac5e284d09","title":"[HR 플랫폼 개발] 시스템 아키텍처 정의: 시작전 -> 완료","status":"done"},{"id":"1212f8fb-4aa7-404b-984c-dc2052b91592","title":"[HR 플랫폼 개발] 개발 환경 구축: 시작전 -> 완료","status":"done"},{"id":"cc4462bf-4666-4894-b2b2-1378d9e21412","title":"[HR 플랫폼 개발] 핵심 기능 개발: 시작전 -> 완료","status":"done"},{"id":"7b0b82b9-03be-4348-b751-f4e3f74b7d57","title":"[HR 플랫폼 개발] 통합 테스트 및 버그 수정: 시작전 -> 진행중","status":"done"},{"id":"260683ec-0873-4a1c-b312-e6b15f92cc46","title":"[AI 디자인 에이전트] 요구사항 분석 및 설계: 시작전 -> 완료","status":"done"},{"id":"781845d5-742b-4ec0-aa09-6c4a6234a71f","title":"[인터오리진 I&C 리뉴얼] 콘텐츠 확인","status":"done"}]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, NULL, 5, NULL, NULL, '2026-03-24T09:17:33.968192+00:00', '2026-03-24T09:17:33.968192+00:00'),
('51a774fa-620d-42b0-ae14-cd73277ba4b9', '5973135f-a384-45d8-bbce-31cd73d27099', '2026-03-25', '[{"id":"2f5b34f8-b1e1-4be6-ae10-3bef197812f1","title":"[작업 완료] 인사노무 -- (9건)","status":"done"},{"id":"fdd666a4-c416-4943-860d-5ea32dc4fc69","title":"[작업 완료] 페이팔 연동 작업 수정 업데이트","status":"done"},{"id":"21edc6b9-2e74-4885-a2f4-c2310539738a","title":"[작업 완료] 인사노무 메뉴 기능 업데이트","status":"done"},{"id":"40934901-433b-4fee-bd90-58f25be0879d","title":"[작업 완료] 채용관리 메뉴 기능 업데이트","status":"done"},{"id":"ae720825-afd4-407b-b967-1b0b8b32c9b8","title":"[작업 완료] OPEN AI API 결제카드 등록(영수증)","status":"done"},{"id":"61bce5e9-6b49-4b52-8331-f0c0cb2f90fb","title":"[작업 완료] 프로젝트 관리 (5건)","status":"done"},{"id":"2b3f0ab3-733c-4676-a67d-915e222b6167","title":"[작업 완료] 채용관리 -- 사전질의서/면접외 (12건)","status":"done"},{"id":"ba82cbdd-fccd-4c7f-97b6-4aa3f1b36777","title":"[HR 플랫폼 개발] 추가 기능 요청 후 개발 진행(인사노무): 진행중 -> 완료","status":"done"},{"id":"4888cb32-3df2-415c-a273-665e5d036b09","title":"[HR 플랫폼 개발] Receipt-2870-1830-9037.pdf","status":"done"}]'::jsonb, '[]'::jsonb, '[{"id":"ec2f45c4-da46-4f20-93fd-6e17941c080e","title":"데이터베이스 유료구독","status":"todo"},{"id":"ccbcb632-b908-4187-b055-01f9e6a1cda7","title":"채용관리 모의 테스트 진행","status":"todo"}]'::jsonb, '[]'::jsonb, NULL, 8, NULL, NULL, '2026-03-25T14:04:34.761809+00:00', '2026-03-25T14:04:34.761809+00:00');

-- =====================================================================
-- 10. urgent_tasks (3개)
-- =====================================================================
DELETE FROM urgent_tasks WHERE id IN (
  'dab5dc8c-5a63-4a7d-b2e9-19baf3be0323',
  '3b24b00b-0cbe-49d3-a99e-d7a2f37b15ad',
  '11221124-b2e1-4412-b997-aa6ed38a689f'
);

INSERT INTO urgent_tasks (id, title, description, priority, assigned_to, created_by, deadline, is_overdue, status, completed_at, completed_by, completion_note, reminder_count, last_reminder_at, reminder_interval_hours, project_id, related_employee_id, created_at, updated_at) VALUES
('dab5dc8c-5a63-4a7d-b2e9-19baf3be0323', '테스트', '', 1, ARRAY['70323171-d1f2-4828-a14e-80896ee4eccf','0288ad7a-7c80-4a69-a1e5-e6eb52f5317b']::uuid[], '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b', '2026-03-20T12:00:00+00:00', false, 'completed', '2026-03-19T09:24:28.223+00:00', '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b', E'완료했습니다.\n', 0, NULL, 2, NULL, NULL, '2026-03-19T02:47:53.666592+00:00', '2026-03-19T09:24:28.239141+00:00'),
('3b24b00b-0cbe-49d3-a99e-d7a2f37b15ad', '5월 워크샵', '26년 1분기 워크샵', 1, ARRAY['70323171-d1f2-4828-a14e-80896ee4eccf','a0e0d8b6-f086-4a97-95c1-e28e032d945c','6bafdc64-133c-4e1e-994f-ee57362fd784']::uuid[], '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b', '2026-05-12T21:00:00+00:00', false, 'pending', NULL, NULL, NULL, 0, NULL, 4, NULL, NULL, '2026-03-23T05:04:44.520143+00:00', '2026-03-23T05:04:44.520143+00:00'),
('11221124-b2e1-4412-b997-aa6ed38a689f', 'HR플랫폼 중간점검', '', 1, ARRAY['5973135f-a384-45d8-bbce-31cd73d27099']::uuid[], '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b', '2026-03-24T15:50:00+00:00', false, 'pending', NULL, NULL, NULL, 0, NULL, 2, NULL, NULL, '2026-03-24T03:27:43.476056+00:00', '2026-03-24T03:27:43.476056+00:00');

-- =====================================================================
-- 11. chat_rooms (5개)
-- =====================================================================
DELETE FROM chat_rooms WHERE id IN (
  'f63938e7-5f82-4063-abd4-fb46c68e3f7b',
  'c3ead317-a6f4-44d8-ab6b-8e540b5b52de',
  '9a5fb01e-5ea3-4461-acfc-f2d1b83ab569',
  '941b6b36-3e8b-4e33-8305-8633660b7a7c',
  '28cba3e2-a8b0-4078-9fbd-41006e2e145b'
);

INSERT INTO chat_rooms (id, name, type, description, linked_project_id, linked_job_posting_id, linked_mentor_assignment_id, linked_department, is_ai_enabled, is_archived, created_by, created_at, updated_at, last_message_at) VALUES
('f63938e7-5f82-4063-abd4-fb46c68e3f7b', NULL, 'dm', NULL, NULL, NULL, NULL, NULL, true, false, '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b', '2026-03-19T07:06:36.994679+00:00', '2026-03-23T06:42:18.754559+00:00', '2026-03-23T06:42:18.754559+00:00'),
('c3ead317-a6f4-44d8-ab6b-8e540b5b52de', E'\U0001F465 인사총무파트', 'group', NULL, NULL, NULL, NULL, NULL, true, false, '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b', '2026-03-19T09:51:06.205132+00:00', '2026-03-19T09:51:06.205132+00:00', NULL),
('9a5fb01e-5ea3-4461-acfc-f2d1b83ab569', E'\U0001F465 인사총무파트', 'group', NULL, NULL, NULL, NULL, NULL, true, false, '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b', '2026-03-19T09:51:07.276686+00:00', '2026-03-19T09:51:16.922794+00:00', '2026-03-19T09:51:16.922794+00:00'),
('941b6b36-3e8b-4e33-8305-8633660b7a7c', E'\U0001F465 \u3139\u3139\u3139', 'group', NULL, NULL, NULL, NULL, NULL, true, false, '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b', '2026-03-23T05:03:08.299162+00:00', '2026-03-23T05:03:08.299162+00:00', NULL),
('28cba3e2-a8b0-4078-9fbd-41006e2e145b', NULL, 'dm', NULL, NULL, NULL, NULL, NULL, true, false, '5973135f-a384-45d8-bbce-31cd73d27099', '2026-03-25T11:45:23.252547+00:00', '2026-03-25T11:46:03.257809+00:00', '2026-03-25T11:46:03.257809+00:00');

-- =====================================================================
-- 12. chat_room_members (15개)
-- =====================================================================
DELETE FROM chat_room_members WHERE id IN (
  '97c9cda6-d835-411d-92dd-57480c5414ce','ebeb8808-a1a1-44f8-8518-6a56a408d1c1',
  '3f70edc7-ecd1-4302-8a73-c1297564e3d9','ec56e806-0be7-43dc-9df3-e32838f61ea1',
  '8c7c4c04-b1d3-4b66-9134-bb6e693c6491','cd968472-04b6-447d-a60a-5c875ceadd02',
  'b3da2066-a9f3-4956-b361-0c1023c4e81a','1ad0ff79-e0c4-4d7b-a767-7a7174c0c21d',
  'f8fa92b3-9693-42b7-9bf9-002ec5d4874a','84881b9b-14ef-4ab3-8a00-e867863776b0',
  '975543d9-c80b-47c0-a5cd-a11821011d8c','dde7c2de-c1af-4318-a1c1-4c204b220b35',
  '8bbadb9a-f440-4f7d-9b30-4c36041a0dcd','2d6a0176-3522-452e-93be-51657b48428f',
  'd3260e3b-c053-4377-be02-a952b7b6e3e4'
);

INSERT INTO chat_room_members (id, room_id, user_id, role, last_read_at, unread_count, is_muted, is_pinned, joined_at) VALUES
('97c9cda6-d835-411d-92dd-57480c5414ce', 'c3ead317-a6f4-44d8-ab6b-8e540b5b52de', '70323171-d1f2-4828-a14e-80896ee4eccf', 'member', '2026-03-19T09:51:06.365103+00:00', 0, false, false, '2026-03-19T09:51:06.365103+00:00'),
('ebeb8808-a1a1-44f8-8518-6a56a408d1c1', 'c3ead317-a6f4-44d8-ab6b-8e540b5b52de', '6bafdc64-133c-4e1e-994f-ee57362fd784', 'member', '2026-03-19T09:51:06.365103+00:00', 0, false, false, '2026-03-19T09:51:06.365103+00:00'),
('3f70edc7-ecd1-4302-8a73-c1297564e3d9', 'c3ead317-a6f4-44d8-ab6b-8e540b5b52de', '3f7e9ffc-384f-4ab0-ab7c-654ecb73ec02', 'member', '2026-03-19T09:51:06.365103+00:00', 0, false, false, '2026-03-19T09:51:06.365103+00:00'),
('ec56e806-0be7-43dc-9df3-e32838f61ea1', '9a5fb01e-5ea3-4461-acfc-f2d1b83ab569', '70323171-d1f2-4828-a14e-80896ee4eccf', 'member', '2026-03-19T09:51:07.379939+00:00', 2, false, false, '2026-03-19T09:51:07.379939+00:00'),
('8c7c4c04-b1d3-4b66-9134-bb6e693c6491', '9a5fb01e-5ea3-4461-acfc-f2d1b83ab569', '6bafdc64-133c-4e1e-994f-ee57362fd784', 'member', '2026-03-19T09:51:07.379939+00:00', 2, false, false, '2026-03-19T09:51:07.379939+00:00'),
('cd968472-04b6-447d-a60a-5c875ceadd02', '9a5fb01e-5ea3-4461-acfc-f2d1b83ab569', '3f7e9ffc-384f-4ab0-ab7c-654ecb73ec02', 'member', '2026-03-19T09:51:07.379939+00:00', 2, false, false, '2026-03-19T09:51:07.379939+00:00'),
('b3da2066-a9f3-4956-b361-0c1023c4e81a', '941b6b36-3e8b-4e33-8305-8633660b7a7c', '70323171-d1f2-4828-a14e-80896ee4eccf', 'member', '2026-03-23T05:03:08.438824+00:00', 0, false, false, '2026-03-23T05:03:08.438824+00:00'),
('1ad0ff79-e0c4-4d7b-a767-7a7174c0c21d', '941b6b36-3e8b-4e33-8305-8633660b7a7c', '4a188aab-eaf3-4129-a2a3-45020f0f1ab2', 'member', '2026-03-23T05:03:08.438824+00:00', 0, false, false, '2026-03-23T05:03:08.438824+00:00'),
('f8fa92b3-9693-42b7-9bf9-002ec5d4874a', 'f63938e7-5f82-4063-abd4-fb46c68e3f7b', '70323171-d1f2-4828-a14e-80896ee4eccf', 'member', '2026-03-19T07:06:37.131906+00:00', 9, false, false, '2026-03-19T07:06:37.131906+00:00'),
('84881b9b-14ef-4ab3-8a00-e867863776b0', '28cba3e2-a8b0-4078-9fbd-41006e2e145b', 'a0e0d8b6-f086-4a97-95c1-e28e032d945c', 'member', '2026-03-25T11:45:23.443296+00:00', 0, false, false, '2026-03-25T11:45:23.443296+00:00'),
('975543d9-c80b-47c0-a5cd-a11821011d8c', 'f63938e7-5f82-4063-abd4-fb46c68e3f7b', '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b', 'admin', '2026-03-26T03:49:00.951+00:00', 0, false, false, '2026-03-19T07:06:37.131906+00:00'),
('dde7c2de-c1af-4318-a1c1-4c204b220b35', '9a5fb01e-5ea3-4461-acfc-f2d1b83ab569', '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b', 'admin', '2026-03-26T03:49:05.799+00:00', 0, false, false, '2026-03-19T09:51:07.379939+00:00'),
('8bbadb9a-f440-4f7d-9b30-4c36041a0dcd', 'c3ead317-a6f4-44d8-ab6b-8e540b5b52de', '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b', 'admin', '2026-03-26T03:49:06.932+00:00', 0, false, false, '2026-03-19T09:51:06.365103+00:00'),
('2d6a0176-3522-452e-93be-51657b48428f', '941b6b36-3e8b-4e33-8305-8633660b7a7c', '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b', 'admin', '2026-03-26T03:49:08.087+00:00', 0, false, false, '2026-03-23T05:03:08.438824+00:00'),
('d3260e3b-c053-4377-be02-a952b7b6e3e4', '28cba3e2-a8b0-4078-9fbd-41006e2e145b', '5973135f-a384-45d8-bbce-31cd73d27099', 'admin', '2026-03-26T03:49:13.743+00:00', 0, false, false, '2026-03-25T11:45:23.443296+00:00');

-- =====================================================================
-- 13. messages (14개)
-- =====================================================================
DELETE FROM messages WHERE id IN (
  '7520dcef-ef58-4bb9-913f-149e7cf635aa','6dcbd501-eee7-4321-aa37-4c26c8c47e43',
  '9c66dc01-1db7-480b-8835-f3b0e3c67f12','09537d03-2c8c-4767-9c89-33ee57077fed',
  '1b28f675-3468-452b-abce-e3ec1ec6ad3b','654d9105-9966-4fe2-8a14-2ddcb4847df9',
  'e3224d3b-4010-46f3-9aef-5e74517a2e9e','aca2a1c0-7f15-4c19-8b94-bc9d6546cf98',
  '36d0eab9-d541-4e03-b9ff-d7a6c715d612','f6975547-9ba4-443b-a1c5-19eab370eeb3',
  'a12a77ec-be08-42b9-a427-750915cc6a40','3189195c-51f9-4764-ac91-42ecea657fea',
  '6315cc89-0cac-4962-8602-82a8493ac55f','984bcc3e-0879-4149-8d83-eaeaf32533b7'
);

INSERT INTO messages (id, room_id, sender_id, content, message_type, attachment_url, attachment_name, attachment_size, attachment_type, reply_to_id, linked_urgent_task_id, linked_candidate_id, linked_employee_id, is_edited, edited_at, is_deleted, created_at) VALUES
('7520dcef-ef58-4bb9-913f-149e7cf635aa', 'f63938e7-5f82-4063-abd4-fb46c68e3f7b', '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b', '안녀하세요?', 'text', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, false, '2026-03-19T07:06:49.832629+00:00'),
('6dcbd501-eee7-4321-aa37-4c26c8c47e43', 'f63938e7-5f82-4063-abd4-fb46c68e3f7b', '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b', '@ai 오늘은 신제품 런칭 주제로 얘기할꺼야', 'text', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, false, '2026-03-19T07:07:10.842994+00:00'),
('9c66dc01-1db7-480b-8835-f3b0e3c67f12', 'f63938e7-5f82-4063-abd4-fb46c68e3f7b', '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b', '@AI', 'text', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, false, '2026-03-19T07:07:21.777419+00:00'),
('09537d03-2c8c-4767-9c89-33ee57077fed', 'f63938e7-5f82-4063-abd4-fb46c68e3f7b', NULL, E'안녕하세요! \U0001F44B 인터오리진 AI 비서입니다.\n\n시스템관리자님의 신제품 런칭 관련 대화를 확인했습니다.\n\n신제품 런칭에 대해 궁금하신 점이 있으신가요?\n\n다음과 같이 도와드릴 수 있습니다:\n- 런칭 관련 담당자 연결\n- 필요한 절차나 정보 안내\n- 관련 직원 정보 제공\n\n**구체적인 질문**을 말씀해 주시면 더 잘 도와드릴 수 있습니다!\n\n무엇을 도와드릴까요?', 'ai_bot', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, false, '2026-03-19T07:07:24.533571+00:00'),
('1b28f675-3468-452b-abce-e3ec1ec6ad3b', 'f63938e7-5f82-4063-abd4-fb46c68e3f7b', '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b', '@AI 오늘은 신제품 런칭 주제로 얘기할껀데 현재 인스타에서 가장 핫한 헤어제품은 뭐가 있는지 찾아봐줘', 'text', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, false, '2026-03-19T07:07:59.82553+00:00'),
('654d9105-9966-4fe2-8a14-2ddcb4847df9', 'f63938e7-5f82-4063-abd4-fb46c68e3f7b', NULL, E'# 안녕하세요!\n\n죄송하지만, 저는 **인터오리진 사내 시스템** 정보와 직원 관련 업무만 지원하는 AI 비서입니다.\n\n인스타그램의 현재 핫한 헤어제품 트렌드 조사는 **외부 정보 수집**이라 직접 도와드리기 어렵습니다.\n\n---\n\n## 이렇게 도와드릴 수 있습니다!\n\n**신제품 런칭 관련 담당자 연결:**\n- **마케팅/상품 담당자** 추천 필요\n- 런칭 전략, 트렌드 분석 담당자 소개\n\n혹시 **마케팅팀이나 상품기획팀** 담당자와 연결되고 싶으신가요?\n\n**구체적으로 이렇게 말씀해주시면 됩니다:**\n- "신제품 런칭 담당자 누구야?"\n- "마케팅팀 담장자 소개해줘"\n\n어떻게 도와드릴까요?', 'ai_bot', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, false, '2026-03-19T07:08:03.724562+00:00'),
('e3224d3b-4010-46f3-9aef-5e74517a2e9e', 'f63938e7-5f82-4063-abd4-fb46c68e3f7b', '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b', E'\U0001F4F7 logo-black.png', 'image', 'https://jlgdbofwlmhjayyjtyxv.supabase.co/storage/v1/object/public/chat-attachments/chat/f63938e7-5f82-4063-abd4-fb46c68e3f7b/1773906918978_logo-black.png', 'logo-black.png', 6166, 'image/png', NULL, NULL, NULL, NULL, false, NULL, false, '2026-03-19T07:55:19.372906+00:00'),
('aca2a1c0-7f15-4c19-8b94-bc9d6546cf98', '9a5fb01e-5ea3-4461-acfc-f2d1b83ab569', '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b', E'안녕하세요', 'text', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, false, '2026-03-19T09:51:12.421502+00:00'),
('36d0eab9-d541-4e03-b9ff-d7a6c715d612', '9a5fb01e-5ea3-4461-acfc-f2d1b83ab569', '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b', E'@최다예', 'text', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, false, '2026-03-19T09:51:16.922794+00:00'),
('f6975547-9ba4-443b-a1c5-19eab370eeb3', 'f63938e7-5f82-4063-abd4-fb46c68e3f7b', '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b', '@AI', 'text', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, false, '2026-03-23T06:42:15.046417+00:00'),
('a12a77ec-be08-42b9-a427-750915cc6a40', 'f63938e7-5f82-4063-abd4-fb46c68e3f7b', NULL, E'# 안녕하세요!\n\n로고 이미지를 받았습니다!\n\n혹시 이 로고와 관련해서 **궁금한 점이나 요청사항**이 있으신가요?\n\n예를 들어:\n- 로고 사용 관련 문의\n- 브랜드 가이드라인 확인\n- 담당자 연결 필요\n\n**구체적으로 어떻게 도와드릴까요?**', 'ai_bot', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, false, '2026-03-23T06:42:18.754559+00:00'),
('3189195c-51f9-4764-ac91-42ecea657fea', '28cba3e2-a8b0-4078-9fbd-41006e2e145b', '5973135f-a384-45d8-bbce-31cd73d27099', '안녕하세요?', 'text', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, false, '2026-03-25T11:45:29.040397+00:00'),
('6315cc89-0cac-4962-8602-82a8493ac55f', '28cba3e2-a8b0-4078-9fbd-41006e2e145b', '5973135f-a384-45d8-bbce-31cd73d27099', '요청하신 영수증 전달 합니다.', 'text', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, false, '2026-03-25T11:45:40.967289+00:00'),
('984bcc3e-0879-4149-8d83-eaeaf32533b7', '28cba3e2-a8b0-4078-9fbd-41006e2e145b', '5973135f-a384-45d8-bbce-31cd73d27099', E'\U0001F4CE Receipt-2870-1830-9037.pdf', 'file', 'https://jlgdbofwlmhjayyjtyxv.supabase.co/storage/v1/object/public/chat-attachments/chat/28cba3e2-a8b0-4078-9fbd-41006e2e145b/1774439162586_Receipt-2870-1830-9037.pdf', 'Receipt-2870-1830-9037.pdf', 56146, 'application/pdf', NULL, NULL, NULL, NULL, false, NULL, false, '2026-03-25T11:46:03.257809+00:00');

COMMIT;

-- =====================================================================
-- 검증 쿼리
-- =====================================================================
SELECT 'ai_settings' AS table_name, COUNT(*) AS cnt FROM ai_settings
UNION ALL SELECT 'pre_survey_templates', COUNT(*) FROM pre_survey_templates
UNION ALL SELECT 'job_postings', COUNT(*) FROM job_postings
UNION ALL SELECT 'candidates', COUNT(*) FROM candidates
UNION ALL SELECT 'interview_schedules', COUNT(*) FROM interview_schedules
UNION ALL SELECT 'resume_analysis', COUNT(*) FROM resume_analysis
UNION ALL SELECT 'hiring_decisions', COUNT(*) FROM hiring_decisions
UNION ALL SELECT 'tasks', COUNT(*) FROM tasks
UNION ALL SELECT 'daily_reports', COUNT(*) FROM daily_reports
UNION ALL SELECT 'urgent_tasks', COUNT(*) FROM urgent_tasks
UNION ALL SELECT 'chat_rooms', COUNT(*) FROM chat_rooms
UNION ALL SELECT 'chat_room_members', COUNT(*) FROM chat_room_members
UNION ALL SELECT 'messages', COUNT(*) FROM messages
ORDER BY table_name;

-- FK 체크 복원
SET session_replication_role = 'origin';
