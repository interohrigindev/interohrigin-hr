// 0514: 사전질의서 v2.0 — 결과 공개 공유 페이지 (로그인 불필요)
// 관리자 페이지를 그대로 재사용하며 publicMode 로 권한 체크/삭제 버튼만 우회

import SurveyTestResults from '@/routes/admin/survey-test-results'

export default function PublicSurveyTestResults() {
  return <SurveyTestResults publicMode />
}
