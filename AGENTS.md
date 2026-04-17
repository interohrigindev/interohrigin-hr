# INTEROHRIGIN HR Platform

직원 생애주기 통합 관리 (채용→입사→OJT→업무→평가→퇴사)
Tech: React + TypeScript + Tailwind / Supabase PRO / Cloudflare Pages

## 절대 규칙
- 기존 테이블 ALTER 금지: employees, evaluations, evaluation_items, users
- 기존 코드 패턴/네이밍/색상 그대로 따르기
- AI 추천은 "결정"이 아닌 "제안/권장" 표현
- 민감 정보(건강/가정)는 임원 외 비공개
- 한국어 UI, 날짜 YYYY.MM.DD, 모바일 반응형 필수
- Phase 자동 전환 금지 (관리자 수동 승인)
- 코드 수정 시 파일 전체를 덮어쓰지 말고 변경 부분만 수정(Edit), 수정 후 반드시 빌드 검증

## 문서 맵 (필요 시 참조)
작업 주제에 맞는 문서를 읽어서 컨텍스트를 확보할 것.
전체 목차: docs/INDEX.md

| 문서 | 내용 |
|------|------|
| docs/DB.md | 테이블 규칙, 스키마, RLS, Storage |
| docs/ROUTES.md | 라우트 맵, 파일 구조, 모듈 구조 |
| docs/CONVENTIONS.md | 코딩 컨벤션, 네이밍, UI 패턴 |
| docs/DEPLOY.md | Supabase, Cloudflare, 환경변수 |
| docs/AI.md | Gemini API, Whisper STT, AI 설정 |
| docs/GOOGLE.md | Workspace, OAuth, Gmail, Meet, Calendar |
| docs/ROADMAP.md | 개발 우선순위, 프롬프트 맵 |
