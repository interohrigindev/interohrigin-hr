import { useParams } from 'react-router-dom'

export default function PublicExitSurvey() {
  const { token } = useParams()

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">퇴사 설문</h1>
        <p className="text-gray-500 mb-6">토큰: {token}</p>
        <p className="text-gray-400">퇴사 설문 페이지가 준비 중입니다.</p>
      </div>
    </div>
  )
}
