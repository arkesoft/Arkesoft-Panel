// @arkesoft/admin — PANEL_DEV_PORT pin testi (ROADMAP v0.0.7, T-008/S4,
// architect K1 "sessiz 403 tuzağı"). `.env.example`'daki `AUTH_BASE_URL`
// portu `PANEL_DEV_PORT` ile EŞİT olmak zorunda — aksi hâlde giriş
// `origin_mismatch` ile SESSİZCE 403 alır (belirtisi hatadan çok "giriş
// çalışmıyor"dur).
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { PANEL_DEV_PORT } from '../app/panel-config.js'

describe('panel-origin-pin', () => {
  it('.env.example içindeki AUTH_BASE_URL portu PANEL_DEV_PORT ile eşleşir', () => {
    const envExampleUrl = new URL('../../../../.env.example', import.meta.url)
    const content = readFileSync(envExampleUrl, 'utf-8')

    const match = /^AUTH_BASE_URL=(\S+)$/m.exec(content)
    if (!match) {
      throw new Error('.env.example içinde AUTH_BASE_URL satırı bulunamadı')
    }

    const rawValue = match[1]
    if (rawValue === undefined) {
      throw new Error('AUTH_BASE_URL satırının değeri ayrıştırılamadı')
    }

    const parsed = new URL(rawValue)
    expect(parsed.port).toBe(String(PANEL_DEV_PORT))
  })
})
