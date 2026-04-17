import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SearchableSelectProps {
  label?: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string; group?: string }[]
  placeholder?: string
  className?: string
  error?: string
}

/** 검색 가능한 드롭다운 — 직원 선택 등 대량 리스트에 사용 */
export function SearchableSelect({
  label, value, onChange, options, placeholder = '선택하세요', className, error,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selected = options.find(o => o.value === value)
  const q = query.toLowerCase()
  const filtered = q
    ? options.filter(o => o.label.toLowerCase().includes(q) || (o.group || '').toLowerCase().includes(q))
    : options

  // 그룹별 묶기
  const grouped = new Map<string, typeof options>()
  for (const opt of filtered) {
    const key = opt.group || ''
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(opt)
  }

  return (
    <div className={cn('w-full', className)}>
      {label && <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>}
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={cn(
            'w-full flex items-center justify-between rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors bg-white',
            'focus:outline-none focus:ring-2 focus:ring-offset-0',
            error ? 'border-red-300 focus:ring-red-200' : 'border-gray-300 focus:border-brand-500 focus:ring-brand-200'
          )}
        >
          <span className={selected ? 'text-gray-900' : 'text-gray-400'}>
            {selected?.label || placeholder}
          </span>
          <ChevronDown className={cn('h-4 w-4 text-gray-400 transition-transform', open && 'rotate-180')} />
        </button>

        {open && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl">
            {/* 검색 */}
            <div className="p-2 border-b border-gray-100 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="이름 또는 부서 검색..."
                className="w-full pl-8 pr-7 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-brand-400 bg-gray-50"
              />
              {query && (
                <button onClick={() => setQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* 옵션 리스트 */}
            <div className="max-h-60 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="text-center text-xs text-gray-400 py-4">검색 결과 없음</p>
              ) : (
                Array.from(grouped.entries()).map(([group, opts]) => (
                  <div key={group}>
                    {group && (
                      <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase sticky top-0 bg-white">
                        {group}
                      </p>
                    )}
                    {opts.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => { onChange(opt.value); setOpen(false); setQuery('') }}
                        className={cn(
                          'w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center justify-between',
                          value === opt.value && 'bg-brand-50 text-brand-700 font-medium'
                        )}
                      >
                        <span>{opt.label}</span>
                        {value === opt.value && <span className="text-brand-500 text-xs">✓</span>}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
