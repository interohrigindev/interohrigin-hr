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

## 예정 확장 메모 (2026.04.21)

### 퇴직자 인수인계 Drive 스캔
- 목적: 퇴사자 이메일/폴더 기준으로 Drive 파일 메타데이터를 수집해 `handover_assets` 초안 생성
- 예정 파일: `src/lib/drive-scanner.ts`
- 기본 수집 항목:
  - 파일명
  - URL
  - 수정일
  - 상위 폴더 또는 경로 추론값

### 스코프 확장 검토
- 우선 후보: `drive.metadata.readonly`
- 필요 시 대체: `drive.readonly`
- 원칙:
  - 가능하면 메타데이터만 읽는 최소 권한 우선
  - 스코프 변경 후 관리자 재인증 1회 필요

### 운영 규칙
- 스캔 결과는 자동 확정하지 않고 관리자 검수 후 저장
- 챗봇 응답에는 Drive 파일 URL을 직접 인용 가능
