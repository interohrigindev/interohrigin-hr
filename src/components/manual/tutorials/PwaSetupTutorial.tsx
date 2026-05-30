/**
 * PWA 설치 + 푸시 알림 시각적 튜토리얼
 *
 * - OS 선택 (모바일/노트북) 큰 토글
 * - OS 별 단계 카드 (큰 번호 + 시각 mockup + 명확한 액션)
 * - 페이크 스크린샷 (Tailwind 기반 미니 mockup — Safari/Chrome/macOS 시스템 설정 흉내)
 * - 트러블슈팅 섹션 (펼침 카드)
 * - FAQ 아코디언
 */
import { useState, type ReactNode } from 'react'
import {
  Smartphone, Laptop, Apple, ChevronDown, ChevronUp, Bell,
  CheckCircle, AlertTriangle, Share2, MoreVertical, Plus,
  Settings as SettingsIcon, Lock,
} from 'lucide-react'

type RootChoice = 'mobile' | 'desktop'
type MobileOs = 'ios' | 'android'
type DesktopOs = 'mac' | 'windows'

export function PwaSetupTutorial() {
  const [root, setRoot] = useState<RootChoice>('mobile')
  const [mobileOs, setMobileOs] = useState<MobileOs>('ios')
  const [desktopOs, setDesktopOs] = useState<DesktopOs>('mac')

  return (
    <div className="space-y-6">
      {/* 헤더 — 그라데이션 카드 */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-lg">
        <div className="flex items-center gap-3 mb-2">
          <div className="rounded-xl bg-white/20 backdrop-blur p-2">
            <Bell className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold">앱(PWA) 설치 + 푸시 알림 받기</h2>
            <p className="text-sm text-white/85 mt-0.5">결재가 오면 즉시 푸시·매일 미결재 자동 리마인더</p>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3 text-xs text-white/90 flex-wrap">
          <span className="inline-flex items-center gap-1 bg-white/15 rounded-full px-2 py-1">⏱ 약 3분</span>
          <span className="inline-flex items-center gap-1 bg-white/15 rounded-full px-2 py-1">📋 6단계</span>
          <span className="inline-flex items-center gap-1 bg-white/15 rounded-full px-2 py-1">📱💻 모바일·노트북 공통</span>
        </div>
      </div>

      {/* 큰 OS 선택 토글 */}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">어떤 기기에 설치할까요?</p>
        <div className="grid grid-cols-2 gap-3">
          <RootToggle
            active={root === 'mobile'}
            onClick={() => setRoot('mobile')}
            icon={<Smartphone className="h-6 w-6" />}
            label="📱 모바일"
            sub="아이폰 / 안드로이드"
            accent="from-sky-500 to-blue-600"
          />
          <RootToggle
            active={root === 'desktop'}
            onClick={() => setRoot('desktop')}
            icon={<Laptop className="h-6 w-6" />}
            label="💻 노트북"
            sub="Mac / Windows"
            accent="from-violet-500 to-fuchsia-600"
          />
        </div>
      </div>

      {/* 모바일 가이드 */}
      {root === 'mobile' && (
        <div className="space-y-5">
          <SubTab
            value={mobileOs}
            onChange={(v) => setMobileOs(v as MobileOs)}
            options={[
              { value: 'ios', label: '🍎 아이폰 (iOS)' },
              { value: 'android', label: '🤖 안드로이드' },
            ]}
          />

          {mobileOs === 'ios' && <MobileIosGuide />}
          {mobileOs === 'android' && <MobileAndroidGuide />}
        </div>
      )}

      {/* 노트북 가이드 */}
      {root === 'desktop' && (
        <div className="space-y-5">
          <SubTab
            value={desktopOs}
            onChange={(v) => setDesktopOs(v as DesktopOs)}
            options={[
              { value: 'mac', label: '🍎 Mac' },
              { value: 'windows', label: '🪟 Windows' },
            ]}
          />

          {desktopOs === 'mac' && <DesktopMacGuide />}
          {desktopOs === 'windows' && <DesktopWindowsGuide />}
        </div>
      )}

      {/* 공통 — 테스트 + FAQ */}
      <TestAndFAQSection />
    </div>
  )
}

// ─── 큰 OS 토글 ────────────────────────────────────────────────
function RootToggle({
  active, onClick, icon, label, sub, accent,
}: {
  active: boolean; onClick: () => void; icon: ReactNode; label: string; sub: string; accent: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative text-left rounded-xl p-4 border-2 transition-all ${
        active
          ? `border-transparent bg-gradient-to-br ${accent} text-white shadow-md`
          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
      }`}
    >
      <div className="flex items-center gap-2">
        {icon}
        <div>
          <p className="text-sm font-bold">{label}</p>
          <p className={`text-[11px] ${active ? 'text-white/80' : 'text-gray-500'}`}>{sub}</p>
        </div>
      </div>
      {active && (
        <div className="absolute top-2 right-2">
          <CheckCircle className="h-4 w-4 text-white/90" />
        </div>
      )}
    </button>
  )
}

// ─── 서브 탭 ───────────────────────────────────────────────────
function SubTab({
  value, onChange, options,
}: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            value === o.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ─── Step 카드 ─────────────────────────────────────────────────
function StepCard({
  step, total, title, summary, accent = 'brand', children,
}: {
  step: number; total: number; title: string; summary?: string; accent?: 'brand' | 'amber' | 'emerald' | 'sky' | 'rose'
  children: ReactNode
}) {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    brand: { bg: 'bg-brand-100', text: 'text-brand-700', border: 'border-brand-200' },
    amber: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
    emerald: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' },
    sky: { bg: 'bg-sky-100', text: 'text-sky-700', border: 'border-sky-200' },
    rose: { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200' },
  }
  const c = colors[accent]
  return (
    <div className={`rounded-xl border ${c.border} bg-white overflow-hidden shadow-sm`}>
      <div className={`flex items-center gap-3 px-4 py-3 ${c.bg}`}>
        <div className={`flex items-center justify-center w-9 h-9 rounded-full bg-white ${c.text} font-bold text-sm shadow`}>
          {step}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${c.text}`}>{title}</p>
          {summary && <p className="text-xs text-gray-700 mt-0.5">{summary}</p>}
        </div>
        <span className="text-[10px] text-gray-500 shrink-0">{step}/{total}</span>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  )
}

// ─── 액션 안내 라인 ────────────────────────────────────────────
function ActionLine({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-gray-800 flex items-start gap-2">
      <span className="text-emerald-500 shrink-0 mt-0.5">▸</span>
      <span>{children}</span>
    </p>
  )
}

// ─── 작은 키캡 / 코드 ─────────────────────────────────────────
function KBD({ children }: { children: ReactNode }) {
  return (
    <code className="inline-block px-1.5 py-0.5 rounded bg-gray-900 text-amber-200 text-[11px] font-mono mx-0.5">
      {children}
    </code>
  )
}

// ─── 폰 mockup (iOS Safari) ────────────────────────────────────
function PhoneMockupIos() {
  return (
    <div className="flex justify-center py-2">
      <div className="relative w-[200px] h-[360px] rounded-[28px] border-[6px] border-gray-900 bg-white shadow-lg overflow-hidden">
        {/* 노치 */}
        <div className="absolute top-1 left-1/2 -translate-x-1/2 h-4 w-20 rounded-full bg-gray-900 z-10" />
        {/* Safari 상단 바 */}
        <div className="pt-6 px-2 bg-gray-100 border-b border-gray-200 text-[8px] text-gray-600">
          <div className="bg-white rounded-md px-2 py-1 text-center text-[8px] truncate">hr.interohrigin.com</div>
        </div>
        {/* 본문 페이크 */}
        <div className="px-2 py-2 space-y-1.5">
          <div className="h-3 w-3/4 rounded bg-brand-200" />
          <div className="h-2 w-full rounded bg-gray-200" />
          <div className="h-2 w-5/6 rounded bg-gray-200" />
          <div className="h-12 rounded bg-brand-50 border border-brand-100 mt-2" />
        </div>
        {/* Safari 하단 툴바 — 공유 버튼 강조 */}
        <div className="absolute bottom-0 left-0 right-0 bg-gray-100 border-t border-gray-200 px-2 py-2 flex justify-around items-center">
          <div className="h-3 w-3 rounded bg-gray-300" />
          <div className="relative">
            <div className="h-6 w-6 rounded-full bg-blue-500 flex items-center justify-center animate-pulse ring-2 ring-blue-300">
              <Share2 className="h-3 w-3 text-white" />
            </div>
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[8px] rounded px-1.5 py-0.5 whitespace-nowrap">
              여기 탭!
            </div>
          </div>
          <div className="h-3 w-3 rounded bg-gray-300" />
          <div className="h-3 w-3 rounded bg-gray-300" />
        </div>
      </div>
    </div>
  )
}

// ─── 폰 mockup (iOS 공유 시트) ──────────────────────────────────
function PhoneMockupIosShareSheet() {
  return (
    <div className="flex justify-center py-2">
      <div className="relative w-[200px] h-[360px] rounded-[28px] border-[6px] border-gray-900 bg-gray-800 shadow-lg overflow-hidden">
        <div className="absolute top-1 left-1/2 -translate-x-1/2 h-4 w-20 rounded-full bg-gray-900 z-10" />
        {/* 어두운 배경 (공유 시트가 띄워진 상태) */}
        <div className="absolute inset-0 bg-black/40" />
        {/* 공유 시트 */}
        <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur rounded-t-2xl p-2 space-y-1">
          <div className="h-1 w-8 rounded-full bg-gray-300 mx-auto mb-2" />
          <ShareRow label="복사" icon="🔗" />
          <ShareRow label="리딩 리스트" icon="👓" />
          <div className="relative">
            <ShareRow label="홈 화면에 추가" icon="➕" highlight />
            <div className="absolute -right-1 top-1/2 -translate-y-1/2 bg-emerald-500 text-white text-[8px] rounded-full px-1.5 py-0.5 shadow animate-pulse">
              선택!
            </div>
          </div>
          <ShareRow label="공유..." icon="📤" />
        </div>
      </div>
    </div>
  )
}
function ShareRow({ label, icon, highlight }: { label: string; icon: string; highlight?: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 rounded text-[9px] ${highlight ? 'bg-emerald-100 ring-1 ring-emerald-400' : ''}`}>
      <span className="text-base">{icon}</span>
      <span className={highlight ? 'font-bold text-emerald-900' : 'text-gray-800'}>{label}</span>
    </div>
  )
}

// ─── 폰 mockup (Android Chrome 메뉴) ───────────────────────────
function PhoneMockupAndroidMenu() {
  return (
    <div className="flex justify-center py-2">
      <div className="relative w-[200px] h-[360px] rounded-[20px] border-[6px] border-gray-900 bg-white shadow-lg overflow-hidden">
        {/* Chrome 상단 바 */}
        <div className="px-2 py-2 bg-gray-100 border-b flex items-center gap-1">
          <div className="bg-white rounded-full px-2 py-1 text-[8px] truncate flex-1">hr.interohrigin.com</div>
          <div className="relative">
            <div className="h-5 w-5 rounded-full bg-gray-200 flex items-center justify-center animate-pulse ring-2 ring-blue-300">
              <MoreVertical className="h-3 w-3 text-gray-700" />
            </div>
          </div>
        </div>
        {/* Chrome 메뉴 (펼침) */}
        <div className="absolute top-12 right-2 w-[140px] bg-white shadow-xl rounded-lg border py-1 z-10">
          <div className="px-2 py-1 text-[9px] text-gray-600">새 탭</div>
          <div className="px-2 py-1 text-[9px] text-gray-600">북마크</div>
          <div className="relative">
            <div className="px-2 py-1 text-[9px] font-bold bg-emerald-100 text-emerald-900 ring-1 ring-emerald-400 rounded mx-1 flex items-center gap-1">
              <Plus className="h-2.5 w-2.5" />앱 설치
            </div>
            <div className="absolute -right-1 top-1/2 -translate-y-1/2 bg-emerald-500 text-white text-[8px] rounded-full px-1.5 py-0.5 shadow animate-pulse">
              선택!
            </div>
          </div>
          <div className="px-2 py-1 text-[9px] text-gray-600">설정</div>
        </div>
        <div className="px-2 pt-2 space-y-1">
          <div className="h-3 w-3/4 rounded bg-gray-200" />
          <div className="h-2 w-full rounded bg-gray-100" />
        </div>
      </div>
    </div>
  )
}

// ─── 알림 권한 팝업 mockup ──────────────────────────────────────
function NotificationPermissionMockup() {
  return (
    <div className="flex justify-center py-2">
      <div className="w-[260px] bg-white rounded-xl shadow-lg border border-gray-200 p-3">
        <div className="flex items-start gap-2 mb-2">
          <div className="rounded-lg bg-amber-100 p-2 shrink-0">
            <Bell className="h-4 w-4 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-gray-900">hr.interohrigin.com 에서 알림을 표시하려고 합니다</p>
            <p className="text-[10px] text-gray-500 mt-0.5">결재·미결재 리마인더를 받을 수 있습니다.</p>
          </div>
        </div>
        <div className="flex gap-2 mt-2">
          <button className="flex-1 text-[10px] text-gray-600 py-1.5 rounded border border-gray-300">차단</button>
          <button className="flex-1 text-[10px] font-bold text-white py-1.5 rounded bg-emerald-500 ring-2 ring-emerald-300 animate-pulse">허용</button>
        </div>
      </div>
    </div>
  )
}

// ─── Chrome 주소창 mockup (PC) ────────────────────────────────
function ChromeAddressBarMockup({ highlightInstall }: { highlightInstall?: boolean }) {
  return (
    <div className="rounded-lg border bg-gray-100 p-2 max-w-md mx-auto">
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <div className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
          <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
        </div>
        <div className="flex-1 bg-white rounded-full px-3 py-1.5 text-xs text-gray-700 flex items-center gap-2">
          <Lock className="h-3 w-3 text-gray-500" />
          <span className="truncate">hr.interohrigin.com</span>
          {highlightInstall && (
            <div className="relative ml-auto">
              <div className="h-5 w-5 rounded-full bg-emerald-100 ring-2 ring-emerald-400 flex items-center justify-center animate-pulse">
                <Plus className="h-3 w-3 text-emerald-700" />
              </div>
              <div className="absolute -top-7 right-0 bg-emerald-500 text-white text-[9px] rounded px-1.5 py-0.5 whitespace-nowrap shadow">
                설치 클릭!
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Chrome flag mockup ────────────────────────────────────────
function ChromeFlagMockup() {
  return (
    <div className="rounded-lg border bg-white p-3 shadow-sm max-w-lg mx-auto">
      <div className="text-[10px] text-gray-500 font-mono mb-2 px-2 py-1 bg-gray-50 rounded">
        chrome://flags/#enable-mac-pwas-notification-attribution
      </div>
      <div className="flex items-start gap-3 p-2 border-l-4 border-amber-400 bg-amber-50">
        <div className="flex-1">
          <p className="text-xs font-bold text-gray-900">Mac PWA notification attribution</p>
          <p className="text-[10px] text-gray-600 mt-0.5">Route notifications for PWAs on Mac through the app shim...</p>
        </div>
        <div className="relative shrink-0">
          <div className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-emerald-600 rounded px-2 py-1 ring-2 ring-emerald-300 animate-pulse">
            Enabled <ChevronDown className="h-3 w-3" />
          </div>
          <div className="absolute -top-6 right-0 bg-emerald-500 text-white text-[9px] rounded px-1.5 py-0.5 whitespace-nowrap shadow">
            이걸로 변경!
          </div>
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <button className="text-[10px] font-bold text-white bg-blue-600 rounded px-3 py-1.5 shadow">
          Relaunch
        </button>
      </div>
    </div>
  )
}

// ─── macOS 시스템 설정 알림 mockup ─────────────────────────────
function MacNotificationSettingsMockup() {
  return (
    <div className="rounded-lg border bg-white shadow-sm max-w-lg mx-auto overflow-hidden">
      {/* macOS 윈도우 헤더 */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 border-b">
        <div className="flex gap-1">
          <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <div className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
          <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
        </div>
        <span className="text-[11px] text-gray-600 mx-auto">시스템 설정 — 알림</span>
      </div>
      <div className="p-3">
        <p className="text-[10px] text-gray-500 mb-2">응용 프로그램 알림</p>
        <div className="flex items-center gap-2 p-2 rounded ring-2 ring-brand-300 bg-brand-50">
          <div className="h-8 w-8 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold text-xs">IO</div>
          <div className="flex-1">
            <p className="text-xs font-bold text-gray-900">인터오리진 HR플랫폼</p>
            <p className="text-[10px] text-gray-600">배지, 사운드 및 데스크탑</p>
          </div>
          <span className="text-[10px] text-brand-700">클릭 →</span>
        </div>
        <div className="mt-3 space-y-1.5 text-[11px]">
          <ToggleLine label="알림 허용" on />
          <div className="flex items-center justify-between px-2 py-1 bg-gray-50 rounded">
            <span>알림 스타일</span>
            <span className="font-bold text-brand-700">알림 (또는 배너)</span>
          </div>
          <ToggleLine label="잠금 화면에 표시" on />
          <ToggleLine label="알림 센터에 표시" on highlight />
          <ToggleLine label="앱 아이콘 배지" on />
        </div>
      </div>
    </div>
  )
}
function ToggleLine({ label, on, highlight }: { label: string; on: boolean; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-2 py-1 rounded ${highlight ? 'bg-emerald-50 ring-1 ring-emerald-300' : 'bg-gray-50'}`}>
      <span className="text-gray-800">{label}</span>
      <div className={`w-7 h-4 rounded-full relative ${on ? 'bg-emerald-500' : 'bg-gray-300'}`}>
        <div className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow ${on ? 'right-0.5' : 'left-0.5'}`} />
      </div>
    </div>
  )
}

// ─── 모바일 iOS 가이드 ─────────────────────────────────────────
function MobileIosGuide() {
  return (
    <div className="space-y-3">
      <CalloutBox kind="warning">
        <span className="text-amber-900 text-sm">
          <strong>iOS 16.4 이상</strong> 이어야 푸시가 동작합니다. <KBD>설정 → 일반 → 정보 → 소프트웨어 버전</KBD> 에서 확인.
        </span>
      </CalloutBox>

      <StepCard step={1} total={3} title="Safari 에서 홈 화면에 추가" summary="공유 버튼 → '홈 화면에 추가'" accent="sky">
        <PhoneMockupIos />
        <ActionLine>Safari 로 <KBD>hr.interohrigin.com</KBD> 접속</ActionLine>
        <ActionLine>화면 하단 <strong>공유 아이콘</strong> 탭</ActionLine>
      </StepCard>

      <StepCard step={2} total={3} title="공유 시트에서 '홈 화면에 추가' 선택" accent="sky">
        <PhoneMockupIosShareSheet />
        <ActionLine>스크롤 후 <strong>"홈 화면에 추가"</strong> 탭</ActionLine>
        <ActionLine>우상단 <KBD>추가</KBD> 탭 → 홈 화면에 "IO HR" 아이콘 생성</ActionLine>
      </StepCard>

      <StepCard step={3} total={3} title="홈 화면 아이콘으로 열고 알림 허용" summary="Safari 가 아니라 반드시 홈 화면 아이콘으로!" accent="emerald">
        <NotificationPermissionMockup />
        <ActionLine>홈 화면의 <strong>IO HR 아이콘</strong> 탭 → 앱 실행</ActionLine>
        <ActionLine>로그인 직후 "알림 허용" 팝업 → <strong>허용</strong> 탭</ActionLine>
      </StepCard>

      <TroubleShootBox os="ios" />
    </div>
  )
}

// ─── 모바일 Android 가이드 ─────────────────────────────────────
function MobileAndroidGuide() {
  return (
    <div className="space-y-3">
      <StepCard step={1} total={2} title="Chrome 메뉴에서 '앱 설치'" accent="sky">
        <PhoneMockupAndroidMenu />
        <ActionLine>Chrome 으로 <KBD>hr.interohrigin.com</KBD> 접속</ActionLine>
        <ActionLine>우상단 <strong>⋮ (메뉴)</strong> 탭 → <strong>"앱 설치"</strong> 또는 <strong>"홈 화면에 추가"</strong></ActionLine>
        <ActionLine>홈 화면에 자동으로 아이콘 생성됨</ActionLine>
      </StepCard>

      <StepCard step={2} total={2} title="앱 실행 후 알림 권한 허용" accent="emerald">
        <NotificationPermissionMockup />
        <ActionLine>홈 화면 IO HR 아이콘 탭 → 로그인 → "알림 허용" 팝업 → <strong>허용</strong></ActionLine>
      </StepCard>

      <TroubleShootBox os="android" />
    </div>
  )
}

// ─── 노트북 Mac 가이드 ─────────────────────────────────────────
function DesktopMacGuide() {
  return (
    <div className="space-y-3">
      <StepCard step={1} total={4} title="Chrome 에서 앱 설치" accent="sky">
        <ChromeAddressBarMockup highlightInstall />
        <ActionLine>Chrome 으로 <KBD>hr.interohrigin.com</KBD> 접속</ActionLine>
        <ActionLine>주소창 우측의 <strong>설치 아이콘(⊕)</strong> 클릭 → "설치"</ActionLine>
        <ActionLine>Launchpad / Dock 에 "인터오리진 HR플랫폼" 아이콘 생성</ActionLine>
      </StepCard>

      <StepCard step={2} total={4} title="앱 실행 후 알림 권한 허용" accent="emerald">
        <NotificationPermissionMockup />
        <ActionLine>설치된 IO HR 앱 실행 (Dock 또는 Launchpad) → 로그인 → "알림 허용" 팝업 → <strong>허용</strong></ActionLine>
      </StepCard>

      <CalloutBox kind="critical">
        <span className="text-rose-900 text-sm">
          <Apple className="inline h-4 w-4 mr-1" />
          <strong>Mac 사용자 필수 추가 단계 ↓</strong> 이걸 안 하면 푸시가 macOS 시스템 알림으로 전달되지 않습니다.
        </span>
      </CalloutBox>

      <StepCard step={3} total={4} title="Chrome flag 활성화 (Mac PWA notification attribution)" summary="Chrome 148 기준 macOS PWA 푸시의 필수 설정" accent="amber">
        <ChromeFlagMockup />
        <ActionLine>앱 또는 Chrome 주소창에 입력: <KBD>chrome://flags/#enable-mac-pwas-notification-attribution</KBD></ActionLine>
        <ActionLine>드롭다운을 <strong>"Enabled"</strong> 로 변경</ActionLine>
        <ActionLine>하단 파란색 <strong>"Relaunch"</strong> 버튼 클릭 → Chrome 재시작</ActionLine>
      </StepCard>

      <StepCard step={4} total={4} title="macOS 시스템 알림 권한 확인" summary="시스템 설정 → 알림 → 인터오리진 HR플랫폼" accent="amber">
        <MacNotificationSettingsMockup />
        <ActionLine><Apple className="inline h-3 w-3" /> → <strong>시스템 설정</strong> → <strong>알림</strong></ActionLine>
        <ActionLine>응용 프로그램 알림 목록 → <strong>"인터오리진 HR플랫폼"</strong> 클릭</ActionLine>
        <ActionLine>모든 토글 ON, 특히 <strong>"알림 센터에 표시"</strong> 가 OFF 면 알림센터 누적 안 됨</ActionLine>
      </StepCard>

      <TroubleShootBox os="mac" />
    </div>
  )
}

// ─── 노트북 Windows 가이드 ─────────────────────────────────────
function DesktopWindowsGuide() {
  return (
    <div className="space-y-3">
      <StepCard step={1} total={2} title="Chrome 에서 앱 설치" accent="sky">
        <ChromeAddressBarMockup highlightInstall />
        <ActionLine>Chrome 으로 <KBD>hr.interohrigin.com</KBD> 접속</ActionLine>
        <ActionLine>주소창 우측의 <strong>설치 아이콘(⊕)</strong> 클릭 → "설치"</ActionLine>
        <ActionLine>시작 메뉴 / 작업표시줄에 "인터오리진 HR플랫폼" 생성</ActionLine>
      </StepCard>

      <StepCard step={2} total={2} title="앱 실행 후 알림 권한 허용" accent="emerald">
        <NotificationPermissionMockup />
        <ActionLine>설치된 IO HR 앱 실행 → 로그인 → "알림 허용" 팝업 → <strong>허용</strong></ActionLine>
        <ActionLine>Windows 알림 센터에 자동 표시</ActionLine>
      </StepCard>

      <CalloutBox kind="tip">
        <span className="text-sm text-gray-700">
          Windows 는 별도 flag 설정 없이 동작합니다. 알림이 안 보이면 <KBD>Windows 설정 → 시스템 → 알림 → Chrome</KBD> 허용 확인.
        </span>
      </CalloutBox>
    </div>
  )
}

// ─── 콜아웃 박스 ───────────────────────────────────────────────
function CalloutBox({ kind, children }: { kind: 'tip' | 'warning' | 'critical'; children: ReactNode }) {
  const styles: Record<string, string> = {
    tip: 'border-sky-200 bg-sky-50',
    warning: 'border-amber-300 bg-amber-50',
    critical: 'border-rose-300 bg-rose-50',
  }
  const icon: Record<string, ReactNode> = {
    tip: <Bell className="h-4 w-4 text-sky-600" />,
    warning: <AlertTriangle className="h-4 w-4 text-amber-600" />,
    critical: <AlertTriangle className="h-4 w-4 text-rose-600" />,
  }
  return (
    <div className={`rounded-lg border-l-4 ${styles[kind]} p-3 flex items-start gap-2`}>
      <div className="shrink-0 mt-0.5">{icon[kind]}</div>
      <div className="flex-1 text-sm">{children}</div>
    </div>
  )
}

// ─── 트러블슈팅 박스 ───────────────────────────────────────────
function TroubleShootBox({ os }: { os: MobileOs | DesktopOs }) {
  const [open, setOpen] = useState(false)
  const items = {
    ios: [
      'iOS 16.4 이상인지 확인 (설정 → 일반 → 정보)',
      '반드시 홈 화면 아이콘으로 열어 권한 허용 (Safari 에서 연 채로는 무효)',
      '설정 → 알림 → IO HR → 알림 허용 / 배너 / 알림 센터 ON',
      '집중 모드 / 방해 금지 해제 (제어 센터)',
    ],
    android: [
      '설정 → 앱 → IO HR → 알림 → ON',
      '배터리 절약 모드에서 백그라운드 알림 차단 가능 — 일반 모드로',
      'Chrome 자체 알림 권한도 확인',
    ],
    mac: [
      'Chrome flag 활성화 했는지 (위 3단계) — 가장 흔한 원인',
      '시스템 설정 → 알림 → 인터오리진 HR플랫폼 → 모든 토글 ON',
      '집중 모드(메뉴바 🌙) 해제',
      '화면 공유/녹화 중 자동 방해 금지 모드 해제',
    ],
    windows: [
      'Windows 설정 → 시스템 → 알림 → Chrome 허용',
      '집중 지원(Focus Assist) OFF',
    ],
  }[os]
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 p-3 text-left"
      >
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
        <span className="text-sm font-bold text-amber-900 flex-1">알림이 안 올 때 — 트러블슈팅</span>
        {open ? <ChevronUp className="h-4 w-4 text-amber-600" /> : <ChevronDown className="h-4 w-4 text-amber-600" />}
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-1.5">
          {items.map((it, i) => (
            <p key={i} className="text-sm text-amber-900 flex items-start gap-2">
              <span className="text-amber-600 shrink-0">✓</span>
              <span>{it}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 테스트 + FAQ ─────────────────────────────────────────────
function TestAndFAQSection() {
  return (
    <>
      {/* 테스트 카드 */}
      <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle className="h-5 w-5 text-emerald-600" />
          <h3 className="text-sm font-bold text-emerald-900">설정이 잘 됐는지 테스트</h3>
        </div>
        <div className="space-y-2 text-sm text-gray-800">
          <ActionLine>본인이 결재 한 건 올려서 다음 결재자에게 알림 도착하는지</ActionLine>
          <ActionLine>헤더 종 아이콘에 빨간 배지 표시되는지</ActionLine>
          <ActionLine>앱 Dock 아이콘(Mac) / 홈 화면 배지(모바일)에 카운트 표시되는지</ActionLine>
          <ActionLine>매일 KST 08:30 미결재 리마인더 자동 도착하는지 (다음날 아침 확인)</ActionLine>
        </div>
      </div>

      {/* FAQ */}
      <FAQ />
    </>
  )
}

function FAQ() {
  const items: { q: string; a: string }[] = [
    {
      q: '푸시 알림이 와도 결재 페이지로 자동 이동 안 됩니다.',
      a: '알림 본문을 클릭하면 자동으로 결재 상세 페이지로 이동합니다. 클릭 안 한 경우엔 헤더 종 아이콘 → 알림 선택으로 이동 가능.',
    },
    {
      q: '이메일 알림은 받는데 푸시는 안 옵니다.',
      a: '이메일은 기본 활성, 푸시는 권한 허용 + (Mac 의 경우) Chrome flag 활성화가 추가 필요합니다. 위 단계 재확인.',
    },
    {
      q: '매일 아침 미결재 리마인더는 언제 옵니까?',
      a: '매일 KST 08:30 자동 발송. 그날 첫 1회만 (중복 발송 없음). 결재가 처리되면 다음날부터 안 옵니다.',
    },
    {
      q: '알림을 받고 싶지 않습니다.',
      a: 'macOS 시스템 설정 → 알림 → "인터오리진 HR플랫폼" → "알림 허용" OFF. 또는 앱 우상단 ⋮ → "사이트 정보" → "알림" 차단.',
    },
  ]
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2 mb-3">
        <SettingsIcon className="h-5 w-5 text-gray-500" />
        <h3 className="text-sm font-bold text-gray-900">자주 묻는 질문</h3>
      </div>
      <div className="space-y-2">
        {items.map((it, i) => <FAQItem key={i} q={it.q} a={it.a} />)}
      </div>
    </div>
  )
}
function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-gray-50"
      >
        <span className="text-sm font-medium text-gray-900 flex-1">{q}</span>
        {open ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
      </button>
      {open && (
        <div className="px-3 py-2 bg-gray-50 text-sm text-gray-700 border-t leading-relaxed">{a}</div>
      )}
    </div>
  )
}
