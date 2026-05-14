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

export type AxisBand = 'A' | 'Mid' | 'B'

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
  c1_band: AxisBand
  c3_band: AxisBand
  s1_band: AxisBand
  s3_band: AxisBand
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

function bandKey(total: number): AxisBand {
  if (total <= 10) return 'A'
  if (total >= 16) return 'B'
  return 'Mid'
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

// 축별 상세 해석 — 결과 페이지 종합 분석에 노출
export interface AxisDetail {
  title: string
  description: string
  bands: {
    A: { name: string; summary: string; strengths: string[]; cautions: string[] }
    Mid: { name: string; summary: string; strengths: string[]; cautions: string[] }
    B: { name: string; summary: string; strengths: string[]; cautions: string[] }
  }
}

export const AXIS_DETAILS: Record<PbdAxis, AxisDetail> = {
  C1: {
    title: '사고방식',
    description: '정보를 처리하고 판단에 이르는 내적 속도와 방식',
    bands: {
      A: {
        name: '직관적',
        summary: '큰 그림과 맥락을 먼저 파악하고, 윤곽이 잡히면 실행하면서 세부를 채워가는 스타일.',
        strengths: ['전체 흐름을 빠르게 포착', '불확실한 상황에서 방향 제시', '실행 속도'],
        cautions: ['세부 검증 누락 위험', '근거 정리 보강 필요'],
      },
      Mid: {
        name: '맥락 전환형',
        summary: '상황에 따라 직관과 숙고를 유연하게 전환. 속도와 정합성 모두 어느 정도 갖춤.',
        strengths: ['업무 종류에 따른 적응력', '팀 내 가교 역할'],
        cautions: ['특정 영역의 깊이는 시간 필요'],
      },
      B: {
        name: '숙고적',
        summary: '준비와 정합성을 중시하며, 세부까지 정리된 후 실행에 들어가는 스타일.',
        strengths: ['체계적 분석과 정확성', '리스크 사전 차단', '구조 설계'],
        cautions: ['결정 속도가 느려질 수 있음', '실행 단계에서의 과도한 검토'],
      },
    },
  },
  C3: {
    title: '추론방식',
    description: '새로운 문제와 변화에 대한 탐색 방향과 리스크 수용 방식',
    bands: {
      A: {
        name: '귀납적',
        summary: '다양한 가능성을 시험하며 답을 찾는 탐색형. 새로운 시도와 실험을 통해 학습.',
        strengths: ['열린 사고', '창의적 대안 도출', '시행착오 수용'],
        cautions: ['검증 절차 가속 필요', '재현 가능한 표준화에는 도움 필요'],
      },
      Mid: {
        name: '균형',
        summary: '탐색과 검증 사이를 상황에 맞게 오가는 균형형.',
        strengths: ['신규/기존 업무 모두 무리없이 수행'],
        cautions: ['뚜렷한 강점은 협업 맥락에서 드러남'],
      },
      B: {
        name: '연역적',
        summary: '명확한 원칙과 검증된 방식에서 출발해 안정적인 성과를 만드는 스타일.',
        strengths: ['논리적 일관성', '예측 가능한 산출', '체계 보존'],
        cautions: ['새로운 가능성 탐색 시 동기 부여 필요'],
      },
    },
  },
  S1: {
    title: '통제방식',
    description: '목표·규칙·의사결정에서 자율과 규범 중 무엇을 기준으로 삼는지',
    bands: {
      A: {
        name: '내적통제',
        summary: '스스로 의미를 부여한 목표에 몰입하며, 자율 환경에서 강점을 발휘.',
        strengths: ['주도성과 책임감', '재량 환경에서 높은 몰입'],
        cautions: ['규범 준수와 절차 합의 강조 필요', '독단으로 비춰지지 않게 커뮤니케이션 보강'],
      },
      Mid: {
        name: '자율·규범 전환형',
        summary: '상황에 따라 규범과 자율을 유연하게 적용 가능.',
        strengths: ['대부분의 환경에서 적응 가능', '리더와 실무 양쪽 협업'],
        cautions: ['뚜렷한 정체성 표현이 약할 수 있음'],
      },
      B: {
        name: '외적통제',
        summary: '명확한 가이드와 절차 속에서 안정적으로 결과를 만들어내는 스타일.',
        strengths: ['절차 준수', '신뢰성 있는 실행', '리스크 관리'],
        cautions: ['가이드가 모호할 때 진입 속도 저하 가능'],
      },
    },
  },
  S3: {
    title: '역할방식',
    description: '성과·협업·책임에서 개인과 집단 중 어디에 무게를 두는지',
    bands: {
      A: {
        name: '개인형',
        summary: '본인의 기여가 명확히 드러나는 환경에서 몰입이 극대화되는 스타일.',
        strengths: ['전문성·완결성', '독립 과업 수행', '개별 책임 명확화'],
        cautions: ['팀 시너지/협업 동기 보강 필요'],
      },
      Mid: {
        name: '개인·집단 전환형',
        summary: '독립 과업과 협업 모두 무리 없이 소화 가능.',
        strengths: ['멀티 롤 적응', '팀 내 균형추 역할'],
        cautions: ['리더십이나 전문가형으로의 분화 시점 관찰 필요'],
      },
      B: {
        name: '집단형',
        summary: '팀 공동 목표와 협업 시너지에서 동기를 얻는 스타일.',
        strengths: ['협업 촉진', '팀 합의 형성', '공동 책임 인식'],
        cautions: ['개별 기여의 가시화·평가 보강 필요'],
      },
    },
  },
}

// 도메인 (성과 도메인 × 직무 매핑) — 상세 해석 + 면접 질문 + 생애주기 가이드
export interface DomainProfile {
  name: string
  summary: string
  detail: string
  interview_questions: string[]
  probation_guide: string
  career_path: string
}

export const DOMAIN_PROFILES: Record<string, DomainProfile> = {
  '직관적×귀납적': {
    name: '발상형 (Idea Generator)',
    summary: '빠른 가능성 포착과 아이디어 확장에 강점',
    detail: '새로운 가능성을 빠르게 포착하고 다양한 시도를 통해 학습합니다. 정해진 답이 없는 영역에서 가설을 만들어 검증하는 데 능숙하며, 변화·실험·창의가 요구되는 직무에서 두각을 보입니다. 다만 체계화와 정합성 보완이 필요할 수 있습니다.',
    interview_questions: [
      '최근 6개월 안에 본인이 먼저 제안해서 시작한 일이 있다면 어떤 과정을 거쳤는지 들려주세요.',
      '아이디어가 실제 결과로 이어지지 못했던 경험이 있다면 왜 그랬다고 보시나요?',
      '여러 가능성 중에서 한 가지를 선택해야 할 때 본인의 판단 기준은 무엇인가요?',
      '검증이 부족한 상태로 실행에 옮겨야 했던 경험이 있다면 어떻게 리스크를 관리했나요?',
    ],
    probation_guide: '초반에는 다양한 가설을 던지게 두고, 1~2개를 골라 작은 실험으로 검증하는 사이클을 설계해 주세요. 정량 지표를 함께 잡아주면 본인의 직관이 결과로 이어지는 패턴을 학습하면서 빠르게 성장합니다.',
    career_path: '신사업/AI콘텐츠/마케팅 기획 등 0→1 영역에서 강점이 드러납니다. 정규직 전환 시 "확장 가능한 가설을 얼마나 실제 성과로 연결시켰는가"를 평가 지표로 잡아두면 좋습니다.',
  },
  '직관적×연역적': {
    name: '실행형 (Doer)',
    summary: '즉각적 현장 대응과 속도 기반 실행에 강점',
    detail: '명확한 방향이 정해지면 빠르게 움직이고 현장 변수에 즉각 반응합니다. 고객·실행 접점에서 강점을 보이며, 정해진 목표를 실제 결과로 연결하는 속도가 빠릅니다. 다만 새 가능성 탐색이나 깊은 분석에는 의식적 시간 투자가 필요합니다.',
    interview_questions: [
      '예상치 못한 상황에서 즉시 판단해 일을 풀어낸 사례를 들려주세요.',
      '명확한 가이드가 있을 때와 없을 때, 어떻게 다르게 일하는지 비교해 주세요.',
      '실행 과정에서 빠뜨리기 쉬운 검토 항목을 본인은 어떻게 챙기시나요?',
      '본인이 가장 빨리 결과를 만든 업무는 무엇이었고, 그 비결은 무엇이었나요?',
    ],
    probation_guide: '명확한 목표와 SOP를 먼저 제공하고, 일정과 책임 범위를 분명히 해주면 빠르게 가시 성과를 만듭니다. 동시에 "왜 이 방식인가" 를 정기적으로 함께 짚어 깊이 있는 의사결정 근육을 길러주세요.',
    career_path: 'AE·CS/CX·해외사업·MD 등 실행 밀도가 높은 영역에서 강점이 드러납니다. 정규직 전환 시 "기준 대비 처리 속도와 품질, 변수 발생 시 회복 능력"을 핵심 지표로 보세요.',
  },
  '숙고적×귀납적': {
    name: '발명형 (Designer)',
    summary: '깊은 탐색과 창의적 구조 설계에 강점',
    detail: '문제의 본질까지 파고들어 새로운 구조를 만들어내는 데 강점이 있습니다. 충분한 정보가 모이면 독창적이면서도 정합성 있는 결과물을 만듭니다. 다만 결정·실행 속도는 의식적 관리가 필요할 수 있습니다.',
    interview_questions: [
      '오랜 시간 고민해서 직접 만들어낸 결과물이 있다면 어떤 과정이었는지 설명해 주세요.',
      '아이디어를 정리할 때 어떤 도구나 절차를 사용하시나요?',
      '본인 작품/결과물에 대한 피드백을 받았을 때 받아들이는 방식은 어떤가요?',
      '제한된 시간에 결정을 내려야 했던 경우 본인의 결정 기준은 무엇이었나요?',
    ],
    probation_guide: '초반에는 작은 단위로 결과물을 자주 공유하게 해서 "장기 침잠"을 방지해 주세요. 본인의 깊이를 살리되 협업 사이클이 너무 길어지지 않도록 페어 리뷰를 정례화하면 좋습니다.',
    career_path: '디자인·AI콘텐츠·개발·BM 등 구조 설계 영역에서 강점이 드러납니다. 정규직 전환 시 "독자 산출물의 완성도 + 사이클 타임 단축 추이" 두 지표를 함께 보세요.',
  },
  '숙고적×연역적': {
    name: '설계형 (Architect)',
    summary: '논리적 정합성과 체계 구축에 강점',
    detail: '원칙·데이터·검증된 방식을 기반으로 안정적인 시스템을 만듭니다. 리스크를 미리 파악하고 예측 가능한 산출을 만들어내는 데 능숙합니다. 다만 0→1 영역에서는 다른 유형과의 협업이 효과적입니다.',
    interview_questions: [
      '체계가 없던 업무를 정리하거나 표준화한 경험이 있다면 어떤 단계를 밟았나요?',
      '근거가 충분하지 않은 의사결정 앞에서 본인은 어떻게 행동하시나요?',
      '효율적이지 않은 절차를 발견했을 때, 어떻게 개선 제안을 했나요?',
      '본인이 만든 산출물이 다른 사람에게 이관되었을 때 어떻게 인수인계 했나요?',
    ],
    probation_guide: '초반에는 명확한 목표·데이터·평가 기준을 제공하면 안정적인 산출을 시작합니다. 본인의 강점인 "체계화"를 회사 자산으로 남기도록 SOP/문서화 결과물을 정기 평가 지표에 포함해 주세요.',
    career_path: '재무회계·개발·인사총무·경영지원 등 시스템 운영 영역에서 강점이 드러납니다. 정규직 전환 시 "본인이 정리해낸 시스템 자산의 재활용성 + 협업 가독성"을 평가 지표로 보세요.',
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

  // ICI: 각 축의 역방향 점수(역산 후)와 정방향 4문항 평균의 절댓값 차이를 합산해 100점 환산
  // 보정 사유: 동일 축 안에서도 "측면에 따라 다르게 응답"하는 양가성은 정직한 사람에게도 자연스러움.
  // → 차이가 0.5 이내는 노이즈로 보고 패널티 0, 분모도 28로 완화하여 자연 변동에 관대하게 산정.
  let deviation = 0
  for (const axis of ['C1', 'C3', 'S1', 'S3'] as PbdAxis[]) {
    const fwd = PBD_QUESTIONS.filter(q => q.axis === axis && !q.reversed)
    const rev = PBD_QUESTIONS.filter(q => q.axis === axis && q.reversed)
    if (fwd.length === 0 || rev.length === 0) continue
    const fwdAvg = fwd.reduce((s, q) => s + (answers[q.id] || 3), 0) / fwd.length
    const revRaw = rev.reduce((s, q) => s + (answers[q.id] || 3), 0) / rev.length
    const revAdjusted = 6 - revRaw // 역산 후 정방향 기준 값
    const rawDiff = Math.abs(fwdAvg - revAdjusted)
    // 0.5 이내 차이는 양가적 응답에 의한 자연 변동으로 간주
    deviation += Math.max(0, rawDiff - 0.5)
  }
  // 4축 × 최대 차이 3.5 ≒ 14 가 이론적 최대, 분모는 14 의 2배로 잡아 일반 응답자에게 관대하게 산정
  const ici = Math.max(0, Math.min(100, Math.round(100 - (deviation / 14) * 100)))

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
    c1_band: bandKey(C1), c3_band: bandKey(C3), s1_band: bandKey(S1), s3_band: bandKey(S3),
    domain: key,
    domain_strength: domainInfo.strength,
    fit_jobs: domainInfo.fit,
    check_jobs: domainInfo.check,
  }
}
