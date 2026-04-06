# INTEROHRIGIN 사내 메신저 — Supabase Realtime 개발 계획서

> **프로젝트**: interohrigin-hr 확장 (기존 HR 플랫폼 내 메신저 탭)
> **기술**: Supabase Realtime + React + TypeScript
> **추가 비용**: $0 (기존 Supabase Pro에 포함)
> **개발 기간**: 5~7일
> **최종 업데이트**: 2026.03.19

---

## 1. 메신저 개요

### 1-1. 왜 자체 메신저인가

```
현재 문제 (3/17 미팅):
  카톡 → 개인 프라이버시 침해 + 업무/사적 구분 안 됨
  슬랙 → 별도 앱 + 히스토리 유실
  노션 → 실시간 대화 불가
  → 4개 도구 혼용으로 업무 누락, 히스토리 분산

해결:
  HR 플랫폼 안에 메신저를 넣어서
  업무 대화 → 프로젝트 데이터 → 인사평가가 하나로 연결
```

### 1-2. 메신저가 HR 플랫폼과 연결되는 지점

```
┌─────────────────────────────────────────────────────┐
│                  HR 플랫폼 메신저                     │
│                                                     │
│  채용 연동:                                          │
│  ├── 면접관끼리 지원자 논의 채팅방 자동 생성            │
│  └── AI가 "이 지원자 분석 결과" 메신저로 공유          │
│                                                     │
│  OJT 연동:                                          │
│  ├── 멘토-멘티 1:1 대화방 자동 생성                   │
│  ├── AI가 멘토에게 오늘의 미션 메신저로 발송            │
│  └── 멘티 질문 → AI 챗봇이 메신저에서 답변             │
│                                                     │
│  긴급 업무 연동:                                     │
│  ├── CEO 긴급 업무 알림이 메신저로 도착                │
│  ├── 리마인드도 메신저로 발송                         │
│  └── 완료 보고도 메신저에서 바로 가능                  │
│                                                     │
│  업무 연동:                                          │
│  ├── 프로젝트별 그룹 채팅방 자동 생성                  │
│  ├── 업무 상태 변경 시 팀원에게 알림                   │
│  └── AI 챗봇: "이거 누구한테 물어봐?" → 담당자 연결    │
│                                                     │
│  인사평가 연동:                                      │
│  ├── 평가 시즌 알림                                  │
│  ├── 메신저 활동량 → 협업 참여도 지표                  │
│  └── AI가 "김영석님, 분기 평가 제출해주세요" 리마인드   │
└─────────────────────────────────────────────────────┘
```

---

## 2. Supabase 테이블 설계

```sql
-- ═══════════════════════════════════
-- 사내 메신저 테이블 (4개)
-- ═══════════════════════════════════

-- 1. 채팅방
CREATE TABLE chat_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 기본 정보
  name text,                            -- 채팅방 이름 (DM은 null)
  type text NOT NULL DEFAULT 'dm',      -- 'dm' | 'group' | 'project' | 'department' | 'mentor' | 'recruitment'
  description text,
  
  -- 연결 정보 (자동 생성 시 사용)
  linked_project_id text,               -- work-milestone 프로젝트 ID
  linked_job_posting_id uuid,           -- 채용공고 ID (면접관 논의방)
  linked_mentor_assignment_id uuid,     -- 멘토-멘티 배정 ID
  linked_department text,               -- 부서명 (부서 채팅방)
  
  -- 설정
  is_ai_enabled boolean DEFAULT true,   -- AI 챗봇 활성화 여부
  is_archived boolean DEFAULT false,    -- 보관 처리
  
  -- 메타
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_message_at timestamptz           -- 최근 메시지 시간 (정렬용)
);

-- 2. 채팅방 멤버
CREATE TABLE chat_room_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  
  -- 권한
  role text DEFAULT 'member',           -- 'admin' | 'member'
  
  -- 읽음 추적
  last_read_at timestamptz DEFAULT now(),
  unread_count integer DEFAULT 0,
  
  -- 알림 설정
  is_muted boolean DEFAULT false,
  is_pinned boolean DEFAULT false,
  
  joined_at timestamptz DEFAULT now(),
  
  UNIQUE(room_id, user_id)
);

-- 3. 메시지
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id uuid,                       -- null이면 시스템/AI 메시지
  
  -- 내용
  content text NOT NULL,
  message_type text DEFAULT 'text',     -- 'text' | 'image' | 'file' | 'ai_bot' | 'system' | 'urgent_alert' | 'task_update'
  
  -- 첨부파일 (이미지/파일)
  attachment_url text,
  attachment_name text,
  attachment_size integer,              -- bytes
  attachment_type text,                 -- 'image/png', 'application/pdf' 등
  
  -- 답글 (스레드)
  reply_to_id uuid REFERENCES messages(id),
  
  -- 연결 (시스템 메시지용)
  linked_urgent_task_id uuid,           -- 긴급 업무 알림 메시지
  linked_candidate_id uuid,             -- 채용 관련 메시지
  linked_employee_id uuid,              -- 직원 관련 메시지
  
  -- 메타
  is_edited boolean DEFAULT false,
  edited_at timestamptz,
  is_deleted boolean DEFAULT false,     -- soft delete
  
  created_at timestamptz DEFAULT now()
);

-- 4. 메시지 반응 (이모지)
CREATE TABLE message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,                  -- '👍' '❤️' '😂' '✅' 등
  created_at timestamptz DEFAULT now(),
  
  UNIQUE(message_id, user_id, emoji)
);

-- ═══════════════════════════════════
-- 인덱스 (성능)
-- ═══════════════════════════════════

CREATE INDEX idx_messages_room_created ON messages(room_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_chat_room_members_user ON chat_room_members(user_id);
CREATE INDEX idx_chat_rooms_last_message ON chat_rooms(last_message_at DESC);

-- ═══════════════════════════════════
-- Realtime 활성화
-- ═══════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_room_members;

-- ═══════════════════════════════════
-- RLS 정책
-- ═══════════════════════════════════

ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 채팅방: 멤버만 조회 가능
CREATE POLICY "room_members_read" ON chat_rooms
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM chat_room_members WHERE room_id = id AND user_id = auth.uid())
  );

-- 메시지: 해당 채팅방 멤버만 읽기/쓰기
CREATE POLICY "messages_member_read" ON messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM chat_room_members WHERE room_id = messages.room_id AND user_id = auth.uid())
  );

CREATE POLICY "messages_member_insert" ON messages
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM chat_room_members WHERE room_id = messages.room_id AND user_id = auth.uid())
  );

-- ═══════════════════════════════════
-- last_message_at 자동 갱신 트리거
-- ═══════════════════════════════════

CREATE OR REPLACE FUNCTION update_room_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chat_rooms SET last_message_at = now(), updated_at = now()
  WHERE id = NEW.room_id;
  
  -- 다른 멤버의 unread_count 증가
  UPDATE chat_room_members
  SET unread_count = unread_count + 1
  WHERE room_id = NEW.room_id AND user_id != NEW.sender_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_room_last_message
AFTER INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION update_room_last_message();
```

---

## 3. 바이브코딩 프롬프트 (5단계)

### PROMPT M-01 — 메신저 DB + 라우팅 + 기본 UI 골격

```
기존 HR 플랫폼에 사내 메신저 기능을 추가합니다.
Supabase Realtime을 사용하여 실시간 채팅을 구현합니다.

## STEP 1: Supabase 테이블 생성

위 설계의 4개 테이블을 마이그레이션으로 생성합니다:
  chat_rooms, chat_room_members, messages, message_reactions
  + 인덱스 + RLS + Realtime 활성화 + 트리거

기존 마이그레이션 파일 네이밍 규칙에 맞춰서 생성하세요.

## STEP 2: 라우트 추가

기존 라우팅 파일에 추가:
  /admin/messenger              → 메신저 메인 화면
  /admin/messenger/:roomId      → 특정 채팅방

사이드바에 추가:
  💬 메신저 (알림 배지: 안 읽은 메시지 수)

## STEP 3: 메신저 레이아웃 (데스크톱)

기존 관리자 레이아웃 안에 메신저 화면:

┌─────────────────────────────────────────────────────┐
│  사이드바  │  채팅방 리스트 (280px)  │  대화 영역     │
│  (기존)   │                        │               │
│           │  🔍 검색               │  💬 마케팅팀    │
│  대시보드  │                        │               │
│  채용관리  │  📌 고정 채팅방         │  메시지 리스트  │
│  직원관리  │  ├── 🔴 CEO 긴급      │  ...           │
│  OJT/수습 │  └── 📋 마케팅팀       │  ...           │
│  💬 메신저│                        │  ...           │
│  인사평가  │  💬 최근 대화          │               │
│  설정     │  ├── 김영석           │  ┌───────────┐ │
│           │  ├── S/S 프로젝트     │  │ 메시지 입력 │ │
│           │  └── 멘토-박지현      │  └───────────┘ │
└─────────────────────────────────────────────────────┘

왼쪽 패널: 채팅방 리스트
  - 고정(핀) 채팅방 상단
  - 안 읽은 메시지 있는 방은 굵은 글씨 + 숫자 배지
  - 최근 메시지 시간순 정렬
  - 채팅방 타입별 아이콘: 👤 DM, 👥 그룹, 📋 프로젝트, 🏢 부서, 🎓 멘토, 🔴 긴급

오른쪽 패널: 대화 영역
  - 상단: 채팅방 이름 + 멤버 수 + 검색 + 설정
  - 중앙: 메시지 리스트 (무한 스크롤, 최신이 아래)
  - 하단: 입력창 + 파일 첨부 + 이모지 + 전송 버튼

## STEP 4: TypeScript 타입

기존 타입 파일 패턴에 맞춰서:
  ChatRoom, ChatRoomMember, Message, MessageReaction 타입 정의

## 주의사항
- 기존 UI 테마(다크+골드) 동일하게
- 기존 컴포넌트 패턴 따르기
- Supabase 클라이언트는 기존 설정 파일 그대로 사용
```

---

### PROMPT M-02 — 실시간 메시지 송수신

```
Supabase Realtime으로 실시간 채팅을 구현합니다.

## STEP 1: 실시간 구독 훅

src/hooks/useRealtimeMessages.ts (또는 기존 hooks 패턴에 맞게):

function useRealtimeMessages(roomId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  
  useEffect(() => {
    // 1. 기존 메시지 로드 (최근 50개, 페이지네이션)
    loadMessages(roomId, 50);
    
    // 2. 실시간 구독
    const channel = supabase
      .channel(`room:${roomId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `room_id=eq.${roomId}`
      }, (payload) => {
        // 새 메시지 추가
        setMessages(prev => [...prev, payload.new as Message]);
        // 스크롤 아래로
        scrollToBottom();
        // 읽음 처리
        markAsRead(roomId);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `room_id=eq.${roomId}`
      }, (payload) => {
        // 메시지 수정/삭제 반영
        setMessages(prev => prev.map(m => 
          m.id === payload.new.id ? payload.new as Message : m
        ));
      })
      .subscribe();
    
    return () => { supabase.removeChannel(channel); };
  }, [roomId]);
  
  return { messages, sendMessage, loadMore };
}

## STEP 2: 메시지 전송

async function sendMessage(roomId: string, content: string, type = 'text') {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      room_id: roomId,
      sender_id: currentUser.id,
      content,
      message_type: type
    });
}

## STEP 3: 채팅방 리스트 실시간 업데이트

function useRealtimeRooms() {
  // chat_room_members에서 내가 속한 방 조회
  // chat_rooms.last_message_at 기준 정렬
  // unread_count 실시간 반영
  
  const channel = supabase
    .channel('my-rooms')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'chat_room_members',
      filter: `user_id=eq.${currentUser.id}`
    }, () => {
      // 채팅방 리스트 새로고침
      refetchRooms();
    })
    .subscribe();
}

## STEP 4: 메시지 UI 컴포넌트

MessageBubble.tsx:
  - 내 메시지: 오른쪽 정렬, 골드(#D4A853) 배경
  - 상대 메시지: 왼쪽 정렬, 다크(#1A1F2E) 배경
  - 시스템 메시지: 중앙 정렬, 작은 회색 텍스트
  - AI 메시지: 왼쪽 정렬, 보라(#A78BFA) 테두리 + 🤖 아이콘
  - 긴급 알림: 빨간(#EF4444) 배경, 🔴 아이콘
  
  메시지 내 표시:
  - 보낸 사람 이름 (그룹 채팅에서)
  - 시간 (HH:MM)
  - 답글인 경우 원본 메시지 미리보기
  - 이모지 반응 (메시지 하단)

MessageInput.tsx:
  - textarea (Enter로 전송, Shift+Enter로 줄바꿈)
  - 📎 파일 첨부 버튼 → Supabase Storage 업로드 후 URL 저장
  - 😊 이모지 선택기
  - 전송 버튼 (골드 색상)

## STEP 5: 읽음 처리

채팅방에 진입 시:
  chat_room_members.last_read_at = now()
  chat_room_members.unread_count = 0

다른 사용자의 unread_count는 메시지 INSERT 트리거에서 자동 증가.

## STEP 6: 무한 스크롤 (이전 메시지 로드)

스크롤을 위로 올리면:
  messages에서 created_at < 현재 가장 오래된 메시지 시간
  LIMIT 30으로 추가 로드

## 주의사항
- Realtime 채널은 컴포넌트 언마운트 시 반드시 해제
- 메시지 로드 시 sender_id로 employees JOIN하여 이름/프로필 표시
- 이미지 첨부 시 Supabase Storage의 chat-attachments 버킷 사용
  (5MB 제한, 이미지 자동 리사이즈)
```

---

### PROMPT M-03 — 채팅방 자동 생성 + HR 연동

```
HR 플랫폼의 각 기능에서 자동으로 채팅방이 생성되도록 연동합니다.

## STEP 1: 채팅방 자동 생성 함수

src/lib/chat-room-creator.ts:

// 1:1 DM 생성 (또는 기존 DM 반환)
async function getOrCreateDM(userId1: string, userId2: string): Promise<ChatRoom>

// 부서 채팅방 (부서별 1개, 이미 있으면 반환)
async function getOrCreateDepartmentRoom(department: string): Promise<ChatRoom>

// 프로젝트 채팅방 (프로젝트 생성 시 자동)
async function createProjectRoom(projectId: string, projectName: string, memberIds: string[]): Promise<ChatRoom>

// 면접관 논의방 (채용공고별)
async function createRecruitmentRoom(jobPostingId: string, interviewerIds: string[]): Promise<ChatRoom>

// 멘토-멘티 채팅방 (멘토 배정 시 자동)
async function createMentorRoom(mentorId: string, menteeId: string, assignmentId: string): Promise<ChatRoom>

## STEP 2: HR 기능별 연동 포인트

a) 직원 등록 시 (합격→입사):
  → 해당 부서 채팅방에 자동 추가
  → "전체 공지" 채팅방에 자동 추가
  → 시스템 메시지: "김민수님이 마케팅팀에 합격하여 입사합니다. 환영해주세요! 🎉"

b) 멘토 배정 시:
  → 멘토-멘티 1:1 채팅방 자동 생성
  → AI가 첫 메시지 발송: "안녕하세요! 멘토링이 시작되었습니다. 
     오늘의 미션: 회사 시설물 위치를 안내해주세요."

c) 프로젝트 생성 시 (AI ToDo):
  → 프로젝트 채팅방 자동 생성
  → 참여자 전원 자동 추가
  → AI가 프로젝트 요약 메시지 발송

d) CEO 긴급 업무 생성 시:
  → 담당자들에게 메신저 알림
  → message_type: 'urgent_alert'로 구분 (빨간 배경)
  → 리마인드도 메신저로 발송

e) 인사평가 시즌:
  → AI가 각 직원에게 "분기 평가를 제출해주세요" DM 발송
  → 미제출 시 리마인드 DM 반복

## STEP 3: 전체 공지 채팅방

시스템 시작 시 자동 생성되는 기본 채팅방:
  - 📢 전체 공지 (전 직원, 관리자만 쓰기)
  - 🔴 CEO 긴급 (전 직원, 읽기 전용 + 완료 보고만)
  - 각 부서별 채팅방 (해당 부서원)

## STEP 4: 채팅방 생성 UI

"새 채팅" 버튼 클릭 시:
  ┌──────────────────────────────┐
  │  새 대화 만들기              │
  │                              │
  │  ○ 1:1 대화                 │
  │    [직원 검색 ▼]             │
  │                              │
  │  ○ 그룹 대화                │
  │    이름: [             ]     │
  │    멤버: [☑김영석 ☑박지현]   │
  │                              │
  │  [만들기]                    │
  └──────────────────────────────┘

프로젝트/부서/멘토 채팅방은 자동 생성이므로 여기서는 DM과 그룹만.

## 주의사항
- 자동 생성된 채팅방은 linked_* 필드로 원본과 연결
- 프로젝트 완료 시 채팅방은 자동 보관(archive) 처리
- 퇴사한 직원은 모든 채팅방에서 자동 제거
```

---

### PROMPT M-04 — AI 챗봇 메신저 통합

```
기존 AI 챗봇 기능을 메신저 안에서 사용할 수 있게 합니다.
각 채팅방에서 @AI 또는 /ai 명령으로 AI를 호출합니다.

## STEP 1: AI 챗봇 메시지 처리

메시지 전송 시 내용에 @AI 또는 /ai가 포함되면:
  1. 사용자 메시지를 먼저 저장 (일반 메시지)
  2. AI에게 질문 전달
  3. AI 응답을 message_type: 'ai_bot'으로 저장
  4. AI 메시지는 🤖 아이콘 + 보라색 테두리로 구분

## STEP 2: AI가 응답할 수 있는 질문 유형

a) 업무 질문:
  "@AI 이 업무 누구한테 물어보면 돼?"
  → AI가 프로젝트/업무 데이터를 확인하여 담당자 추천
  "김형석 이사님께 문의하시면 될 것 같습니다. 
   이 프로젝트의 메인 담당자입니다."

b) 회사 정보:
  "@AI 연차 신청 어떻게 해?"
  → OJT 자료 + 사내 규정에서 답변
  "연차 신청은 시스템에서 직접 하시면 됩니다.
   최소 3일 전 신청이 원칙입니다."

c) 긴급 업무 현황:
  "@AI 지금 긴급 업무 뭐 있어?"
  → urgent_tasks에서 조회
  "현재 긴급 업무 3건이 있습니다:
   1. S/S 컬렉션 샘플 확정 (D-2, 담당: 김영석)
   2. ..."

d) 직원 정보 (임원만):
  "@AI 김영석 최근 평가 어때?"
  → 권한 확인 후 employees + evaluations에서 조회
  "김영석: 최근 분기 A- (82점), 작업 완료율 87%"

e) 감정 케어 (3/17 미팅 요청):
  메시지가 업무 재촉 느낌일 때 AI가 자동으로 제안:
  "💡 이런 표현은 어떨까요?
   '바쁘신 거 알지만, 내일까지 가능할까요? 감사합니다 🙏'"
  → 선택적 팝업, 강제 아님

## STEP 3: AI 프롬프트

시스템 프롬프트:
  "당신은 인터오리진의 사내 AI 비서입니다.
   직원들의 업무 질문에 답변하고, 담당자를 연결해주고,
   회사 정보를 안내합니다.
   
   사용 가능한 데이터:
   - employees 테이블 (직원 목록, 부서, 직급)
   - urgent_tasks (긴급 업무)
   - 프로젝트/업무 데이터
   - OJT 자료 + 사내 규정
   
   권한 규칙:
   - 일반 직원: 공개 정보만 (업무 질문, 회사 규정)
   - 임원: 직원 평가 데이터, 전체 프로젝트 현황
   
   답변은 간결하고 친근하게. 이모지를 적절히 사용.
   모르는 건 '확인 후 답변드리겠습니다'로 응답."

## STEP 4: 감정 케어 AI 로직

메시지 분석 조건:
  - 같은 사람에게 같은 주제로 3회 이상 메시지 시
  - "아직", "빨리", "언제", "왜 안" 같은 재촉 키워드 감지
  - 상하 관계 메시지 (role이 executive/leader인 사람 → employee)

감지 시:
  → 보내기 전에 팝업 (발신자에게만 보임):
  "💡 부드러운 표현 제안:
   원본: '아직 안 됐어요?'
   제안: '진행 상황이 궁금해서요. 어려운 부분 있으면 말씀해주세요!'
   [제안 사용] [원본 그대로 보내기]"

과부하 감지:
  담당자의 현재 진행중 업무가 평균의 150% 이상이면
  → 지시자에게 AI DM:
  "김영석님은 현재 진행중 업무 8건 + 긴급 3건입니다.
   업무 재배치를 검토해보세요."

## 주의사항
- AI 호출은 기존 Gemini 연동 패턴 사용 (GEMINI.md)
- AI 응답은 5초 내 (타이핑 인디케이터 표시)
- AI가 접근하는 데이터는 요청자의 권한에 맞춰서만
- 감정 케어는 선택적 제안 (강제 아님)
```

---

### PROMPT M-05 — 알림 + 모바일 대응 + 파일 공유

```
메신저의 완성도를 높이는 부가 기능입니다.

## STEP 1: 알림 시스템

a) 앱 내 알림:
  사이드바 "💬 메신저" 옆에 빨간 배지 (총 안 읽은 수)
  브라우저 탭 제목: "(3) INTEROHRIGIN HR" ← 안 읽은 수

b) 브라우저 알림 (Push):
  Notification API 사용:
  - 처음 접속 시 권한 요청
  - 채팅방 밖에 있을 때 새 메시지 오면 브라우저 알림
  - 알림 클릭 시 해당 채팅방으로 이동

c) 긴급 업무 알림:
  message_type이 'urgent_alert'이면
  → 일반 알림보다 강하게 (빨간 배지 + 소리)
  → 메신저를 안 보고 있어도 대시보드에 팝업

## STEP 2: 파일 공유

메시지 입력창에서 📎 클릭 또는 드래그&드롭:
  - 이미지: 미리보기 표시 (인라인)
  - 파일: 아이콘 + 파일명 + 크기 표시
  - 업로드: Supabase Storage chat-attachments 버킷
  - 제한: 10MB, 이미지/PDF/문서만

이미지 전송:
  - 자동 리사이즈 (최대 1920px)
  - 썸네일 생성 (200px)
  - 클릭 시 원본 보기 (라이트박스)

## STEP 3: 메시지 검색

채팅방 상단 🔍 클릭:
  - 현재 채팅방 내 텍스트 검색
  - 검색 결과 클릭 시 해당 메시지로 스크롤
  - Supabase: messages WHERE room_id = ? AND content ILIKE '%검색어%'

전체 검색 (채팅방 리스트 상단):
  - 채팅방 이름 + 멤버 이름 + 메시지 내용 통합 검색

## STEP 4: 모바일 반응형

768px 미만:
  - 채팅방 리스트가 전체 화면
  - 채팅방 선택 시 대화 영역이 전체 화면 (← 뒤로가기 버튼)
  - 입력창 하단 고정
  - 터치 친화적 (버튼 44px 이상)

## STEP 5: 메시지 기능 확장

a) 메시지 답글 (스레드):
  메시지 길게 누르기/우클릭 → "답글" → reply_to_id에 원본 연결
  답글 메시지 위에 원본 미리보기 표시

b) 메시지 수정/삭제:
  내 메시지만 가능
  수정: is_edited = true, 하단에 "(수정됨)" 표시
  삭제: is_deleted = true, "삭제된 메시지입니다" 표시

c) 이모지 반응:
  메시지에 마우스 오버 → 빠른 반응 (👍 ❤️ 😂 ✅)
  클릭 시 message_reactions에 INSERT
  메시지 하단에 반응 표시 (👍 3 ❤️ 1)

d) 메시지 핀(고정):
  중요한 메시지를 채팅방 상단에 고정
  채팅방 헤더에 📌 아이콘 → 핀 메시지 리스트

## STEP 6: 인사평가 연동 지표

메신저 활동 데이터를 인사평가에 연동:
  - 메시지 전송 수 (활동량)
  - 타 부서/타 프로젝트 채팅방 참여 (협업도)
  - AI 챗봇 활용 빈도 (자기주도 학습)
  - 긴급 업무 알림 응답 속도

이 데이터는 work_metrics 또는 별도 messenger_metrics 테이블에 집계.
분기 평가 시 "협업 참여도" 지표로 활용.

## 주의사항
- 기존 HR 기능에 영향 없도록 메신저는 독립적 모듈
- 파일 업로드 시 악성 파일 체크 (확장자 제한)
- 메시지 삭제는 soft delete (관리자는 복구 가능)
- 모바일에서 테스트 필수 (iOS Safari + Android Chrome)
```

---

## 4. 개발 일정

```
Day 1: M-01 (DB + 라우팅 + 기본 UI 골격)
Day 2: M-02 (실시간 메시지 송수신 — 핵심)
Day 3: M-03 (채팅방 자동 생성 + HR 연동)
Day 4: M-04 (AI 챗봇 + 감정 케어)
Day 5: M-05 (알림 + 파일 + 모바일 + 검색)

총 5일 (Phase 1.5 이후 또는 병렬 진행 가능)
```

---

## 5. 비용

```
추가 비용: $0

이유:
  - Supabase Realtime: Pro 플랜($25)에 포함 (동시 접속 500명)
  - Storage: chat-attachments 버킷 (Pro 플랜 8GB 포함)
  - 인터오리진 40명 기준 충분
  
  ※ 동시 접속 500명 초과 시 Supabase Team 플랜($599)이지만
     40명 회사에서는 해당 없음
```

---

## 6. DEVPLAN.md 반영 방법

기존 P-35(사내 메신저 일원화)를 이 5개 프롬프트(M-01~M-05)로 교체합니다.

```
기존 DEVPLAN.md에서:
  P-35: 사내 메신저 일원화 (Phase 3 — 장기)

변경:
  P-35: M-01 메신저 DB + 라우팅 + 기본 UI
  P-36: M-02 실시간 메시지 송수신 (Supabase Realtime)
  P-37: M-03 채팅방 자동 생성 + HR 연동
  P-38: M-04 AI 챗봇 + 감정 케어
  P-39: M-05 알림 + 파일 + 모바일 + 검색

총 프롬프트: 34 + 5 = 39단계
```

---

## 7. 실행 프롬프트 예시

Firebase Studio Gemini에서:

```
DEVPLAN.md의 P-35 (메신저 M-01)를 실행해주세요.

사내 메신저의 DB 테이블 4개를 생성하고,
라우팅과 기본 UI 골격을 만들어주세요.
Supabase Realtime을 활성화하고,
RLS 정책과 트리거도 설정해주세요.

CLAUDE.md의 규칙을 따라주세요:
- 기존 다크+골드 테마
- 기존 컴포넌트 패턴
- 기존 Supabase 클라이언트 사용
```
