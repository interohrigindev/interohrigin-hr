/**
 * 이메일 HTML 템플릿 — 인터오리진 HR
 */

export function surveyInviteEmail(
  candidateName: string,
  surveyUrl: string,
  jobTitle?: string
): { subject: string; html: string } {
  return {
    subject: `[인터오리진] ${candidateName}님, 사전 질의서 작성 요청`,
    html: `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#6B3FA0,#4A2C6F);padding:28px 24px;text-align:center;">
      <h1 style="color:#ffffff;font-size:20px;margin:0;letter-spacing:1px;">INTEROHRIGIN</h1>
      <p style="color:#d8b4fe;font-size:12px;margin:4px 0 0;">Human Resources</p>
    </div>

    <!-- Body -->
    <div style="padding:32px 28px;">
      <p style="font-size:15px;color:#1f2937;margin:0 0 16px;">
        <strong>${candidateName}</strong>님, 안녕하세요.
      </p>
      <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 12px;">
        인터오리진에 관심을 가져주셔서 감사합니다.
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
        본 메일은 인터오리진 채용 프로세스의 일환으로 발송되었습니다.<br>
        문의: hr@interohrigin.com
      </p>
    </div>
  </div>
</body>
</html>
    `.trim(),
  }
}
