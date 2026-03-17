import { useParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

export default function EmployeeProfile() {
  const { id } = useParams()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">직원 통합 프로필</h1>
      <Card>
        <CardHeader>
          <CardTitle>직원 ID: {id}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">직원 통합 프로필 페이지가 준비 중입니다.</p>
        </CardContent>
      </Card>
    </div>
  )
}
