import { useEffect, useState } from 'react'

// Open-Meteo (무료, 키 없음) 현재 날씨 — 서울 좌표 고정
const SEOUL_LAT = 37.5665
const SEOUL_LON = 126.9780
const API_URL = `https://api.open-meteo.com/v1/forecast?latitude=${SEOUL_LAT}&longitude=${SEOUL_LON}&current_weather=true&timezone=Asia/Seoul`

// WMO weather code → 이모지 + 한글 라벨
function describeWeather(code: number): { emoji: string; label: string } {
  if (code === 0) return { emoji: '☀️', label: '맑음' }
  if (code === 1) return { emoji: '🌤️', label: '대체로 맑음' }
  if (code === 2) return { emoji: '⛅', label: '구름 조금' }
  if (code === 3) return { emoji: '☁️', label: '흐림' }
  if (code === 45 || code === 48) return { emoji: '🌫️', label: '안개' }
  if (code >= 51 && code <= 57) return { emoji: '🌦️', label: '이슬비' }
  if (code >= 61 && code <= 65) return { emoji: '🌧️', label: '비' }
  if (code === 66 || code === 67) return { emoji: '🌧️', label: '얼어붙는 비' }
  if (code >= 71 && code <= 77) return { emoji: '🌨️', label: '눈' }
  if (code >= 80 && code <= 82) return { emoji: '🌧️', label: '소나기' }
  if (code === 85 || code === 86) return { emoji: '🌨️', label: '눈 소나기' }
  if (code >= 95) return { emoji: '⛈️', label: '뇌우' }
  return { emoji: '🌡️', label: '날씨' }
}

interface WeatherData {
  temperature: number
  weathercode: number
}

export function DateWeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(API_URL)
        const json = await res.json()
        if (!cancelled && json?.current_weather) {
          setWeather({
            temperature: json.current_weather.temperature,
            weathercode: json.current_weather.weathercode,
          })
        }
      } catch {
        // 네트워크 실패는 조용히
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const now = new Date()
  const dateLabel = now.toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
  const weekday = now.toLocaleDateString('ko-KR', { weekday: 'long' })

  const w = weather ? describeWeather(weather.weathercode) : null

  return (
    <div className="inline-flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2 shadow-sm">
      {/* 날짜 + 요일 */}
      <div className="flex flex-col items-end leading-tight">
        <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">{dateLabel}</span>
        <span className="text-xs text-gray-500">{weekday}</span>
      </div>
      {/* 구분선 */}
      <div className="w-px h-8 bg-gray-200" />
      {/* 날씨 */}
      <div className="flex items-center gap-1.5 min-w-[88px]">
        {loading || !weather || !w ? (
          <span className="text-xs text-gray-400">날씨 로딩…</span>
        ) : (
          <>
            <span className="text-2xl leading-none">{w.emoji}</span>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold text-gray-900">{Math.round(weather.temperature)}°C</span>
              <span className="text-[10px] text-gray-500">{w.label}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
