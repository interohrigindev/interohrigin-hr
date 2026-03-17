import { useParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

export default function CandidateReport() {
  const { id } = useParams()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">지원자 리포트</h1>
      <Card>
        <CardHeader>
          <CardTitle>지원자 ID: {id}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">지원자 분석 리포트가 준비 중입니다.</p>
        </CardContent>
      </Card>
    </div>
  )
}
