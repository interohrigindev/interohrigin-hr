# GOOGLE — Google Workspace + OAuth

## Google Workspace Business

- **도메인**: interohriginhr.com
- **관리 계정**: admin@interohriginhr.com
- **플랜**: Business Starter ($8.40/user/month, 1계정)
- **용도**: Gmail 발송, Calendar 일정, Meet 화상면접, Drive 녹화 파일

## OAuth 설정

- **GCP 프로젝트**: Interohrigin HR (Workspace 조직 내부)
- **OAuth 동의 화면**: Internal (Workspace 사용자만)
- **Client ID**: Cloudflare Pages Functions 환경변수에 설정
- **Scopes**: gmail.send, calendar, drive.readonly

### 토큰 구조
| 토큰 | 용도 | 계정 |
|------|------|------|
| GMAIL_REFRESH_TOKEN | 이메일 발송 | admin@interohriginhr.com |
| CALENDAR_REFRESH_TOKEN | Meet 생성 + Calendar 일정 | admin@interohriginhr.com |

### 토큰 발급 방법
1. `/api/gmail-auth` 접속
2. admin@interohriginhr.com 로그인
3. 권한 승인 → Refresh Token 발급
4. Cloudflare Pages 환경변수에 등록

## Google Meet 호스트 권한

- 같은 Workspace 도메인(@interohriginhr.com) 사용자는 자동 호스트
- 외부 사용자(임원 등 @interohrigin.com)는 Meet 설정에서 "호스트 관리" OFF 시 동등 권한
- 면접관을 Calendar attendee로 추가하면 초대+호스트 자동 해결

## API 엔드포인트

| 파일 | 용도 |
|------|------|
| `functions/api/send-email.ts` | Gmail API로 이메일 발송 |
| `functions/api/google-meet.ts` | Calendar API로 Meet 링크 생성 |
| `functions/api/google-calendar.ts` | Calendar 이벤트 관리 |
| `functions/api/drive-recordings.ts` | Drive 녹화 파일 조회 |
| `functions/api/gmail-auth.ts` | OAuth 토큰 발급 플로우 |
