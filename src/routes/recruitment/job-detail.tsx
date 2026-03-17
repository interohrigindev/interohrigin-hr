import { useParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

export default function RecruitmentJobDetail() {
  const { id } = useParams()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">채용공고 상세</h1>
      <Card>
        <CardHeader>
          <CardTitle>공고 ID: {id}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">채용공고 상세 페이지가 준비 중입니다.</p>
        </CardContent>
      </Card>
    </div>
  )
}
