// @arkesoft/admin — ChallengeCountdown (ROADMAP v0.0.15, T-016/S10,
// docs/ui/T-016-iki-faktorlu-dogrulama.md P5 — "challenge'a özgü eşik
// mantığı, genel bir 'Countdown' ilkeli DEĞİL")
//
// İstemci tarafı sayaç — `two_factor` challenge çerezinin `Max-Age=600`
// (10 dk, canlı ölçülen) penceresini TAKLİT eder; sunucunun bu durumda tam
// olarak ne döneceği DOĞRULANAMADI (docs/ux/T-016) — bu bileşen PROAKTİF
// davranır (sunucuya sormadan kendi sayacıyla 0'a indiğinde `onExpire`
// çağırır).
import { useEffect, useRef, useState, type JSX } from 'react'

import { formatRemainingTime, shouldAnnounceRemainingSeconds } from '../lib/challenge-countdown.js'

export interface ChallengeCountdownProps {
  readonly totalSeconds: number
  readonly onExpire: () => void
  /** ux: "Kalan süre: {dakika}:{saniye}" — `{dakika}`/`{saniye}` burada BİRLEŞİK formatlanmış metinle değiştirilir. */
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

  // `react-hooks/refs` (BAĞLAYICI eslint kuralı): ref RENDER sırasında
  // YAZILMAZ/OKUNMAZ — "en güncel callback'e işaret eden ref" deseni bu
  // yüzden bir `useEffect` İÇİNDE güncellenir (React'in resmî önerisi).
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
