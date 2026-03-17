import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent } from '@/components/ui/Card'
import { supabase } from '@/lib/supabase'
import logoSvg from '@/assets/logo.svg'
import { Mail, KeyRound, ArrowLeft, CheckCircle } from 'lucide-react'

type PageMode = 'login' | 'forgot' | 'forgot-sent'

export default function Login() {
  const { user, loading, signIn } = useAuth()
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [mode, setMode] = useState<PageMode>('login')
  const [resetEmail, setResetEmail] = useState('')

  if (!loading && user) {
    return <Navigate to="/" replace />
  }

  function isEmail(value: string) {
    return value.includes('@')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    let loginEmail = identifier.trim()

    // 사원번호인 경우 이메일 조회
    if (!isEmail(loginEmail)) {
      try {
        const { data, error: rpcErr } = await supabase.rpc('get_email_by_employee_number', {
          p_employee_number: loginEmail,
        })
        if (rpcErr || !data) {
          setError('해당 사원번호를 찾을 수 없습니다.')
          setSubmitting(false)
          return
        }
        loginEmail = data as string
      } catch {
        setError('사원번호 조회 실패')
        setSubmitting(false)
        return
      }
    }

    const result = await signIn(loginEmail, password)
    if (result.error) {
      setError(
        result.error.includes('Invalid login')
          ? '이메일/사원번호 또는 비밀번호가 올바르지 않습니다.'
          : result.error
      )
      setSubmitting(false)
    } else {
      navigate('/')
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const email = resetEmail.trim()
    if (!email || !isEmail(email)) {
      setError('유효한 이메일 주소를 입력하세요.')
      return
    }

    setSubmitting(true)
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (resetErr) {
      setError('메일 발송 실패: ' + resetErr.message)
    } else {
      setMode('forgot-sent')
    }
    setSubmitting(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4">
      <div className="w-full max-w-sm">
        {/* 타이틀 */}
        <div className="mb-8 text-center">
          <img src={logoSvg} alt="InterOhrigin" className="mx-auto mb-4 h-14 w-14" />
          <h1 className="text-2xl font-bold text-gray-900">인터오리진</h1>
          <p className="mt-1 text-sm text-gray-500">HR Platform</p>
        </div>

        {/* ─── 로그인 ─── */}
        {mode === 'login' && (
          <>
            <Card>
              <CardContent className="pt-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <Input
                    id="identifier"
                    label="이메일 또는 사원번호"
                    type="text"
                    placeholder="name@interohrigin.com 또는 IO-2026-001"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    autoComplete="username"
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

            <div className="mt-5 text-center space-y-2">
              <button
                onClick={() => { setMode('forgot'); setError('') }}
                className="text-sm text-brand-600 hover:text-brand-700 hover:underline transition-colors"
              >
                <KeyRound className="h-3.5 w-3.5 inline mr-1" />
                비밀번호 설정 / 재설정
              </button>
              <p className="text-xs text-gray-400">
                계정이 없으신가요? 관리자에게 문의하세요.
              </p>
            </div>
          </>
        )}

        {/* ─── 비밀번호 재설정 요청 ─── */}
        {mode === 'forgot' && (
          <>
            <Card>
              <CardContent className="pt-6">
                <div className="mb-4">
                  <button
                    onClick={() => { setMode('login'); setError('') }}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" /> 로그인으로 돌아가기
                  </button>
                </div>

                <div className="text-center mb-5">
                  <Mail className="h-10 w-10 text-brand-500 mx-auto mb-2" />
                  <h2 className="text-lg font-bold text-gray-900">비밀번호 설정</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    등록된 이메일로 비밀번호 설정 링크를 보내드립니다.
                  </p>
                </div>

                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <Input
                    id="reset-email"
                    label="이메일"
                    type="email"
                    placeholder="name@interohrigin.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                  />

                  {error && (
                    <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                      {error}
                    </div>
                  )}

                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? '발송 중...' : '비밀번호 설정 메일 발송'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </>
        )}

        {/* ─── 메일 발송 완료 ─── */}
        {mode === 'forgot-sent' && (
          <Card>
            <CardContent className="pt-6 text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
              <h2 className="text-lg font-bold text-gray-900 mb-2">메일이 발송되었습니다</h2>
              <p className="text-sm text-gray-500 mb-1">
                <strong>{resetEmail}</strong>으로
              </p>
              <p className="text-sm text-gray-500 mb-5">
                비밀번호 설정 링크를 보냈습니다.<br />
                메일함을 확인해주세요.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => { setMode('login'); setError('') }}
              >
                로그인으로 돌아가기
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
