// 0513: 사전질의서 PBD 성향 진단 문항 데이터 + 채점 로직
// 근거 문서: IO_사전질의서_공통문항_v2.0.pdf (P1~P20)
// 4축 × 5문항, 양극 5단계 척도, 역방향 4문항 (P4·P9·P14·P19)
// 지원자에게는 축 이름과 "성향 진단" 라벨을 노출하지 않음 (자연스러운 응답 유도)

export type PbdAxis = 'C1' | 'C3' | 'S1' | 'S3'

export interface PbdQuestion {
  id: string // 'P01' ~ 'P20'
  axis: PbdAxis
  reversed: boolean
  a_label: string // 짧은 라벨
  a_text: string // 본문
  b_label: string
  b_text: string
}

export const PBD_QUESTIONS: PbdQuestion[] = [
  // 사고방식 (C1) · 직관적 ↔ 숙고적
  {
    id: 'P01', axis: 'C1', reversed: false,
    a_label: '전체 맥락 우선',
    a_text: '처음 보는 자료도 훑어보면 "대략 이런 내용이구나" 감이 온다',
    b_label: '순차적 확인',
    b_text: '자료를 볼 때 순서대로 읽으며 각 항목을 확인해야 이해된다',
  },
  {
    id: 'P02', axis: 'C1', reversed: false,
    a_label: '내적 확신 중심',
    a_text: '"이 방향이 맞다"는 확신이 오면 근거가 부족해도 밀고 나가고 싶다',
    b_label: '근거 확인 중심',
    b_text: '확신이 와도 근거를 한 번 더 정리해야 마음이 놓인다',
  },
  {
    id: 'P03', axis: 'C1', reversed: false,
    a_label: '윤곽 → 실행',
    a_text: '윤곽이 잡히면 실행하면서 세부를 채워나가는 편이다',
    b_label: '준비 → 실행',
    b_text: '세부까지 준비된 상태에서 실행을 시작하는 편이다',
  },
  {
    id: 'P04', axis: 'C1', reversed: true,
    a_label: '계획 문서화 우선',
    a_text: '새 프로젝트를 시작할 때 먼저 전체 일정과 단계를 문서로 정리한다',
    b_label: '핵심 먼저 시도',
    b_text: '새 프로젝트를 시작할 때 일단 핵심부터 건드려보고 구조를 잡아간다',
  },
  {
    id: 'P05', axis: 'C1', reversed: false,
    a_label: '전방 지향 회고',
    a_text: '일이 잘 안 풀렸을 때 "왜 안 됐는지"보다 "다음엔 어떻게 할지"가 먼저 떠오른다',
    b_label: '원인 규명 후 전진',
    b_text: '일이 잘 안 풀렸을 때 원인을 충분히 짚고 나서야 다음 단계를 생각한다',
  },

  // 추론방식 (C3) · 귀납적 ↔ 연역적
  {
    id: 'P06', axis: 'C3', reversed: false,
    a_label: '열린 탐색',
    a_text: '정해진 답이 없는 문제에서 오히려 다양한 가능성을 시험해보고 싶다',
    b_label: '조건 명확화 선호',
    b_text: '문제의 조건이 명확할수록 집중해서 풀어낼 수 있다',
  },
  {
    id: 'P07', axis: 'C3', reversed: false,
    a_label: '개선 충동',
    a_text: '잘 되고 있는 방식도 더 나은 가능성이 보이면 바꿔보고 싶은 충동이 있다',
    b_label: '검증된 방식 신뢰',
    b_text: '잘 되고 있는 방식은 검증된 이유가 있으니 유지하는 게 맞다고 생각한다',
  },
  {
    id: 'P08', axis: 'C3', reversed: false,
    a_label: '불확실 시도 수용',
    a_text: '성과가 불확실해도 새로운 방식으로 소규모 시도를 먼저 해본다',
    b_label: '성과 예측 후 시도',
    b_text: '기대 성과가 어느 정도 보일 때 시도에 들어가는 편이다',
  },
  {
    id: 'P09', axis: 'C3', reversed: true,
    a_label: '현재 방식 근거 탐색',
    a_text: '업무 개선을 논의할 때 "왜 현재 방식이 있는지"를 먼저 검토한다',
    b_label: '변화 방향 우선 탐색',
    b_text: '업무 개선을 논의할 때 "어떻게 바꿀 수 있는지"부터 아이디어를 낸다',
  },
  {
    id: 'P10', axis: 'C3', reversed: false,
    a_label: '학습 가치 중심',
    a_text: '시도가 실패해도 "무엇을 배웠는지"가 남으면 의미 있는 경험이라고 생각한다',
    b_label: '예방 가능성 점검',
    b_text: '시도가 실패하면 "사전에 막을 수 있었는가"를 먼저 점검한다',
  },

  // 통제방식 (S1) · 내적통제 ↔ 외적통제
  {
    id: 'P11', axis: 'S1', reversed: false,
    a_label: '의미 판단 후 몰입',
    a_text: '내가 의미있다고 판단한 목표일 때 더 깊이 몰입된다',
    b_label: '공식 목표 수용',
    b_text: '조직이나 팀이 정한 목표라는 사실 자체가 실행의 근거가 된다',
  },
  {
    id: 'P12', axis: 'S1', reversed: false,
    a_label: '효율 판단 기반 재량',
    a_text: '정해진 방식이 비효율적이라는 확신이 들면 다른 방식을 선택하고 싶다',
    b_label: '절차 준수 우선',
    b_text: '정해진 방식이 비효율적이더라도 공식 변경 전까지는 따르는 게 맞다',
  },
  {
    id: 'P13', axis: 'S1', reversed: false,
    a_label: '자율 실행',
    a_text: '내가 옳다고 판단하면 승인 없이도 실행에 옮기는 편이다',
    b_label: '확인 후 실행',
    b_text: '옳다고 판단해도 공식 확인을 받고 실행하는 편이 안전하다',
  },
  {
    id: 'P14', axis: 'S1', reversed: true,
    a_label: '팀 방향 수용',
    a_text: '팀에서 방향이 정해지면 내 의견과 달라도 일단 맞춰서 진행한다',
    b_label: '독자 관점 유지',
    b_text: '팀에서 방향이 정해져도 내 관점에서 문제가 있으면 재검토를 요청한다',
  },
  {
    id: 'P15', axis: 'S1', reversed: false,
    a_label: '내적 귀인',
    a_text: '일이 잘못됐을 때 내 판단 중 무엇이 틀렸는지를 먼저 돌아본다',
    b_label: '외적 귀인',
    b_text: '일이 잘못됐을 때 상황이나 구조적 요인이 무엇이었는지를 먼저 살핀다',
  },

  // 역할방식 (S3) · 개인적 ↔ 집단적
  {
    id: 'P16', axis: 'S3', reversed: false,
    a_label: '기여 구분 중시',
    a_text: '프로젝트가 성공했을 때 각자가 어떤 기여를 했는지 구분하는 것이 중요하다',
    b_label: '공동 성과 인식',
    b_text: '프로젝트가 성공했을 때 팀 전체의 결과라는 인식이 더 자연스럽다',
  },
  {
    id: 'P17', axis: 'S3', reversed: false,
    a_label: '역할 명확성 동기',
    a_text: '함께 일할 때도 내가 무엇을 맡아 어떻게 완결할지가 명확해야 에너지가 생긴다',
    b_label: '공동 방향성 동기',
    b_text: '함께 일할 때 팀 전체가 같은 방향을 향하고 있다는 느낌이 에너지가 된다',
  },
  {
    id: 'P18', axis: 'S3', reversed: false,
    a_label: '역할 경계 유지',
    a_text: '팀 내 의견 충돌 시 내 역할 범위 안에서의 판단을 우선적으로 지킨다',
    b_label: '팀 합의 우선',
    b_text: '팀 내 의견 충돌 시 팀 전체의 합의를 이끌어내는 것을 우선한다',
  },
  {
    id: 'P19', axis: 'S3', reversed: true,
    a_label: '경계 초월 지원',
    a_text: '팀 과제에서 내 담당이 끝나면 다른 팀원의 영역까지 챙기는 편이다',
    b_label: '역할 내 완결',
    b_text: '팀 과제에서 내 담당을 완벽히 끝내는 것이 팀에 대한 최선의 기여다',
  },
  {
    id: 'P20', axis: 'S3', reversed: false,
    a_label: '개별 책임 명확화',
    a_text: '문제가 생겼을 때 내가 직접 관여한 부분에 대한 책임을 먼저 명확히 한다',
    b_label: '공동 대응 우선',
    b_text: '문제가 생겼을 때 팀 전체가 함께 원인을 짚고 대응하는 것이 맞다',
  },
]

// 척도 라벨 (지원자 화면에서 노출) — 제시된 문항에 대한 동의 정도
export const SCALE_LABELS = [
  { value: 1, short: '매우 그렇다', desc: '' },
  { value: 2, short: '그렇다', desc: '' },
  { value: 3, short: '보통', desc: '' },
  { value: 4, short: '아니다', desc: '' },
  { value: 5, short: '매우 아니다', desc: '' },
] as const

// ──────────────────────────────────────────────────────────
// 채점 로직 (관리자 결과 페이지 전용 — 지원자에게 노출 X)
// ──────────────────────────────────────────────────────────

export interface PbdScores {
  C1: number // 사고방식 (직관적 5 ↔ 숙고적 25)
  C3: number // 추론방식 (귀납적 5 ↔ 연역적 25)
  S1: number // 통제방식 (내적통제 5 ↔ 외적통제 25)
  S3: number // 역할방식 (개인적 5 ↔ 집단적 25)
  ici: number // 내적 일관성 지수 0~100
  c1_label: string
  c3_label: string
  s1_label: string
  s3_label: string
  domain: string // 발상/실행/발명/설계
  domain_strength: string
  fit_jobs: string[]
  check_jobs: string[]
}

function bandLabel(axis: PbdAxis, total: number): string {
  // 5~10 A우세 / 11~15 균형 / 16~25 B우세
  const map: Record<PbdAxis, [string, string]> = {
    C1: ['직관적 우세', '숙고적 우세'],
    C3: ['귀납적 우세', '연역적 우세'],
    S1: ['내적통제 우세', '외적통제 우세'],
    S3: ['개인형 우세', '집단형 우세'],
  }
  if (total <= 10) return map[axis][0]
  if (total >= 16) return map[axis][1]
  return '균형'
}

// 도메인 × 직무 매핑 (PDF Part 3)
const DOMAIN_TABLE: Record<string, { strength: string; fit: string[]; check: string[] }> = {
  '직관적×귀납적': {
    strength: '발상 — 빠른 가능성 포착 · 아이디어 확장',
    fit: ['AI콘텐츠', 'BM', 'PPL', '해외사업', 'AE'],
    check: ['디자인', 'MD', '경영지원'],
  },
  '직관적×연역적': {
    strength: '실행 — 즉각적 현장 대응 · 속도 기반 실행',
    fit: ['AE', 'CS/CX', 'PPL', '해외사업', 'MD'],
    check: ['BM', '쥬얼리', '경영지원'],
  },
  '숙고적×귀납적': {
    strength: '발명 — 깊은 탐색 · 창의적 구조 설계',
    fit: ['디자인', 'AI콘텐츠', '개발', 'BM'],
    check: ['PPL', 'MD', '인사총무'],
  },
  '숙고적×연역적': {
    strength: '설계 — 논리적 정합성 · 체계 구축',
    fit: ['재무회계', '개발', '인사총무', '경영지원'],
    check: ['BM', 'MD', 'CS/CX'],
  },
}

export function scorePbd(answers: Record<string, number>): PbdScores | null {
  const sum: Record<PbdAxis, number> = { C1: 0, C3: 0, S1: 0, S3: 0 }
  const filled: Record<PbdAxis, number> = { C1: 0, C3: 0, S1: 0, S3: 0 }
  // ICI: 역방향 문항의 응답을 역산했을 때 같은 축 정방향 합 평균과 일치하는 정도
  for (const q of PBD_QUESTIONS) {
    const raw = answers[q.id]
    if (typeof raw !== 'number' || raw < 1 || raw > 5) continue
    const v = q.reversed ? 6 - raw : raw
    sum[q.axis] += v
    filled[q.axis] += 1
  }
  // 누락이 있으면 null
  if (filled.C1 < 5 || filled.C3 < 5 || filled.S1 < 5 || filled.S3 < 5) return null

  const C1 = sum.C1, C3 = sum.C3, S1 = sum.S1, S3 = sum.S3

  // ICI: 각 축의 역방향 점수(역산 후)와 정방향 4문항 평균의 절댓값 차이를 합산 후 100점 환산
  let deviation = 0
  for (const axis of ['C1', 'C3', 'S1', 'S3'] as PbdAxis[]) {
    const fwd = PBD_QUESTIONS.filter(q => q.axis === axis && !q.reversed)
    const rev = PBD_QUESTIONS.filter(q => q.axis === axis && q.reversed)
    if (fwd.length === 0 || rev.length === 0) continue
    const fwdAvg = fwd.reduce((s, q) => s + (answers[q.id] || 3), 0) / fwd.length
    const revRaw = rev.reduce((s, q) => s + (answers[q.id] || 3), 0) / rev.length
    const revAdjusted = 6 - revRaw // 역산 후 정방향 기준 값
    deviation += Math.abs(fwdAvg - revAdjusted)
  }
  // deviation 최대 약 16 (4축 × 최대 4점 차이) → 100점 환산
  const ici = Math.max(0, Math.min(100, Math.round(100 - (deviation / 16) * 100)))

  const c1_label = bandLabel('C1', C1)
  const c3_label = bandLabel('C3', C3)
  const s1_label = bandLabel('S1', S1)
  const s3_label = bandLabel('S3', S3)

  // 도메인 (균형은 가까운 쪽으로 환원)
  const c1Side = C1 <= 12 ? '직관적' : C1 >= 14 ? '숙고적' : (C1 < 13 ? '직관적' : '숙고적')
  const c3Side = C3 <= 12 ? '귀납적' : C3 >= 14 ? '연역적' : (C3 < 13 ? '귀납적' : '연역적')
  const key = `${c1Side}×${c3Side}`
  const domainInfo = DOMAIN_TABLE[key] || { strength: '판정 필요', fit: [], check: [] }

  return {
    C1, C3, S1, S3, ici,
    c1_label, c3_label, s1_label, s3_label,
    domain: key,
    domain_strength: domainInfo.strength,
    fit_jobs: domainInfo.fit,
    check_jobs: domainInfo.check,
  }
}
