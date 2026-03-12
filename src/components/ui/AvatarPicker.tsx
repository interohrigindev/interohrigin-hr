import { useRef, useState, useEffect } from 'react'
import { Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

import avatar01 from '@/assets/avatars/avatar-01.svg'
import avatar02 from '@/assets/avatars/avatar-02.svg'
import avatar03 from '@/assets/avatars/avatar-03.svg'
import avatar04 from '@/assets/avatars/avatar-04.svg'
import avatar05 from '@/assets/avatars/avatar-05.svg'
import avatar06 from '@/assets/avatars/avatar-06.svg'
import avatar07 from '@/assets/avatars/avatar-07.svg'
import avatar08 from '@/assets/avatars/avatar-08.svg'
import avatar09 from '@/assets/avatars/avatar-09.svg'
import avatar10 from '@/assets/avatars/avatar-10.svg'
import avatar11 from '@/assets/avatars/avatar-11.svg'
import avatar12 from '@/assets/avatars/avatar-12.svg'
import avatar13 from '@/assets/avatars/avatar-13.svg'
import avatar14 from '@/assets/avatars/avatar-14.svg'
import avatar15 from '@/assets/avatars/avatar-15.svg'
import avatar16 from '@/assets/avatars/avatar-16.svg'
import avatar17 from '@/assets/avatars/avatar-17.svg'
import avatar18 from '@/assets/avatars/avatar-18.svg'
import avatar19 from '@/assets/avatars/avatar-19.svg'
import avatar20 from '@/assets/avatars/avatar-20.svg'
import avatar21 from '@/assets/avatars/avatar-21.svg'
import avatar22 from '@/assets/avatars/avatar-22.svg'
import avatar23 from '@/assets/avatars/avatar-23.svg'
import avatar24 from '@/assets/avatars/avatar-24.svg'
import avatar25 from '@/assets/avatars/avatar-25.svg'
import avatar26 from '@/assets/avatars/avatar-26.svg'
import avatar27 from '@/assets/avatars/avatar-27.svg'
import avatar28 from '@/assets/avatars/avatar-28.svg'
import avatar29 from '@/assets/avatars/avatar-29.svg'
import avatar30 from '@/assets/avatars/avatar-30.svg'
import avatar31 from '@/assets/avatars/avatar-31.svg'
import avatar32 from '@/assets/avatars/avatar-32.svg'
import avatar33 from '@/assets/avatars/avatar-33.svg'
import avatar34 from '@/assets/avatars/avatar-34.svg'
import avatar35 from '@/assets/avatars/avatar-35.svg'
import avatar36 from '@/assets/avatars/avatar-36.svg'

const ZODIAC_AVATARS = [
  { key: 'avatar-01', src: avatar01, label: '쥐' },
  { key: 'avatar-02', src: avatar02, label: '소' },
  { key: 'avatar-03', src: avatar03, label: '호랑이' },
  { key: 'avatar-04', src: avatar04, label: '토끼' },
  { key: 'avatar-05', src: avatar05, label: '용' },
  { key: 'avatar-06', src: avatar06, label: '뱀' },
  { key: 'avatar-07', src: avatar07, label: '말' },
  { key: 'avatar-08', src: avatar08, label: '양' },
  { key: 'avatar-09', src: avatar09, label: '원숭이' },
  { key: 'avatar-10', src: avatar10, label: '닭' },
  { key: 'avatar-11', src: avatar11, label: '개' },
  { key: 'avatar-12', src: avatar12, label: '돼지' },
]

const FOOD_AVATARS = [
  { key: 'avatar-13', src: avatar13, label: '피자' },
  { key: 'avatar-14', src: avatar14, label: '초밥' },
  { key: 'avatar-15', src: avatar15, label: '버거' },
  { key: 'avatar-16', src: avatar16, label: '타코' },
  { key: 'avatar-17', src: avatar17, label: '라멘' },
  { key: 'avatar-18', src: avatar18, label: '케이크' },
  { key: 'avatar-19', src: avatar19, label: '아이스크림' },
  { key: 'avatar-20', src: avatar20, label: '도넛' },
  { key: 'avatar-21', src: avatar21, label: '김밥' },
  { key: 'avatar-22', src: avatar22, label: '크루아상' },
  { key: 'avatar-23', src: avatar23, label: '떡볶이' },
  { key: 'avatar-24', src: avatar24, label: '수박' },
]

const LANDMARK_AVATARS = [
  { key: 'avatar-25', src: avatar25, label: '에펠탑' },
  { key: 'avatar-26', src: avatar26, label: '자유의여신상' },
  { key: 'avatar-27', src: avatar27, label: '빅벤' },
  { key: 'avatar-28', src: avatar28, label: '도쿄타워' },
  { key: 'avatar-29', src: avatar29, label: 'N서울타워' },
  { key: 'avatar-30', src: avatar30, label: '오페라하우스' },
  { key: 'avatar-31', src: avatar31, label: '피사의탑' },
  { key: 'avatar-32', src: avatar32, label: '타지마할' },
  { key: 'avatar-33', src: avatar33, label: '만리장성' },
  { key: 'avatar-34', src: avatar34, label: '콜로세움' },
  { key: 'avatar-35', src: avatar35, label: '부르즈칼리파' },
  { key: 'avatar-36', src: avatar36, label: '피라미드' },
]

export const AVATAR_LIST = [
  ...ZODIAC_AVATARS,
  ...FOOD_AVATARS,
  ...LANDMARK_AVATARS,
]

const CATEGORIES = [
  { title: '12간지', avatars: ZODIAC_AVATARS },
  { title: '음식', avatars: FOOD_AVATARS },
  { title: '랜드마크', avatars: LANDMARK_AVATARS },
]

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

  // Cleanup blob URL on unmount or when preview changes
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

    // Revoke old blob URL
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
      if (!user) {
        setError('로그인이 필요합니다.')
        return
      }

      const timestamp = Date.now()
      const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `employee-photos/${user.id}/${timestamp}-${safeName}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, selectedFile, { upsert: true })

      if (uploadError) {
        setError(`업로드 실패: ${uploadError.message}`)
        return
      }

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(path)

      // Revoke blob URL after successful upload
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl)
      }
      setPreviewUrl(publicUrl)
      setSelectedFile(null)
      onChange(publicUrl)
    } catch {
      setError('업로드 중 오류가 발생했습니다.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">아바타</label>

      {/* Tab buttons */}
      <div className="mb-3 flex gap-1 rounded-lg bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => setTab('avatar')}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            tab === 'avatar'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          아바타 선택
        </button>
        <button
          type="button"
          onClick={() => setTab('photo')}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            tab === 'photo'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          사진 업로드
        </button>
      </div>

      {/* Avatar selection tab */}
      {tab === 'avatar' && (
        <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
          {CATEGORIES.map((cat) => (
            <div key={cat.title}>
              <p className="mb-1.5 text-xs font-semibold text-gray-500">{cat.title}</p>
              <div className="grid grid-cols-6 gap-2">
                {cat.avatars.map((avatar) => {
                  const isSelected = value === `/avatars/${avatar.key}.svg` || value === avatar.src
                  return (
                    <button
                      key={avatar.key}
                      type="button"
                      title={avatar.label}
                      onClick={() => onChange(`/avatars/${avatar.key}.svg`)}
                      className={cn(
                        'rounded-full p-0.5 transition-all',
                        isSelected
                          ? 'ring-2 ring-brand-500 ring-offset-2 scale-110'
                          : 'hover:ring-2 hover:ring-gray-300 hover:ring-offset-1'
                      )}
                    >
                      <img
                        src={avatar.src}
                        alt={avatar.label}
                        className="h-10 w-10 rounded-full"
                      />
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Photo upload tab */}
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
                <img
                  src={previewUrl}
                  alt="미리보기"
                  className="h-full w-full object-cover"
                />
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

          {error && (
            <p className="text-center text-xs text-red-500">{error}</p>
          )}
        </div>
      )}
    </div>
  )
}

/** Resolve avatar URL: if it's a /avatars/ path, return the imported src */
export function resolveAvatarSrc(url: string | null): string | null {
  if (!url) return null
  const match = url.match(/\/avatars\/(avatar-\d{2})\.svg/)
  if (match) {
    const found = AVATAR_LIST.find((a) => a.key === match[1])
    return found?.src ?? url
  }
  return url
}
