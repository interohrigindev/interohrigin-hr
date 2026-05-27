---
name: decision-traceability-6th-pattern
description: 의사결정 traceability 보존 — 5단계 명시 패턴에 6번째(외부 리서치 원문 보존 디렉토리)를 추가하는 컨벤션
metadata:
  type: feedback
---

PDCA 사이클에서 architecture-level pivot (예: "강제 투어 only" → "3-Tier Help Center") 같은 큰 의사결정의 traceability 는 5단계로 보존해야 한다:

1. 커밋 메시지에 메트릭 인용 (예: `a684b05` 처럼 "-28% 이탈, -25% 티켓")
2. Design "Deviation from Plan" 섹션 명시
3. Context Anchor RISK/SUCCESS 갱신
4. Analysis Deviation Map 정량화
5. Report Decision Record Summary 등재

**+ 6번째 패턴 (interactive-manual 사이클 #1에서 발견)**:
6. **외부 리서치 원문 / 인용 출처 / 스크린샷 이미지를 `docs/00-research/{feature}/` 디렉토리에 별도 보존**

**Why**: 커밋 메시지는 압축적이라 시간이 지나면 인용 출처가 불명해질 수 있음. 정량 메트릭(-28%, -25% 등)의 신뢰성을 1년 후에도 검증 가능하게 유지하려면 원문/스크린샷 보존이 1차 source-of-truth 역할.

**How to apply**:
- Plan §3 "아키텍처 결정" 섹션 작성 전 외부 리서치 1시간 의무화 (관련: PM/Plan 프로세스 개선)
- 외부 SaaS / 논문 / 블로그 비교 표를 만들 때 `docs/00-research/{feature}/` 디렉토리 생성 + 출처 URL + 발췌 텍스트 + 스크린샷 PDF 보존
- Plan/Design 문서에서 `docs/00-research/{feature}/` 를 reference 로 링크
- 본 컨벤션은 v1.7+ 사이클부터 적용 권장 — interactive-manual 사이클 #1 (2026-05-27) 종료 시점 합의

**관련 메모리**: [[workflow-no-residual-risks]] (단계별 리스크 0 진입 원칙) — 외부 리서치도 Plan phase 의 진입 리스크 제거 활동.
