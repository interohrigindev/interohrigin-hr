import clsx, { type ClassValue } from 'clsx'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

/** 0~100점 기준 등급 산출 */
export function calculateGrade(score: number): string {
  if (score >= 90) return 'S'
  if (score >= 80) return 'A'
  if (score >= 70) return 'B'
  if (score >= 60) return 'C'
  return 'D'
}

export function formatDate(date: string | Date, formatStr = 'yyyy년 MM월 dd일') {
  return format(new Date(date), formatStr, { locale: ko })
}

export function formatDateTime(date: string | Date) {
  return format(new Date(date), 'yyyy년 MM월 dd일 HH:mm', { locale: ko })
}
