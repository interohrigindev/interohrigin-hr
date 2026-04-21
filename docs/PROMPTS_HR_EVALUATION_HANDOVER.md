# HR 플랫폼 고도화 단계별 프롬프트

## 1. 공통 베이스 프롬프트

```text
interohrigin-hr 저장소에서 HR 플랫폼 고도화 작업을 진행해줘.

[목표]
- 수습평가를 성장 피드백 중심 문서로 강화
- 퇴직자 인수인계 문서와 후임자 검색 체계를 구축
- 차대표님 운영 피드백(평가/OJT/멘토링/프로젝트/연차/전자결재)을 반영

[절대 제약]
- employees, evaluations, evaluation_items, users 테이블 ALTER 금지
- 기존 UI 패턴/색상/네이밍 유지
- 한국어 UI, 날짜 YYYY.MM.DD, 모바일 반응형 필수
- AI 문구는 결정이 아닌 제안/권장 표현 사용
- Phase 자동 전환 금지

[작업 방식]
- 관련 문서를 먼저 읽고 진행
- 파일은 필요한 부분만 수정
- 신규 테이블은 별도 SQL 또는 migration으로 추가
- 구현 후 npm run build 검증
- 결과는 변경 파일, 검증 결과, 잔여 리스크 순으로 정리

[참고 문서]
- docs/PLAN_HR_EVALUATION_HANDOVER.md
- docs/ref/차대표님_확인요청_정리_20260421.md
```

## 2. Phase A 프롬프트

### A1. 평가 카드 입사일/수습종료일 표시

```text
src/routes/ojt/probation-results.tsx에서 수습평가 카드 헤더에 입사일과 수습종료일을 표시해줘.

[요구사항]
- 형식: 입사일: YYYY.MM.DD · 수습종료: YYYY.MM.DD
- employees.hire_date를 사용
- 수습종료일은 기존 probation.tsx의 hire_date + 90일 계산 로직을 재사용
- 카드 목록과 상세 다이얼로그에서 동일하게 보여줘

[검증]
- hire_date가 있는 직원 카드에서 정상 표시
- 날짜 포맷이 YYYY.MM.DD로 일관됨
- npm run build 통과
```

### A2. 수습평가 PDF 저장

```text
수습평가 결과를 A4 1페이지 중심으로 PDF 저장할 수 있게 구현해줘.

[대상 파일]
- 신규: src/lib/pdf-probation.ts
- 수정: src/routes/ojt/probation-results.tsx

[재사용]
- src/lib/pdf-report.ts 구조
- src/lib/pdf-fonts.ts NanumGothic base64 폰트

[PDF 구성]
- 헤더: 회사 로고/인감, 수습 평가서, 생성일
- 직원 정보: 이름, 소속, 입사일, 수습종료일, 평가 단계
- 점수 테이블: 5항목 × 20점 + 총점
- 총평, 칭찬할 점, 보완할 점, 역할별 코멘트
- 수습 지속 권고 배지
- AI 분석 섹션
- 평가자 서명 영역

[검증]
- PDF 저장 버튼이 카드와 다이얼로그에서 동작
- 한글 깨짐 없음
- 1페이지에 최대한 맞게 출력
- npm run build 통과
```

### A3. 평가 코멘트 확장하기

```text
src/routes/ojt/probation-results.tsx의 기존 polishText() 기능을 확장해서 평가 코멘트에 "다듬기"와 "확장하기" 두 모드를 제공해줘.

[요구사항]
- mode: 'polish' | 'expand' 파라미터 방식으로 통합
- 다듬기: 의미 유지 리라이팅
- 확장하기: 성장 조언, 예시, 실행 제안 포함 3~5문장으로 확장
- UI 버튼 2개로 분리
- 결과는 저장 가능한 텍스트로 반환

[프롬프트 규칙]
- 건설적 피드백
- 비난형 표현 금지
- 제안/권장 표현 유지

[검증]
- 짧은 코멘트 입력 시 두 모드 결과가 다름
- 확장 결과에 행동 제안이 포함됨
- npm run build 통과
```

### A4. AI 종합 분석

```text
직원별 수습평가 회차와 평가자 코멘트를 종합해서 AI 강점/약점/조언/실행계획을 생성하는 기능을 추가해줘.

[대상]
- src/routes/ojt/probation-results.tsx
- src/lib/ai-client.ts generateAIContent() 재사용

[출력 형식]
{
  strengths: string[],
  weaknesses: string[],
  advice: string[],
  actionPlan: string
}

[UI]
- 카드 내부에 AI 종합 분석 섹션 추가
- 다시 분석 버튼 제공

[검증]
- 회차가 여러 개인 직원에서 분석 성공
- JSON 파싱 실패 시 안전한 fallback 처리
- npm run build 통과
```

## 3. Phase B 프롬프트

### B1. DB 스키마 + 타입 + RLS

```text
퇴직자 인수인계 자동화를 위한 DB 스키마와 프론트 타입을 추가해줘.

[생성 테이블]
- handover_documents
- handover_assets
- handover_chats

[제약]
- employees는 FK만 사용하고 ALTER 금지
- 상태값은 draft/generated/reviewed/completed
- 본인/후임/관리자만 읽을 수 있도록 RLS 설계

[반영 파일]
- Supabase SQL 또는 migration
- src/types/database.ts

[검증]
- 타입과 스키마가 일치
- RLS 정책 설명 포함
```

### B2. 인수인계서 자동 생성

```text
관리자가 퇴사 예정자를 선택하고 "인수인계서 생성" 버튼을 누르면 프로젝트/일일보고/자산 데이터를 모아 AI 초안을 생성하는 기능을 구현해줘.

[신규 파일]
- src/lib/handover-generator.ts

[입력 데이터]
- project_boards
- pipeline_stages
- daily_reports
- handover_assets

[출력 JSON]
- overview
- projects[]
- daily_summary
- pending_tasks[]
- knowhow
- contacts[]

[규칙]
- 역할은 인사 담당자 + PMO 관점
- 누락 없이 후임자가 바로 이어받을 수 있는 문서
- 수동 재생성 가능

[검증]
- 테스트 퇴사자 1명 기준 초안 생성 성공
- 프로젝트/업무보고 기반 내용 반영
```

### B3. 자산/계약서/문서 위치 인벤토리 UI

```text
src/routes/employees/handover.tsx에 자산/계약서/문서 위치 인벤토리 CRUD UI를 구현해줘.

[필드]
- 유형(contract/device/document/account/other)
- 이름
- 위치
- URL
- 비고
- 반납 상태

[UX]
- 구글 드라이브 링크 붙여넣기 지원
- 반납 현황을 체크리스트처럼 한눈에 볼 수 있게 구성

[검증]
- 3건 이상 등록/수정/삭제 가능
- 반납 상태 토글 가능
- 모바일에서도 사용 가능
```

### B4. 후임자용 인수인계 챗봇

```text
후임자가 해당 퇴사자의 인수인계 문서와 자산/업무 데이터를 바탕으로 질문할 수 있는 챗봇을 구현해줘.

[대상 파일]
- 신규: src/routes/employees/handover-chat.tsx
- 재사용: src/routes/work/chat.tsx, src/lib/ai-client.ts

[컨텍스트 범위]
- handover_documents.content
- handover_assets
- daily_reports
- project_boards

[MVP 방식]
- 벡터 검색 없이 키워드 매칭 + 관련 청크 프롬프트 포함
- sources도 함께 반환하고 handover_chats에 저장

[예시 질문]
- ○○ 계약서 어디 있나요?
- 노트북 반납 상태는?
- 진행 중 프로젝트가 뭐였나요?

[검증]
- 질문에 위치 또는 URL 기반 답변 가능
- sources 저장 확인
- 권한 없는 사용자는 차단
```

### B5. Google Drive 스캔 + 메뉴 연결

```text
퇴사자 인수인계 모듈에 Google Drive 파일 메타 스캔과 사이드바 메뉴 연결을 추가해줘.

[신규 파일]
- src/lib/drive-scanner.ts

[수정 파일]
- src/components/layout/Sidebar.tsx
- 필요 시 Google OAuth 설정 관련 파일

[요구사항]
- 퇴사자 이메일 또는 지정 폴더 기준으로 Drive 파일 이름/URL/수정일 조회
- 스캔 결과를 handover_assets 초안으로 반영
- 스캔 결과는 관리자가 편집 가능
- 사이드바 직원 관리 섹션에 인수인계 메뉴 추가

[OAuth]
- drive.readonly 또는 drive.metadata.readonly 스코프 확장 고려
- 관리자 재인증 필요 사항 문서화

[검증]
- 스캔 결과가 자산 목록에 반영
- 메뉴 권한이 관리자/본인/후임자 기준으로 동작
```

## 4. Phase C 프롬프트

### C1. 정규직 평가/월간 점검 보완

```text
정규직 인사 평가와 월간 점검 흐름을 직원 계정 기준으로 점검하고 보완해줘.

[요구사항]
- 직원 계정에서 목표 설정 완료 후 평가가 실제로 진행 가능해야 함
- 직원 계정 월간 점검 후 담당 임원 확인/확정 흐름을 현재 동작 기준으로 점검하고 막히는 지점을 수정
- 월간 점검 입력 상단의 이슈/칭찬/제안/기타 탭은 제거
- 우측 특이사항 입력 영역만 유지하여 정보를 통합

[참고]
- source: docs/ref/차대표님_확인요청_정리_20260421.md
- UI reference: image 5.png

[검증]
- 직원 계정에서 목표 설정 이후 평가 진입 가능
- 월간 점검 저장 및 임원 확인 흐름 점검 완료
- 상단 탭 제거 확인
```

### C2. 동료평가 10항목 × 10점 구조

```text
동료평가를 10개 항목, 항목당 10점, 총점 100점 구조로 보완해줘.

[요구사항]
- 평가 항목 10개 구성
- 각 항목은 10점 만점
- 총점은 0~100 자동 계산
- 강점/개선사항 또는 한 줄 코멘트 입력은 유지
- 기존 UI 패턴은 유지하되 제공된 예시 이미지 수준으로 정리

[참고]
- source: docs/ref/차대표님_확인요청_정리_20260421.md
- UI reference: image 6.png, image 7.png

[검증]
- 10개 항목 렌더링
- 총점 계산 정확
- 저장/수정/제출 흐름 정상
```

### C3. OJT 일정 보완 + AI 퀴즈 생성 오류 수정

```text
OJT 프로그램 편집 화면을 보완하고 AI 퀴즈 생성 오류를 수정해줘.

[요구사항]
- 재무회계 OJT 일정은 제공된 노션 링크 기준으로 주차 계획을 정리
- AI 퀴즈 생성 오류 `Incorrect API key provided` 원인을 파악
- OJT 퀴즈 생성이 현재 플랫폼 AI 설정과 일치하게 동작하도록 정리
- 가능하면 OpenAI 의존 대신 현재 표준 AI 경로와 통합

[참고]
- source: docs/ref/차대표님_확인요청_정리_20260421.md
- UI reference: image 8.png, image 9.png

[검증]
- OJT 일정 저장 정상
- AI 퀴즈 생성 버튼 재현 시 오류 없음
- 빌드 통과
```

### C4. 멘토-멘티 직원 계정 노출

```text
멘토-멘티 프로그램이 직원 계정에서도 보이고 사용할 수 있게 권한과 메뉴를 보완해줘.

[요구사항]
- 직원 계정에서 본인 참여 멘토링 목록 확인 가능
- 진행 중/완료 상태 확인 가능
- 필요한 액션(예: 일일 보고 연결)이 직원 계정에서도 동작
- 관리자 전용 기능은 그대로 보호

[참고]
- source: docs/ref/차대표님_확인요청_정리_20260421.md
- UI reference: image 10.png

[검증]
- 직원 계정 메뉴 노출 확인
- 본인 건만 보이는지 확인
```

### C5. 프로젝트 대시보드 개인화 + 새 프로젝트 CTA

```text
프로젝트 & 업무 대시보드를 개인 중심으로 정리하고 새 프로젝트 버튼 가독성을 개선해줘.

[요구사항]
- 통합 대시보드는 내가 담당한 업무 중심으로 우선 표시
- 담당자 업무량/주의 필요 영역도 개인 기준에서 이해하기 쉽게 정리
- `+ 새 프로젝트` 버튼은 더 명확하고 읽기 쉽게 개선

[참고]
- source: docs/ref/차대표님_확인요청_정리_20260421.md
- UI reference: image 11.png

[검증]
- 직원 계정에서 내 업무 중심 노출
- CTA 가독성 개선 확인
```

### C6. 일일 업무 보고서와 프로젝트 진행 작업 연동

```text
프로젝트의 진행 중 작업을 일일 업무 보고서의 진행 중 작업 영역과 연동해줘.

[요구사항]
- 프로젝트에서 진행 중 상태인 작업을 일일보고 초안에 가져오기
- 사용자가 불필요한 항목은 제거 또는 메모 보완 가능
- 수동 작성과 자동 연동이 충돌하지 않게 처리

[참고]
- source: docs/ref/차대표님_확인요청_정리_20260421.md
- UI reference: image 12.png

[검증]
- 프로젝트 진행 작업이 일일보고에 표시
- 수정 후 저장 가능
```

### C7. 연차 현황 캘린더

```text
연차 관리에 직원별 휴가 현황을 한눈에 보는 캘린더 또는 월간 뷰를 추가해줘.

[요구사항]
- 관리자 기준 전체 직원 휴가 현황 확인 가능
- 연차/반차 구분 표시
- 월간 뷰 중심으로 시각화
- 기존 대시보드 요약 카드와 연결 유지

[참고]
- source: docs/ref/차대표님_확인요청_정리_20260421.md
- UI reference: image 13.png, image 14.png

[검증]
- 월간 캘린더에 직원별 휴가 표시
- 반차 텍스트 구분 가능
```

### C8. 전자결재 진입 구조 + 작성 화면 개선

```text
전자결재를 Works Mobile Flow 참고 구조처럼 개선해줘.

[요구사항]
- 전자결재 메인에서 품의 종류를 먼저 고르는 런처형 UI 제공
- 클릭 시 해당 품의 양식으로 진입
- 현재 품의서 작성 화면은 더 넓고 읽기 쉽게 개선
- 조건별 결재선 관리 UI는 제공된 레퍼런스 이미지 방향을 참고
- 증명서/평가 PDF에 사용할 인감 이미지 2종도 자산으로 정리

[참고]
- source: docs/ref/차대표님_확인요청_정리_20260421.md
- UI reference: image.png, image 1.png, image 2.png
- seal reference: image 3.png, image 4.png

[검증]
- 결재 종류 선택 진입 가능
- 작성 화면 가독성 개선 확인
- 결재선 관리 흐름 정리
```

## 5. 통합 마감 프롬프트

```text
HR 플랫폼 고도화 작업(수습평가 보강 + 인수인계 자동화 + 운영 피드백 보완)을 마감 점검해줘.

[확인 항목]
- 평가 카드 입사일/수습종료일
- 수습평가 PDF 저장
- 코멘트 다듬기/확장하기
- AI 종합 분석
- 정규직 평가/월간 점검 보완
- 동료평가 100점 구조
- OJT 일정/AI 퀴즈 생성
- 멘토-멘티 직원 계정 노출
- 프로젝트 대시보드 개인화
- 프로젝트 진행 작업과 일일보고 연동
- 연차 캘린더
- 전자결재 진입 구조/작성 화면 개선
- 인수인계서 자동 생성
- 자산 인벤토리 CRUD
- 후임자 챗봇
- Google Drive 스캔
- 권한/RLS
- 모바일 반응형

[출력 형식]
1. 완료된 항목
2. 미완료 또는 후속 과제
3. 빌드/테스트 결과
4. 운영 전 확인사항
```
