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

## Archive 운영 정책

- Archive 된 문서의 원본(`docs/01-plan/features/*`, `docs/02-design/features/*`, `docs/03-analysis/*`, `docs/04-report/*`) 위치에는 stub 파일만 남아서 새 위치로 안내함
- archive 사본은 PDCA 완료 시점의 freeze 상태 — 이후 수정하지 않음 (수정 필요 시 새 PDCA 사이클 시작)
- 메트릭은 `.bkit/state/pdca-status.json` 의 lightweight summary 영역에도 보존됨 (`--summary` 옵션)
