/**
 * 이메일 HTML 템플릿 — 인터오리진 HR
 */

export function surveyInviteEmail(
  candidateName: string,
  surveyUrl: string,
  jobTitle?: string
): { subject: string; html: string } {
  return {
    subject: `[인터오리진아이앤씨] ${candidateName}님, 사전 질의서 작성 요청`,
    html: `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#6B3FA0,#4A2C6F);padding:28px 24px;text-align:center;">
      <h1 style="color:#ffffff;font-size:20px;margin:0;letter-spacing:1px;">Interohrigin I&amp;C</h1>
      <p style="color:#d8b4fe;font-size:12px;margin:4px 0 0;">Human Resources</p>
    </div>

    <!-- Body -->
    <div style="padding:32px 28px;">
      <p style="font-size:15px;color:#1f2937;margin:0 0 16px;">
        <strong>${candidateName}</strong>님, 안녕하세요.
      </p>
      <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 12px;">
        인터오리진아이앤씨에 관심을 가져주셔서 감사합니다.
      </p>
      ${jobTitle ? `<p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 12px;">지원하신 <strong>${jobTitle}</strong> 포지션 관련하여 사전 질의서를 보내드립니다.</p>` : ''}
      <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 24px;">
        면접 준비를 위해 아래 버튼을 클릭하여 사전 질의서를 작성해 주시기 바랍니다.
      </p>

      <!-- CTA Button -->
      <div style="text-align:center;margin:28px 0;">
        <a href="${surveyUrl}"
           style="display:inline-block;background:#6B3FA0;color:#ffffff;padding:14px 36px;
                  border-radius:8px;text-decoration:none;font-size:15px;font-weight:bold;
                  letter-spacing:0.5px;">
          사전 질의서 작성하기
        </a>
      </div>

      <p style="font-size:13px;color:#6b7280;line-height:1.6;margin:16px 0 0;">
        버튼이 작동하지 않는 경우, 아래 링크를 브라우저에 직접 입력해 주세요:<br>
        <a href="${surveyUrl}" style="color:#6B3FA0;word-break:break-all;">${surveyUrl}</a>
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f9fafb;padding:20px 28px;border-top:1px solid #e5e7eb;">
      <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;">
        본 메일은 인터오리진아이앤씨 채용 프로세스의 일환으로 발송되었습니다.<br>
        문의: admin@interohriginhr.com
      </p>
    </div>
  </div>
</body>
</html>
    `.trim(),
  }
}

export function hiringAcceptEmail(
  candidateName: string,
  jobTitle?: string,
  conditions?: {
    salary?: string
    probation_salary?: string
    regular_salary?: string
    job_title?: string
    start_date?: string
  },
  acceptUrl?: string
): { subject: string; html: string } {
  const conditionRows = []
  if (conditions?.job_title) conditionRows.push({ label: '직무', value: conditions.job_title })
  if (conditions?.salary) conditionRows.push({ label: '연봉', value: `${Number(conditions.salary).toLocaleString()}만원` })
  if (conditions?.probation_salary) conditionRows.push({ label: '수습 기간 급여', value: `${Number(conditions.probation_salary).toLocaleString()}만원` })
  if (conditions?.regular_salary) conditionRows.push({ label: '정규직 전환 급여', value: `${Number(conditions.regular_salary).toLocaleString()}만원` })
  if (conditions?.start_date) conditionRows.push({ label: '입사 예정일', value: conditions.start_date })

  const conditionHtml = conditionRows.length > 0 ? `
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px 24px;margin:20px 0;">
        <p style="font-size:14px;font-weight:bold;color:#1f2937;margin:0 0 12px;">채용 조건</p>
        <table style="width:100%;font-size:14px;color:#374151;">
          ${conditionRows.map(r => `
          <tr>
            <td style="padding:6px 0;font-weight:bold;width:120px;vertical-align:top;">${r.label}</td>
            <td style="padding:6px 0;">${r.value}</td>
          </tr>`).join('')}
        </table>
      </div>` : ''

  return {
    subject: `[인터오리진아이앤씨] ${candidateName}님, 합격을 축하드립니다`,
    html: `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <div style="background:linear-gradient(135deg,#6B3FA0,#4A2C6F);padding:28px 24px;text-align:center;">
      <h1 style="color:#ffffff;font-size:20px;margin:0;letter-spacing:1px;">Interohrigin I&amp;C</h1>
      <p style="color:#d8b4fe;font-size:12px;margin:4px 0 0;">Human Resources</p>
    </div>
    <div style="padding:32px 28px;">
      <p style="font-size:15px;color:#1f2937;margin:0 0 16px;">
        <strong>${candidateName}</strong>님, 안녕하세요.
      </p>
      <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 12px;">
        인터오리진아이앤씨에 관심을 가져주시고 채용 과정에 참여해 주셔서 진심으로 감사드립니다.
      </p>

      <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:24px;margin:20px 0;text-align:center;">
        <p style="font-size:18px;font-weight:bold;color:#065f46;margin:0 0 8px;">
          합격을 축하드립니다!
        </p>
        ${jobTitle ? `<p style="font-size:14px;color:#047857;margin:0;"><strong>${jobTitle}</strong> 포지션</p>` : ''}
      </div>

      <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 12px;">
        ${candidateName}님을 인터오리진아이앤씨의 새로운 구성원으로 모시게 되었습니다.
      </p>
      ${conditionHtml}
      ${acceptUrl ? `
      <div style="text-align:center;margin:28px 0;">
        <p style="font-size:14px;color:#374151;margin:0 0 16px;">
          아래 버튼을 클릭하여 합격 조건을 확인하고 응답해주세요.
        </p>
        <a href="${acceptUrl}"
           style="display:inline-block;background:#6B3FA0;color:#ffffff;padding:14px 36px;
                  border-radius:8px;text-decoration:none;font-size:15px;font-weight:bold;">
          합격 조건 확인 및 응답
        </a>
      </div>` : `
      <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 12px;">
        입사 일정 및 필요 서류 등 세부 사항은 별도로 안내드릴 예정입니다.
      </p>`}
      <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 24px;">
        궁금하신 사항이 있으시면 언제든 아래 연락처로 문의해 주시기 바랍니다.
      </p>

      <p style="font-size:13px;color:#6b7280;line-height:1.6;margin:16px 0 0;">
        문의: admin@interohriginhr.com
      </p>
    </div>
    <div style="background:#f9fafb;padding:20px 28px;border-top:1px solid #e5e7eb;">
      <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;">
        본 메일은 인터오리진아이앤씨 채용 프로세스의 일환으로 발송되었습니다.<br>
        문의: admin@interohriginhr.com
      </p>
    </div>
  </div>
</body>
</html>
    `.trim(),
  }
}

export function hiringRejectEmail(
  candidateName: string,
  _jobTitle?: string
): { subject: string; html: string } {
  return {
    subject: `[인터오리진아이앤씨] ${candidateName}님, 채용 결과 안내`,
    html: `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <div style="background:linear-gradient(135deg,#6B3FA0,#4A2C6F);padding:28px 24px;text-align:center;">
      <h1 style="color:#ffffff;font-size:20px;margin:0;letter-spacing:1px;">Interohrigin I&amp;C</h1>
      <p style="color:#d8b4fe;font-size:12px;margin:4px 0 0;">Human Resources</p>
    </div>
    <div style="padding:32px 28px;">
      <p style="font-size:15px;color:#1f2937;margin:0 0 16px;">
        안녕하세요 <strong>${candidateName}</strong>님
      </p>
      <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 12px;">
        저희 인터오리진아이앤씨 채용에 지원해 주셔서 진심으로 감사드립니다.
      </p>
      <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 12px;">
        면접을 통해 ${candidateName}님의 역량과 열정을 느낄 수 있었으나, 이번에는 아쉽게도 함께하지 못하게 되었습니다.
      </p>
      <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 24px;">
        지원해 주신 귀한 시간과 노고에 다시 한 번 감사드리며, 앞으로 더 좋은 기회에서 꼭 좋은 인연으로 만나 뵙기를 바랍니다.
      </p>
      <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 0;">
        감사합니다.<br>인터오리진아이앤씨 드림.
      </p>
    </div>
    <div style="background:#f9fafb;padding:20px 28px;border-top:1px solid #e5e7eb;">
      <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;">
        본 메일은 인터오리진아이앤씨 채용 프로세스의 일환으로 발송되었습니다.<br>
        문의: admin@interohriginhr.com
      </p>
    </div>
  </div>
</body>
</html>
    `.trim(),
  }
}

export function interviewInviteEmail(
  candidateName: string,
  scheduledAt: string,
  durationMinutes: number,
  interviewType: string,
  meetingLink?: string | null,
  locationInfo?: string | null,
  jobTitle?: string
): { subject: string; html: string } {
  // scheduled_at이 "2026-03-25T14:15" 형태(시간대 없음)일 수 있으므로
  // KST로 명시 변환하여 올바른 시간 표시
  const raw = scheduledAt.includes('+') || scheduledAt.endsWith('Z')
    ? scheduledAt  // 이미 시간대 포함
    : scheduledAt + '+09:00'  // 시간대 없으면 KST로 간주
  const date = new Date(raw)
  const kst = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const dateStr = `${kst.getFullYear()}년 ${kst.getMonth() + 1}월 ${kst.getDate()}일`
  const timeStr = `${String(kst.getHours()).padStart(2, '0')}:${String(kst.getMinutes()).padStart(2, '0')}`
  const typeLabel = interviewType === 'video' ? 'Google Meet 화상면접' : '대면면접'

  return {
    subject: `[인터오리진아이앤씨] ${candidateName}님, 면접 일정 안내`,
    html: `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <div style="background:linear-gradient(135deg,#6B3FA0,#4A2C6F);padding:28px 24px;text-align:center;">
      <h1 style="color:#ffffff;font-size:20px;margin:0;letter-spacing:1px;">Interohrigin I&amp;C</h1>
      <p style="color:#d8b4fe;font-size:12px;margin:4px 0 0;">Human Resources</p>
    </div>
    <div style="padding:32px 28px;">
      <p style="font-size:15px;color:#1f2937;margin:0 0 16px;">
        <strong>${candidateName}</strong>님, 안녕하세요.
      </p>
      <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 20px;">
        인터오리진아이앤씨 채용 면접 일정을 안내드립니다.${jobTitle ? ` (${jobTitle} 포지션)` : ''}
      </p>

      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px 24px;margin:0 0 24px;">
        <table style="width:100%;font-size:14px;color:#374151;">
          <tr>
            <td style="padding:6px 0;font-weight:bold;width:80px;vertical-align:top;">일시</td>
            <td style="padding:6px 0;">${dateStr} ${timeStr}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-weight:bold;vertical-align:top;">소요시간</td>
            <td style="padding:6px 0;">약 ${durationMinutes}분</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-weight:bold;vertical-align:top;">형태</td>
            <td style="padding:6px 0;">${typeLabel}</td>
          </tr>
          ${meetingLink ? `
          <tr>
            <td style="padding:6px 0;font-weight:bold;vertical-align:top;">접속링크</td>
            <td style="padding:6px 0;"><a href="${meetingLink}" style="color:#6B3FA0;">${meetingLink}</a></td>
          </tr>` : ''}
          ${locationInfo ? `
          <tr>
            <td style="padding:6px 0;font-weight:bold;vertical-align:top;">장소</td>
            <td style="padding:6px 0;">${locationInfo}</td>
          </tr>` : ''}
        </table>
      </div>

      ${meetingLink ? `
      <div style="text-align:center;margin:28px 0;">
        <a href="${meetingLink}"
           style="display:inline-block;background:#6B3FA0;color:#ffffff;padding:14px 36px;
                  border-radius:8px;text-decoration:none;font-size:15px;font-weight:bold;">
          면접 입장하기
        </a>
      </div>` : ''}

      ${locationInfo && !meetingLink ? `
      <div style="text-align:center;margin:28px 0;">
        <p style="font-size:13px;color:#374151;margin:0 0 12px;">면접 장소를 지도에서 확인하세요</p>
        <a href="https://map.naver.com/p/search/${encodeURIComponent(locationInfo)}"
           style="display:inline-block;background:#03C75A;color:#ffffff;padding:10px 24px;
                  border-radius:8px;text-decoration:none;font-size:13px;font-weight:bold;margin:0 6px;">
          네이버지도
        </a>
        <a href="https://map.kakao.com/?q=${encodeURIComponent(locationInfo)}"
           style="display:inline-block;background:#FEE500;color:#3C1E1E;padding:10px 24px;
                  border-radius:8px;text-decoration:none;font-size:13px;font-weight:bold;margin:0 6px;">
          카카오맵
        </a>
      </div>
      <div style="background:#eff6ff;border:1px solid #3b82f6;border-radius:8px;padding:12px 16px;margin:20px 0 0;">
        <p style="font-size:13px;color:#1e40af;line-height:1.5;margin:0;">
          <strong>📍 방문 안내</strong><br>
          1층 도착하시면 <strong>010-3062-0070</strong>으로 연락 부탁드립니다.<br>
          안내 도와드리겠습니다.
        </p>
      </div>` : ''}

      <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px 16px;margin:20px 0 0;">
        <p style="font-size:13px;color:#92400e;line-height:1.5;margin:0;">
          <strong>📌 안내사항</strong><br>
          채용 관련 모든 안내는 이메일로 발송됩니다. 수신함을 자주 확인해 주세요.
        </p>
      </div>
      <p style="font-size:13px;color:#6b7280;line-height:1.6;margin:16px 0 0;">
        면접 관련 문의사항이 있으시면 admin@interohriginhr.com으로 연락 부탁드립니다.
      </p>
    </div>
    <div style="background:#f9fafb;padding:20px 28px;border-top:1px solid #e5e7eb;">
      <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;">
        본 메일은 인터오리진아이앤씨 채용 프로세스의 일환으로 발송되었습니다.<br>
        문의: admin@interohriginhr.com
      </p>
    </div>
  </div>
</body>
</html>
    `.trim(),
  }
}

export function interviewerNotificationEmail(
  interviewerName: string,
  candidateName: string,
  candidateEmail: string,
  scheduledAt: string,
  durationMinutes: number,
  interviewType: string,
  meetingLink?: string | null,
  locationInfo?: string | null,
  jobTitle?: string,
): { subject: string; html: string } {
  let dateStr = scheduledAt
  try {
    const d = new Date(scheduledAt)
    if (!isNaN(d.getTime())) {
      dateStr = d.toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' })
    }
  } catch {}
  const typeLabel = interviewType === 'video' ? 'Google Meet 화상면접' : '대면면접'
  const dateShort = dateStr.split(' ').slice(0, 3).join(' ')
  return {
    subject: `[인터오리진아이앤씨] 면접 일정 안내 — ${candidateName} (${dateShort})`,
    html: `
<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#fff;">
  <div style="background:linear-gradient(135deg,#6B3FA0,#4A2C6F);padding:28px 24px;text-align:center;">
    <h1 style="color:#fff;font-size:20px;margin:0;">Interohrigin I&amp;C</h1>
    <p style="color:#d8b4fe;font-size:12px;margin:4px 0 0;">면접 일정 안내</p>
  </div>
  <div style="padding:32px 28px;">
    <p style="font-size:15px;color:#1f2937;margin:0 0 16px;"><strong>${interviewerName}</strong>님, 면접 일정을 안내드립니다.</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:10px 12px;font-size:13px;color:#6b7280;width:100px;">지원자</td><td style="padding:10px 12px;font-size:14px;font-weight:600;color:#1f2937;">${candidateName}</td></tr>
      <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:10px 12px;font-size:13px;color:#6b7280;">이메일</td><td style="padding:10px 12px;font-size:14px;color:#1f2937;">${candidateEmail}</td></tr>
      ${jobTitle ? '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:10px 12px;font-size:13px;color:#6b7280;">포지션</td><td style="padding:10px 12px;font-size:14px;color:#1f2937;">' + jobTitle + '</td></tr>' : ''}
      <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:10px 12px;font-size:13px;color:#6b7280;">일시</td><td style="padding:10px 12px;font-size:14px;color:#1f2937;">${dateStr}</td></tr>
      <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:10px 12px;font-size:13px;color:#6b7280;">소요시간</td><td style="padding:10px 12px;font-size:14px;color:#1f2937;">약 ${durationMinutes}분</td></tr>
      <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:10px 12px;font-size:13px;color:#6b7280;">형태</td><td style="padding:10px 12px;font-size:14px;color:#1f2937;">${typeLabel}</td></tr>
      ${meetingLink ? '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:10px 12px;font-size:13px;color:#6b7280;">접속링크</td><td style="padding:10px 12px;"><a href="' + meetingLink + '" style="color:#6B3FA0;font-size:14px;">' + meetingLink + '</a></td></tr>' : ''}
      ${locationInfo ? '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:10px 12px;font-size:13px;color:#6b7280;">장소</td><td style="padding:10px 12px;font-size:14px;color:#1f2937;">' + locationInfo + '</td></tr>' : ''}
    </table>
    ${meetingLink ? '<div style="text-align:center;margin:28px 0;"><a href="' + meetingLink + '" style="display:inline-block;background:#6B3FA0;color:#fff;padding:14px 36px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:bold;">면접 입장하기</a></div>' : ''}
    <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;margin-top:20px;">
      <p style="font-size:13px;color:#92400e;margin:0;">면접 전 지원자의 이력서와 사전 질의서 응답을 확인해 주세요.</p>
    </div>
  </div>
  <div style="background:#f9fafb;padding:20px 28px;border-top:1px solid #e5e7eb;">
    <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;">인터오리진아이앤씨 채용팀 | admin@interohriginhr.com</p>
  </div>
</div>
</body></html>
    `.trim(),
  }
}
