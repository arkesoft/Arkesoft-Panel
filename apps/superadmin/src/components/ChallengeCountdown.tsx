// @arkesoft/superadmin — ChallengeCountdown (ROADMAP v0.0.20, T-021/S8,
// `apps/admin/src/components/ChallengeCountdown.tsx`'in BİREBİR aynısı —
// cross-app import yasak olduğu için yerel kopya, "challenge'a özgü eşik
// mantığı" P5 deseni korunuyor).
//
// İstemci tarafı sayaç — `two_factor` challenge çerezinin 10 dakikalık
// penceresini TAKLİT eder; PROAKTİF davranır (sunucuya sormadan kendi
// sayacıyla 0'a indiğinde `onExpire` çağırır).
import { useEffect, useRef, useState, type JSX } from 'react'

import { formatRemainingTime, shouldAnnounceRemainingSeconds } from '../lib/challenge-countdown.js'

export interface ChallengeCountdownProps {
  readonly totalSeconds: number
  readonly onExpire: () => void
  /** "Kalan süre: {kalan}" — `{kalan}` burada BİRLEŞİK formatlanmış metinle değiştirilir. */
  readonly label: string
  /** 60 saniye eşiğinde duyurulan metin. */
  readonly oneMinuteRemainingAnnouncement: string
  /** 0 saniye eşiğinde duyurulan metin. */
  readonly expiredAnnouncement: string
}

export function ChallengeCountdown({
  totalSeconds,
  onExpire,
  label,
  oneMinuteRemainingAnnouncement,
  expiredAnnouncement,
}: ChallengeCountdownProps): JSX.Element {
  const [secondsRemaining, setSecondsRemaining] = useState(totalSeconds)
  const onExpireRef = useRef(onExpire)

  useEffect(() => {
    onExpireRef.current = onExpire
  }, [onExpire])

  useEffect(() => {
    const intervalId = setInterval(() => {
      setSecondsRemaining((previous) => Math.max(0, previous - 1))
    }, 1000)
    return () => {
      clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    if (secondsRemaining === 0) {
      onExpireRef.current()
    }
  }, [secondsRemaining])

  const announce = shouldAnnounceRemainingSeconds(secondsRemaining)
  const announcement = secondsRemaining === 0 ? expiredAnnouncement : oneMinuteRemainingAnnouncement

  return (
    <div className="flex flex-col gap-1">
      <p
        aria-hidden="true"
        className="text-(length:--font-size-small) text-(--color-text-secondary)"
      >
        {label.replace('{kalan}', formatRemainingTime(secondsRemaining))}
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {announce ? announcement : null}
      </p>
    </div>
  )
}
