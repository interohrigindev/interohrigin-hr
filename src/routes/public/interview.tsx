/**
 * /interview/:token — 기존 지원자 셀프 녹화 페이지 (비활성화)
 *
 * 면접 녹화는 이제 관리자가 Google Meet 녹화 파일을 업로드하는 방식으로 변경됨.
 * 기존 토큰 링크로 접근한 지원자에게 안내 메시지를 표시.
 */
import { AlertTriangle } from 'lucide-react'

export default function PublicInterview() {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl p-8 max-w-md text-center">
        <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto mb-3" />
        <h1 className="text-xl font-bold text-white mb-2">안내</h1>
        <p className="text-gray-400 text-sm leading-relaxed">
          면접은 담당자가 안내한 Google Meet 링크를 통해 진행됩니다.
          <br />
          별도 녹화 페이지는 사용되지 않습니다.
          <br /><br />
          면접 일정 관련 문의는 담당자에게 연락해주세요.
        </p>
      </div>
    </div>
  )
}
