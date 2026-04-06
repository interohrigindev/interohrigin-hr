# CONVENTIONS — 코딩 컨벤션

## 네이밍 규칙

| 대상 | 규칙 | 예시 |
|------|------|------|
| 컴포넌트 | PascalCase | `LeaveManagement.tsx` |
| 파일 | kebab-case (또는 기존 패턴) | `leave-management.tsx` |
| DB 테이블 | snake_case | `leave_management` |
| 상수 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| 훅 | use + PascalCase | `useMonthlyCheckin` |

## UI 패턴

- **Tailwind CSS** 사용 (별도 CSS 파일 없음)
- **공통 컴포넌트** 재사용: `Button`, `Card`, `Dialog`, `Badge`, `Select`, `Input`, `Textarea`, `Spinner`, `Toast`
  - 위치: `src/components/ui/`
- **반응형 필수** (모바일 우선)
- **한국어 UI**, 날짜 형식: `YYYY.MM.DD`
- **아이콘**: lucide-react 사용

## 코드 패턴

```typescript
// 데이터 로딩: custom hook 패턴
const { data, loading, error, refetch } = useCustomHook()

// Supabase 쿼리: lib/supabase.ts의 클라이언트 사용
import { supabase } from '@/lib/supabase'

// 인증: useAuth() 훅
const { profile, isAdmin, hasRole } = useAuth()

// 토스트 알림
const { toast } = useToast()
toast('메시지', 'success' | 'error')

// 페이지 로딩
if (loading) return <PageSpinner />
```

## 중요 규칙

- 기존 코드 먼저 파악 후 수정
- 기존 패턴/색상/스타일 그대로 따르기
- Supabase Storage는 private 버킷 + Signed URL 사용
- `localStorage`/`sessionStorage` 사용 금지
