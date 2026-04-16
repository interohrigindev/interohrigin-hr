import { useRef, useState, useEffect } from 'react'
import { Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { AVATAR_CATEGORIES, ALL_AVATARS, renderAvatarSvg, extractAvatarKey } from '@/lib/avatar-data'

export const AVATAR_LIST = ALL_AVATARS

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

interface AvatarPickerProps {
  value: string | null
  onChange: (avatarUrl: string) => void
}

function isHttpUrl(value: string | null): boolean {
  return !!value && value.startsWith('http')
}

export function AvatarPicker({ value, onChange }: AvatarPickerProps) {
  const [tab, setTab] = useState<'avatar' | 'photo'>(() =>
    isHttpUrl(value) ? 'photo' : 'avatar'
  )
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    isHttpUrl(value) ? value : null
  )
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    const file = e.target.files?.[0]
    if (!file) return
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('JPG, PNG, WebP, GIF 파일만 업로드할 수 있습니다.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('파일 크기는 2MB 이하여야 합니다.')
      return
    }
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl)
    }
    const blobUrl = URL.createObjectURL(file)
    setPreviewUrl(blobUrl)
    setSelectedFile(file)
  }

  const handleUpload = async () => {
    if (!selectedFile) return
    setUploading(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('로그인이 필요합니다.'); return }

      const timestamp = Date.now()
      const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `employee-photos/${user.id}/${timestamp}-${safeName}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, selectedFile, { upsert: true })

      if (uploadError) { setError(`업로드 실패: ${uploadError.message}`); return }

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(path)

      if (previewUrl && previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(publicUrl)
      setSelectedFile(null)
      onChange(publicUrl)
    } catch {
      setError('업로드 중 오류가 발생했습니다.')
    } finally {
      setUploading(false)
    }
  }

  const selectedKey = extractAvatarKey(value)

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">아바타</label>

      {/* 탭 */}
      <div className="mb-3 flex gap-1 rounded-lg bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => setTab('avatar')}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            tab === 'avatar' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          )}
        >
          아바타 선택
        </button>
        <button
          type="button"
          onClick={() => setTab('photo')}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            tab === 'photo' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          )}
        >
          사진 업로드
        </button>
      </div>

      {/* 아바타 선택 */}
      {tab === 'avatar' && (
        <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
          {AVATAR_CATEGORIES.map(cat => (
            <div key={cat.title}>
              <p className="mb-1.5 text-xs font-semibold text-gray-500">{cat.title}</p>
              <div className="grid grid-cols-3 gap-1.5">
                {cat.avatars.map(avatar => {
                  const isSelected = selectedKey === avatar.key
                  return (
                    <button
                      key={avatar.key}
                      type="button"
                      onClick={() => onChange(`/avatars/${avatar.key}.svg`)}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-1.5 py-1 transition-all',
                        isSelected
                          ? 'ring-2 ring-brand-500 bg-brand-50'
                          : 'hover:bg-gray-50'
                      )}
                    >
                      {renderAvatarSvg(avatar.key, 32)}
                      <span className="text-xs text-gray-700 truncate">{avatar.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 사진 업로드 */}
      {tab === 'photo' && (
        <div className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleFileSelect}
            className="hidden"
          />
          {previewUrl ? (
            <div className="flex flex-col items-center gap-3">
              <div className="h-20 w-20 overflow-hidden rounded-full border-2 border-gray-200">
                <img src={previewUrl} alt="미리보기" className="h-full w-full object-cover" />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                >
                  다른 사진
                </button>
                {selectedFile && (
                  <button
                    type="button"
                    onClick={handleUpload}
                    disabled={uploading}
                    className="rounded-md bg-brand-600 px-3 py-1.5 text-xs text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {uploading ? '업로드 중...' : '이 사진 사용'}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 p-6 text-gray-400 hover:border-gray-400 hover:text-gray-500"
            >
              <Upload className="h-8 w-8" />
              <span className="text-xs">사진 선택 (JPG, PNG, WebP, GIF / 최대 2MB)</span>
            </button>
          )}
          {error && <p className="text-center text-xs text-red-500">{error}</p>}
        </div>
      )}
    </div>
  )
}

/** Resolve avatar URL — 하위 호환용 (기존 코드에서 참조) */
export function resolveAvatarSrc(url: string | null): string | null {
  if (!url) return null
  // 인라인 SVG로 전환했으므로 key만 추출하면 됨
  return url
}
