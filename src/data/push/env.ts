import "server-only"

export function getVapidPublicKey() {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
  if (!key) throw new Error("Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY")
  return key
}

export function getVapidPrivateKey() {
  const key = process.env.VAPID_PRIVATE_KEY?.trim()
  if (!key) throw new Error("Missing VAPID_PRIVATE_KEY")
  return key
}

export function getVapidSubject() {
  return process.env.VAPID_SUBJECT?.trim() || "mailto:ynyb73326@gmail.com"
}

export function isPushConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() && process.env.VAPID_PRIVATE_KEY?.trim()
  )
}
