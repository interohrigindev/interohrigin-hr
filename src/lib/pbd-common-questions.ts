/**
 * PBD 사전질의서 Part 1 — 공통 질문 (Q1~Q9) 정의.
 * survey-test 입력 화면과 결과 표시 화면(PbdResultView, survey-test-results)에서
 * 동일한 질문 텍스트를 사용하도록 단일 소스로 분리.
 */

export type CommonQ =
  | {
      id: string
      label: string
      type: 'choice'
      options: string[]
      required?: boolean
      help?: string
      etc_when?: string[]
      etc_placeholder?: string
    }
  | {
      id: string
      label: string
      type: 'text'
      multiline?: boolean
      placeholder?: string
      required?: boolean
      help?: string
    }

export const COMMON_QUESTIONS: CommonQ[] = [
  {
    id: 'Q1',
    label: '채용공고를 어디서 보셨습니까?',
    type: 'choice',
    required: true,
    options: ['사람인', '잡코리아', '링크드인', '인스타그램 / SNS', '지인 추천', '기타'],
    etc_when: ['기타'],
    etc_placeholder: '직접 입력해주세요',
  },
  {
    id: 'Q2',
    label: '귀하가 지원한 분야와 예상 업무를 간략히 기술해주세요',
    type: 'text',
    multiline: true,
    required: true,
    help: '지원 직무에서 담당할 것으로 예상하는 업무를 구체적으로 작성',
    placeholder: '예) 콘텐츠 마케팅 — SNS 운영, 카피라이팅, 캠페인 기획 등',
  },
  {
    id: 'Q3',
    label: '전직장 담당업무 / 퇴사일 / 퇴사사유 / 직전연봉을 작성해주세요',
    type: 'text',
    multiline: true,
    required: true,
    help: '신입의 경우 아르바이트 및 프리랜서 활동 포함',
    placeholder: '예) ○○회사 마케팅팀 / 2024.12 / 개인 사유 / 3,200만원',
  },
  {
    id: 'Q4',
    label: '채용 확정 시 출근 가능일자',
    type: 'text',
    required: true,
    help: '예) 협의 후 즉시 / 2025.07.01',
    placeholder: '협의 후 즉시 또는 YYYY.MM.DD',
  },
  {
    id: 'Q5',
    label: '채용 확정 시 희망 연봉',
    type: 'text',
    required: true,
    help: '수습 급여는 면접 시 협의',
    placeholder: '예) 3,500만원',
  },
  {
    id: 'Q6',
    label: '필수서류 제출이 가능하신가요?',
    type: 'choice',
    required: true,
    help: '원천징수영수증, 경력증명서, 사업자등록여부확인서, 범죄경력회보서',
    options: ['가능합니다', '일부 서류는 준비에 시간이 필요합니다', '제출이 어려운 서류가 있습니다'],
    etc_when: ['일부 서류는 준비에 시간이 필요합니다', '제출이 어려운 서류가 있습니다'],
    etc_placeholder: '어떤 서류인지 적어주세요 (예: 범죄경력회보서)',
  },
  {
    id: 'Q7',
    label: '경업금지 조항에 동의하십니까?',
    type: 'choice',
    required: true,
    help: '업무기간 내 아르바이트, 프리랜서, 이중취업 등 일체의 경업 금지',
    options: ['동의합니다', '동의하기 어렵습니다'],
  },
  {
    id: 'Q8',
    label: '운전면허 보유 및 운전 능숙도',
    type: 'choice',
    required: true,
    options: [
      '면허 있음 — 능숙하게 운전합니다',
      '면허 있음 — 운전이 익숙하지 않습니다 (장롱면허)',
      '운전면허 없음',
    ],
  },
  {
    id: 'Q9',
    label: '면접 녹화·녹음 동의',
    type: 'choice',
    required: true,
    help: '화상면접 시 인사 평가 목적으로만 사용되며 평가 완료 후 즉시 폐기됩니다',
    options: ['충분히 이해하고 동의합니다', '동의하지 않습니다'],
  },
]

/** Q번호 → 질문 라벨 매핑 (결과 화면에서 빠른 조회용) */
export const COMMON_QUESTION_LABELS: Record<string, string> = COMMON_QUESTIONS.reduce(
  (acc, q) => {
    acc[q.id] = q.label
    return acc
  },
  {} as Record<string, string>,
)
