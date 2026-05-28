# unified-ai-cost-dashboard Design (Archive 압축본)

> PDCA #3 / 2026-05-28 / 전체 원본은 git history(`b740307` 직후 archive 커밋)에 보존.

## §0 Deviation from Plan
- `meeting_records.stt_cost` 컬럼 미존재(SQL 확정) → STT는 ai_usage_log unit_count 경로
- STT provider = Deepgram (Whisper 아님), DEEPGRAM_COST_PER_MIN 재사용
- 1·2단계 합침 (대표 결정)

## Architecture: Option C (Pragmatic) 채택
- finance: RPC가 읽기로 합류 (무수정) / HR: ai.ts usage 응답 추가 → authed 클라 logAiUsage insert
- vs Option B(service-role 주입): 보안 표면 + finance 침범 회피

## 핵심 설계
- §3.1 `public.ai_usage_log` — source_system/feature/provider/model/tokens_input·output/unit_count·type/ref/occurred_at/created_by + RLS 2(insert self, select admin) + 인덱스 3
- §3.3 `public.get_unified_ai_costs(p_start date, p_end date)` SECURITY DEFINER, search_path=public,finance, guard CTE(5 role CROSS JOIN), ai_usage_log + finance 3테이블 UNION, raw 토큰만
- §4 ai.ts usage 추출 (Gemini usageMetadata / OpenAI usage / Claude usage), 응답에 usage 필드 추가
- §5 billing.tsx 확장 (기간/시스템별/모델별/월별, cs·mall 기록 대기, 추정치 disclaimer)
- 단가는 ai-cost-pricing.ts 클라 상수

## Module Map (Session 분할)
- module-1,2 (S1): 마이그레이션+RPC + ai.ts usage
- module-3 (S2): 단가 모듈 + logAiUsage + 데이터 레이어 + ai-client 자동 적재
- module-4 (S3): billing UI
- module-5 (S4): 검증 + Check

> 상세 SQL/UI 체크리스트/테스트 계획은 git history 참조.
