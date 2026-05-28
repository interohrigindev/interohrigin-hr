# unified-ai-cost-dashboard Report — Archive

> PDCA #3 완료 / 2026-05-28 / cto-lead. 전체 원본은 git history(`b740307` 직후) 보존.

## Executive Summary
| Perspective | Content |
|-------------|---------|
| Problem | AI 과금이 시스템마다 분산 + HR·cs·mall 토큰 미기록 → 가시성 부재 |
| Solution | ai_usage_log + cross-schema RPC + ai.ts 토큰 추출 + ai-client 자동 적재 + billing 섹션 (Option C) |
| Function/UX | 월/모델/시스템별 AI 비용, 구독비/토큰비 분리, cs/mall 기록 대기 표시 |
| Core Value | 전사 AI 비용 가시성 + 자동 합류 표준 로깅 인프라 |

### Value Delivered
- Match Rate 98% / SC 6 Met + 1 Partial / Critical 0 / 회귀 0
- ai_usage_log 운영 적용 + RPC 동작 검증 / 3 commits 1회 빌드 통과 / 경고 0

## Key Decisions
- 방향 정정(운영비→AI 과금, 폐기 0) / Option C(stateless ai.ts) / is_admin 미사용(hr_admin 일치) / Deepgram 정정 / ai-client 자동 적재(49 호출처 무수정) / stt_cost 컬럼 미존재 정정

## Commits
`1273f53`(S1) / `d4f8898`(S2) / `b740307`(S3) + archive

## 향후 권고 Top 3
1. cs/mall 합류 (각 시스템 ai_usage_log insert)
2. HR 실데이터 모니터링 (1~2주 후 누적 확인)
3. 단가표 분기 갱신

## cycleType: feature-development / Do 3세션 / 3 commits / Match 98% / 회귀 0
