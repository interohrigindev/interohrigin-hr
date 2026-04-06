# AI — AI/STT 통합

## Gemini API (Google)

- **용도**: 이력서 분석, 면접 분석, 종합 인사 리포트, AI 에이전트
- **모델**: Gemini 2.5 Flash (무료 플랜, 분당 15건 제한)
- **호출 위치**: `functions/api/ai.ts`
- **프론트엔드 설정**: `src/components/settings/TabAI.tsx`
- **지원 MIME**: PDF, 이미지, 텍스트, 오디오, 비디오 (docx 제외 → 텍스트 추출 후 전송)

### AI 분석 유형
| 유형 | 입력 | 출력 |
|------|------|------|
| 이력서 분석 | PDF/이미지 | 점수, 강점, 약점, 추천 여부 |
| 면접 분석 | 녹음 파일 + 트랜스크립트 | 답변 평가, 종합 의견 |
| 종합 분석 | 이력서+질의서+면접 | 최종 추천, 상세 리포트 |
| 평가 리포트 | 평가 데이터 | AI 종합 리포트 (report.tsx) |

## Whisper API (OpenAI)

- **용도**: 회의 녹음 음성→텍스트 변환 (STT)
- **단가**: $0.006/분
- **호출 위치**: `functions/api/transcribe.ts`
- **설정 위치**: `src/components/settings/TabAI.tsx` → meeting_stt: 'openai'

## AI 규칙

- AI 추천은 **"결정"이 아닌 "제안/권장"** 표현
- 사주/MBTI 분석은 **참고 자료**로만 취급 (의사결정 근거 아님)
- AI 신뢰도 Phase 자동 전환 **금지** (관리자 수동 승인 필수)
- Gemini 무료 한도 초과 방지: 대량 분석은 분산 실행
