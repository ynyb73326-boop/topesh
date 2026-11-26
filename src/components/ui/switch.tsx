"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "cn"

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-transparent px-0.5 transition-colors outline-none",
        "bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
        "data-checked:bg-primary data-unchecked:bg-input/80",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-6 rounded-full bg-background shadow-sm ring-1 ring-black/5 transition-transform",
          // App is RTL: flex-start is on the right; checked slides toward the left.
          "data-unchecked:translate-x-0 data-checked:-translate-x-5",
          "ltr:data-unchecked:translate-x-0 ltr:data-checked:translate-x-5"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
