import { DashboardScreen } from "@/features/manager/dashboard-screen"

/** Client auth gate + live Supabase fetch — not expected to be instant. */
export const instant = false

export default function ManagerDashboardPage() {
  return <DashboardScreen />
}
