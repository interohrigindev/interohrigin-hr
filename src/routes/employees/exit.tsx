import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

export default function ExitManage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">퇴사 관리</h1>
      <Card>
        <CardHeader>
          <CardTitle>퇴사 현황</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">퇴사 관리 페이지가 준비 중입니다.</p>
        </CardContent>
      </Card>
    </div>
  )
}
