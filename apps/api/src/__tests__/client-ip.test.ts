// @arkesoft/api — client-ip.ts birim testleri (ROADMAP v0.0.5, T-006/S8,
// architect riski 4)
//
// SAF fonksiyon — Redis/DB/HTTP YOK, tamamen senkron/birim.

import { describe, expect, it } from 'vitest'

import { resolveClientIp } from '../auth/rate-limit/client-ip.js'

describe('resolveClientIp — architect riski 4 (varsayılan 0 = XFF YOK SAYILIR)', () => {
  it('trustedProxyCount=0 → X-Forwarded-For TAMAMEN yok sayılır, soket adresi kullanılır', () => {
    const ip = resolveClientIp(
      { headers: { 'x-forwarded-for': '203.0.113.9' }, socket: { remoteAddress: '10.0.0.5' } },
      0,
    )
    expect(ip).toBe('10.0.0.5')
  })

  it('trustedProxyCount=0 VE soket adresi de yoksa → "unknown" sentinel', () => {
    const ip = resolveClientIp({ headers: { 'x-forwarded-for': '203.0.113.9' } }, 0)
    expect(ip).toBe('unknown')
  })

  it('trustedProxyCount=1 + TEK hop → o hop istemcidir (Express "trust proxy" semantiği)', () => {
    const ip = resolveClientIp(
      { headers: { 'x-forwarded-for': '203.0.113.9' }, socket: { remoteAddress: '10.0.0.5' } },
      1,
    )
    expect(ip).toBe('203.0.113.9')
  })

  it('trustedProxyCount=2 + İKİ hop → EN SOLDAKİ (orijinal istemci) döner', () => {
    const ip = resolveClientIp(
      {
        headers: { 'x-forwarded-for': '203.0.113.9, 198.51.100.4' },
        socket: { remoteAddress: '10.0.0.5' },
      },
      2,
    )
    expect(ip).toBe('203.0.113.9')
  })

  it('trustedProxyCount=1 + İKİ hop (eksik güven) → GÜVEN SINIRINDAKİ hop (en sondaki) döner', () => {
    const ip = resolveClientIp(
      {
        headers: { 'x-forwarded-for': '203.0.113.9, 198.51.100.4' },
        socket: { remoteAddress: '10.0.0.5' },
      },
      1,
    )
    expect(ip).toBe('198.51.100.4')
  })

  it('trustedProxyCount > 0 AMA başlık YOK → soket adresine düşer', () => {
    const ip = resolveClientIp({ headers: {}, socket: { remoteAddress: '10.0.0.5' } }, 1)
    expect(ip).toBe('10.0.0.5')
  })

  it('trustedProxyCount > 0 AMA başlık BOŞ dize → soket adresine düşer', () => {
    const ip = resolveClientIp(
      { headers: { 'x-forwarded-for': '   ' }, socket: { remoteAddress: '10.0.0.5' } },
      1,
    )
    expect(ip).toBe('10.0.0.5')
  })

  it('trustedProxyCount, hop sayısından BÜYÜK (aşırı güven) → EN SOLDAKİ hope KLAMPLENİR', () => {
    const ip = resolveClientIp(
      { headers: { 'x-forwarded-for': '203.0.113.9' }, socket: { remoteAddress: '10.0.0.5' } },
      5,
    )
    expect(ip).toBe('203.0.113.9')
  })

  it('başlık dizi olarak gelirse (çoklu header) İLK değeri kullanır', () => {
    const ip = resolveClientIp(
      {
        headers: { 'x-forwarded-for': ['203.0.113.9', '198.51.100.4'] },
        socket: { remoteAddress: '10.0.0.5' },
      },
      1,
    )
    expect(ip).toBe('203.0.113.9')
  })

  it('hiçbir kaynak yoksa (başlık yok, soket yok, trust>0) → "unknown"', () => {
    const ip = resolveClientIp({ headers: {} }, 1)
    expect(ip).toBe('unknown')
  })
})
