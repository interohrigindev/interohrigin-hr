# 재무회계 연동 개발 계획

## 1. WEHAGO WISE 분석 결과

### WEHAGO WISE란?
- **Brightics AI (삼성SDS) 기반** 데이터 분석/ML 플랫폼
- 재무회계 소프트웨어가 아닌 **데이터 분석 도구**
- 핵심 가치: 분석 모델을 만들고 **REST API로 Publish**하여 외부 시스템과 연동

### WISE에서 활용 가능한 기능
| 기능 | 설명 | HR 플랫폼 활용 |
|------|------|--------------|
| Analytics App API | 분석 모델을 REST API로 게시 | 재무 데이터 분석 결과를 API로 받아 CEO 리포트에 표시 |
| Workflow Modeler | 데이터 흐름 시각화 모델링 | 급여/비용 데이터 분석 파이프라인 구성 |
| Script (Scala/Python/SQL) | 고급 데이터 처리 | 재무 데이터 가공/집계 쿼리 |
| Guided Analytics | ML 기반 예측 분석 | 매출 예측, 인건비 추이 예측 |

### API 연동 방식 (매뉴얼 p.50~60)
```
WEHAGO WISE Analytics App
  → Publish as API (REST)
  → API Key 발급
  → HR 플랫폼에서 fetch 호출
  → CEO 리포트/재무 대시보드에 표시
```

**API 구조:**
- Request: JSON body (Input Data + Variables)
- Response: JSON (분석 결과 데이터)
- 인증: API Key 헤더
- 비동기 지원: timeout=0 시 jobId 반환 → Retrieve Data API로 결과 조회

---

## 2. 재무회계 데이터 소스 전략

WEHAGO WISE 자체는 데이터 소스가 아니므로, 재무 데이터는 **별도 소스**에서 가져와야 합니다.

### Option A: WEHAGO 회계 모듈 → WISE → HR 플랫폼 (권장)
```
WEHAGO 회계 ──→ WISE 분석 모델 ──→ REST API ──→ HR 플랫폼
(전표/매출/급여)    (집계/분석/예측)     (Publish)      (CEO 리포트)
```
- WEHAGO 회계 모듈의 데이터를 WISE에서 분석 모델로 가공
- 가공된 결과만 API로 HR 플랫폼에 전달
- **장점**: 원본 데이터 보안 유지, 분석 로직을 WISE에서 관리
- **필요**: WEHAGO 회계 모듈 사용 중이어야 함

### Option B: 엑셀/CSV 수동 업로드 → HR 플랫폼 직접 처리
```
재무팀 엑셀 ──→ HR 플랫폼 업로드 ──→ Supabase 저장 ──→ CEO 리포트
(월별 손익표)     (드래그 앤 드롭)       (financial_data)
```
- 재무팀이 월별로 엑셀 업로드
- HR 플랫폼에서 직접 파싱/저장/표시
- **장점**: 즉시 구현 가능, 외부 의존 없음
- **단점**: 수동 작업 필요

### Option C: WISE API + 엑셀 업로드 하이브리드
```
Phase 1: 엑셀 업로드 (즉시 사용)
Phase 2: WISE API 연동 (자동화)
```
- 1단계로 엑셀 업로드 기능을 먼저 구현
- 2단계로 WISE API 연동하여 자동화
- **권장 방식**

---

## 3. HR 플랫폼 내 재무 기능 구현 계획

### Phase 1: 재무 데이터 수동 입력 (즉시 구현 가능)

#### 3-1. DB 테이블
```sql
CREATE TABLE financial_summaries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  period_year int NOT NULL,
  period_month int NOT NULL,
  category text NOT NULL,  -- 'revenue', 'expense', 'payroll', 'operating'
  item_name text NOT NULL,
  amount bigint NOT NULL,  -- 원 단위
  notes text,
  uploaded_by uuid REFERENCES employees(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(period_year, period_month, category, item_name)
);
```

#### 3-2. 엑셀 업로드 기능
- 설정 > 재무 관리 메뉴 추가
- 엑셀/CSV 드래그 앤 드롭 업로드
- 컬럼 매핑 UI (년/월, 카테고리, 항목명, 금액)
- 업로드 후 미리보기 → 확인 → 저장

#### 3-3. CEO 리포트 재무 섹션
```
━━ 재무 현황 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌──────────────┬──────────────┬──────────────┐
│ 매출 1.2억    │ 영업이익 3천만  │ 인건비 비율 42% │
└──────────────┴──────────────┴──────────────┘
[월별 매출/비용 추이 차트]
[인건비 vs 매출 비율 추이]
```

### Phase 2: WISE API 자동 연동

#### 3-4. WISE API 프록시
```
functions/api/wise-data.ts
  → WISE Analytics App API 호출
  → API Key 인증
  → 결과 가공 후 반환
```

#### 3-5. 자동 데이터 갱신
- 매일/매주 WISE API에서 최신 재무 데이터 pull
- Supabase financial_summaries 테이블 업데이트
- CEO 리포트 자동 반영

#### 3-6. AI 재무 분석
- CEO 경영 분석에 재무 데이터 포함
- "매출 대비 인건비 비율이 X%로 업계 평균 대비 높음" 등 인사이트
- 급여 인상/채용 시 비용 시뮬레이션

---

## 4. 기술 구현 상세

### 필요 환경변수
```
WISE_API_URL=https://wise.wehago.com/api/v1/...
WISE_API_KEY=발급받은_API_KEY
```

### 파일 구조
```
src/routes/
  settings/
    finance.tsx          -- 재무 데이터 업로드/관리 페이지
src/routes/
  ceo-report.tsx         -- 재무 섹션 추가
src/lib/
  finance-utils.ts       -- 엑셀 파싱, 금액 포맷, 차트 데이터 변환
functions/api/
  wise-data.ts           -- WISE API 프록시 (Phase 2)
supabase/migrations/
  XXX_financial_summaries.sql
```

### 구현 우선순위
| 순서 | 작업 | 난이도 | 소요 |
|------|------|--------|------|
| 1 | DB 마이그레이션 (financial_summaries) | 낮음 | - |
| 2 | 엑셀 업로드 페이지 (settings/finance.tsx) | 중간 | - |
| 3 | CEO 리포트 재무 섹션 UI | 중간 | - |
| 4 | AI 분석에 재무 데이터 포함 | 낮음 | - |
| 5 | WISE API 프록시 (Phase 2) | 중간 | - |
| 6 | 자동 갱신 스케줄러 (Phase 2) | 높음 | - |

---

## 5. WISE API 연동 기술 세부 (Phase 2)

### API 호출 예시
```typescript
// WISE Analytics App API 호출
const response = await fetch(WISE_API_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${WISE_API_KEY}`,
  },
  body: JSON.stringify({
    inputs: { period: '2026-04' },
    variables: { company_id: 'interohrigin' },
    timeout: 30,
  }),
})

// 비동기 실행 시
const { jobs } = await response.json()
// jobId로 결과 조회
const result = await fetch(`${WISE_API_URL}/retrieve`, {
  method: 'POST',
  body: JSON.stringify({ jobId: jobs.jobId }),
})
```

### 데이터 매핑
```
WISE 출력 → HR 플랫폼 테이블 매핑
revenue_total    → financial_summaries (category='revenue')
expense_total    → financial_summaries (category='expense')
payroll_total    → financial_summaries (category='payroll')
operating_profit → financial_summaries (category='operating')
```

---

## 6. 결론

**즉시 실행 가능한 작업 (Phase 1):**
- 엑셀 업로드 방식으로 재무 데이터 수동 입력
- CEO 리포트에 재무 현황 섹션 추가
- AI 경영 분석에 재무 데이터 포함

**WISE 연동 시 필요 조건 (Phase 2):**
- WEHAGO WISE 계정 및 API Key 발급
- WISE에서 재무 분석 모델 생성 + Analytics App Publish
- 재무 데이터가 WISE에 연동되어 있어야 함 (WEHAGO 회계 모듈 또는 CSV)
