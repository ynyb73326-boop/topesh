/** Branded OTP email (RTL) — based on top-esh-otp-email.html */

export function buildManagerOtpEmail(code: string): { subject: string; text: string; html: string } {
  const subject = "קיבלת קוד התחברות לאפליקציית טופ-אש"
  const text = [
    "טופ־אש · אימות התחברות",
    "",
    "שלום,",
    "קיבלנו בקשה להתחברות למערכת טופ־אש.",
    `קוד האימות שלך: ${code}`,
    "",
    "הקוד תקף לזמן קצר. לא ביקשת להתחבר? אפשר להתעלם מהודעה זו.",
    "אין להעביר את קוד האימות לאף אדם אחר.",
  ].join("\n")

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>קוד התחברות | טופ-אש</title>
</head>
<body dir="rtl" style="margin:0;padding:0;background-color:#eef0f2;color:#171d22;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;color:#eef0f2;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">קוד האימות שלך לטופ-אש ממתין לך. אין לשתף את הקוד עם אף אחד.</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background-color:#eef0f2;">
    <tr><td align="center" style="padding:48px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;border-collapse:separate;background-color:#ffffff;border:1px solid #dee2e5;border-radius:20px;overflow:hidden;">
        <tr><td style="background-color:#171d22;padding:26px 34px;text-align:right;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td align="right" style="color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">טופ<span style="color:#ff5a1f;">־אש</span></td>
            <td align="left" style="color:#aeb5bc;font-size:12px;">מערכת ניהול יומני עבודה</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:40px 34px 16px;text-align:right;">
          <div style="font-size:12px;line-height:20px;font-weight:700;letter-spacing:0.3px;color:#e35a24;">אימות התחברות</div>
          <h1 style="font-size:29px;line-height:1.35;font-weight:700;letter-spacing:-0.5px;margin:12px 0 14px;color:#171d22;">הקוד שלך להתחברות</h1>
          <p style="margin:0;color:#65707a;font-size:16px;line-height:1.85;">שלום,<br>קיבלנו בקשה להתחברות למערכת <strong style="color:#171d22;">טופ־אש</strong>. הזן את קוד האימות הבא במסך ההתחברות:</p>
        </td></tr>
        <tr><td style="padding:18px 34px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;background-color:#fff3ec;border:1px solid #ffd7c4;border-radius:14px;">
            <tr><td align="center" dir="ltr" style="padding:27px 12px 22px;direction:ltr;text-align:center;">
              <span style="font-family:Arial,Helvetica,sans-serif;font-size:42px;line-height:1.2;font-weight:700;letter-spacing:8px;color:#ea5319;white-space:nowrap;">${code}</span>
            </td></tr>
            <tr><td align="center" style="padding:0 16px 22px;font-size:12px;color:#915c46;">קוד אימות חד־פעמי בן 6 ספרות</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 34px 36px;text-align:right;">
          <p style="font-size:14px;line-height:1.8;color:#65707a;margin:0 0 18px;">לא ביקשת להתחבר? אפשר להתעלם מהודעה זו.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:#f3f4f5;border-radius:10px;"><tr><td style="padding:14px 16px;font-size:13px;line-height:1.7;color:#515b64;text-align:right;">לשמירה על החשבון שלך, אין להעביר את קוד האימות לאף אדם אחר.</td></tr></table>
        </td></tr>
        <tr><td style="border-top:1px solid #e6e8ea;padding:22px 34px;text-align:center;color:#8a939c;font-size:12px;line-height:1.8;background-color:#fafafa;">הודעה אוטומטית ממערכת טופ־אש. אין צורך להשיב למייל זה.</td></tr>
      </table>
      <p style="font-size:12px;line-height:1.8;color:#8c959e;margin:20px 0 0;">טופ־אש · ניהול יומני עבודה</p>
    </td></tr>
  </table>
</body>
</html>`

  return { subject, text, html }
}
