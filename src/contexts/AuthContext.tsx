import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Employee } from '@/types/database'

export interface AuthContextType {
  user: User | null
  profile: Employee | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Employee | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 초기 세션 확인
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // 인증 상태 변경 리스너
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          fetchProfile(session.user.id)
          // 로그인 시 자동 출근 기록
          if (event === 'SIGNED_IN') {
            recordClockIn(session.user.id)
          }
        } else {
          setProfile(null)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // 로그인 시 자동 출근 기록 (당일 기록이 없으면 생성)
  async function recordClockIn(userId: string) {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const { data: existing } = await supabase
        .from('attendance_records')
        .select('id')
        .eq('employee_id', userId)
        .eq('date', today)
        .maybeSingle()

      if (!existing) {
        await supabase.from('attendance_records').insert({
          employee_id: userId,
          date: today,
          clock_in: new Date().toISOString(),
          clock_in_method: 'web_login',
          status: 'normal',
        })
        console.log('[Attendance] 출근 기록 생성:', today)
      }
    } catch (err) {
      console.warn('[Attendance] 출근 기록 실패:', err)
    }
  }

  async function fetchProfile(userId: string) {
    const { data, error } = await supabase
      .from('employees')
      .select('id, name, email, department_id, role, is_active, phone, address, birth_date, avatar_url, created_at, updated_at')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('직원 프로필 조회 실패:', error.message)
      setProfile(null)
    } else {
      setProfile(data as Employee)
    }
    setLoading(false)
  }

  async function signIn(email: string, password: string) {
    console.log('[Auth] signInWithPassword 호출:', email)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      console.error('[Auth] signIn 에러:', error.message, error.status, error)
      return { error: error.message }
    }
    console.log('[Auth] signIn 성공, user:', data.user?.id)
    return { error: null }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth는 AuthProvider 내부에서만 사용할 수 있습니다')
  }
  return context
}
