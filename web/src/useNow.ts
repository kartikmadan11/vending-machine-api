import { useEffect, useState } from 'react'

/**
 * The current time, updated every `intervalMs`, for countdowns. Between updates it can be up to
 * `intervalMs` behind, so a countdown should not let it run behind the event it counts from.
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
