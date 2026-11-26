"use server"

import { createServiceSupabaseClient } from "@/data/supabase/server"

/** Bump the Realtime singleton so other open sessions reload their snapshot. */
export async function bumpAppDataSignalAction() {
  try {
    const admin = createServiceSupabaseClient()
    const { error } = await admin.rpc("bump_app_data_signal")
    if (error) console.error("[live] bump_app_data_signal:", error.message)
  } catch (error) {
    console.error("[live] bump_app_data_signal:", error)
  }
}
