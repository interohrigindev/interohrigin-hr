/**
 * 귀여운 동물 아바타 — 이름 기반으로 일관된 동물+색상 배정
 */
import type { ReactNode } from 'react'

interface AnimalAvatarProps {
  name: string
  size?: number
  className?: string
}

/* ─── 배경 색상 팔레트 ─── */
const BG_COLORS = [
  '#E8E0D8', // 베이지
  '#E87461', // 코랄
  '#2EAE8F', // 틸
  '#B5B843', // 올리브
  '#A8D8EA', // 스카이
  '#E8B730', // 골드
  '#C9A0DC', // 라벤더
  '#F4A261', // 피치
  '#7EC8B0', // 민트
  '#F28B82', // 로즈
]

/* ─── 동물 SVG path 데이터 ─── */
const ANIMALS: { name: string; render: (cx: number, cy: number) => ReactNode }[] = [
  {
    // 토끼
    name: 'rabbit',
    render: (cx, cy) => (
      <g stroke="#3D3D3D" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* 귀 */}
        <ellipse cx={cx - 8} cy={cy - 22} rx="5" ry="14" />
        <ellipse cx={cx + 8} cy={cy - 22} rx="5" ry="14" />
        {/* 얼굴 */}
        <circle cx={cx} cy={cy} r="16" />
        {/* 눈 */}
        <circle cx={cx - 5} cy={cy - 3} r="1.5" fill="#3D3D3D" />
        <circle cx={cx + 5} cy={cy - 3} r="1.5" fill="#3D3D3D" />
        {/* 코+입 */}
        <ellipse cx={cx} cy={cy + 3} rx="2" ry="1.5" fill="#FFB6C1" />
        <path d={`M${cx} ${cy + 4.5} L${cx - 3} ${cy + 7}`} />
        <path d={`M${cx} ${cy + 4.5} L${cx + 3} ${cy + 7}`} />
      </g>
    ),
  },
  {
    // 곰
    name: 'bear',
    render: (cx, cy) => (
      <g stroke="#3D3D3D" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* 귀 */}
        <circle cx={cx - 14} cy={cy - 14} r="6" />
        <circle cx={cx + 14} cy={cy - 14} r="6" />
        {/* 얼굴 */}
        <circle cx={cx} cy={cy} r="17" />
        {/* 눈 */}
        <circle cx={cx - 6} cy={cy - 3} r="1.5" fill="#3D3D3D" />
        <circle cx={cx + 6} cy={cy - 3} r="1.5" fill="#3D3D3D" />
        {/* 코 */}
        <ellipse cx={cx} cy={cy + 4} rx="4" ry="3" />
        <circle cx={cx} cy={cy + 3} r="2" fill="#3D3D3D" />
        {/* 입 */}
        <path d={`M${cx} ${cy + 6} L${cx - 2} ${cy + 8}`} />
        <path d={`M${cx} ${cy + 6} L${cx + 2} ${cy + 8}`} />
      </g>
    ),
  },
  {
    // 개구리
    name: 'frog',
    render: (cx, cy) => (
      <g stroke="#3D3D3D" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* 눈 동그라미 (위에 튀어나온) */}
        <circle cx={cx - 10} cy={cy - 14} r="7" />
        <circle cx={cx + 10} cy={cy - 14} r="7" />
        <circle cx={cx - 10} cy={cy - 14} r="2.5" fill="#3D3D3D" />
        <circle cx={cx + 10} cy={cy - 14} r="2.5" fill="#3D3D3D" />
        {/* 얼굴 */}
        <ellipse cx={cx} cy={cy + 2} rx="18" ry="14" />
        {/* 입 */}
        <path d={`M${cx - 12} ${cy + 6} Q${cx} ${cy + 14} ${cx + 12} ${cy + 6}`} />
        {/* 볼 */}
        <circle cx={cx - 10} cy={cy + 4} r="2" fill="#FFB6C1" opacity="0.5" />
        <circle cx={cx + 10} cy={cy + 4} r="2" fill="#FFB6C1" opacity="0.5" />
      </g>
    ),
  },
  {
    // 고양이
    name: 'cat',
    render: (cx, cy) => (
      <g stroke="#3D3D3D" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* 귀 (삼각형) */}
        <path d={`M${cx - 15} ${cy - 6} L${cx - 10} ${cy - 22} L${cx - 2} ${cy - 12}`} />
        <path d={`M${cx + 15} ${cy - 6} L${cx + 10} ${cy - 22} L${cx + 2} ${cy - 12}`} />
        {/* 얼굴 */}
        <circle cx={cx} cy={cy} r="16" />
        {/* 눈 */}
        <ellipse cx={cx - 5} cy={cy - 2} rx="2.5" ry="3" fill="#3D3D3D" />
        <ellipse cx={cx + 5} cy={cy - 2} rx="2.5" ry="3" fill="#3D3D3D" />
        {/* 코 */}
        <path d={`M${cx - 1.5} ${cy + 4} L${cx} ${cy + 2.5} L${cx + 1.5} ${cy + 4} Z`} fill="#FFB6C1" />
        {/* 수염 */}
        <line x1={cx - 18} y1={cy + 2} x2={cx - 9} y2={cy + 4} />
        <line x1={cx - 17} y1={cy + 6} x2={cx - 9} y2={cy + 6} />
        <line x1={cx + 18} y1={cy + 2} x2={cx + 9} y2={cy + 4} />
        <line x1={cx + 17} y1={cy + 6} x2={cx + 9} y2={cy + 6} />
      </g>
    ),
  },
  {
    // 양
    name: 'sheep',
    render: (cx, cy) => (
      <g stroke="#3D3D3D" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* 곱슬 털 */}
        <circle cx={cx - 10} cy={cy - 14} r="5" />
        <circle cx={cx} cy={cy - 17} r="5" />
        <circle cx={cx + 10} cy={cy - 14} r="5" />
        <circle cx={cx - 14} cy={cy - 6} r="5" />
        <circle cx={cx + 14} cy={cy - 6} r="5" />
        {/* 얼굴 */}
        <ellipse cx={cx} cy={cy + 2} rx="12" ry="14" />
        {/* 눈 */}
        <circle cx={cx - 4} cy={cy - 1} r="1.5" fill="#3D3D3D" />
        <circle cx={cx + 4} cy={cy - 1} r="1.5" fill="#3D3D3D" />
        {/* 볼 */}
        <circle cx={cx - 7} cy={cy + 5} r="2.5" fill="#FFB6C1" opacity="0.4" />
        <circle cx={cx + 7} cy={cy + 5} r="2.5" fill="#FFB6C1" opacity="0.4" />
        {/* 입 */}
        <path d={`M${cx - 2} ${cy + 7} Q${cx} ${cy + 10} ${cx + 2} ${cy + 7}`} />
      </g>
    ),
  },
  {
    // 기린
    name: 'giraffe',
    render: (cx, cy) => (
      <g stroke="#3D3D3D" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* 뿔 */}
        <line x1={cx - 6} y1={cy - 16} x2={cx - 6} y2={cy - 24} />
        <circle cx={cx - 6} cy={cy - 25} r="2.5" fill="#3D3D3D" />
        <line x1={cx + 6} y1={cy - 16} x2={cx + 6} y2={cy - 24} />
        <circle cx={cx + 6} cy={cy - 25} r="2.5" fill="#3D3D3D" />
        {/* 얼굴 */}
        <ellipse cx={cx} cy={cy} rx="14" ry="17" />
        {/* 눈 */}
        <circle cx={cx - 5} cy={cy - 4} r="1.5" fill="#3D3D3D" />
        <circle cx={cx + 5} cy={cy - 4} r="1.5" fill="#3D3D3D" />
        {/* 무늬 */}
        <circle cx={cx - 8} cy={cy - 10} r="2" fill="#D4A030" opacity="0.5" />
        <circle cx={cx + 8} cy={cy - 8} r="2" fill="#D4A030" opacity="0.5" />
        <circle cx={cx} cy={cy - 12} r="1.5" fill="#D4A030" opacity="0.5" />
        {/* 코 */}
        <circle cx={cx - 3} cy={cy + 5} r="1" fill="#3D3D3D" />
        <circle cx={cx + 3} cy={cy + 5} r="1" fill="#3D3D3D" />
        {/* 입 */}
        <path d={`M${cx - 4} ${cy + 9} Q${cx} ${cy + 12} ${cx + 4} ${cy + 9}`} />
      </g>
    ),
  },
  {
    // 펭귄
    name: 'penguin',
    render: (cx, cy) => (
      <g stroke="#3D3D3D" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* 몸통 */}
        <ellipse cx={cx} cy={cy} rx="16" ry="18" />
        {/* 배 */}
        <ellipse cx={cx} cy={cy + 4} rx="10" ry="12" fill="white" stroke="#3D3D3D" strokeWidth="1.2" />
        {/* 눈 */}
        <circle cx={cx - 5} cy={cy - 5} r="2" fill="#3D3D3D" />
        <circle cx={cx + 5} cy={cy - 5} r="2" fill="#3D3D3D" />
        <circle cx={cx - 4.5} cy={cy - 5.5} r="0.7" fill="white" />
        <circle cx={cx + 5.5} cy={cy - 5.5} r="0.7" fill="white" />
        {/* 부리 */}
        <path d={`M${cx - 3} ${cy} L${cx} ${cy + 3} L${cx + 3} ${cy}`} fill="#F4A261" stroke="#E8963A" />
        {/* 볼 */}
        <circle cx={cx - 8} cy={cy + 1} r="2" fill="#FFB6C1" opacity="0.4" />
        <circle cx={cx + 8} cy={cy + 1} r="2" fill="#FFB6C1" opacity="0.4" />
      </g>
    ),
  },
  {
    // 여우
    name: 'fox',
    render: (cx, cy) => (
      <g stroke="#3D3D3D" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* 귀 */}
        <path d={`M${cx - 16} ${cy - 4} L${cx - 10} ${cy - 24} L${cx - 2} ${cy - 10}`} />
        <path d={`M${cx + 16} ${cy - 4} L${cx + 10} ${cy - 24} L${cx + 2} ${cy - 10}`} />
        {/* 얼굴 */}
        <circle cx={cx} cy={cy} r="16" />
        {/* 눈 */}
        <ellipse cx={cx - 6} cy={cy - 2} rx="1.5" ry="2" fill="#3D3D3D" />
        <ellipse cx={cx + 6} cy={cy - 2} rx="1.5" ry="2" fill="#3D3D3D" />
        {/* 코 */}
        <circle cx={cx} cy={cy + 4} r="2.5" fill="#3D3D3D" />
        {/* 입 */}
        <path d={`M${cx} ${cy + 6.5} L${cx - 3} ${cy + 9}`} />
        <path d={`M${cx} ${cy + 6.5} L${cx + 3} ${cy + 9}`} />
        {/* 볼 마크 */}
        <path d={`M${cx - 16} ${cy + 2} Q${cx - 8} ${cy + 10} ${cx} ${cy + 4}`} strokeWidth="1.2" />
        <path d={`M${cx + 16} ${cy + 2} Q${cx + 8} ${cy + 10} ${cx} ${cy + 4}`} strokeWidth="1.2" />
      </g>
    ),
  },
  {
    // 강아지
    name: 'dog',
    render: (cx, cy) => (
      <g stroke="#3D3D3D" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* 귀 (늘어진) */}
        <ellipse cx={cx - 16} cy={cy - 4} rx="6" ry="12" transform={`rotate(-15 ${cx - 16} ${cy - 4})`} />
        <ellipse cx={cx + 16} cy={cy - 4} rx="6" ry="12" transform={`rotate(15 ${cx + 16} ${cy - 4})`} />
        {/* 얼굴 */}
        <circle cx={cx} cy={cy} r="16" />
        {/* 눈 */}
        <circle cx={cx - 5} cy={cy - 3} r="2" fill="#3D3D3D" />
        <circle cx={cx + 5} cy={cy - 3} r="2" fill="#3D3D3D" />
        <circle cx={cx - 4.5} cy={cy - 3.5} r="0.7" fill="white" />
        <circle cx={cx + 5.5} cy={cy - 3.5} r="0.7" fill="white" />
        {/* 코 */}
        <ellipse cx={cx} cy={cy + 4} rx="4" ry="3" />
        <ellipse cx={cx} cy={cy + 3.5} r="2.5" fill="#3D3D3D" />
        {/* 혀 */}
        <path d={`M${cx - 2} ${cy + 7} Q${cx} ${cy + 12} ${cx + 2} ${cy + 7}`} fill="#FFB6C1" />
      </g>
    ),
  },
  {
    // 병아리
    name: 'chick',
    render: (cx, cy) => (
      <g stroke="#3D3D3D" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* 머리 깃 */}
        <path d={`M${cx - 2} ${cy - 18} Q${cx - 6} ${cy - 26} ${cx} ${cy - 22} Q${cx + 6} ${cy - 26} ${cx + 2} ${cy - 18}`} />
        {/* 얼굴 */}
        <circle cx={cx} cy={cy} r="17" />
        {/* 눈 */}
        <circle cx={cx - 5} cy={cy - 3} r="1.8" fill="#3D3D3D" />
        <circle cx={cx + 5} cy={cy - 3} r="1.8" fill="#3D3D3D" />
        {/* 부리 */}
        <path d={`M${cx - 4} ${cy + 3} L${cx} ${cy + 7} L${cx + 4} ${cy + 3}`} fill="#F4A261" stroke="#E8963A" />
        {/* 볼 */}
        <circle cx={cx - 9} cy={cy + 2} r="3" fill="#FFB6C1" opacity="0.35" />
        <circle cx={cx + 9} cy={cy + 2} r="3" fill="#FFB6C1" opacity="0.35" />
      </g>
    ),
  },
]

/* ─── 이름 해시 → 인덱스 ─── */
function nameHash(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

export function AnimalAvatar({ name, size = 40, className = '' }: AnimalAvatarProps) {
  const hash = nameHash(name)
  const animal = ANIMALS[hash % ANIMALS.length]
  const bgColor = BG_COLORS[hash % BG_COLORS.length]

  const viewBox = 80
  const cx = viewBox / 2
  const cy = viewBox / 2 + 2

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${viewBox} ${viewBox}`}
      className={`rounded-full shrink-0 ${className}`}
      style={{ backgroundColor: bgColor }}
    >
      {animal.render(cx, cy)}
    </svg>
  )
}
