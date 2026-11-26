import "server-only"

import nodemailer from "nodemailer"
import { buildManagerOtpEmail } from "@/features/auth/otp-email-template"
import { he } from "@/i18n/he"

/**
 * Send manager OTP via Gmail SMTP from the Next.js server.
 * Supabase Custom SMTP → Gmail often times out (504) from cloud IPs.
 */
export async function sendManagerOtpEmail(input: {
  to: string
  code: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = process.env.GMAIL_USER?.trim()
  const pass = process.env.GMAIL_APP_PASSWORD?.trim()?.replace(/\s+/g, "")

  if (!user || !pass) {
    return {
      ok: false,
      error: he.auth.missingGmail,
    }
  }

  const fromName = process.env.GMAIL_FROM_NAME?.trim() || "צוות טופ-אש"
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  })

  try {
    const mail = buildManagerOtpEmail(input.code)
    await transporter.sendMail({
      from: `"${fromName}" <${user}>`,
      to: input.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    })
    return { ok: true }
  } catch (error) {
    console.error("[auth] Gmail send failed:", error)
    return {
      ok: false,
      error:
        process.env.NODE_ENV === "development"
          ? `${he.auth.otpSendFailed} (Gmail SMTP failed)`
          : he.auth.otpSendFailed,
    }
  }
}
