import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

export default function PersonalityAnalysis() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">사주/MBTI 분석</h1>
      <Card>
        <CardHeader>
          <CardTitle>성향 분석</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">사주/MBTI 분석 페이지가 준비 중입니다.</p>
        </CardContent>
      </Card>
    </div>
  )
}
