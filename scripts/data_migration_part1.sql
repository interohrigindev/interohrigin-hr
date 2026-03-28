-- =====================================================================
-- Phase 3: 데이터 마이그레이션 (FREE → PRO)
-- PRO DB SQL Editor에서 실행
-- =====================================================================

-- ★ 주의: departments를 교체하므로 기존 seed 데이터 정리 필요
-- employees.department_id가 FK로 참조하므로 순서 중요

-- 1. 기존 seed departments 삭제 (PRO에서 자동생성된 것)
DELETE FROM employees;
DELETE FROM departments;

-- 2. FREE DB departments 삽입 (정확한 UUID 보존)
INSERT INTO departments (id, name, created_at) VALUES
  ('d0000000-0000-0000-0000-000000000001', '브랜드사업본부', now()),
  ('d0000000-0000-0000-0000-000000000002', '경영관리본부', now()),
  ('d0000000-0000-0000-0000-000000000003', '마케팅영업본부', now()),
  ('d0000000-0000-0000-0000-000000000004', '대표', now());

-- 3. employees 28명 삽입
INSERT INTO employees (id, name, email, department_id, role, is_active, created_at, updated_at, phone, address, birth_date, avatar_url, employee_number, hire_date, position, employment_type, emergency_contact) VALUES (
  '0288ad7a-7c80-4a69-a1e5-e6eb52f5317b', '시스템관리자', 'admin@interohrigin.com', NULL, 'admin', true,
  '2026-02-28T08:08:42.912451+00:00', '2026-03-19T03:36:31.625682+00:00', NULL, NULL, '1979-04-22',
  '/avatars/avatar-28.svg', NULL, NULL, NULL, 'full_time', NULL
);
INSERT INTO employees (id, name, email, department_id, role, is_active, created_at, updated_at, phone, address, birth_date, avatar_url, employee_number, hire_date, position, employment_type, emergency_contact) VALUES (
  'a0e0d8b6-f086-4a97-95c1-e28e032d945c', '이민지', 'mj.lee@interohrigin.com', 'd0000000-0000-0000-0000-000000000002', 'employee', true,
  '2026-03-13T01:19:39.942975+00:00', '2026-03-17T10:48:51.106239+00:00', '010-9466-5247', '서울특별시 송파구 성내천로 8가길 4-10, 202호', '1998-10-28',
  '/avatars/avatar-03.svg', '25072101', '2025-07-21', '대리', 'full_time', NULL
);
INSERT INTO employees (id, name, email, department_id, role, is_active, created_at, updated_at, phone, address, birth_date, avatar_url, employee_number, hire_date, position, employment_type, emergency_contact) VALUES (
  '3d833975-0773-419d-b245-f4adf42d2641', '안병철', 'bc.an@interohrigin.com', 'd0000000-0000-0000-0000-000000000001', 'director', true,
  '2026-03-13T01:23:13.32377+00:00', '2026-03-19T06:39:18.151341+00:00', '010-3219-6536', '서울특별시 강남구 선릉로 121길 5', '1980-01-18',
  '/avatars/avatar-05.svg', '19010101', '2019-01-01', '이사', 'full_time', NULL
);
INSERT INTO employees (id, name, email, department_id, role, is_active, created_at, updated_at, phone, address, birth_date, avatar_url, employee_number, hire_date, position, employment_type, emergency_contact) VALUES (
  'b5e06b9c-087e-4894-acc4-10e9718f7e3d', '김푸른', 'pr.kim@interohrigin.com', 'd0000000-0000-0000-0000-000000000001', 'leader', true,
  '2026-03-13T01:24:46.581203+00:00', '2026-03-17T10:46:22.027193+00:00', '010-2572-0349', '서울특별시 강서구 금낭화로 48 에이블 602호', '1992-03-17',
  '/avatars/avatar-04.svg', '20030401', '2020-03-04', '차장', 'full_time', NULL
);
INSERT INTO employees (id, name, email, department_id, role, is_active, created_at, updated_at, phone, address, birth_date, avatar_url, employee_number, hire_date, position, employment_type, emergency_contact) VALUES (
  'beea7d5e-7a5e-47aa-83b4-222422cefa70', '정유리', 'yr.jung@interohrigin.com', 'd0000000-0000-0000-0000-000000000001', 'leader', true,
  '2026-03-13T01:26:25.334411+00:00', '2026-03-18T07:29:11.78023+00:00', '010-2574-9429', '서울특별시 강남구 논현로 16길 14-12, 202호', '1996-02-29',
  '/avatars/avatar-04.svg', '25101301', '2025-10-13', '과장', 'full_time', NULL
);
INSERT INTO employees (id, name, email, department_id, role, is_active, created_at, updated_at, phone, address, birth_date, avatar_url, employee_number, hire_date, position, employment_type, emergency_contact) VALUES (
  '4713f452-182b-4de8-b089-2acbf0bbb5f6', '정예슬', 'ys.jung@interohrigin.com', 'd0000000-0000-0000-0000-000000000001', 'leader', true,
  '2026-03-13T01:27:55.742645+00:00', '2026-03-17T10:49:41.971906+00:00', '010-4559-3028', '경기도 광주시 회안대로 350-25, 쌍용A 101동 304호', '1996-03-08',
  '/avatars/avatar-04.svg', '23072401', '2023-07-24', '과장', 'full_time', NULL
);
INSERT INTO employees (id, name, email, department_id, role, is_active, created_at, updated_at, phone, address, birth_date, avatar_url, employee_number, hire_date, position, employment_type, emergency_contact) VALUES (
  '2f7e1549-6aad-4095-b8bd-efa05c7d8ac4', '백지영', 'jy.baek@interohrigin.com', 'd0000000-0000-0000-0000-000000000001', 'employee', true,
  '2026-03-13T01:31:50.149844+00:00', '2026-03-18T07:29:35.484552+00:00', '010-2681-4819', '서울특별시 강남구 압구정로 113, 21동 301호', '1994-02-06',
  '/avatars/avatar-04.svg', '25022401', '2025-02-24', '대리', 'full_time', NULL
);
INSERT INTO employees (id, name, email, department_id, role, is_active, created_at, updated_at, phone, address, birth_date, avatar_url, employee_number, hire_date, position, employment_type, emergency_contact) VALUES (
  '54113fd4-db7f-461d-a66f-12ce24b683d1', '이진희', 'jh.lee@interohrigin.com', 'd0000000-0000-0000-0000-000000000001', 'employee', true,
  '2026-03-13T01:33:26.6488+00:00', '2026-03-17T10:49:12.59707+00:00', '010-5488-4176', '서울특별시 노원구 중계로 8길 29, 101동 706호', '2000-07-03',
  '/avatars/avatar-04.svg', '25120101', '2025-12-01', '사원', 'full_time', NULL
);
INSERT INTO employees (id, name, email, department_id, role, is_active, created_at, updated_at, phone, address, birth_date, avatar_url, employee_number, hire_date, position, employment_type, emergency_contact) VALUES (
  '4f667df9-bc39-4f3a-8ab6-7e2f8dc60203', '김윤정', 'yj.kim2@interohrigin.com', 'd0000000-0000-0000-0000-000000000001', 'employee', true,
  '2026-03-13T01:35:15.325294+00:00', '2026-03-17T10:45:57.513701+00:00', '010-2933-7402', '서울특별시 강북구 수유로 12길 27-6 ', '2003-01-27',
  '/avatars/avatar-04.svg', '26011901', '2026-01-19', '수습', 'full_time', NULL
);
INSERT INTO employees (id, name, email, department_id, role, is_active, created_at, updated_at, phone, address, birth_date, avatar_url, employee_number, hire_date, position, employment_type, emergency_contact) VALUES (
  'c05847c7-6c5f-4679-984c-f5a632845d9f', '민시현', 'sh.min@interohrigin.com', 'd0000000-0000-0000-0000-000000000001', 'employee', true,
  '2026-03-13T01:38:37.69172+00:00', '2026-03-17T10:46:48.080753+00:00', '010-5603-2529', '경기도 안산시 상록구 화랑로 534, 101동 2501호', '2000-05-06',
  '/avatars/avatar-04.svg', '26020401', '2026-02-04', '수습', 'full_time', NULL
);
INSERT INTO employees (id, name, email, department_id, role, is_active, created_at, updated_at, phone, address, birth_date, avatar_url, employee_number, hire_date, position, employment_type, emergency_contact) VALUES (
  'ca2d5c53-c1fc-4e68-9f06-18f383dbff4f', '신이수', 'es.shin@interohrigin.com', 'd0000000-0000-0000-0000-000000000001', 'employee', true,
  '2026-03-13T01:40:17.764197+00:00', '2026-03-17T10:48:04.963363+00:00', '010-3515-3404', '서울특별시 송파구 오금로 34길 43, 301호', '1993-03-12',
  '/avatars/avatar-04.svg', '26022502', '2026-02-25', '수습', 'full_time', NULL
);
INSERT INTO employees (id, name, email, department_id, role, is_active, created_at, updated_at, phone, address, birth_date, avatar_url, employee_number, hire_date, position, employment_type, emergency_contact) VALUES (
  '34461e5b-09fa-480b-aba9-3c5b878081dd', '최성주', 'sj.choi@interohrigin.com', 'd0000000-0000-0000-0000-000000000003', 'leader', true,
  '2026-03-13T01:42:55.944793+00:00', '2026-03-17T10:51:12.356134+00:00', '010-7169-9150', '경기도 화성시 동탄순환대로 26길 81. 461동 605호', '1982-09-01',
  '/avatars/avatar-08.svg', '26010101', '2026-01-01', NULL, 'full_time', NULL
);
INSERT INTO employees (id, name, email, department_id, role, is_active, created_at, updated_at, phone, address, birth_date, avatar_url, employee_number, hire_date, position, employment_type, emergency_contact) VALUES (
  '689f47d0-2058-4417-945c-a5b1066eb202', '김민서', 'ms.kim@interohrigin.com', 'd0000000-0000-0000-0000-000000000003', 'leader', true,
  '2026-03-13T01:44:24.167649+00:00', '2026-03-17T10:44:29.051194+00:00', '010-4569-2631', '경기도 광주시 오포로 580-17, 15동 201호', '1995-02-03',
  '/avatars/avatar-08.svg', '25090801', '2025-09-08', '과장', 'full_time', NULL
);
INSERT INTO employees (id, name, email, department_id, role, is_active, created_at, updated_at, phone, address, birth_date, avatar_url, employee_number, hire_date, position, employment_type, emergency_contact) VALUES (
  'e2f6f6b7-4b0d-4686-9868-d902bbd277bd', '권래은', 're.kweon@interohrigin.com', 'd0000000-0000-0000-0000-000000000003', 'employee', true,
  '2026-03-13T01:46:14.199647+00:00', '2026-03-17T10:42:50.090047+00:00', '010-7217-9773', '서울특별시 관악구 봉천로 13나길 19, 406호', '1999-09-28',
  '/avatars/avatar-08.svg', '24091901', '2024-09-19', '대리', 'full_time', NULL
);
INSERT INTO employees (id, name, email, department_id, role, is_active, created_at, updated_at, phone, address, birth_date, avatar_url, employee_number, hire_date, position, employment_type, emergency_contact) VALUES (
  '8f22e9bb-b0b2-4c8a-b10e-c7f96a70e409', '범주영', 'jy.beum@interohrigin.com', 'd0000000-0000-0000-0000-000000000003', 'employee', true,
  '2026-03-13T01:49:44.491257+00:00', '2026-03-17T10:47:42.225892+00:00', '010-9911-7413', '서울특별시 중랑구 봉화산로 146, 1306동 1006호', '2000-02-10',
  '/avatars/avatar-08.svg', '25081901', '2025-08-19', '사원', 'full_time', NULL
);
INSERT INTO employees (id, name, email, department_id, role, is_active, created_at, updated_at, phone, address, birth_date, avatar_url, employee_number, hire_date, position, employment_type, emergency_contact) VALUES (
  '4a188aab-eaf3-4129-a2a3-45020f0f1ab2', '김민관', 'mk.kim@interohrigin.com', 'd0000000-0000-0000-0000-000000000003', 'employee', true,
  '2026-03-13T01:51:41.150541+00:00', '2026-03-17T10:43:39.242137+00:00', '010-5955-4086', '서울특별시 강남구 봉은사로 43길 21-1, 102호', '2001-09-07',
  '/avatars/avatar-08.svg', '26030301', '2026-03-03', '수습', 'full_time', NULL
);
INSERT INTO employees (id, name, email, department_id, role, is_active, created_at, updated_at, phone, address, birth_date, avatar_url, employee_number, hire_date, position, employment_type, emergency_contact) VALUES (
  'ac9fd76a-2b70-4a2b-a7ff-019beb420b23', '조민재', 'mj.jo@interohrigin.com', 'd0000000-0000-0000-0000-000000000003', 'employee', true,
  '2026-03-13T01:52:52.023456+00:00', '2026-03-17T10:50:28.488046+00:00', '010-8230-8047', '인천광역시 부평구 부흥북로 120번길 4, 401호', '1999-03-02',
  '/avatars/avatar-08.svg', '24102401', '2024-10-24', '대리', 'full_time', NULL
);
INSERT INTO employees (id, name, email, department_id, role, is_active, created_at, updated_at, phone, address, birth_date, avatar_url, employee_number, hire_date, position, employment_type, emergency_contact) VALUES (
  '50910a48-1728-45ea-b936-3a070bed47db', '한예은', 'yu.han@interohrigin.com', 'd0000000-0000-0000-0000-000000000003', 'employee', true,
  '2026-03-13T01:54:47.691204+00:00', '2026-03-17T10:51:37.504659+00:00', '010-6651-2673', '경기도 시흥시 복지로 91번길 4-1, 202호', '2000-04-28',
  '/avatars/avatar-08.svg', '25071401', '2025-07-14', '사원', 'full_time', NULL
);
INSERT INTO employees (id, name, email, department_id, role, is_active, created_at, updated_at, phone, address, birth_date, avatar_url, employee_number, hire_date, position, employment_type, emergency_contact) VALUES (
  '426bedb9-c4c3-4eb3-a66e-0af35338a086', '김예슬', 'ys.kim@interohrigin.com', 'd0000000-0000-0000-0000-000000000003', 'employee', true,
  '2026-03-13T02:00:16.304407+00:00', '2026-03-17T10:45:32.666151+00:00', '010-2471-3995', '경기도 성남시 분당구 정자일로 72, 305동 2202호', '1995-12-06',
  '/avatars/avatar-08.svg', '26022501', '2026-02-25', '수습', 'full_time', NULL
);
INSERT INTO employees (id, name, email, department_id, role, is_active, created_at, updated_at, phone, address, birth_date, avatar_url, employee_number, hire_date, position, employment_type, emergency_contact) VALUES (
  'efdc6a10-0d0e-49d8-a6f0-6833d454dedf', '김보경', 'bk.kim@interohrigin.com', 'd0000000-0000-0000-0000-000000000002', 'employee', true,
  '2026-03-13T02:01:46.02874+00:00', '2026-03-17T10:44:59.864512+00:00', '010-9959-6159', '서울특별시 은평구 통일로 82나길, 16-10', '1996-05-22',
  '/avatars/avatar-03.svg', '25021701', '2025-02-17', '과장', 'full_time', NULL
);
INSERT INTO employees (id, name, email, department_id, role, is_active, created_at, updated_at, phone, address, birth_date, avatar_url, employee_number, hire_date, position, employment_type, emergency_contact) VALUES (
  'b94a492c-4880-405a-a286-245e06700d25', '유지혜', 'jh.yu@interohrigin.com', 'd0000000-0000-0000-0000-000000000002', 'leader', true,
  '2026-03-13T02:02:37.145875+00:00', '2026-03-17T10:48:32.178703+00:00', '010-9181-2137', '서울시 관악구 봉천동 1618-16', '1998-05-16',
  '/avatars/avatar-03.svg', '25060901', '2025-06-09', '과장', 'full_time', NULL
);
INSERT INTO employees (id, name, email, department_id, role, is_active, created_at, updated_at, phone, address, birth_date, avatar_url, employee_number, hire_date, position, employment_type, emergency_contact) VALUES (
  '6bafdc64-133c-4e1e-994f-ee57362fd784', '최다예', 'dy.choi@interohrigin.com', 'd0000000-0000-0000-0000-000000000002', 'employee', true,
  '2026-03-13T02:03:46.816349+00:00', '2026-03-17T10:50:50.533238+00:00', '010-7168-1601', '경기도 과천시 별양로 12, 307동 904호', '2000-01-31',
  '/avatars/avatar-03.svg', '25111701', '2025-11-17', '사원', 'full_time', NULL
);
INSERT INTO employees (id, name, email, department_id, role, is_active, created_at, updated_at, phone, address, birth_date, avatar_url, employee_number, hire_date, position, employment_type, emergency_contact) VALUES (
  '3f7e9ffc-384f-4ab0-ab7c-654ecb73ec02', '황경민', 'gm.hwang@interohrigin.com', 'd0000000-0000-0000-0000-000000000002', 'employee', true,
  '2026-03-13T02:04:54.077247+00:00', '2026-03-17T10:52:10.796773+00:00', '010-7244-2552', '서울특별시 노원구 노원로 532, 912동 1103호', '2004-01-05',
  '/avatars/avatar-03.svg', '26022503', '2026-02-25', '수습', 'full_time', NULL
);
INSERT INTO employees (id, name, email, department_id, role, is_active, created_at, updated_at, phone, address, birth_date, avatar_url, employee_number, hire_date, position, employment_type, emergency_contact) VALUES (
  '70323171-d1f2-4828-a14e-80896ee4eccf', '강제묵', 'jm.kang@interohrigin.com', 'd0000000-0000-0000-0000-000000000002', 'director', true,
  '2026-03-13T02:13:27.804756+00:00', '2026-03-19T06:39:11.898477+00:00', '010-5298-8727', '서울특별시 강남구 선릉로 121길 5', '1976-03-05',
  '/avatars/avatar-05.svg', '24040101', '2024-04-01', '이사', 'full_time', NULL
);
INSERT INTO employees (id, name, email, department_id, role, is_active, created_at, updated_at, phone, address, birth_date, avatar_url, employee_number, hire_date, position, employment_type, emergency_contact) VALUES (
  '225066f4-2842-477f-b9e4-b920e047ad8a', '김형석', 'hs.kim@interohrigin.com', 'd0000000-0000-0000-0000-000000000003', 'director', true,
  '2026-03-13T02:14:35.489309+00:00', '2026-03-19T22:59:34.931011+00:00', '010-9191-6478', '서울특별시 강남구 선릉로 121길 5', '1981-08-21',
  '/avatars/avatar-05.svg', '22010101', '2022-01-01', '이사', 'full_time', NULL
);
INSERT INTO employees (id, name, email, department_id, role, is_active, created_at, updated_at, phone, address, birth_date, avatar_url, employee_number, hire_date, position, employment_type, emergency_contact) VALUES (
  'd7031e03-2b31-4d2b-973d-cfab0a746d5c', '오영근', 'yk.oh@interohrigin.com', 'd0000000-0000-0000-0000-000000000004', 'ceo', true,
  '2026-03-13T02:15:24.91573+00:00', '2026-03-18T06:28:39.221131+00:00', '010-3222-6269', '서울특별시 강남구 선릉로 121길 5', '1979-10-29',
  '/avatars/avatar-05.svg', '03080601', '2003-08-06', '대표', 'full_time', NULL
);
INSERT INTO employees (id, name, email, department_id, role, is_active, created_at, updated_at, phone, address, birth_date, avatar_url, employee_number, hire_date, position, employment_type, emergency_contact) VALUES (
  '12d43c3b-f738-4844-a671-9dd953c1e0c1', '제유나', 'yn.je@interohrigin.com', 'd0000000-0000-0000-0000-000000000001', 'leader', true,
  '2026-03-18T07:38:24.395205+00:00', '2026-03-18T07:38:24.540236+00:00', '010-3457-7911', '경기도 용인시 기흥구 동백죽전대로 455-17, 104동 901호 ', '1996-11-11',
  '/avatars/avatar-04.svg', '24080501', '2024-08-05', '과장', 'full_time', NULL
);
INSERT INTO employees (id, name, email, department_id, role, is_active, created_at, updated_at, phone, address, birth_date, avatar_url, employee_number, hire_date, position, employment_type, emergency_contact) VALUES (
  '5973135f-a384-45d8-bbce-31cd73d27099', '차주용', 'jycha@interohrigin.com', 'd0000000-0000-0000-0000-000000000002', 'employee', true,
  '2026-03-19T08:31:57.106782+00:00', '2026-03-19T08:31:57.259332+00:00', '010-8453-4667', '동산1로 50', '1979-04-22',
  '/avatars/avatar-08.svg', '26031901', '2026-03-19', '사원', 'full_time', NULL
);

-- 검증
SELECT 'departments' as tbl, COUNT(*) as cnt FROM departments
UNION ALL SELECT 'employees', COUNT(*) FROM employees;
