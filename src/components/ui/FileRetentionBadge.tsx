import { Clock, Download, AlertTriangle } from 'lucide-react'

interface FileRetentionBadgeProps {
  /** 파일 생성일 (ISO 문자열) */
  createdAt: string
  /** 보관 기간 (일) */
  retentionDays: number
  /** 다운로드 URL */
  downloadUrl?: string
  /** 파일명 (다운로드 시 사용) */
  fileName?: string
  /** 컴팩트 모드 (한줄) */
  compact?: boolean
}

/**
 * 파일 보관 기한 안내 배지 + 다운로드 버튼
 * 모든 Storage 파일에 공통 적용
 */
export function FileRetentionBadge({
  createdAt,
  retentionDays,
  downloadUrl,
  fileName,
  compact = false,
}: FileRetentionBadgeProps) {
  const created = new Date(createdAt)
  const expiryDate = new Date(created.getTime() + retentionDays * 24 * 60 * 60 * 1000)
  const now = new Date()
  const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  const isExpiringSoon = daysLeft <= 7 && daysLeft > 0
  const isExpired = daysLeft <= 0

  const expiryStr = expiryDate.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  async function handleDownload() {
    if (!downloadUrl) return
    try {
      const response = await fetch(downloadUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName || 'download'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch {
      window.open(downloadUrl, '_blank')
    }
  }

  if (isExpired) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-500">
        <AlertTriangle className="h-3 w-3" />
        보관 기간 만료
      </span>
    )
  }

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs ${
          isExpiringSoon ? 'text-amber-600 font-medium' : 'text-gray-400'
        }`}
      >
        <Clock className="h-3 w-3" />
        {isExpiringSoon ? `${daysLeft}일 후 삭제` : `${expiryStr}까지`}
        {downloadUrl && (
          <button
            onClick={(e) => { e.stopPropagation(); handleDownload() }}
            className="ml-1 text-blue-500 hover:text-blue-700"
            title="다운로드"
          >
            <Download className="h-3 w-3" />
          </button>
        )}
      </span>
    )
  }

  return (
    <div
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs ${
        isExpiringSoon
          ? 'bg-amber-50 border border-amber-200 text-amber-700'
          : 'bg-gray-50 border border-gray-200 text-gray-500'
      }`}
    >
      {isExpiringSoon ? (
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
      ) : (
        <Clock className="h-3.5 w-3.5 text-gray-400 shrink-0" />
      )}
      <span>
        {isExpiringSoon
          ? `${daysLeft}일 후 자동 삭제됩니다. 필요시 다운로드하세요.`
          : `${expiryStr}까지 보관 (${daysLeft}일 남음)`}
      </span>
      {downloadUrl && (
        <button
          onClick={(e) => { e.stopPropagation(); handleDownload() }}
          className="ml-auto flex items-center gap-1 px-2 py-0.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-xs font-medium transition-colors shrink-0"
        >
          <Download className="h-3 w-3" />
          다운로드
        </button>
      )}
    </div>
  )
}

/** 업로드 시 토스트 메시지용 보관 안내 텍스트 */
export function getRetentionMessage(bucketId: string): string {
  const policies: Record<string, string> = {
    'interview-recordings': '면접 녹화 파일은 2주간 보관됩니다. 필요시 다운로드해주세요.',
    'chat-attachments': '첨부파일은 6개월간 보관됩니다.',
    'resumes': '이력서는 1년간 보관됩니다.',
    'meeting-recordings': '회의 녹음은 1개월간 보관됩니다.',
  }
  return policies[bucketId] || ''
}

/** 버킷별 보관 일수 */
export function getRetentionDays(bucketId: string): number {
  const days: Record<string, number> = {
    'interview-recordings': 14,
    'chat-attachments': 180,
    'resumes': 365,
    'meeting-recordings': 30,
    'avatars': 99999,
  }
  return days[bucketId] || 365
}
