# AI 모델 단가 출처 (unified-ai-cost-dashboard)

> PDCA #3 Do S2 — `src/lib/ai-cost-pricing.ts` 의 단가 상수 1차 source-of-truth.
> [[decision-traceability-6th-pattern]] 6번째 패턴 — 외부 리서치 원문 보존.
>
> **갱신일**: 2026-05 / **성격**: 추정치 (공식 published 단가 기준, 실제 청구액과 다를 수 있음)
> 단가는 변동되므로 분기마다 재확인 권장. 변경 시 본 문서 + `ai-cost-pricing.ts` 동시 갱신.

## 단위 규약

- LLM 토큰 단가: **USD per 1M tokens** (input / output 분리)
- STT: **USD per minute**
- 환율: `USD_TO_KRW = 1380` (billing.tsx 기존 값 재사용, 상수화)

## LLM 토큰 단가 (USD / 1M tokens)

| provider | model | input | output | 출처 |
|----------|-------|------:|-------:|------|
| gemini | gemini-2.5-flash | 0.30 | 2.50 | https://ai.google.dev/gemini-api/docs/pricing |
| gemini | gemini-2.5-flash-lite | 0.10 | 0.40 | 동상 |
| gemini | gemini-3-flash-preview | 0.30 | 2.50 | preview — 2.5-flash 기준 추정 |
| gemini | gemini-3.1-pro-preview | 1.25 | 10.00 | preview — pro tier 추정 |
| openai | gpt-4o | 2.50 | 10.00 | https://openai.com/api/pricing |
| openai | gpt-4o-mini | 0.15 | 0.60 | 동상 |
| openai | gpt-4-turbo | 10.00 | 30.00 | 동상 |
| anthropic | claude-sonnet-4-5-20250514 | 3.00 | 15.00 | https://www.anthropic.com/pricing |
| anthropic | claude-haiku-4-5-20251001 | 1.00 | 5.00 | 동상 |
| anthropic | claude-sonnet-4-6 | 3.00 | 15.00 | sonnet tier 추정 |
| anthropic | claude-opus-4-6 | 15.00 | 75.00 | opus tier 추정 |

## STT 단가 (USD / minute)

| provider | model | per minute | 출처 |
|----------|-------|-----------:|------|
| deepgram | nova-3 | 0.0043 | https://deepgram.com/pricing — ai-client.ts:DEEPGRAM_COST_PER_MIN 재사용 |

## 미등록 모델 처리

- 단가표에 없는 model → 비용 0 + "단가 미등록" 표기 (토큰은 그대로 표시). 추정 강제 금지.

## provider 추론 (finance 레코드는 provider=NULL, model 로 추론)

| model prefix | provider |
|--------------|----------|
| `gemini` | gemini |
| `gpt`, `o1`, `o3` | openai |
| `claude` | anthropic |
| `nova` | deepgram |
| 그 외 | unknown (단가 미등록 처리) |
