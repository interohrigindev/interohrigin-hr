import { useParams, useSearchParams } from 'react-router-dom'

export default function PublicApply() {
  const { postingId } = useParams()
  const [searchParams] = useSearchParams()
  const source = searchParams.get('source') || 'direct'

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">지원서 제출</h1>
        <p className="text-gray-500 mb-6">공고 ID: {postingId} | 유입경로: {source}</p>
        <p className="text-gray-400">지원서 제출 페이지가 준비 중입니다.</p>
      </div>
    </div>
  )
}
