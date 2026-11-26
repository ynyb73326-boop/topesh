import "server-only"

function jerusalemParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  })
  const parts = fmt.formatToParts(now)
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? ""
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "-1")
  return { weekday, hour }
}

/** Sun–Thu at 18:00 Asia/Jerusalem. */
export function shouldSendPendingReminder(now = new Date()) {
  const { weekday, hour } = jerusalemParts(now)
  const workday = ["Sun", "Mon", "Tue", "Wed", "Thu"].includes(weekday)
  return workday && hour === 18
}
