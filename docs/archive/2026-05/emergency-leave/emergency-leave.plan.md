# emergency-leave Planning Document (Archive 압축본)

> PDCA #4 · 2026-05-28 · Match Rate 98.4% · SC 8/8
> 원본 전체는 git history (archive 커밋 직전 `docs/01-plan/features/emergency-leave.plan.md`) 에 보존. 본 사본은 핵심 요약.

## Executive Summary

| Perspective | Content |
|-------------|---------|
| Problem | 출근 전날 밤/새벽 긴급·질병 시 인사담당 개인 연락 의존 + 정식 결재선 즉시 처리 불가 → "선 신청/후 정식화" 불가 |
| Solution | [긴급연차] 신설 — 결재선 없이 즉시 통보형 상신 + 임원급 이메일 자동발송. 출근 후 보완자료 → 정식 전환·차감(부족 시 무급) |
| Function/UX | 새벽에도 시스템만으로 통보 완료, 임원진 즉시 인지, 신규 테이블 분리로 회귀 0 |
| Core Value | "통보 즉시성"+"결재 정합성" 2단계 분리. 민감정보 임원급 한정 |

## Context Anchor
WHY 긴급·질병 즉시 통보+사후 정식화 / WHO 전직원·hr_admin·ceo·director / RISK 민감정보·트리거정합성·hr_admin누락 / SUCCESS 5단계 흐름 / SCOPE 신규 테이블+이메일+버킷+leave.tsx 통합

## 핵심 결정 (Q1~Q6)
- Q1 데이터모델: **신규 테이블** `emergency_leave_requests` (전환 시 leave_requests INSERT)
- Q2 이메일: **hr_admin+ceo+director 한정**, 풀 템플릿
- Q3 무급: **관리자 수동 확인** (혼합 가능)
- Q4 전환 결재선: 기존 자동 라인 재사용
- Q5 첨부: 신규 버킷 emergency-leave-files, 병가만 진단서 필수
- Q6 비상연락망: 상수 안내 (평일 이민지 / 주말 강은묵 이사)

## Success Criteria
SC-01 결재없이 신청 / SC-02 임원급 자동 이메일 / SC-03 보완자료 업로드 / SC-04 전환 결재선 / SC-05 차감·무급 수동 / SC-06 마이그레이션 / SC-07 빌드·회귀 0 / SC-08 병가 진단서 차단

## Out-of-Scope
무급 자동화 / 비상연락망 편집 / 부서리더 알림 / 긴급연차 자체 별도 결재선

## DB 조사 결과
leave_requests CHECK 제약 0 (leave_type/approval_status 자유 text), trigger_leave_balance = approved 전이 시 days_count 1회 차감. 역할: hr_admin1/ceo1/director3 = 이메일 실수신 5명.
