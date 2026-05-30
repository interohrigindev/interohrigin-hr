# INTEROHRIGIN 통합 Cron 라우터

여러 서비스(HR, Finance, CS, Mall …)의 매일 cron 작업을 **단일 Cloudflare Worker** 가 담당합니다.
Worker 가 지정 시각에 트리거되면 → 해당 cron 에 매핑된 서비스 endpoint 로 HTTPS POST + `X-Cron-Secret` 헤더로 호출.

## 구조

```
workers/cron-router/
├── src/index.ts        ← scheduled 핸들러 + ROUTES 매핑
├── wrangler.toml       ← name + [triggers].crons (UTC 시각)
├── package.json
└── tsconfig.json
```

## 1회 배포 (최초 한 번)

### 옵션 A — wrangler CLI (권장)

```bash
cd workers/cron-router
npm install
npx wrangler login                           # 브라우저로 Cloudflare 로그인
npx wrangler secret put CRON_SECRET          # HR Pages 와 같은 값 입력
npx wrangler deploy                          # Worker 배포 + cron 등록
```

배포되면 Cloudflare 대시보드 → Workers & Pages → `interohrigin-cron-router` 에서 확인 가능.

### 옵션 B — Cloudflare 대시보드 (코드 직접 붙여넣기)

1. Cloudflare 대시보드 → **Workers & Pages** → **Create** → **Worker**
2. 이름: `interohrigin-cron-router` → **Deploy**
3. **Edit code** → `src/index.ts` 의 코드 전체 붙여넣기 → **Save and deploy**
4. **Settings → Variables and Secrets** → `CRON_SECRET` 추가 (HR Pages 와 같은 값)
5. **Settings → Triggers → Cron Triggers** → **Add Cron Trigger** → `30 23 * * *` 추가

## 동작 확인

배포 직후 수동 트리거로 테스트:

```bash
# 등록된 routes 확인
curl "https://interohrigin-cron-router.<your-subdomain>.workers.dev?secret=$CRON_SECRET"

# HR 결재 리마인더 즉시 실행
curl "https://interohrigin-cron-router.<your-subdomain>.workers.dev?secret=$CRON_SECRET&cron=30+23+*+*+*"
```

실행 로그는 Cloudflare 대시보드 → Worker → **Logs (real-time)** 에서 확인.

## 새 서비스 cron 추가 절차

예: Finance 일일 마감 cron 추가 (KST 09:00 = UTC 00:00)

### 1. `src/index.ts` 의 ROUTES 에 1줄 추가

```ts
const ROUTES: Record<string, string> = {
  '30 23 * * *': 'https://hr.interohrigin.com/api/cron-pending-approval-reminder',
  '0 0 * * *':   'https://finance.interohrigin.com/api/cron-daily-close',   // ← 추가
}
```

### 2. `wrangler.toml` 의 `[triggers].crons` 에 같은 expression 추가

```toml
[triggers]
crons = [
  "30 23 * * *",
  "0 0 * * *",   # ← 추가
]
```

### 3. 재배포

```bash
cd workers/cron-router
npx wrangler deploy
```

→ 끝. 매일 KST 09:00 에 Finance endpoint 가 자동 호출됨.

## Cron Expression 참고 (UTC 기준)

| KST 시각 | UTC Expression | 의미 |
|---|---|---|
| 08:00 | `0 23 * * *` | 매일 새벽 출근 직전 |
| 08:30 | `30 23 * * *` | HR 미결재 리마인더 (현재 등록) |
| 09:00 | `0 0 * * *` | 매일 업무 시작 시간 |
| 10:00 | `0 1 * * *` | 오전 중반 |
| 18:00 | `0 9 * * *` | 매일 퇴근 시간 |
| 매주 월요일 09:00 | `0 0 * * 1` | 주간 |

## 보안

- `CRON_SECRET` 은 **각 호출 대상 서비스(HR, Finance, …)와 같은 값**이어야 함
- 호출 대상 서비스는 자체적으로 `X-Cron-Secret` 헤더를 검증
- 시크릿은 wrangler secret 또는 대시보드 Variables 로만 등록 (코드에 하드코딩 금지)

## 모니터링

- Cloudflare 대시보드 → Worker → **Observability** 탭에서 실행 횟수/실패율 확인
- 알림 설정: Cloudflare **Notifications** 에서 Workers 에러율 임계 알림 설정 가능 (선택)

## 비용

- Workers Free Plan: 100,000 requests/day (Cron Triggers 포함)
- 매일 cron 1~5회 호출은 free quota 0.005% 수준 → 사실상 무료
- 한도 초과 시 Workers Paid: $5/월 (10M req/month)
