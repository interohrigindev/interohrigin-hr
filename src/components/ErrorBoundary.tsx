/**
 * 전역 React Error Boundary
 *  - 자식 컴포넌트의 렌더 에러를 캐치해 자동 보고
 *  - 사용자에게는 깔끔한 에러 화면 표시 (새로고침 안내)
 */
import { Component, type ReactNode, type ErrorInfo } from 'react'
import { reportError } from '@/lib/error-collector'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  message: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError({
      errorType: 'react_error',
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack || undefined,
      severity: 'critical',
    })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-6 text-center">
            <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle className="h-7 w-7 text-red-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">화면을 표시할 수 없습니다</h2>
            <p className="text-sm text-gray-500 mb-4">
              일시적인 오류가 발생했습니다. 새로고침 후 다시 시도해 주세요.
            </p>
            <p className="text-[11px] text-gray-400 bg-gray-50 rounded p-2 mb-4 break-all">
              {this.state.message}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              새로고침
            </button>
            <p className="text-[10px] text-gray-400 mt-3">
              관리자에게 자동으로 보고되었습니다.
            </p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
