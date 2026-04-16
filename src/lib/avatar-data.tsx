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
    // 쥐 — 큰 둥근 귀, 뾰족한 얼굴, 긴 수염, 분홍 귀속
    key: 'avatar-01', label: '쥐', bg: '#E8E0D8',
    render: (cx, cy) => (
      <g {...g}>
        {/* 큰 둥근 귀 */}
        <circle cx={cx - 12} cy={cy - 16} r="9" />
        <circle cx={cx - 12} cy={cy - 16} r="5" fill={P} opacity="0.4" stroke="none" />
        <circle cx={cx + 12} cy={cy - 16} r="9" />
        <circle cx={cx + 12} cy={cy - 16} r="5" fill={P} opacity="0.4" stroke="none" />
        {/* 뾰족한 얼굴 */}
        <ellipse cx={cx} cy={cy + 2} rx="13" ry="15" />
        {/* 눈 — 반짝이는 큰 눈 */}
        <circle cx={cx - 5} cy={cy - 2} r="2.5" fill={C} />
        <circle cx={cx - 4} cy={cy - 3} r="1" fill="white" />
        <circle cx={cx + 5} cy={cy - 2} r="2.5" fill={C} />
        <circle cx={cx + 6} cy={cy - 3} r="1" fill="white" />
        {/* 분홍 코 */}
        <ellipse cx={cx} cy={cy + 5} rx="2.5" ry="2" fill={P} stroke={C} strokeWidth="1" />
        {/* 긴 수염 3쌍 */}
        <line x1={cx - 14} y1={cy + 2} x2={cx - 6} y2={cy + 4} />
        <line x1={cx - 13} y1={cy + 5} x2={cx - 6} y2={cy + 6} />
        <line x1={cx - 12} y1={cy + 8} x2={cx - 6} y2={cy + 8} />
        <line x1={cx + 14} y1={cy + 2} x2={cx + 6} y2={cy + 4} />
        <line x1={cx + 13} y1={cy + 5} x2={cx + 6} y2={cy + 6} />
        <line x1={cx + 12} y1={cy + 8} x2={cx + 6} y2={cy + 8} />
        {/* 입 */}
        <path d={`M${cx} ${cy + 7} L${cx - 2} ${cy + 10}`} />
        <path d={`M${cx} ${cy + 7} L${cx + 2} ${cy + 10}`} />
      </g>
    ),
  },
  {
    // 소 — 굵은 뿔, 큰 코, 반점, 꽃 귀
    key: 'avatar-02', label: '소', bg: '#F4A261',
    render: (cx, cy) => (
      <g {...g}>
        {/* 굵은 뿔 */}
        <path d={`M${cx - 14} ${cy - 14} Q${cx - 22} ${cy - 26} ${cx - 10} ${cy - 24}`} strokeWidth="3" stroke="#E8B730" />
        <path d={`M${cx + 14} ${cy - 14} Q${cx + 22} ${cy - 26} ${cx + 10} ${cy - 24}`} strokeWidth="3" stroke="#E8B730" />
        {/* 꽃 귀 */}
        <ellipse cx={cx - 18} cy={cy - 8} rx="4" ry="7" transform={`rotate(-20 ${cx - 18} ${cy - 8})`} />
        <ellipse cx={cx + 18} cy={cy - 8} rx="4" ry="7" transform={`rotate(20 ${cx + 18} ${cy - 8})`} />
        {/* 큰 얼굴 */}
        <circle cx={cx} cy={cy} r="17" />
        {/* 반점 */}
        <circle cx={cx - 8} cy={cy - 8} r="4" fill="#8B6914" opacity="0.25" stroke="none" />
        <circle cx={cx + 6} cy={cy - 10} r="3" fill="#8B6914" opacity="0.25" stroke="none" />
        {/* 눈 */}
        <circle cx={cx - 6} cy={cy - 4} r="2" fill={C} />
        <circle cx={cx - 5.5} cy={cy - 4.5} r="0.7" fill="white" />
        <circle cx={cx + 6} cy={cy - 4} r="2" fill={C} />
        <circle cx={cx + 6.5} cy={cy - 4.5} r="0.7" fill="white" />
        {/* 큰 코 — 소 특유의 넓은 코 */}
        <ellipse cx={cx} cy={cy + 6} rx="9" ry="6" fill="#F5DEB3" stroke={C} strokeWidth="1.5" />
        <ellipse cx={cx - 3} cy={cy + 6} rx="2" ry="1.5" fill={C} />
        <ellipse cx={cx + 3} cy={cy + 6} rx="2" ry="1.5" fill={C} />
        {/* 입 */}
        <path d={`M${cx - 3} ${cy + 10} Q${cx} ${cy + 13} ${cx + 3} ${cy + 10}`} />
      </g>
    ),
  },
  {
    // 호랑이 — 왕(王) 이마, 뚜렷한 줄무늬, 둥근 귀
    key: 'avatar-03', label: '호랑이', bg: '#E8B730',
    render: (cx, cy) => (
      <g {...g}>
        {/* 둥근 귀 */}
        <circle cx={cx - 14} cy={cy - 16} r="7" />
        <circle cx={cx - 14} cy={cy - 16} r="4" fill="#E8B730" stroke="none" />
        <circle cx={cx + 14} cy={cy - 16} r="7" />
        <circle cx={cx + 14} cy={cy - 16} r="4" fill="#E8B730" stroke="none" />
        {/* 얼굴 */}
        <circle cx={cx} cy={cy} r="17" />
        {/* 이마 왕(王) 줄무늬 */}
        <line x1={cx - 6} y1={cy - 14} x2={cx + 6} y2={cy - 14} strokeWidth="2.2" />
        <line x1={cx} y1={cy - 16} x2={cx} y2={cy - 10} strokeWidth="2.2" />
        <line x1={cx - 5} y1={cy - 11} x2={cx + 5} y2={cy - 11} strokeWidth="2.2" />
        {/* 볼 줄무늬 */}
        <path d={`M${cx - 16} ${cy - 2} L${cx - 10} ${cy}`} strokeWidth="1.5" />
        <path d={`M${cx - 17} ${cy + 2} L${cx - 10} ${cy + 3}`} strokeWidth="1.5" />
        <path d={`M${cx + 16} ${cy - 2} L${cx + 10} ${cy}`} strokeWidth="1.5" />
        <path d={`M${cx + 17} ${cy + 2} L${cx + 10} ${cy + 3}`} strokeWidth="1.5" />
        {/* 큰 눈 */}
        <circle cx={cx - 6} cy={cy - 3} r="2.5" fill={C} />
        <circle cx={cx - 5} cy={cy - 3.5} r="1" fill="white" />
        <circle cx={cx + 6} cy={cy - 3} r="2.5" fill={C} />
        <circle cx={cx + 7} cy={cy - 3.5} r="1" fill="white" />
        {/* 코 */}
        <path d={`M${cx - 2.5} ${cy + 4} L${cx} ${cy + 2} L${cx + 2.5} ${cy + 4} Z`} fill={P} stroke={C} strokeWidth="1" />
        {/* Y자 입 */}
        <path d={`M${cx} ${cy + 4} L${cx} ${cy + 7}`} />
        <path d={`M${cx} ${cy + 7} L${cx - 3} ${cy + 10}`} />
        <path d={`M${cx} ${cy + 7} L${cx + 3} ${cy + 10}`} />
      </g>
    ),
  },
  {
    // 토끼 — 매우 길고 큰 귀, 분홍 귀속, 솜뭉치 볼
    key: 'avatar-04', label: '토끼', bg: '#C9A0DC',
    render: (cx, cy) => (
      <g {...g}>
        {/* 매우 긴 귀 */}
        <ellipse cx={cx - 7} cy={cy - 24} rx="5.5" ry="16" />
        <ellipse cx={cx - 7} cy={cy - 24} rx="3" ry="12" fill={P} opacity="0.35" stroke="none" />
        <ellipse cx={cx + 7} cy={cy - 24} rx="5.5" ry="16" />
        <ellipse cx={cx + 7} cy={cy - 24} rx="3" ry="12" fill={P} opacity="0.35" stroke="none" />
        {/* 둥근 얼굴 */}
        <circle cx={cx} cy={cy + 2} r="16" />
        {/* 큰 눈 */}
        <circle cx={cx - 5} cy={cy - 1} r="2.5" fill={C} />
        <circle cx={cx - 4} cy={cy - 2} r="1" fill="white" />
        <circle cx={cx + 5} cy={cy - 1} r="2.5" fill={C} />
        <circle cx={cx + 6} cy={cy - 2} r="1" fill="white" />
        {/* 핑크 볼터치 */}
        <circle cx={cx - 10} cy={cy + 4} r="3" fill={P} opacity="0.4" stroke="none" />
        <circle cx={cx + 10} cy={cy + 4} r="3" fill={P} opacity="0.4" stroke="none" />
        {/* 분홍 ▽ 코 */}
        <path d={`M${cx - 2} ${cy + 4} L${cx} ${cy + 6.5} L${cx + 2} ${cy + 4} Z`} fill={P} stroke={C} strokeWidth="1" />
        {/* Y자 입 */}
        <path d={`M${cx} ${cy + 6.5} L${cx} ${cy + 8}`} />
        <path d={`M${cx} ${cy + 8} L${cx - 3} ${cy + 11}`} />
        <path d={`M${cx} ${cy + 8} L${cx + 3} ${cy + 11}`} />
      </g>
    ),
  },
  {
    // 용 — 뿔, 비늘, 수염, 날카로운 눈, 콧구멍에서 연기
    key: 'avatar-05', label: '용', bg: '#2EAE8F',
    render: (cx, cy) => (
      <g {...g}>
        {/* 뿔 */}
        <path d={`M${cx - 10} ${cy - 14} L${cx - 14} ${cy - 26} L${cx - 6} ${cy - 18}`} fill="#E8B730" stroke={C} strokeWidth="1.5" />
        <path d={`M${cx + 10} ${cy - 14} L${cx + 14} ${cy - 26} L${cx + 6} ${cy - 18}`} fill="#E8B730" stroke={C} strokeWidth="1.5" />
        {/* 얼굴 */}
        <ellipse cx={cx} cy={cy} rx="16" ry="17" />
        {/* 이마 비늘 */}
        <path d={`M${cx - 5} ${cy - 14} L${cx} ${cy - 10} L${cx + 5} ${cy - 14}`} strokeWidth="1.5" />
        <path d={`M${cx - 3} ${cy - 12} L${cx} ${cy - 9} L${cx + 3} ${cy - 12}`} strokeWidth="1.2" />
        {/* 날카로운 눈 */}
        <ellipse cx={cx - 7} cy={cy - 3} rx="3.5" ry="2.5" fill="white" stroke={C} strokeWidth="1.5" />
        <circle cx={cx - 6} cy={cy - 3} r="1.8" fill={C} />
        <circle cx={cx - 5.5} cy={cy - 3.5} r="0.6" fill="#E8B730" />
        <ellipse cx={cx + 7} cy={cy - 3} rx="3.5" ry="2.5" fill="white" stroke={C} strokeWidth="1.5" />
        <circle cx={cx + 8} cy={cy - 3} r="1.8" fill={C} />
        <circle cx={cx + 8.5} cy={cy - 3.5} r="0.6" fill="#E8B730" />
        {/* 콧구멍 */}
        <circle cx={cx - 3} cy={cy + 6} r="1.5" fill={C} />
        <circle cx={cx + 3} cy={cy + 6} r="1.5" fill={C} />
        {/* 콧구멍 연기 */}
        <path d={`M${cx - 5} ${cy + 4} Q${cx - 7} ${cy + 1} ${cx - 5} ${cy - 1}`} strokeWidth="1" opacity="0.4" />
        <path d={`M${cx + 5} ${cy + 4} Q${cx + 7} ${cy + 1} ${cx + 5} ${cy - 1}`} strokeWidth="1" opacity="0.4" />
        {/* 수염 */}
        <path d={`M${cx - 16} ${cy + 6} Q${cx - 10} ${cy + 10} ${cx - 6} ${cy + 8}`} strokeWidth="1.2" />
        <path d={`M${cx + 16} ${cy + 6} Q${cx + 10} ${cy + 10} ${cx + 6} ${cy + 8}`} strokeWidth="1.2" />
        {/* 입 */}
        <path d={`M${cx - 6} ${cy + 11} Q${cx} ${cy + 15} ${cx + 6} ${cy + 11}`} />
      </g>
    ),
  },
  {
    // 뱀 — 또아리 튼 몸, 갈라진 혀, 가늘한 눈
    key: 'avatar-06', label: '뱀', bg: '#7EC8B0',
    render: (cx, cy) => (
      <g {...g}>
        {/* 또아리 튼 몸통 */}
        <path d={`M${cx + 8} ${cy + 18} Q${cx + 20} ${cy + 14} ${cx + 18} ${cy + 4} Q${cx + 16} ${cy - 6} ${cx + 6} ${cy - 4} Q${cx - 4} ${cy - 2} ${cx - 8} ${cy + 6} Q${cx - 12} ${cy + 14} ${cx - 2} ${cy + 16} Q${cx + 6} ${cy + 18} ${cx + 8} ${cy + 12}`} strokeWidth="4" stroke="#7EC8B0" />
        <path d={`M${cx + 8} ${cy + 18} Q${cx + 20} ${cy + 14} ${cx + 18} ${cy + 4} Q${cx + 16} ${cy - 6} ${cx + 6} ${cy - 4} Q${cx - 4} ${cy - 2} ${cx - 8} ${cy + 6} Q${cx - 12} ${cy + 14} ${cx - 2} ${cy + 16} Q${cx + 6} ${cy + 18} ${cx + 8} ${cy + 12}`} strokeWidth="2" />
        {/* 머리 */}
        <ellipse cx={cx} cy={cy - 10} rx="10" ry="8" />
        {/* 몸 무늬 */}
        <circle cx={cx + 14} cy={cy + 2} r="2" fill="#2EAE8F" opacity="0.4" stroke="none" />
        <circle cx={cx - 6} cy={cy + 10} r="2" fill="#2EAE8F" opacity="0.4" stroke="none" />
        {/* 가늘한 눈 */}
        <ellipse cx={cx - 4} cy={cy - 12} rx="2" ry="1.2" fill={C} />
        <ellipse cx={cx + 4} cy={cy - 12} rx="2" ry="1.2" fill={C} />
        {/* 갈라진 빨간 혀 */}
        <path d={`M${cx} ${cy - 3} L${cx} ${cy + 2}`} stroke="red" strokeWidth="1.5" />
        <path d={`M${cx} ${cy + 2} L${cx - 2} ${cy + 5}`} stroke="red" strokeWidth="1.2" />
        <path d={`M${cx} ${cy + 2} L${cx + 2} ${cy + 5}`} stroke="red" strokeWidth="1.2" />
        {/* 입 */}
        <path d={`M${cx - 5} ${cy - 5} Q${cx} ${cy - 2} ${cx + 5} ${cy - 5}`} />
      </g>
    ),
  },
  {
    // 말 — 긴 얼굴, 갈기, 큰 콧구멍
    key: 'avatar-07', label: '말', bg: '#E87461',
    render: (cx, cy) => (
      <g {...g}>
        {/* 뾰족한 귀 */}
        <path d={`M${cx - 12} ${cy - 12} L${cx - 8} ${cy - 24} L${cx - 4} ${cy - 14}`} />
        <path d={`M${cx + 12} ${cy - 12} L${cx + 8} ${cy - 24} L${cx + 4} ${cy - 14}`} />
        {/* 갈기 (왼쪽에 풍성하게) */}
        <path d={`M${cx - 4} ${cy - 20} Q${cx - 14} ${cy - 22} ${cx - 12} ${cy - 14}`} strokeWidth="3" stroke="#8B4513" opacity="0.6" />
        <path d={`M${cx - 6} ${cy - 18} Q${cx - 16} ${cy - 16} ${cx - 14} ${cy - 8}`} strokeWidth="3" stroke="#8B4513" opacity="0.6" />
        <path d={`M${cx - 8} ${cy - 14} Q${cx - 18} ${cy - 10} ${cx - 16} ${cy - 2}`} strokeWidth="3" stroke="#8B4513" opacity="0.6" />
        {/* 긴 얼굴 */}
        <ellipse cx={cx} cy={cy + 2} rx="13" ry="18" />
        {/* 눈 */}
        <circle cx={cx - 5} cy={cy - 6} r="2" fill={C} />
        <circle cx={cx - 4.5} cy={cy - 6.5} r="0.7" fill="white" />
        <circle cx={cx + 5} cy={cy - 6} r="2" fill={C} />
        <circle cx={cx + 5.5} cy={cy - 6.5} r="0.7" fill="white" />
        {/* 큰 주둥이 + 콧구멍 */}
        <ellipse cx={cx} cy={cy + 10} rx="8" ry="6" fill="#F5DEB3" stroke={C} strokeWidth="1.5" />
        <ellipse cx={cx - 3} cy={cy + 9} rx="1.5" ry="2" fill={C} />
        <ellipse cx={cx + 3} cy={cy + 9} rx="1.5" ry="2" fill={C} />
        {/* 입 */}
        <path d={`M${cx - 4} ${cy + 13} Q${cx} ${cy + 16} ${cx + 4} ${cy + 13}`} />
      </g>
    ),
  },
  {
    // 양 — 풍성한 곱슬 털, 작은 얼굴, 구불구불 울
    key: 'avatar-08', label: '양', bg: '#A8D8EA',
    render: (cx, cy) => (
      <g {...g}>
        {/* 풍성한 곱슬 울 — 더 많은 원 */}
        <circle cx={cx - 12} cy={cy - 16} r="6" fill="white" stroke={C} strokeWidth="1.2" />
        <circle cx={cx} cy={cy - 19} r="6" fill="white" stroke={C} strokeWidth="1.2" />
        <circle cx={cx + 12} cy={cy - 16} r="6" fill="white" stroke={C} strokeWidth="1.2" />
        <circle cx={cx - 16} cy={cy - 8} r="6" fill="white" stroke={C} strokeWidth="1.2" />
        <circle cx={cx + 16} cy={cy - 8} r="6" fill="white" stroke={C} strokeWidth="1.2" />
        <circle cx={cx - 16} cy={cy + 2} r="5" fill="white" stroke={C} strokeWidth="1.2" />
        <circle cx={cx + 16} cy={cy + 2} r="5" fill="white" stroke={C} strokeWidth="1.2" />
        <circle cx={cx - 12} cy={cy + 10} r="5" fill="white" stroke={C} strokeWidth="1.2" />
        <circle cx={cx + 12} cy={cy + 10} r="5" fill="white" stroke={C} strokeWidth="1.2" />
        {/* 작은 베이지 얼굴 */}
        <ellipse cx={cx} cy={cy + 2} rx="10" ry="12" fill="#F5DEB3" stroke={C} strokeWidth="1.5" />
        {/* 눈 */}
        <circle cx={cx - 3.5} cy={cy - 1} r="1.8" fill={C} />
        <circle cx={cx - 3} cy={cy - 1.5} r="0.6" fill="white" />
        <circle cx={cx + 3.5} cy={cy - 1} r="1.8" fill={C} />
        <circle cx={cx + 4} cy={cy - 1.5} r="0.6" fill="white" />
        {/* 핑크 볼 */}
        <circle cx={cx - 7} cy={cy + 4} r="2.5" fill={P} opacity="0.5" stroke="none" />
        <circle cx={cx + 7} cy={cy + 4} r="2.5" fill={P} opacity="0.5" stroke="none" />
        {/* 입 */}
        <path d={`M${cx - 2} ${cy + 6} Q${cx} ${cy + 9} ${cx + 2} ${cy + 6}`} />
      </g>
    ),
  },
  {
    // 원숭이 — 하트형 안면, 큰 귀, 갈색 머리
    key: 'avatar-09', label: '원숭이', bg: '#F28B82',
    render: (cx, cy) => (
      <g {...g}>
        {/* 큰 둥근 귀 + 안쪽 색 */}
        <circle cx={cx - 20} cy={cy - 2} r="8" />
        <circle cx={cx - 20} cy={cy - 2} r="5" fill="#F5DEB3" stroke="none" />
        <circle cx={cx + 20} cy={cy - 2} r="8" />
        <circle cx={cx + 20} cy={cy - 2} r="5" fill="#F5DEB3" stroke="none" />
        {/* 머리 (갈색) */}
        <circle cx={cx} cy={cy} r="17" />
        {/* 연한 하트형 안면 */}
        <path d={`M${cx - 10} ${cy - 6} Q${cx - 10} ${cy + 14} ${cx} ${cy + 14} Q${cx + 10} ${cy + 14} ${cx + 10} ${cy - 6} Q${cx + 6} ${cy - 10} ${cx} ${cy - 6} Q${cx - 6} ${cy - 10} ${cx - 10} ${cy - 6}`} fill="#F5DEB3" stroke={C} strokeWidth="1.2" />
        {/* 큰 눈 */}
        <circle cx={cx - 5} cy={cy - 2} r="2.5" fill={C} />
        <circle cx={cx - 4.5} cy={cy - 2.5} r="1" fill="white" />
        <circle cx={cx + 5} cy={cy - 2} r="2.5" fill={C} />
        <circle cx={cx + 5.5} cy={cy - 2.5} r="1" fill="white" />
        {/* 납작한 코 */}
        <ellipse cx={cx} cy={cy + 4} rx="3" ry="2" fill="#D2691E" opacity="0.5" stroke={C} strokeWidth="1" />
        {/* 큰 웃는 입 */}
        <path d={`M${cx - 5} ${cy + 7} Q${cx} ${cy + 12} ${cx + 5} ${cy + 7}`} />
      </g>
    ),
  },
  {
    // 닭 — 빨간 벼슬, 노란 부리, 빨간 수염(육수), 풍성한 몸
    key: 'avatar-10', label: '닭', bg: '#F4A261',
    render: (cx, cy) => (
      <g {...g}>
        {/* 빨간 벼슬 (3개 봉우리) */}
        <path d={`M${cx - 4} ${cy - 16} Q${cx - 6} ${cy - 28} ${cx} ${cy - 22} Q${cx + 2} ${cy - 30} ${cx + 4} ${cy - 22} Q${cx + 8} ${cy - 28} ${cx + 6} ${cy - 16}`} fill="#FF3B30" stroke={C} strokeWidth="1.2" />
        {/* 둥근 머리 */}
        <circle cx={cx} cy={cy - 2} r="17" />
        {/* 눈 */}
        <circle cx={cx - 5} cy={cy - 5} r="2" fill={C} />
        <circle cx={cx - 4.5} cy={cy - 5.5} r="0.7" fill="white" />
        <circle cx={cx + 5} cy={cy - 5} r="2" fill={C} />
        <circle cx={cx + 5.5} cy={cy - 5.5} r="0.7" fill="white" />
        {/* 핑크볼 */}
        <circle cx={cx - 10} cy={cy} r="2.5" fill={P} opacity="0.4" stroke="none" />
        <circle cx={cx + 10} cy={cy} r="2.5" fill={P} opacity="0.4" stroke="none" />
        {/* 노란 뾰족 부리 */}
        <path d={`M${cx - 5} ${cy + 1} L${cx} ${cy + 7} L${cx + 5} ${cy + 1}`} fill="#FFD700" stroke={C} strokeWidth="1.5" />
        {/* 빨간 육수 */}
        <path d={`M${cx - 2} ${cy + 7} Q${cx} ${cy + 14} ${cx + 2} ${cy + 7}`} fill="#FF3B30" stroke={C} strokeWidth="1" />
      </g>
    ),
  },
  {
    // 개 — 늘어진 귀, 큰 코, 혀, 목걸이
    key: 'avatar-11', label: '개', bg: '#B5B843',
    render: (cx, cy) => (
      <g {...g}>
        {/* 축 늘어진 귀 */}
        <ellipse cx={cx - 18} cy={cy - 2} rx="6" ry="14" transform={`rotate(-10 ${cx - 18} ${cy - 2})`} fill="#D2B48C" opacity="0.3" stroke={C} />
        <ellipse cx={cx + 18} cy={cy - 2} rx="6" ry="14" transform={`rotate(10 ${cx + 18} ${cy - 2})`} fill="#D2B48C" opacity="0.3" stroke={C} />
        {/* 머리 */}
        <circle cx={cx} cy={cy} r="16" />
        {/* 이마 반점 */}
        <circle cx={cx} cy={cy - 10} r="5" fill="#D2B48C" opacity="0.25" stroke="none" />
        {/* 반짝이는 큰 눈 */}
        <circle cx={cx - 6} cy={cy - 3} r="3" fill={C} />
        <circle cx={cx - 5} cy={cy - 4} r="1.2" fill="white" />
        <circle cx={cx + 6} cy={cy - 3} r="3" fill={C} />
        <circle cx={cx + 7} cy={cy - 4} r="1.2" fill="white" />
        {/* 큰 까만 코 */}
        <ellipse cx={cx} cy={cy + 4} rx="3.5" ry="2.5" fill={C} />
        {/* 내민 혀 */}
        <path d={`M${cx - 3} ${cy + 8} Q${cx} ${cy + 15} ${cx + 3} ${cy + 8}`} fill={P} stroke={C} strokeWidth="1" />
        {/* 입 */}
        <path d={`M${cx} ${cy + 6} L${cx - 5} ${cy + 8}`} />
        <path d={`M${cx} ${cy + 6} L${cx + 5} ${cy + 8}`} />
      </g>
    ),
  },
  {
    // 돼지 — 큰 코, 둥근 콧구멍, 동글한 귀, 핑크 톤
    key: 'avatar-12', label: '돼지', bg: '#F28B82',
    render: (cx, cy) => (
      <g {...g}>
        {/* 동그란 귀 */}
        <ellipse cx={cx - 14} cy={cy - 14} r="7" fill={P} opacity="0.3" stroke={C} />
        <ellipse cx={cx + 14} cy={cy - 14} r="7" fill={P} opacity="0.3" stroke={C} />
        {/* 둥근 얼굴 */}
        <circle cx={cx} cy={cy} r="17" />
        {/* 큰 눈 */}
        <circle cx={cx - 6} cy={cy - 5} r="2.5" fill={C} />
        <circle cx={cx - 5.5} cy={cy - 5.5} r="1" fill="white" />
        <circle cx={cx + 6} cy={cy - 5} r="2.5" fill={C} />
        <circle cx={cx + 6.5} cy={cy - 5.5} r="1" fill="white" />
        {/* 핑크 볼 */}
        <circle cx={cx - 11} cy={cy + 2} r="3" fill={P} opacity="0.4" stroke="none" />
        <circle cx={cx + 11} cy={cy + 2} r="3" fill={P} opacity="0.4" stroke="none" />
        {/* 크고 둥근 돼지코 */}
        <ellipse cx={cx} cy={cy + 4} rx="7" ry="5" fill={P} stroke={C} strokeWidth="1.5" />
        <ellipse cx={cx - 2.5} cy={cy + 4} rx="2" ry="1.5" fill={C} />
        <ellipse cx={cx + 2.5} cy={cy + 4} rx="2" ry="1.5" fill={C} />
        {/* 입 */}
        <path d={`M${cx - 3} ${cy + 11} Q${cx} ${cy + 14} ${cx + 3} ${cy + 11}`} />
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
