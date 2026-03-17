import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

export default function RecruitmentDashboard() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">채용 대시보드</h1>
      <Card>
        <CardHeader>
          <CardTitle>채용 현황</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">채용 대시보드가 준비 중입니다.</p>
        </CardContent>
      </Card>
    </div>
  )
}
