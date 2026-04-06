# DEPLOY — 배포 + 환경 설정

## Supabase PRO

- **Project Ref**: `ckzbzumycmgkcpyhlclb`
- **URL**: `https://ckzbzumycmgkcpyhlclb.supabase.co`
- **플랜**: Pro ($25/월)
- **DB 접근 정보**: Claude memory에 별도 저장 (reference_supabase_db.md 참조)
- **SQL 실행**: Management API 사용 (직접 DB 연결 불가)

## Cloudflare Pages

- **운영 URL**: https://interohrigin-hr2.pages.dev/
- **배포**: GitHub main 브랜치 push → 자동 빌드/배포
- **빌드 명령어**: `npm run build` (vite)
- **SPA 라우팅**: `functions/[[catchall]].ts` — /index.html 폴백
- **API**: `functions/api/*.ts` — Cloudflare Pages Functions

## GitHub

- **레포**: https://github.com/interohrigindev/interohrigin-hr
- **브랜치**: `main` (단일 브랜치)

## 환경변수

### 프론트엔드 (.env / Cloudflare Pages)
```
VITE_SUPABASE_URL=https://ckzbzumycmgkcpyhlclb.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_GEMINI_API_KEY=...
```

### Cloudflare Pages Functions (서버사이드)
```
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...          # 이메일 발송용 (admin@interohriginhr.com)
GMAIL_SENDER_EMAIL=admin@interohriginhr.com
CALENDAR_REFRESH_TOKEN=...       # Meet/Calendar용 (admin@interohriginhr.com)
OPENAI_API_KEY=...               # Whisper STT
SUPABASE_SERVICE_ROLE_KEY=...
```

## 개발 환경

- **Firebase Studio**: https://studio.firebase.google.com/interohrigin-hr-08305956
- **로컬**: `npm run dev` (Vite dev server)
