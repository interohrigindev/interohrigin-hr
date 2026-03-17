import { useParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

export default function FaceToFaceEval() {
  const { candidateId } = useParams()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">대면 면접 평가</h1>
      <Card>
        <CardHeader>
          <CardTitle>지원자 ID: {candidateId}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">대면 면접 평가 폼이 준비 중입니다.</p>
        </CardContent>
      </Card>
    </div>
  )
}
