"use client"

import { useEffect, useRef } from "react"
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react"
import { cn } from "cn"

/** Counts from 0 (or previous) up to `value` when data becomes ready. */
export function AnimatedMetricNumber({
  value,
  loading = false,
  className,
}: {
  value: number
  loading?: boolean
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  const motionValue = useMotionValue(0)
  const rounded = useTransform(motionValue, (latest) =>
    Math.round(latest).toLocaleString("he-IL")
  )
  const readyOnce = useRef(false)

  useEffect(() => {
    if (loading) {
      motionValue.set(0)
      readyOnce.current = false
      return
    }

    if (reduceMotion) {
      motionValue.set(value)
      readyOnce.current = true
      return
    }

    const from = readyOnce.current ? motionValue.get() : 0
    readyOnce.current = true
    const controls = animate(from, value, {
      duration: Math.min(1.15, 0.45 + Math.abs(value - from) * 0.035),
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => motionValue.set(latest),
    })
    return () => controls.stop()
  }, [loading, value, reduceMotion, motionValue])

  return (
    <motion.span
      className={cn("tabular-nums", className)}
      aria-label={loading ? "0" : String(value)}
    >
      {rounded}
    </motion.span>
  )
}
