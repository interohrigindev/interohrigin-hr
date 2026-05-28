# unified-ai-cost-dashboard Analysis (Check) — Archive

> PDCA #3 / 2026-05-28 / cto-lead. 검증: 단일 모드 정적 분석 (static-only formula).

## Match Rate = 98%
- Structural 0.2×100 + Functional 0.4×95 + Contract 0.4×100 = **98%** (≥90 통과)

## Success Criteria 6/7 Met + 1 Partial
| SC | 상태 | Evidence |
|----|:----:|----------|
| SC-1 finance 토큰 환산 | ✅ | RPC finance 3테이블 UNION + estimateCost + S1 검증 4건 |
| SC-2 STT+구독비 통합 | ✅ | SERVICES 유지 + STT unit 경로 + 신규 섹션 공존 |
| SC-3 월/모델/시스템별 | ✅ | aggregate() + billing 3뷰 |
| SC-4 RPC 캡슐화 | ✅ | get_unified_ai_costs SECURITY DEFINER + guard CTE |
| SC-5 cs/mall 정직 표시 | ✅ | SYSTEM_META expected=false → "기록 대기" |
| SC-6 공통 규격 정의 | ✅ | 133 마이그레이션 테이블+RLS+인덱스 |
| SC-7 HR 토큰 기록 | ⚠️ Partial | 인프라 완비(ai.ts usage + recordUsage 자동), 실데이터 누적 대기 |

Critical 0 / Important 0.

## Design 충실도 (Option C)
§3.1/§3.3/§2.0/§4/§5/§7 전부 ✅. 추가 개선: is_admin() 미사용(hr_admin 누락 회피), Deepgram 정정.

## 회귀 0
- ai.ts 49 호출처 영향 0 (usage 옵셔널) / BillingDashboard 본문 미수정 / callAIProxy 내부 격리
- 3 commits 전부 1회 빌드 통과, 기존 테이블 ALTER 0

## Out-of-Scope
cs/mall 적재 코드(각 시스템) / 실시간 알림 / 단가 자동 동기화.

## 결정
Match 98% + Critical 0 → 그대로 Report 진행 (iterate 없음).
