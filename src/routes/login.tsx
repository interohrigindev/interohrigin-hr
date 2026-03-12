import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent } from '@/components/ui/Card'
import { MethodologyFooter } from '@/components/layout/MethodologyFooter'
import logoSvg from '@/assets/logo.svg'

export default function Login() {
  const { user, loading, signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 이미 로그인 상태면 자동 리다이렉트
  if (!loading && user) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    const result = await signIn(email, password)
    if (result.error) {
      setError(
        result.error.includes('Invalid login')
          ? '이메일 또는 비밀번호가 올바르지 않습니다.'
          : result.error
      )
      setSubmitting(false)
    } else {
      navigate('/')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4">
      <div className="w-full max-w-sm">
        {/* 타이틀 */}
        <div className="mb-8 text-center">
          <img src={logoSvg} alt="InterOhrigin" className="mx-auto mb-4 h-14 w-14" />
          <h1 className="text-2xl font-bold text-gray-900">
            인터오리진
          </h1>
          <p className="mt-1 text-sm text-gray-500">HR Evaluation System</p>
        </div>

        {/* 로그인 카드 */}
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                id="email"
                label="이메일"
                type="email"
                placeholder="name@interohrigin.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
              <Input
                id="password"
                label="비밀번호"
                type="password"
                placeholder="비밀번호를 입력하세요"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />

              {error && (
                <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={submitting || loading}>
                {submitting ? '로그인 중...' : '로그인'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-gray-400">
          계정이 없으신가요? 관리자에게 문의하세요.
        </p>

        <MethodologyFooter mode="expanded" />
      </div>
    </div>
  )
}
