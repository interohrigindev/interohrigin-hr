import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

export default function SpecialNotes() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">특이사항 관리</h1>
      <Card>
        <CardHeader>
          <CardTitle>특이사항 기록</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">특이사항 관리 페이지가 준비 중입니다.</p>
        </CardContent>
      </Card>
    </div>
  )
}
