import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Plane, Users, Gift, Heart, Cake, BookOpen, Briefcase,
  ChevronRight, MapPin, Calendar, ArrowRight, Loader2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface JobPosting {
  id: string
  title: string
  department_id: string
  position: string | null
  employment_type: string
  experience_level: string
  deadline: string | null
  location: string | null
  headcount: number | null
  created_at: string
  department_name?: string
}

const BENEFITS = [
  { no: '01', title: '휴가제도', desc: '리프레시 여름 휴가 제공으로 재충전의 기회 보장', icon: Plane },
  { no: '02', title: 'OH! FRIENDLY DAY', desc: '매월 1회, 직원들과의 랜덤 회식으로 유대감 강화', icon: Users },
  { no: '03', title: '명절 혜택', desc: '설 & 추석 등 명절 상품권 지급', icon: Gift },
  { no: '04', title: '경조사 지원', desc: '화환 제공, 경조 휴가 및 비용 지원 등 전방위 지원', icon: Heart },
  { no: '05', title: '생일 복지', desc: '생일 파티, 케이크, 선물, 반차 제공으로 특별한 하루 선사', icon: Cake },
  { no: '06', title: '건강 케어', desc: '사내 헬스키퍼 상주, 정기 건강검진 제공', icon: Heart },
  { no: '07', title: '교육 및 성장', desc: '체계적인 신규 입사자 교육, 빠르고 유연한 승진 기회 제공', icon: BookOpen },
  { no: '08', title: '근무환경', desc: '스마트 오피스 운영, 자율복장, 업무용 개인 노트북 지급, 초역세권 위치', icon: Briefcase },
]

const TALENT_TRAITS = [
  '조직문화에서의 원활한 커뮤니케이션',
  '적극적이고 주도적인 자세',
  '고객 만족과 클라이언트 지향적인 자세',
  '변함없는 열정과 노력',
  '시대에 맞는 트렌드에 대한 이해',
]

const EMP_TYPE_LABELS: Record<string, string> = {
  full_time: '정규직', contract: '계약직', intern: '인턴', part_time: '파트타임',
}

const EXP_LABELS: Record<string, string> = {
  any: '경력무관', entry: '신입', junior: '주니어', mid: '경력', senior: '시니어', executive: '임원',
}

export default function CareersPage() {
  const [postings, setPostings] = useState<JobPosting[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('job_postings')
        .select('id, title, department_id, position, employment_type, experience_level, deadline, location, headcount, created_at')
        .eq('status', 'open')
        .order('created_at', { ascending: false })

      if (data) {
        const { data: depts } = await supabase.from('departments').select('id, name')
        const deptMap = new Map((depts || []).map((d: any) => [d.id, d.name]))
        setPostings(data.map((p: any) => ({ ...p, department_name: deptMap.get(p.department_id) || '' })))
      }
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="min-h-screen bg-white">
      {/* ① Hero */}
      <section className="relative bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 min-h-[70vh] flex items-center justify-center text-center px-6">
        <div className="absolute inset-0 bg-black/30" />
        <div className="relative z-10 max-w-3xl mx-auto">
          <p className="text-purple-300 text-sm font-bold tracking-[0.3em] mb-6">RECRUIT</p>
          <h1 className="text-white text-3xl md:text-4xl lg:text-5xl font-bold leading-tight mb-6">
            (주)인터오리진아이엔씨에<br />
            도전하는 많은 인재들을<br />
            기다리고 있습니다.
          </h1>
          <p className="text-gray-300 text-base md:text-lg">
            함께 성장하고, 함께 만들어가는 인터오리진
          </p>
          <a href="#openings" className="inline-flex items-center gap-2 mt-8 px-8 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-full font-semibold transition-colors">
            채용 공고 보기 <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      {/* ② 복지 */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">복지</h2>
          <p className="text-center text-gray-500 mb-12">인터오리진과 함께하는 즐거운 일상</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {BENEFITS.map((b) => (
              <div key={b.no} className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow border border-gray-100">
                <div className="flex items-start justify-between mb-4">
                  <span className="text-2xl font-bold text-purple-600">{b.no}</span>
                  <b.icon className="h-6 w-6 text-purple-400" />
                </div>
                <h3 className="font-bold text-gray-800 text-sm mb-1.5">{b.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ③ 인재상 */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">인재상</h2>
          <p className="text-center text-gray-500 mb-12">인터오리진이 찾는 인재</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {TALENT_TRAITS.map((trait, i) => (
              <div key={i} className="text-center p-5 bg-purple-50 rounded-2xl border border-purple-100">
                <div className="w-12 h-12 bg-purple-600 text-white rounded-full flex items-center justify-center mx-auto mb-3 text-lg font-bold">
                  {i + 1}
                </div>
                <p className="text-sm font-medium text-gray-700 leading-relaxed">{trait}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ④ 채용 프로세스 */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">채용 프로세스</h2>
          <div className="flex items-center justify-center gap-2 md:gap-6">
            {[
              { step: '01', label: '서류전형' },
              { step: '02', label: '실무면접' },
              { step: '03', label: '최종입사' },
            ].map((s, i) => (
              <div key={s.step} className="flex items-center gap-2 md:gap-6">
                <div className="text-center">
                  <div className="w-20 h-20 md:w-24 md:h-24 bg-purple-600 text-white rounded-2xl flex flex-col items-center justify-center mx-auto shadow-lg">
                    <span className="text-xs font-bold opacity-70">{s.step}</span>
                    <span className="text-sm md:text-base font-bold mt-0.5">{s.label}</span>
                  </div>
                </div>
                {i < 2 && <ChevronRight className="h-6 w-6 text-purple-300 shrink-0" />}
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-500 mt-8">
            ※ 필수 제출서류: 이력서 및 자기소개서, 경력기술서, 포트폴리오
          </p>
        </div>
      </section>

      {/* ⑤ 채용 공고 */}
      <section id="openings" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center gap-3 mb-12">
            <h2 className="text-3xl font-bold text-gray-900">현재 채용 중</h2>
            <span className="bg-purple-600 text-white text-sm font-bold px-3 py-1 rounded-full">
              {postings.length}
            </span>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-purple-600 mx-auto" />
            </div>
          ) : postings.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 rounded-2xl">
              <p className="text-gray-500 text-lg">현재 진행 중인 채용 공고가 없습니다.</p>
              <p className="text-gray-400 text-sm mt-2">새로운 포지션이 오픈되면 업데이트됩니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {postings.map((p) => (
                <div key={p.id} className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-lg transition-shadow group">
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2.5 py-1 rounded-full">
                      {p.department_name || '부서 미지정'}
                    </span>
                    {p.headcount && (
                      <span className="text-xs text-gray-400">{p.headcount}명 모집</span>
                    )}
                  </div>
                  <h3 className="font-bold text-gray-900 text-lg mb-3 group-hover:text-purple-700 transition-colors leading-snug">
                    {p.title}
                  </h3>
                  <div className="space-y-1.5 text-sm text-gray-500 mb-5">
                    <div className="flex items-center gap-1.5">
                      <Briefcase className="h-3.5 w-3.5" />
                      <span>{EMP_TYPE_LABELS[p.employment_type] || p.employment_type} · {EXP_LABELS[p.experience_level] || p.experience_level}</span>
                    </div>
                    {p.location && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        <span>{p.location}</span>
                      </div>
                    )}
                    {p.deadline && (
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>마감: {p.deadline}</span>
                      </div>
                    )}
                  </div>
                  <Link
                    to={`/apply/${p.id}`}
                    className="block w-full text-center py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold text-sm transition-colors"
                  >
                    지원하기
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 푸터 */}
      <footer className="bg-gray-900 text-gray-400 py-12 px-6 text-center">
        <p className="text-lg font-bold text-white mb-2">INTEROHRIGIN INC.</p>
        <p className="text-sm">서울시 강남구 선릉로 121길 5, 인터오리진타워</p>
        <p className="text-sm mt-1">채용 문의: hr@interohrigin.com | 02-783-8138</p>
        <p className="text-xs mt-4 text-gray-600">© 2026 Interohrigin Inc. All rights reserved.</p>
      </footer>
    </div>
  )
}
