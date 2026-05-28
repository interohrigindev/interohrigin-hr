# unified-ai-cost-dashboard Plan (Archive 압축본)

> PDCA #3 / 2026-05-28 / 전체 원본은 git history(`b740307` 직후 archive 커밋)에 보존.

## Executive Summary

| Perspective | Content |
|-------------|---------|
| Problem | AI 과금(토큰비+구독비)이 시스템마다 흩어짐, HR·cs·mall은 토큰 미기록 → 가시성 부재 |
| Solution | 공통 ai_usage_log + cross-schema RPC + ai.ts 토큰 기록 + billing 확장 |
| Function/UX | 월/모델/시스템별 AI 비용, 구독비(고정)/토큰비(변동) 분리 |
| Core Value | 전사 AI 비용 가시성 + 표준 로깅 인프라 |

## Context Anchor
- WHY: 전사 AI 과금 분산 + 미기록 → 가시성 부재
- WHO: 관리자/임원 (AdminRoute 5 role)
- RISK: HR/cs/mall 미기록 / cross-schema 권한 / 단가 정확성
- SUCCESS: 공통 로깅 + HR 토큰 + finance 합류 + 집계 + billing 통합
- SCOPE: 로깅 인프라 → HR/finance 적용 → RPC → UI / cs·mall 규격만

## 핵심
- 방향 정정: 회사 운영비 통합 폐기 → AI 과금 통합 (인터뷰 직후)
- SC 7개 / FR 9개 / Risk 6개
- 단가는 클라이언트 TS 상수, RPC는 raw 토큰만
- Out-of-Scope: cs/mall 측 코드 수정, 실시간 알림, 단가 자동 동기화

> 상세 FR/Risk/Impact는 git history 참조.
