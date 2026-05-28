# Archive Index — 2026-05

> 본 디렉토리는 2026년 5월 완료된 PDCA 사이클의 archive. 각 feature 하위에 plan / design / analysis / report 4개 문서가 보존됨.

## Archived Features

### 1. interactive-manual

**HR 플랫폼 3-Tier 도움말 시스템** (검색형 Help Center + 우하단 컨텍스트 Floating `?` + 선택형 체험 투어)

| 항목 | 내용 |
|---|---|
| Plan 작성 | 2026-05-26 |
| Code Complete | 2026-05-27 (커밋 `a684b05`) |
| Archive 완료 | 2026-05-27 |
| PDCA Cycle | #1 (코드 후행 사후 정리, 옵션 A "Historical Record 보존") |
| Match Rate | **97.4%** ✅ |
| Success Criteria | **12/12 Met** (Plan SC-01~06 + Design S1~S6) |
| Critical / Important Gap | 0 / 0 |
| Minor Gap 처리 | G3 본 사이클 픽스 (커밋 `3f27130`), G1/G2/G4 향후 권고 |
| CLAUDE.md 절대 규칙 위반 | 0건 |
| 본 사이클 데이터 무결성 픽스 | 1건 (G3, `articles.ts` 깨진 article 참조 제거, 빌드 통과·push 완료) |

**핵심 발견**:
- "강제 투어 only" (Plan 5/26) → **"3-Tier Help Center"** (코드 5/27) 로의 architecture-level pivot 을 외부 리서치(Arcade/UXCam/Userpilot/ServiceNow — static tour 안티패턴 / contextual -28% 이탈 / Help Center -25% 티켓) 근거와 함께 traceability 보존.
- selector 11/11, route 14/14, tour-id 5/5, article-id 8/8 (G3 픽스 후) 모든 cross-reference 100% 정합.

**4개 문서**:
- [interactive-manual.plan.md](./interactive-manual/interactive-manual.plan.md) — 5/26 Plan (historical record, 일부 superseded)
- [interactive-manual.design.md](./interactive-manual/interactive-manual.design.md) — 5/27 역공학 Design + "Deviation from Plan" 섹션
- [interactive-manual.analysis.md](./interactive-manual/interactive-manual.analysis.md) — 5/27 Gap Analysis (97.4% Match Rate)
- [interactive-manual.report.md](./interactive-manual/interactive-manual.report.md) — 5/27 최종 Report + 향후 권고 10건

**향후 권고 Top 3** (Report §8.2 참조):
1. G1+G2 dead code 청소 PR (`useTour.ts`, `ChapterCard.tsx` 삭제) — 10분 작업
2. Phase 2 — 경영지원 6 챕터 + hr-admin article 작성 — 2-3일
3. 외부 리서치 보존 디렉토리 신설 (`docs/00-research/{feature}/`) — 의사결정 근거 traceability 1차 source 강화

---

### 2. external-pre-survey-import

**외부 Google Form 사전질의서 PDF 업로드 + Gemini AI 파싱 + entries 통합** (admin → PDF → 미리보기 편집 → 저장 → admin/공유링크 동시 표시)

| 항목 | 내용 |
|---|---|
| Plan/Design/Do/Check/Report 전체 | 2026-05-27 (단일일 5세션) |
| Code Commits | `c38f8b1` → `4f199b6` → `c47f1f8` → `4274b78` (4개, 모두 빌드 통과) |
| Archive 완료 | 2026-05-27 |
| PDCA Cycle | #2 (feature-development — PDCA #1 post-hoc-cleanup 과 구분) |
| Match Rate | **99.2%** ✅ |
| Success Criteria | **8/8 Met** (SC-01~08, Plan 5개 + Design Checkpoint 3 추가 + 세션 3.5 L2-12) |
| Critical / Important Gap | 0 / 0 |
| 의도적 보류 | 1건 (manual entry 수정 버튼 [✏️] → 후속 사이클, 삭제→재업로드 우회 가능) |
| 분리 사이클 | v1 fallback 코드 정리 → **사이클 #3** (legacy 데이터 마이그레이션 SQL 선행 필요) |
| CLAUDE.md 절대 규칙 위반 | 0건 (DB ALTER 0, candidate-storage 진입점, 한국어 UI, 부분 수정+빌드 검증) |
| LOC 증가 | 8 files / 약 +1,254 lines / -11 lines |

**핵심 발견**:
- **Architecture Option C** (entries 배열 통합 + v1 deprecate 분리) — Option B (별도 컬럼) 는 CLAUDE.md ALTER 금지로 자동 부적격. 부적격 옵션도 비교표에 명시해서 절대 규칙의 의미를 traceability 보존.
- **R1 (PBD 재발송 시 manual 보존)** — `removeEntriesBySource(prev, 'pbd')` 한 줄로 종결. 기존 `pre_survey_data: null` 의 breaking risk 완전 차단.
- **Backward-compat shim** (`readPreSurveyEntries`) — legacy v2.0 top-level 을 entry 로 읽기 시점 자동 변환 → DB 마이그레이션 0 으로 신구 데이터 모델 공존.
- **세션 3.5 의 유연 scope 확장** — Phase 4 직전 대표 추가 결정 (L2-12 AI 분석에 manual 포함) 을 단일 짧은 세션으로 흡수. PDCA 사이클 안의 작은 iterative 확장 패턴.
- **정적 사전 검증 + 외부 빌드 위임** — cto-lead Bash 권한 0 + gap-detector nested spawn 차단 환경에서, LLM 정적 점검 (verbatimModuleSyntax / noUnusedLocals / strict) → 외부 빌드 위임으로 4 commits 모두 한 번에 빌드 통과 (수정 0회).

**4개 문서**:
- [external-pre-survey-import.plan.md](./external-pre-survey-import/external-pre-survey-import.plan.md) — Plan (Checkpoint 1 결정 7건 + v1 deprecate 컨텍스트)
- [external-pre-survey-import.design.md](./external-pre-survey-import/external-pre-survey-import.design.md) — Design (Architecture Option C + 데이터 모델 + AI 파싱 + UI Flow)
- [external-pre-survey-import.analysis.md](./external-pre-survey-import/external-pre-survey-import.analysis.md) — Gap Analysis (Match Rate 99.2%, 정적 6 회귀 통과)
- [external-pre-survey-import.report.md](./external-pre-survey-import/external-pre-survey-import.report.md) — 최종 Report + 향후 권고

**향후 권고 Top 3** (Report §8 참조):
1. **사이클 #3 — 유지보수 통합** (v1 fallback 코드 정리 + legacy 마이그레이션 SQL + Storage orphan cleanup cron + ai_feature_settings 매핑 운영 점검) — 1-2일
2. 운영 모니터링 1주 (manual upload 사용 빈도 + parsing confidence 분포 통계) — 백그라운드 관찰
3. 샘플 Google Form PDF 1-2건 `docs/00-research/external-pre-survey-import/` 배치 — AI 프롬프트 튜닝 + L2 시나리오 정확도 향상

> **Archive 사본 정책 차이 (PDCA #1 vs #2)**: PDCA #1 은 archive 사본을 원본 그대로 freeze (post-hoc-cleanup 특성상 historical record 보존이 중심), PDCA #2 는 archive 사본을 압축본 + 원본 stub link 패턴으로 정리. 원본 전체 내용은 PDCA 사이클 종료 시점의 git history (`4274b78` 직후) 에 보존됨. 향후 운영자가 전체 원본 필요 시 git show 로 복원 가능.

---

### 3. unified-ai-cost-dashboard

**전사 AI 과금 통합 대시보드** (4개 스키마 HR/finance/cs/mall의 AI API 토큰비 + 구독비를 공통 ai_usage_log + cross-schema RPC로 취합, 비용 관리 화면 확장)

| 항목 | 내용 |
|---|---|
| Plan/Design/Do/Check/Report 전체 | 2026-05-28 |
| Code Commits | `1273f53` → `d4f8898` → `b740307` (3개, 모두 빌드 통과) |
| Archive 완료 | 2026-05-28 |
| PDCA Cycle | #3 (feature-development) |
| Match Rate | **98%** ✅ |
| Success Criteria | **6/7 Met + 1 Partial** (SC-7 인프라 완비, 실데이터 누적 대기) |
| Critical / Important Gap | 0 / 0 |
| 방향 정정 | 1회 (회사 운영비 → AI 과금, Plan 단계 전환, 폐기 코드 0) |
| CLAUDE.md 절대 규칙 위반 | 0건 (기존 테이블 ALTER 0, 신규 테이블/RPC만, 한국어 UI, 부분 수정+빌드 검증) |
| LOC 증가 | 9 files / 약 +717 lines / -20 lines |

**핵심 발견**:
- **방향 대정정** — "회사 운영비(고정비/경비) 통합" Plan을 인터뷰 직후 "AI 개발 과금(토큰비+구독비) 통합"으로 전환. Plan 단계라 폐기 코드 0.
- **Architecture Option C (Pragmatic)** — ai.ts를 stateless 유지(usage 응답에만 추가) + authed 클라이언트가 ai_usage_log insert. Option B(service-role 주입)의 보안 표면 + finance 코드 침범 회피.
- **`is_admin()` 헬퍼 미사용 결정** — 헬퍼가 hr_admin을 누락(`role IN (director,division_head,ceo,admin)`)함을 발견. billing AdminRoute(+hr_admin)와 RPC 권한을 일치시키기 위해 5 role 인라인 명시.
- **ai-client 내부 자동 적재** — recordUsage를 generateAIContent/Chat 내부에서 호출 → 49개 호출처 수정 0으로 전사 토큰 기록 활성화.
- **Deepgram 정정 + STT 컬럼 미존재** — Plan "Whisper" 가정을 코드 사실(DEEPGRAM_COST_PER_MIN)로, `meeting_records.stt_cost` 컬럼 미존재를 SQL로 확정해 Design §0에 정정 기록.
- **cross-schema SECURITY DEFINER + guard CTE** — search_path 고정 + 관리자 role CROSS JOIN으로 비관리자 0행, PUBLIC revoke.

**4개 문서**:
- [unified-ai-cost-dashboard.plan.md](./unified-ai-cost-dashboard/unified-ai-cost-dashboard.plan.md)
- [unified-ai-cost-dashboard.design.md](./unified-ai-cost-dashboard/unified-ai-cost-dashboard.design.md)
- [unified-ai-cost-dashboard.analysis.md](./unified-ai-cost-dashboard/unified-ai-cost-dashboard.analysis.md)
- [unified-ai-cost-dashboard.report.md](./unified-ai-cost-dashboard/unified-ai-cost-dashboard.report.md)

**향후 권고 Top 3** (Report §5 참조):
1. **cs/mall 합류** — 각 시스템이 AI 호출 시 `public.ai_usage_log`에 source_system='cs'|'mall'로 insert. 규격은 이미 제공, 각 시스템 작업.
2. **HR 실데이터 모니터링** — SC-7 인프라 완비, AI 호출 발생 시 ai_usage_log 누적을 1~2주 후 확인.
3. **단가표 정기 갱신** — ai-cost-pricing.ts + pricing-sources.md 분기 재확인 ("추정치" 유지).

> Archive 사본 정책: PDCA #2와 동일 — 원본은 stub link, 전체 내용은 git history(`b740307` 직후 archive 커밋)에 보존.

---

### 4. emergency-leave

**긴급연차** (결재 없이 즉시 통보형 상신 + 임원급 자동 이메일 → 출근 후 보완자료 첨부 → 정식 연차 전환·차감/무급)

| 항목 | 내용 |
|---|---|
| Plan/Design/Do/Check/Report 전체 | 2026-05-28 |
| Code Commits | `1412c75` (S1) → `463ad97` (S2) → `9499b7e` (S3) (3개, 모두 빌드 통과) |
| Archive 완료 | 2026-05-28 |
| PDCA Cycle | #4 (feature-development) |
| Match Rate | **98.4%** ✅ |
| Success Criteria | **8/8 Met** (SC-01~08) |
| Critical / Important Gap | 0 / 0 |
| Minor Gap | 3건 (무급 승인후 수동 / Runtime 미실행 / 이메일 발송률 미측정) — 전부 향후 권고 |
| CLAUDE.md 절대 규칙 위반 | 0건 (기존 테이블 ALTER 0, 신규 테이블/버킷만, 민감정보 임원급 한정, 한국어 UI, Edit 부분수정+빌드) |
| 마이그레이션 | `134_emergency_leave.sql` |

**핵심 발견**:
- **2단계 라이프사이클** — "결재 없는 통보형 신청(filed)" + "사후 정식 연차 전환(promoted)"을 신규 테이블 + 상태머신으로 분리. 통보 즉시성과 결재 정합성을 동시 충족.
- **Architecture Option C** — 단일 테이블 상태머신 + best-effort 이메일 + buildApprovalLine helper 추출. B(전이로그+재시도큐+각서연동) YAGNI 회피.
- **트리거 무급 days_count 분리** — `update_leave_balance` 가 approved 전이 시 days_count 전체 차감 → 무급분은 leave_requests.days_count 에서 제외(미승인 시점 days_count=paid 자동 조정)해 이중/과차감 방지.
- **storage 정책 db-exec 적용 가능** — Design "콘솔 수동" 가정을 메인이 db-exec(postgres 권한)로 적용 성공 → 파일=DB 일치, 콘솔 수동 불필요. (PDCA #3 cross-schema RPC 와 함께 db-exec 권한 범위 학습)
- **병가 진단서 차단** — Checkpoint 3 에서 Design "경고 후 허용" → 대표 결정대로 "차단"으로 구현 (Decision deviation traceability 보존).
- **buildApprovalLine 추출 회귀 0** — 인라인 결재라인 로직을 helper 추출 시 "리더 미지정" 특정 toast 까지 보존해 일반 연차 신청 동작 동일.

**4개 문서**:
- [emergency-leave.plan.md](./emergency-leave/emergency-leave.plan.md) — 압축본 (Q1~Q6 결정)
- [emergency-leave.design.md](./emergency-leave/emergency-leave.design.md) — 압축본 (Option C + 데이터 모델 + 전환 흐름)
- [emergency-leave.analysis.md](./emergency-leave/emergency-leave.analysis.md) — Gap Analysis (98.4%, 트리거 정합성 검증)
- [emergency-leave.report.md](./emergency-leave/emergency-leave.report.md) — 최종 Report + 향후 권고

**향후 권고 Top 3** (Report §5):
1. 실제 긴급연차 1건 E2E 모니터링 (신청→이메일→보완→전환→승인→차감)
2. 이메일 발송 성공률 모니터링 (notification_deliveries emergency_leave sent/failed)
3. 무급 승인 후 케이스 급여 연동 (현재 수동 안내 → 급여 모듈 연동 시 자동화)

> Archive 사본 정책: PDCA #2/#3과 동일 — 원본 stub, 전체 내용 git history(`9499b7e` 직후 archive 커밋)에 보존.

---

## Archive 운영 정책

- Archive 된 문서의 원본(`docs/01-plan/features/*`, `docs/02-design/features/*`, `docs/03-analysis/*`, `docs/04-report/*`) 위치에는 stub 파일만 남아서 새 위치로 안내함
- archive 사본은 PDCA 완료 시점의 freeze 상태 — 이후 수정하지 않음 (수정 필요 시 새 PDCA 사이클 시작)
- 메트릭은 `.bkit/state/pdca-status.json` 의 lightweight summary 영역에도 보존됨 (`--summary` 옵션)
