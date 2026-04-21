# DB — 데이터베이스 규칙

## READ ONLY 테이블 (절대 ALTER 금지)

```
employees, evaluations, evaluation_items, users
```

이 테이블은 기존 시스템과 연동되어 있어 스키마 변경 시 전체 장애 발생.
신규 컬럼이 필요하면 **별도 테이블을 생성**하여 FK로 연결할 것.

## 신규 테이블 (40+개)

| 카테고리 | 테이블 |
|---------|--------|
| 채용관리 | job_postings, candidates, resume_analysis, interview_schedules, interview_recordings, interview_analyses, survey_questions, candidate_surveys, hiring_decisions, talent_profiles |
| AI 신뢰도 | ai_accuracy_log, ai_trust_metrics, ai_analysis_history |
| 사주/MBTI | employee_profiles, personality_analysis, saju_analysis |
| 수습/OJT | ojt_programs, ojt_checklists, mentor_assignments, probation_evaluations, probation_reports |
| 기록 | special_notes, exit_surveys |
| 업무 | work_metrics, urgent_tasks, task_reminders, reminder_penalties |
| 인사노무 | attendance_records, leave_management, leave_requests, leave_promotions, approval_templates, approval_documents, approval_steps, certificates, training_records |
| 인수인계 | handover_documents, handover_assets, handover_chats |
| 평가 확장 | evaluation_categories, evaluation_weights, evaluation_targets, self_evaluations, evaluator_scores, evaluator_comments, peer_review_assignments, peer_reviews, monthly_checkins, job_types, employee_job_assignments, evaluation_item_job_types |
| 메신저 | chat_rooms, chat_messages, chat_room_members |
| 게시판 | bulletin_posts, bulletin_comments |
| 회의 | meeting_records |

## Supabase Storage 버킷

| 버킷 | 접근 | 용도 |
|------|------|------|
| interview-recordings | private (Signed URL) | 면접 녹화/녹음 |
| resumes | private | 이력서/자소서 |
| certificates | private | 증명서 |
| training-docs | private | 교육 자료 |
| chat-attachments | private (Signed URL 7일) | 메신저 첨부파일 |

## RLS 패턴

- 기존 테이블과 동일한 패턴 적용
- `is_admin()` 함수로 관리자 권한 체크
- `auth.uid()` 기반 본인 데이터 접근
- Storage: private 버킷 + Signed URL (1시간 / 7일)

## 예정 확장 메모 (2026.04.21)

### 수습평가 보강
- `employees.hire_date`는 조회만 사용
- 수습종료일은 애플리케이션 계산(`hire_date + 90일`)으로 처리
- 기존 평가 테이블 ALTER 없이 PDF/AI 분석은 프론트/신규 JSON 저장 구조로 보강

### 인수인계 자동화
- `handover_documents`
  - 퇴사자 기준 인수인계 본문 JSON 저장
  - `successor_id`로 후임자 권한 범위 설정
- `handover_assets`
  - 계약서/기기/문서/계정/기타 자산 인벤토리 저장
  - Drive 스캔 결과도 수동 검수 후 이 테이블에 반영
- `handover_chats`
  - 후임자 질의응답 로그와 source 추적 저장

### 권한 원칙
- 관리자: 전체 접근
- 퇴사자 본인: 본인 문서 열람/보완
- 후임자: 지정된 handover 문서와 자산만 열람
- 그 외: 차단
