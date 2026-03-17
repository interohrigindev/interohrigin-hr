import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent } from '@/components/ui/Card'
import { supabase } from '@/lib/supabase'
import logoSvg from '@/assets/logo.svg'
import { CheckCircle, KeyRound } from 'lucide-react'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    // Supabase는 리다이렉트 시 URL fragment에 access_token을 포함
    // onAuthStateChange에서 PASSWORD_RECOVERY 이벤트를 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true)
      }
    })

    // 이미 세션이 있을 수도 있음
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.')
      return
    }
    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.')
      return
    }

    setSubmitting(true)
    const { error: updateErr } = await supabase.auth.updateUser({ password })

    if (updateErr) {
      setError('비밀번호 변경 실패: ' + updateErr.message)
    } else {
      setDone(true)
    }
    setSubmitting(false)
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <img src={logoSvg} alt="InterOhrigin" className="mx-auto mb-4 h-14 w-14" />
          </div>
          <Card>
            <CardContent className="pt-6 text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
              <h2 className="text-lg font-bold text-gray-900 mb-2">비밀번호가 설정되었습니다</h2>
              <p className="text-sm text-gray-500 mb-5">
                새 비밀번호로 로그인할 수 있습니다.
              </p>
              <Button className="w-full" onClick={() => navigate('/login')}>
                로그인하기
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src={logoSvg} alt="InterOhrigin" className="mx-auto mb-4 h-14 w-14" />
          <h1 className="text-2xl font-bold text-gray-900">인터오리진</h1>
          <p className="mt-1 text-sm text-gray-500">HR Platform</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center mb-5">
              <KeyRound className="h-10 w-10 text-brand-500 mx-auto mb-2" />
              <h2 className="text-lg font-bold text-gray-900">비밀번호 설정</h2>
              <p className="text-sm text-gray-500 mt-1">새 비밀번호를 입력해주세요.</p>
            </div>

            {!sessionReady ? (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500">인증 확인 중...</p>
                <p className="text-xs text-gray-400 mt-2">
                  이 페이지는 이메일의 비밀번호 설정 링크를 통해 접근해야 합니다.
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => navigate('/login')}
                >
                  로그인으로 돌아가기
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  id="new-password"
                  label="새 비밀번호"
                  type="password"
                  placeholder="6자 이상 입력"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <Input
                  id="confirm-password"
                  label="비밀번호 확인"
                  type="password"
                  placeholder="비밀번호를 다시 입력"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />

                {error && (
                  <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? '변경 중...' : '비밀번호 설정'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
