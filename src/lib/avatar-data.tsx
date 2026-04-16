/**
 * 36종 귀여운 인라인 SVG 아바타 — 12간지 / 음식 / 랜드마크
 * 톤: 둥근 원형 배경 + 심플 라인 드로잉 + 핑크 볼터치
 */
import type { ReactNode } from 'react'

export interface AvatarDef {
  key: string      // avatar-01 ~ avatar-36
  label: string
  bg: string       // 배경색
  render: (cx: number, cy: number) => ReactNode
}

const S = 1.8  // stroke width
const C = '#3D3D3D' // stroke color
const P = '#FFB6C1' // 볼터치 핑크
const g = { stroke: C, strokeWidth: S, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

/* ════════════════════════════════════════════
   12간지
   ════════════════════════════════════════════ */
export const ZODIAC: AvatarDef[] = [
  {
    key: 'avatar-01', label: '쥐', bg: '#E8E0D8',
    render: (cx, cy) => (
      <g {...g}>
        <circle cx={cx - 10} cy={cy - 16} r="7" />
        <circle cx={cx + 10} cy={cy - 16} r="7" />
        <ellipse cx={cx} cy={cy + 2} rx="14" ry="16" />
        <circle cx={cx - 5} cy={cy - 2} r="1.5" fill={C} />
        <circle cx={cx + 5} cy={cy - 2} r="1.5" fill={C} />
        <ellipse cx={cx} cy={cy + 5} rx="2" ry="1.5" fill={P} />
        <path d={`M${cx - 12} ${cy + 4} L${cx - 7} ${cy + 3}`} />
        <path d={`M${cx - 11} ${cy + 7} L${cx - 7} ${cy + 6}`} />
        <path d={`M${cx + 12} ${cy + 4} L${cx + 7} ${cy + 3}`} />
        <path d={`M${cx + 11} ${cy + 7} L${cx + 7} ${cy + 6}`} />
      </g>
    ),
  },
  {
    key: 'avatar-02', label: '소', bg: '#F4A261',
    render: (cx, cy) => (
      <g {...g}>
        <path d={`M${cx - 16} ${cy - 16} Q${cx - 20} ${cy - 24} ${cx - 14} ${cy - 22}`} strokeWidth="2.5" />
        <path d={`M${cx + 16} ${cy - 16} Q${cx + 20} ${cy - 24} ${cx + 14} ${cy - 22}`} strokeWidth="2.5" />
        <ellipse cx={cx} cy={cy} rx="17" ry="16" />
        <circle cx={cx - 6} cy={cy - 4} r="1.8" fill={C} />
        <circle cx={cx + 6} cy={cy - 4} r="1.8" fill={C} />
        <ellipse cx={cx} cy={cy + 6} rx="8" ry="5" strokeWidth="1.5" />
        <circle cx={cx - 2} cy={cy + 6} r="1" fill={C} />
        <circle cx={cx + 2} cy={cy + 6} r="1" fill={C} />
      </g>
    ),
  },
  {
    key: 'avatar-03', label: '호랑이', bg: '#E8B730',
    render: (cx, cy) => (
      <g {...g}>
        <path d={`M${cx - 14} ${cy - 8} L${cx - 10} ${cy - 22} L${cx - 3} ${cy - 12}`} />
        <path d={`M${cx + 14} ${cy - 8} L${cx + 10} ${cy - 22} L${cx + 3} ${cy - 12}`} />
        <circle cx={cx} cy={cy} r="16" />
        <circle cx={cx - 6} cy={cy - 3} r="1.8" fill={C} />
        <circle cx={cx + 6} cy={cy - 3} r="1.8" fill={C} />
        <ellipse cx={cx} cy={cy + 4} rx="2" ry="1.5" fill={P} />
        <path d={`M${cx} ${cy + 5.5} L${cx - 2} ${cy + 8}`} />
        <path d={`M${cx} ${cy + 5.5} L${cx + 2} ${cy + 8}`} />
        <path d={`M${cx - 3} ${cy - 14} L${cx} ${cy - 10} L${cx + 3} ${cy - 14}`} strokeWidth="2" />
        <path d={`M${cx - 10} ${cy - 2} Q${cx - 6} ${cy + 2} ${cx - 10} ${cy + 4}`} strokeWidth="1.2" />
        <path d={`M${cx + 10} ${cy - 2} Q${cx + 6} ${cy + 2} ${cx + 10} ${cy + 4}`} strokeWidth="1.2" />
      </g>
    ),
  },
  {
    key: 'avatar-04', label: '토끼', bg: '#C9A0DC',
    render: (cx, cy) => (
      <g {...g}>
        <ellipse cx={cx - 8} cy={cy - 22} rx="5" ry="14" />
        <ellipse cx={cx + 8} cy={cy - 22} rx="5" ry="14" />
        <circle cx={cx} cy={cy} r="16" />
        <circle cx={cx - 5} cy={cy - 3} r="1.5" fill={C} />
        <circle cx={cx + 5} cy={cy - 3} r="1.5" fill={C} />
        <ellipse cx={cx} cy={cy + 3} rx="2" ry="1.5" fill={P} />
        <path d={`M${cx} ${cy + 4.5} L${cx - 3} ${cy + 7}`} />
        <path d={`M${cx} ${cy + 4.5} L${cx + 3} ${cy + 7}`} />
        <circle cx={cx - 9} cy={cy + 2} r="2.5" fill={P} opacity="0.35" />
        <circle cx={cx + 9} cy={cy + 2} r="2.5" fill={P} opacity="0.35" />
      </g>
    ),
  },
  {
    key: 'avatar-05', label: '용', bg: '#2EAE8F',
    render: (cx, cy) => (
      <g {...g}>
        <path d={`M${cx - 10} ${cy - 20} L${cx - 6} ${cy - 14}`} strokeWidth="2.5" />
        <path d={`M${cx - 6} ${cy - 22} L${cx - 4} ${cy - 15}`} strokeWidth="2.5" />
        <path d={`M${cx + 10} ${cy - 20} L${cx + 6} ${cy - 14}`} strokeWidth="2.5" />
        <path d={`M${cx + 6} ${cy - 22} L${cx + 4} ${cy - 15}`} strokeWidth="2.5" />
        <ellipse cx={cx} cy={cy} rx="16" ry="17" />
        <circle cx={cx - 6} cy={cy - 4} r="2.5" fill="white" stroke={C} strokeWidth="1.5" />
        <circle cx={cx - 6} cy={cy - 4} r="1.2" fill={C} />
        <circle cx={cx + 6} cy={cy - 4} r="2.5" fill="white" stroke={C} strokeWidth="1.5" />
        <circle cx={cx + 6} cy={cy - 4} r="1.2" fill={C} />
        <circle cx={cx - 3} cy={cy + 6} r="1" fill={C} />
        <circle cx={cx + 3} cy={cy + 6} r="1" fill={C} />
        <path d={`M${cx - 6} ${cy + 10} Q${cx} ${cy + 14} ${cx + 6} ${cy + 10}`} />
      </g>
    ),
  },
  {
    key: 'avatar-06', label: '뱀', bg: '#7EC8B0',
    render: (cx, cy) => (
      <g {...g}>
        <circle cx={cx} cy={cy - 2} r="15" />
        <circle cx={cx - 5} cy={cy - 6} r="1.5" fill={C} />
        <circle cx={cx + 5} cy={cy - 6} r="1.5" fill={C} />
        <path d={`M${cx - 3} ${cy} Q${cx} ${cy + 3} ${cx + 3} ${cy}`} />
        <path d={`M${cx - 2} ${cy + 6} L${cx} ${cy + 4} L${cx + 2} ${cy + 6}`} fill="red" stroke="red" strokeWidth="1" />
        <path d={`M${cx} ${cy + 14} Q${cx - 8} ${cy + 18} ${cx - 4} ${cy + 22}`} strokeWidth="2.5" />
        <circle cx={cx - 8} cy={cy + 1} r="2" fill={P} opacity="0.35" />
        <circle cx={cx + 8} cy={cy + 1} r="2" fill={P} opacity="0.35" />
      </g>
    ),
  },
  {
    key: 'avatar-07', label: '말', bg: '#E87461',
    render: (cx, cy) => (
      <g {...g}>
        <path d={`M${cx - 4} ${cy - 18} Q${cx} ${cy - 26} ${cx + 4} ${cy - 18}`} strokeWidth="3" />
        <path d={`M${cx - 2} ${cy - 20} Q${cx} ${cy - 28} ${cx + 2} ${cy - 20}`} strokeWidth="2" />
        <ellipse cx={cx} cy={cy} rx="14" ry="17" />
        <circle cx={cx - 5} cy={cy - 5} r="1.5" fill={C} />
        <circle cx={cx + 5} cy={cy - 5} r="1.5" fill={C} />
        <ellipse cx={cx} cy={cy + 7} rx="6" ry="4" strokeWidth="1.5" />
        <circle cx={cx - 1.5} cy={cy + 7} r="0.8" fill={C} />
        <circle cx={cx + 1.5} cy={cy + 7} r="0.8" fill={C} />
        <path d={`M${cx - 14} ${cy - 10} L${cx - 8} ${cy - 20} L${cx - 4} ${cy - 10}`} />
        <path d={`M${cx + 14} ${cy - 10} L${cx + 8} ${cy - 20} L${cx + 4} ${cy - 10}`} />
      </g>
    ),
  },
  {
    key: 'avatar-08', label: '양', bg: '#A8D8EA',
    render: (cx, cy) => (
      <g {...g}>
        <circle cx={cx - 10} cy={cy - 14} r="5" />
        <circle cx={cx} cy={cy - 17} r="5" />
        <circle cx={cx + 10} cy={cy - 14} r="5" />
        <circle cx={cx - 14} cy={cy - 6} r="5" />
        <circle cx={cx + 14} cy={cy - 6} r="5" />
        <ellipse cx={cx} cy={cy + 2} rx="12" ry="14" />
        <circle cx={cx - 4} cy={cy - 1} r="1.5" fill={C} />
        <circle cx={cx + 4} cy={cy - 1} r="1.5" fill={C} />
        <circle cx={cx - 7} cy={cy + 5} r="2.5" fill={P} opacity="0.4" />
        <circle cx={cx + 7} cy={cy + 5} r="2.5" fill={P} opacity="0.4" />
        <path d={`M${cx - 2} ${cy + 7} Q${cx} ${cy + 10} ${cx + 2} ${cy + 7}`} />
      </g>
    ),
  },
  {
    key: 'avatar-09', label: '원숭이', bg: '#F28B82',
    render: (cx, cy) => (
      <g {...g}>
        <circle cx={cx - 18} cy={cy - 2} r="6" />
        <circle cx={cx + 18} cy={cy - 2} r="6" />
        <circle cx={cx} cy={cy} r="16" />
        <ellipse cx={cx} cy={cy + 2} rx="10" ry="9" fill="white" stroke={C} strokeWidth="1.2" />
        <circle cx={cx - 5} cy={cy - 3} r="1.5" fill={C} />
        <circle cx={cx + 5} cy={cy - 3} r="1.5" fill={C} />
        <ellipse cx={cx} cy={cy + 4} rx="3" ry="2" />
        <path d={`M${cx - 2} ${cy + 7} Q${cx} ${cy + 10} ${cx + 2} ${cy + 7}`} />
      </g>
    ),
  },
  {
    key: 'avatar-10', label: '닭', bg: '#F4A261',
    render: (cx, cy) => (
      <g {...g}>
        <path d={`M${cx - 3} ${cy - 18} Q${cx - 6} ${cy - 26} ${cx} ${cy - 22} Q${cx + 6} ${cy - 26} ${cx + 3} ${cy - 18}`} fill="red" stroke="red" strokeWidth="1.2" />
        <circle cx={cx} cy={cy} r="17" />
        <circle cx={cx - 5} cy={cy - 3} r="1.8" fill={C} />
        <circle cx={cx + 5} cy={cy - 3} r="1.8" fill={C} />
        <path d={`M${cx - 4} ${cy + 3} L${cx} ${cy + 7} L${cx + 4} ${cy + 3}`} fill="#F4A261" stroke="#E8963A" />
        <path d={`M${cx - 2} ${cy + 8} Q${cx} ${cy + 12} ${cx + 2} ${cy + 8}`} fill="red" stroke="red" strokeWidth="1" />
        <circle cx={cx - 9} cy={cy + 2} r="3" fill={P} opacity="0.35" />
        <circle cx={cx + 9} cy={cy + 2} r="3" fill={P} opacity="0.35" />
      </g>
    ),
  },
  {
    key: 'avatar-11', label: '개', bg: '#B5B843',
    render: (cx, cy) => (
      <g {...g}>
        <ellipse cx={cx - 16} cy={cy - 4} rx="6" ry="12" transform={`rotate(-15 ${cx - 16} ${cy - 4})`} />
        <ellipse cx={cx + 16} cy={cy - 4} rx="6" ry="12" transform={`rotate(15 ${cx + 16} ${cy - 4})`} />
        <circle cx={cx} cy={cy} r="16" />
        <circle cx={cx - 5} cy={cy - 3} r="2" fill={C} />
        <circle cx={cx + 5} cy={cy - 3} r="2" fill={C} />
        <circle cx={cx - 4.5} cy={cy - 3.5} r="0.7" fill="white" />
        <circle cx={cx + 5.5} cy={cy - 3.5} r="0.7" fill="white" />
        <ellipse cx={cx} cy={cy + 3.5} rx="2.5" ry="2" fill={C} />
        <path d={`M${cx - 2} ${cy + 7} Q${cx} ${cy + 12} ${cx + 2} ${cy + 7}`} fill={P} />
      </g>
    ),
  },
  {
    key: 'avatar-12', label: '돼지', bg: '#F28B82',
    render: (cx, cy) => (
      <g {...g}>
        <circle cx={cx - 14} cy={cy - 12} r="6" />
        <circle cx={cx + 14} cy={cy - 12} r="6" />
        <circle cx={cx} cy={cy} r="17" />
        <circle cx={cx - 6} cy={cy - 4} r="1.5" fill={C} />
        <circle cx={cx + 6} cy={cy - 4} r="1.5" fill={C} />
        <ellipse cx={cx} cy={cy + 4} rx="6" ry="4" fill={P} opacity="0.5" stroke={C} strokeWidth="1.2" />
        <circle cx={cx - 2} cy={cy + 4} r="1" fill={C} />
        <circle cx={cx + 2} cy={cy + 4} r="1" fill={C} />
        <path d={`M${cx - 3} ${cy + 10} Q${cx} ${cy + 13} ${cx + 3} ${cy + 10}`} />
      </g>
    ),
  },
]

/* ════════════════════════════════════════════
   음식
   ════════════════════════════════════════════ */
export const FOOD: AvatarDef[] = [
  {
    key: 'avatar-13', label: '피자', bg: '#E8B730',
    render: (cx, cy) => (
      <g {...g}>
        <path d={`M${cx} ${cy - 18} L${cx - 18} ${cy + 14} L${cx + 18} ${cy + 14} Z`} />
        <circle cx={cx - 4} cy={cy} r="2.5" fill="#E87461" />
        <circle cx={cx + 5} cy={cy + 4} r="2.5" fill="#E87461" />
        <circle cx={cx - 1} cy={cy + 8} r="2.5" fill="#E87461" />
        <circle cx={cx - 6} cy={cy - 2} r="1.5" fill="#2EAE8F" />
        <circle cx={cx + 2} cy={cy - 4} r="1.5" fill="#2EAE8F" />
        <circle cx={cx} cy={cy - 10} r="1.5" fill={C} />
        <circle cx={cx - 2} cy={cy - 9} r="1.5" fill={C} />
        <path d={`M${cx - 3} ${cy - 6} Q${cx} ${cy - 4} ${cx + 3} ${cy - 6}`} />
      </g>
    ),
  },
  {
    key: 'avatar-14', label: '초밥', bg: '#F4A261',
    render: (cx, cy) => (
      <g {...g}>
        <ellipse cx={cx} cy={cy + 4} rx="16" ry="10" fill="white" stroke={C} />
        <ellipse cx={cx} cy={cy - 2} rx="14" ry="8" fill="#FF6B6B" stroke={C} />
        <path d={`M${cx - 8} ${cy - 4} Q${cx} ${cy - 8} ${cx + 8} ${cy - 4}`} strokeWidth="1.2" fill="white" opacity="0.4" />
        <circle cx={cx - 4} cy={cy - 4} r="1.2" fill={C} />
        <circle cx={cx + 4} cy={cy - 4} r="1.2" fill={C} />
        <path d={`M${cx - 2} ${cy} Q${cx} ${cy + 2} ${cx + 2} ${cy}`} />
        <circle cx={cx - 7} cy={cy - 1} r="1.5" fill={P} opacity="0.4" />
        <circle cx={cx + 7} cy={cy - 1} r="1.5" fill={P} opacity="0.4" />
      </g>
    ),
  },
  {
    key: 'avatar-15', label: '버거', bg: '#B5B843',
    render: (cx, cy) => (
      <g {...g}>
        <path d={`M${cx - 16} ${cy - 4} Q${cx - 16} ${cy - 16} ${cx} ${cy - 16} Q${cx + 16} ${cy - 16} ${cx + 16} ${cy - 4}`} fill="#E8B730" stroke={C} />
        <line x1={cx - 16} y1={cy - 2} x2={cx + 16} y2={cy - 2} />
        <path d={`M${cx - 15} ${cy} Q${cx - 10} ${cy + 3} ${cx - 5} ${cy} Q${cx} ${cy + 3} ${cx + 5} ${cy} Q${cx + 10} ${cy + 3} ${cx + 15} ${cy}`} stroke="#2EAE8F" strokeWidth="2" />
        <rect x={cx - 16} y={cy + 3} width="32" height="4" rx="1" fill="#E87461" stroke={C} />
        <line x1={cx - 16} y1={cy + 9} x2={cx + 16} y2={cy + 9} />
        <path d={`M${cx - 16} ${cy + 11} Q${cx} ${cy + 18} ${cx + 16} ${cy + 11}`} fill="#E8B730" stroke={C} />
        <circle cx={cx - 4} cy={cy - 10} r="1" fill={C} />
        <circle cx={cx + 4} cy={cy - 10} r="1" fill={C} />
        <path d={`M${cx - 3} ${cy - 7} Q${cx} ${cy - 5} ${cx + 3} ${cy - 7}`} />
      </g>
    ),
  },
  {
    key: 'avatar-16', label: '타코', bg: '#E8B730',
    render: (cx, cy) => (
      <g {...g}>
        <path d={`M${cx - 18} ${cy + 6} Q${cx} ${cy + 18} ${cx + 18} ${cy + 6}`} />
        <path d={`M${cx - 18} ${cy + 6} Q${cx - 18} ${cy - 14} ${cx} ${cy - 14} Q${cx + 18} ${cy - 14} ${cx + 18} ${cy + 6}`} />
        <circle cx={cx - 6} cy={cy - 2} r="3" fill="#2EAE8F" opacity="0.6" />
        <circle cx={cx + 2} cy={cy} r="3" fill="#E87461" opacity="0.6" />
        <circle cx={cx + 8} cy={cy - 3} r="2.5" fill="#E8B730" opacity="0.6" />
        <circle cx={cx - 3} cy={cy - 8} r="1.2" fill={C} />
        <circle cx={cx + 3} cy={cy - 8} r="1.2" fill={C} />
        <path d={`M${cx - 2} ${cy - 5} Q${cx} ${cy - 3} ${cx + 2} ${cy - 5}`} />
      </g>
    ),
  },
  {
    key: 'avatar-17', label: '라멘', bg: '#E87461',
    render: (cx, cy) => (
      <g {...g}>
        <path d={`M${cx - 18} ${cy - 4} L${cx - 14} ${cy + 14} L${cx + 14} ${cy + 14} L${cx + 18} ${cy - 4} Z`} />
        <path d={`M${cx - 20} ${cy - 4} L${cx + 20} ${cy - 4}`} strokeWidth="2.5" />
        <path d={`M${cx - 8} ${cy} Q${cx - 6} ${cy + 6} ${cx - 8} ${cy + 10}`} strokeWidth="1.5" />
        <path d={`M${cx} ${cy} Q${cx + 2} ${cy + 6} ${cx} ${cy + 10}`} strokeWidth="1.5" />
        <path d={`M${cx + 8} ${cy} Q${cx + 10} ${cy + 6} ${cx + 8} ${cy + 10}`} strokeWidth="1.5" />
        <ellipse cx={cx - 5} cy={cy - 2} rx="3" ry="2" fill="#E8B730" stroke={C} strokeWidth="1" />
        <path d={`M${cx - 6} ${cy - 10} Q${cx - 4} ${cy - 14} ${cx - 2} ${cy - 10}`} />
        <path d={`M${cx + 2} ${cy - 10} Q${cx + 4} ${cy - 14} ${cx + 6} ${cy - 10}`} />
      </g>
    ),
  },
  {
    key: 'avatar-18', label: '케이크', bg: '#C9A0DC',
    render: (cx, cy) => (
      <g {...g}>
        <line x1={cx} y1={cy - 20} x2={cx} y2={cy - 12} />
        <ellipse cx={cx} cy={cy - 21} rx="2" ry="3" fill="#F4A261" stroke="none" />
        <rect x={cx - 14} y={cy - 12} width="28" height="8" rx="3" fill={P} stroke={C} opacity="0.6" />
        <rect x={cx - 16} y={cy - 4} width="32" height="14" rx="4" fill="white" stroke={C} />
        <path d={`M${cx - 16} ${cy + 2} Q${cx - 8} ${cy + 5} ${cx} ${cy + 2} Q${cx + 8} ${cy + 5} ${cx + 16} ${cy + 2}`} fill={P} opacity="0.4" stroke={C} strokeWidth="1" />
        <circle cx={cx - 5} cy={cy - 8} r="1" fill={C} />
        <circle cx={cx + 5} cy={cy - 8} r="1" fill={C} />
        <path d={`M${cx - 2} ${cy - 6} Q${cx} ${cy - 4} ${cx + 2} ${cy - 6}`} />
      </g>
    ),
  },
  {
    key: 'avatar-19', label: '아이스크림', bg: '#A8D8EA',
    render: (cx, cy) => (
      <g {...g}>
        <circle cx={cx} cy={cy - 8} r="10" fill={P} opacity="0.5" stroke={C} />
        <circle cx={cx - 8} cy={cy - 4} r="8" fill="#A8D8EA" opacity="0.5" stroke={C} />
        <circle cx={cx + 8} cy={cy - 4} r="8" fill="#C9A0DC" opacity="0.5" stroke={C} />
        <path d={`M${cx - 10} ${cy + 2} L${cx} ${cy + 20} L${cx + 10} ${cy + 2}`} fill="#E8B730" stroke={C} />
        <circle cx={cx - 2} cy={cy - 8} r="1" fill={C} />
        <circle cx={cx + 3} cy={cy - 8} r="1" fill={C} />
        <path d={`M${cx - 1} ${cy - 5} Q${cx + 1} ${cy - 3} ${cx + 3} ${cy - 5}`} />
      </g>
    ),
  },
  {
    key: 'avatar-20', label: '도넛', bg: '#F28B82',
    render: (cx, cy) => (
      <g {...g}>
        <ellipse cx={cx} cy={cy} rx="18" ry="16" />
        <ellipse cx={cx} cy={cy} rx="7" ry="6" />
        <path d={`M${cx - 16} ${cy - 4} Q${cx - 8} ${cy - 8} ${cx} ${cy - 6} Q${cx + 8} ${cy - 8} ${cx + 16} ${cy - 4}`} fill="#C9A0DC" opacity="0.5" stroke={C} strokeWidth="1.2" />
        <circle cx={cx - 8} cy={cy - 6} r="1.5" fill="#E8B730" />
        <circle cx={cx + 6} cy={cy - 7} r="1.5" fill="#2EAE8F" />
        <circle cx={cx - 2} cy={cy - 8} r="1.5" fill="#E87461" />
        <circle cx={cx + 12} cy={cy - 4} r="1.5" fill="#A8D8EA" />
        <circle cx={cx - 10} cy={cy - 2} r="1" fill={C} />
        <circle cx={cx + 2} cy={cy - 2} r="1" fill={C} />
        <path d={`M${cx - 6} ${cy + 1} Q${cx - 4} ${cy + 3} ${cx - 2} ${cy + 1}`} />
      </g>
    ),
  },
  {
    key: 'avatar-21', label: '김밥', bg: '#2EAE8F',
    render: (cx, cy) => (
      <g {...g}>
        <circle cx={cx} cy={cy} r="17" fill="#2D2D2D" stroke={C} />
        <circle cx={cx} cy={cy} r="14" fill="white" stroke={C} strokeWidth="1.2" />
        <circle cx={cx} cy={cy} r="3" fill="#E8B730" stroke={C} strokeWidth="1" />
        <circle cx={cx - 6} cy={cy - 4} r="2.5" fill="#E87461" opacity="0.6" stroke={C} strokeWidth="0.8" />
        <circle cx={cx + 5} cy={cy - 5} r="2" fill="#2EAE8F" opacity="0.6" stroke={C} strokeWidth="0.8" />
        <circle cx={cx + 7} cy={cy + 3} r="2" fill="#F4A261" opacity="0.6" stroke={C} strokeWidth="0.8" />
        <circle cx={cx - 5} cy={cy + 5} r="2.5" fill="#B5B843" opacity="0.6" stroke={C} strokeWidth="0.8" />
        <circle cx={cx - 2} cy={cy - 10} r="0.8" fill={C} />
        <circle cx={cx + 3} cy={cy - 10} r="0.8" fill={C} />
        <path d={`M${cx - 1} ${cy - 7} Q${cx + 1} ${cy - 6} ${cx + 3} ${cy - 7}`} />
      </g>
    ),
  },
  {
    key: 'avatar-22', label: '크루아상', bg: '#E8E0D8',
    render: (cx, cy) => (
      <g {...g}>
        <path d={`M${cx - 18} ${cy + 2} Q${cx - 12} ${cy - 14} ${cx} ${cy - 10} Q${cx + 12} ${cy - 14} ${cx + 18} ${cy + 2} Q${cx + 12} ${cy + 10} ${cx} ${cy + 8} Q${cx - 12} ${cy + 10} ${cx - 18} ${cy + 2}`} fill="#E8B730" opacity="0.3" stroke={C} />
        <path d={`M${cx - 10} ${cy - 4} L${cx - 6} ${cy + 4}`} strokeWidth="1.2" />
        <path d={`M${cx - 4} ${cy - 6} L${cx} ${cy + 4}`} strokeWidth="1.2" />
        <path d={`M${cx + 4} ${cy - 6} L${cx + 2} ${cy + 4}`} strokeWidth="1.2" />
        <path d={`M${cx + 10} ${cy - 4} L${cx + 8} ${cy + 4}`} strokeWidth="1.2" />
        <circle cx={cx - 3} cy={cy - 4} r="1" fill={C} />
        <circle cx={cx + 3} cy={cy - 4} r="1" fill={C} />
        <path d={`M${cx - 1} ${cy - 1} Q${cx} ${cy + 1} ${cx + 1} ${cy - 1}`} />
      </g>
    ),
  },
  {
    key: 'avatar-23', label: '떡볶이', bg: '#E87461',
    render: (cx, cy) => (
      <g {...g}>
        <rect x={cx - 8} y={cy - 14} width="5" height="22" rx="2.5" fill="white" stroke={C} />
        <rect x={cx - 1} y={cy - 12} width="5" height="20" rx="2.5" fill="white" stroke={C} />
        <rect x={cx + 6} y={cy - 10} width="5" height="18" rx="2.5" fill="white" stroke={C} />
        <ellipse cx={cx} cy={cy + 10} rx="18" ry="6" fill="#E87461" opacity="0.3" stroke={C} />
        <circle cx={cx - 4} cy={cy - 8} r="0.8" fill={C} />
        <circle cx={cx + 2} cy={cy - 8} r="0.8" fill={C} />
        <path d={`M${cx - 2} ${cy - 5} Q${cx} ${cy - 3} ${cx + 2} ${cy - 5}`} />
      </g>
    ),
  },
  {
    key: 'avatar-24', label: '수박', bg: '#2EAE8F',
    render: (cx, cy) => (
      <g {...g}>
        <path d={`M${cx - 18} ${cy + 4} Q${cx} ${cy - 18} ${cx + 18} ${cy + 4}`} />
        <line x1={cx - 18} y1={cy + 4} x2={cx + 18} y2={cy + 4} />
        <path d={`M${cx - 16} ${cy + 2} Q${cx} ${cy - 14} ${cx + 16} ${cy + 2}`} fill="#FF6B6B" opacity="0.3" stroke="none" />
        <ellipse cx={cx - 6} cy={cy - 2} rx="1" ry="1.5" fill={C} />
        <ellipse cx={cx + 2} cy={cy} rx="1" ry="1.5" fill={C} />
        <ellipse cx={cx + 8} cy={cy - 1} rx="1" ry="1.5" fill={C} />
        <ellipse cx={cx - 2} cy={cy - 6} rx="1" ry="1.5" fill={C} />
        <circle cx={cx - 4} cy={cy - 12} r="1" fill={C} />
        <circle cx={cx + 3} cy={cy - 12} r="1" fill={C} />
        <path d={`M${cx - 2} ${cy - 9} Q${cx} ${cy - 7} ${cx + 2} ${cy - 9}`} />
      </g>
    ),
  },
]

/* ════════════════════════════════════════════
   랜드마크
   ════════════════════════════════════════════ */
export const LANDMARK: AvatarDef[] = [
  {
    key: 'avatar-25', label: '에펠탑', bg: '#C9A0DC',
    render: (cx, cy) => (
      <g {...g}>
        <path d={`M${cx} ${cy - 22} L${cx - 14} ${cy + 16} L${cx + 14} ${cy + 16} Z`} />
        <line x1={cx - 8} y1={cy - 2} x2={cx + 8} y2={cy - 2} />
        <line x1={cx - 10} y1={cy + 6} x2={cx + 10} y2={cy + 6} />
        <path d={`M${cx - 4} ${cy + 16} Q${cx} ${cy + 12} ${cx + 4} ${cy + 16}`} />
        <circle cx={cx - 2} cy={cy - 10} r="1" fill={C} />
        <circle cx={cx + 2} cy={cy - 10} r="1" fill={C} />
        <path d={`M${cx - 1} ${cy - 7} Q${cx} ${cy - 5} ${cx + 1} ${cy - 7}`} />
      </g>
    ),
  },
  {
    key: 'avatar-26', label: '자유의여신상', bg: '#7EC8B0',
    render: (cx, cy) => (
      <g {...g}>
        <rect x={cx - 4} y={cy - 6} width="8" height="22" rx="3" />
        <circle cx={cx} cy={cy - 12} r="8" />
        <line x1={cx + 8} y1={cy - 12} x2={cx + 14} y2={cy - 22} strokeWidth="2" />
        <circle cx={cx + 14} cy={cy - 24} r="3" fill="#E8B730" stroke={C} />
        <path d={`M${cx - 4} ${cy - 18} L${cx - 2} ${cy - 22} L${cx} ${cy - 18} L${cx + 2} ${cy - 22} L${cx + 4} ${cy - 18}`} strokeWidth="1.5" />
        <circle cx={cx - 2} cy={cy - 14} r="1" fill={C} />
        <circle cx={cx + 2} cy={cy - 14} r="1" fill={C} />
        <path d={`M${cx - 1} ${cy - 10} Q${cx} ${cy - 9} ${cx + 1} ${cy - 10}`} />
      </g>
    ),
  },
  {
    key: 'avatar-27', label: '빅벤', bg: '#E8E0D8',
    render: (cx, cy) => (
      <g {...g}>
        <rect x={cx - 8} y={cy - 4} width="16" height="20" rx="2" />
        <rect x={cx - 6} y={cy - 18} width="12" height="14" rx="2" />
        <path d={`M${cx - 4} ${cy - 18} L${cx} ${cy - 24} L${cx + 4} ${cy - 18}`} />
        <circle cx={cx} cy={cy - 10} r="4" />
        <line x1={cx} y1={cy - 10} x2={cx} y2={cy - 13} strokeWidth="1.5" />
        <line x1={cx} y1={cy - 10} x2={cx + 2} y2={cy - 9} strokeWidth="1.5" />
        <circle cx={cx - 2} cy={cy + 2} r="0.8" fill={C} />
        <circle cx={cx + 2} cy={cy + 2} r="0.8" fill={C} />
        <path d={`M${cx - 1} ${cy + 5} Q${cx} ${cy + 6} ${cx + 1} ${cy + 5}`} />
      </g>
    ),
  },
  {
    key: 'avatar-28', label: '도쿄타워', bg: '#E87461',
    render: (cx, cy) => (
      <g {...g}>
        <path d={`M${cx} ${cy - 24} L${cx - 12} ${cy + 16} L${cx + 12} ${cy + 16} Z`} />
        <line x1={cx - 6} y1={cy - 4} x2={cx + 6} y2={cy - 4} />
        <line x1={cx - 8} y1={cy + 4} x2={cx + 8} y2={cy + 4} />
        <rect x={cx - 3} y={cy - 6} width="6" height="6" rx="1" />
        <circle cx={cx - 1} cy={cy - 16} r="0.8" fill={C} />
        <circle cx={cx + 1} cy={cy - 16} r="0.8" fill={C} />
        <path d={`M${cx - 1} ${cy - 13} Q${cx} ${cy - 12} ${cx + 1} ${cy - 13}`} />
      </g>
    ),
  },
  {
    key: 'avatar-29', label: 'N서울타워', bg: '#A8D8EA',
    render: (cx, cy) => (
      <g {...g}>
        <line x1={cx} y1={cy - 26} x2={cx} y2={cy - 14} strokeWidth="2" />
        <ellipse cx={cx} cy={cy - 10} rx="10" ry="5" />
        <rect x={cx - 6} y={cy - 6} width="12" height="16" rx="3" />
        <rect x={cx - 10} y={cy + 10} width="20" height="6" rx="2" />
        <circle cx={cx - 2} cy={cy} r="0.8" fill={C} />
        <circle cx={cx + 2} cy={cy} r="0.8" fill={C} />
        <path d={`M${cx - 1} ${cy + 3} Q${cx} ${cy + 4} ${cx + 1} ${cy + 3}`} />
      </g>
    ),
  },
  {
    key: 'avatar-30', label: '오페라하우스', bg: '#E8E0D8',
    render: (cx, cy) => (
      <g {...g}>
        <path d={`M${cx - 16} ${cy + 6} Q${cx - 12} ${cy - 16} ${cx - 8} ${cy + 6}`} />
        <path d={`M${cx - 8} ${cy + 6} Q${cx - 2} ${cy - 20} ${cx + 4} ${cy + 6}`} />
        <path d={`M${cx + 4} ${cy + 6} Q${cx + 10} ${cy - 14} ${cx + 16} ${cy + 6}`} />
        <line x1={cx - 18} y1={cy + 6} x2={cx + 18} y2={cy + 6} />
        <rect x={cx - 18} y={cy + 6} width="36" height="8" rx="2" />
        <circle cx={cx - 2} cy={cy - 6} r="0.8" fill={C} />
        <circle cx={cx + 2} cy={cy - 6} r="0.8" fill={C} />
        <path d={`M${cx - 1} ${cy - 3} Q${cx} ${cy - 2} ${cx + 1} ${cy - 3}`} />
      </g>
    ),
  },
  {
    key: 'avatar-31', label: '피사의탑', bg: '#F4A261',
    render: (cx, cy) => (
      <g {...g}>
        <rect x={cx - 8} y={cy - 18} width="14" height="34" rx="2" transform={`rotate(-8 ${cx} ${cy})`} />
        <line x1={cx - 7} y1={cy - 10} x2={cx + 5} y2={cy - 10} transform={`rotate(-8 ${cx} ${cy})`} />
        <line x1={cx - 7} y1={cy - 2} x2={cx + 5} y2={cy - 2} transform={`rotate(-8 ${cx} ${cy})`} />
        <line x1={cx - 7} y1={cy + 6} x2={cx + 5} y2={cy + 6} transform={`rotate(-8 ${cx} ${cy})`} />
        <circle cx={cx - 2} cy={cy - 14} r="0.8" fill={C} />
        <circle cx={cx + 2} cy={cy - 14} r="0.8" fill={C} />
        <path d={`M${cx - 1} ${cy - 11} Q${cx} ${cy - 10} ${cx + 1} ${cy - 11}`} />
      </g>
    ),
  },
  {
    key: 'avatar-32', label: '타지마할', bg: '#C9A0DC',
    render: (cx, cy) => (
      <g {...g}>
        <path d={`M${cx - 6} ${cy - 10} Q${cx} ${cy - 24} ${cx + 6} ${cy - 10}`} />
        <circle cx={cx} cy={cy - 22} r="3" />
        <rect x={cx - 10} y={cy - 10} width="20" height="16" rx="2" />
        <path d={`M${cx - 4} ${cy - 10} Q${cx} ${cy - 16} ${cx + 4} ${cy - 10}`} />
        <rect x={cx - 16} y={cy + 6} width="4" height="10" rx="1" />
        <rect x={cx + 12} y={cy + 6} width="4" height="10" rx="1" />
        <circle cx={cx - 2} cy={cy - 4} r="0.8" fill={C} />
        <circle cx={cx + 2} cy={cy - 4} r="0.8" fill={C} />
        <path d={`M${cx - 1} ${cy - 1} Q${cx} ${cy} ${cx + 1} ${cy - 1}`} />
      </g>
    ),
  },
  {
    key: 'avatar-33', label: '만리장성', bg: '#B5B843',
    render: (cx, cy) => (
      <g {...g}>
        <path d={`M${cx - 20} ${cy + 4} Q${cx - 10} ${cy - 8} ${cx} ${cy - 2} Q${cx + 10} ${cy + 4} ${cx + 20} ${cy - 4}`} strokeWidth="2.5" />
        <rect x={cx - 10} y={cy - 12} width="8" height="10" rx="1" />
        <rect x={cx + 4} y={cy - 8} width="8" height="10" rx="1" />
        <path d={`M${cx - 10} ${cy - 12} L${cx - 10} ${cy - 14} L${cx - 8} ${cy - 14} L${cx - 8} ${cy - 12} L${cx - 6} ${cy - 12} L${cx - 6} ${cy - 14} L${cx - 4} ${cy - 14} L${cx - 4} ${cy - 12} L${cx - 2} ${cy - 12} L${cx - 2} ${cy - 14}`} strokeWidth="1.2" />
        <circle cx={cx - 5} cy={cy - 8} r="0.8" fill={C} />
        <circle cx={cx - 3} cy={cy - 8} r="0.8" fill={C} />
        <path d={`M${cx - 5} ${cy - 6} Q${cx - 4} ${cy - 5} ${cx - 3} ${cy - 6}`} />
      </g>
    ),
  },
  {
    key: 'avatar-34', label: '콜로세움', bg: '#E8E0D8',
    render: (cx, cy) => (
      <g {...g}>
        <ellipse cx={cx} cy={cy} rx="18" ry="14" />
        <ellipse cx={cx} cy={cy - 4} rx="16" ry="10" />
        <line x1={cx - 10} y1={cy - 10} x2={cx - 10} y2={cy + 6} />
        <line x1={cx - 4} y1={cy - 12} x2={cx - 4} y2={cy + 8} />
        <line x1={cx + 4} y1={cy - 12} x2={cx + 4} y2={cy + 8} />
        <line x1={cx + 10} y1={cy - 10} x2={cx + 10} y2={cy + 6} />
        <line x1={cx - 16} y1={cy} x2={cx + 16} y2={cy} />
        <circle cx={cx - 1} cy={cy - 6} r="0.8" fill={C} />
        <circle cx={cx + 1} cy={cy - 6} r="0.8" fill={C} />
      </g>
    ),
  },
  {
    key: 'avatar-35', label: '부르즈칼리파', bg: '#A8D8EA',
    render: (cx, cy) => (
      <g {...g}>
        <rect x={cx - 3} y={cy - 26} width="6" height="42" rx="2" />
        <rect x={cx - 7} y={cy - 10} width="14" height="26" rx="2" />
        <rect x={cx - 10} y={cy} width="20" height="16" rx="2" />
        <line x1={cx} y1={cy - 26} x2={cx} y2={cy - 30} strokeWidth="1.5" />
        <circle cx={cx - 1} cy={cy - 18} r="0.8" fill={C} />
        <circle cx={cx + 1} cy={cy - 18} r="0.8" fill={C} />
        <path d={`M${cx - 1} ${cy - 15} Q${cx} ${cy - 14} ${cx + 1} ${cy - 15}`} />
      </g>
    ),
  },
  {
    key: 'avatar-36', label: '피라미드', bg: '#E8B730',
    render: (cx, cy) => (
      <g {...g}>
        <path d={`M${cx} ${cy - 18} L${cx - 20} ${cy + 12} L${cx + 20} ${cy + 12} Z`} />
        <path d={`M${cx} ${cy - 18} L${cx + 20} ${cy + 12}`} strokeWidth="1" />
        <line x1={cx - 12} y1={cy + 2} x2={cx + 12} y2={cy + 2} strokeWidth="1" />
        <line x1={cx - 6} y1={cy - 8} x2={cx + 6} y2={cy - 8} strokeWidth="1" />
        <circle cx={cx - 2} cy={cy - 4} r="1" fill={C} />
        <circle cx={cx + 2} cy={cy - 4} r="1" fill={C} />
        <path d={`M${cx - 1} ${cy - 1} Q${cx} ${cy} ${cx + 1} ${cy - 1}`} />
      </g>
    ),
  },
]

/* ════════════════════════════════════════════
   통합 목록 + 헬퍼
   ════════════════════════════════════════════ */

export const ALL_AVATARS: AvatarDef[] = [...ZODIAC, ...FOOD, ...LANDMARK]

export const AVATAR_CATEGORIES = [
  { title: '12간지', avatars: ZODIAC },
  { title: '음식', avatars: FOOD },
  { title: '랜드마크', avatars: LANDMARK },
]

const AVATAR_MAP = new Map(ALL_AVATARS.map(a => [a.key, a]))

/** key로 아바타 정의 찾기 */
export function getAvatarDef(key: string): AvatarDef | undefined {
  return AVATAR_MAP.get(key)
}

/** avatar_url → 아바타 key 추출 (없으면 null) */
export function extractAvatarKey(url: string | null): string | null {
  if (!url) return null
  const match = url.match(/avatar-(\d{2})/)
  if (match) return `avatar-${match[1]}`
  return null
}

/** 아바타 SVG 렌더 (key 기반) */
export function renderAvatarSvg(key: string, size: number): ReactNode {
  const def = AVATAR_MAP.get(key)
  if (!def) return null
  const vb = 80
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${vb} ${vb}`}
      className="rounded-full shrink-0"
      style={{ backgroundColor: def.bg }}
    >
      {def.render(vb / 2, vb / 2 + 2)}
    </svg>
  )
}
