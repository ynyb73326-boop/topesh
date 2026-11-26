import { toast } from "sonner"
import { he } from "@/i18n/he"

type SavingToastOptions<T> = {
  loading?: string
  /** `false` dismisses the loading toast without a success message. */
  success?: string | false | ((result: Extract<T, { ok: true }>) => string | false | undefined)
  /** `false` dismisses the loading toast without an error message. */
  error?: string | false
}

/**
 * Shows a top toast while an async mutate runs, then swaps it to success/error.
 * Prefer this over silent awaits so the user always sees progress.
 */
export async function withSavingToast<T extends { ok: boolean }>(
  action: () => Promise<T>,
  options: SavingToastOptions<T> = {}
): Promise<T> {
  const copy = he.feedback
  const id = toast.loading(options.loading ?? copy.saving)
  try {
    const result = await action()
    if (result.ok) {
      const resolved =
        typeof options.success === "function"
          ? options.success(result as Extract<T, { ok: true }>)
          : options.success
      if (resolved === false) toast.dismiss(id)
      else toast.success(resolved ?? copy.saved, { id })
    } else if (options.error === false) {
      toast.dismiss(id)
    } else {
      toast.error(options.error ?? copy.saveFailed, { id })
    }
    return result
  } catch (error) {
    if (options.error === false) toast.dismiss(id)
    else toast.error(options.error ?? copy.saveFailed, { id })
    throw error
  }
}
