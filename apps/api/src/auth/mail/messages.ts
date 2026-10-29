// @arkesoft/api — e-posta mesaj katalogu (ROADMAP v0.0.5, T-006/S4, architect
// K8)
//
// `packages/i18n` henüz yok (v0.0.18). Bu modül onun DEVRALACAĞI asgari
// yüzeyi taşır: anahtar + değişkenler → {subject, text, html}. Konu/gövde
// metni çağıran kodda (ileride `AuthModule`) HİÇBİR ZAMAN sabit yazılmaz
// (CLAUDE.md §4/§10.17) — her e-posta bir MESAJ ANAHTARI ile istenir, metnin
// TEK doğruluk kaynağı burasıdır.
//
// AC11 — eksik/yanlış yazılmış anahtar SESSİZCE boş içerik DÖNMEZ, throw
// eder: "e-posta gönderildi ama içi boştu" sınıfı hata çalışma anında GÖRÜNÜR
// olur, production'da sessizce yutulmaz.
//
// v0.0.18 taşıması: `MAIL_MESSAGE_CATALOG`'un girdileri `packages/i18n`'in
// mesaj kataloğuna BİREBİR taşınır; `renderMailMessage`'ın çağıran imzası
// (anahtar + değişkenler → {subject,text,html}) AYNI kalır — bu modülü
// tüketen kod (ileride `AuthModule`) o geçişte DEĞİŞMEZ.
//
// Türkçe karakter notu (ş/ğ/İ/ı): RFC 2047 başlık kodlaması SMTP istemci
// kütüphanesinin işidir (bkz. smtp-mail-transport.ts — TEK import noktası);
// bu katalog yalnızca ham UTF-8 Türkçe metin ÜRETİR, kodlamaya KARIŞMAZ.

/** Katalogdan dönen, gönderime hazır içerik. */
export interface MailContent {
  readonly subject: string
  readonly text: string
  readonly html: string
}

type MailMessageVariables = Readonly<Record<string, string>>

type MailMessageRenderer = (variables: MailMessageVariables) => MailContent

/**
 * `variables[name]` eksikse/boşsa throw eder — AC11'in "eksik anahtar/değişken
 * sessizce geçilmez" disiplini değişkenler için de geçerlidir.
 * `noUncheckedIndexedAccess` altında `variables[name]`'in tipi zaten
 * `string | undefined`'dır; bu fonksiyon o daraltmayı TEK yerde yapar.
 */
function requireVariable(variables: MailMessageVariables, name: string): string {
  const value = variables[name]

  if (value === undefined || value.length === 0) {
    throw new Error(`eksik e-posta mesaj değişkeni: ${name}`)
  }

  return value
}

/**
 * Bir metni HTML gövdesine güvenle gömmek için asgari kaçışlama. Değişkenler
 * (ör. doğrulama bağlantısı) ÇAĞIRANDAN gelir — doğrulanmamış veri HTML'e
 * ham yazılmaz (XSS'e karşı asgari disiplin; bu katalog tam bir HTML
 * şablon motoru DEĞİLDİR, K8'in "görsel tasarım yok" kararıyla uyumlu).
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

const MAIL_MESSAGE_CATALOG = {
  /**
   * Kayıt sonrası e-posta doğrulama ve `/auth/send-verification-email` ile
   * yeniden gönderim (ROADMAP v0.0.5 kapsamı). Değişken: `url` (doğrulama
   * bağlantısı, tam URL).
   */
  'auth.emailVerification': (variables: MailMessageVariables): MailContent => {
    const url = requireVariable(variables, 'url')

    return {
      subject: 'İşleminizi doğrulayın',
      text: [
        'Merhaba,',
        '',
        'Arkesoft hesabınızı doğrulamak için aşağıdaki bağlantıyı açın:',
        url,
        '',
        'Bu isteği siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz.',
      ].join('\n'),
      html: [
        '<p>Merhaba,</p>',
        `<p>Arkesoft hesabınızı doğrulamak için <a href="${escapeHtml(url)}">bu bağlantıyı</a> açın.</p>`,
        '<p>Bu isteği siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz.</p>',
      ].join(''),
    }
  },

  /** Şifre sıfırlama (ROADMAP v0.0.5 kapsamı). Değişken: `url`. */
  'auth.passwordReset': (variables: MailMessageVariables): MailContent => {
    const url = requireVariable(variables, 'url')

    return {
      subject: 'Şifrenizi sıfırlayın',
      text: [
        'Merhaba,',
        '',
        'Şifrenizi sıfırlamak için aşağıdaki bağlantıyı açın:',
        url,
        '',
        'Bu isteği siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz.',
      ].join('\n'),
      html: [
        '<p>Merhaba,</p>',
        `<p>Şifrenizi sıfırlamak için <a href="${escapeHtml(url)}">bu bağlantıyı</a> açın.</p>`,
        '<p>Bu isteği siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz.</p>',
      ].join(''),
    }
  },
} satisfies Record<string, MailMessageRenderer>

/** Katalogdaki geçerli anahtarların derleme zamanı birleşimi. */
export type MailMessageKey = keyof typeof MAIL_MESSAGE_CATALOG

/**
 * `key`'in katalogdaki bir üyeye TAM eşleştiğini çalışma anında doğrulayan
 * tip koruyucusu (type guard). `renderMailMessage`'ın `string` girdisini
 * (dış kaynaklı olabilir — ör. v0.0.11 kuyruk payload'ı) `as` ile zorlamadan
 * (CLAUDE.md §4 — `as` yalnızca Zod doğrulamasından sonra kabul edilir; burada
 * Zod yerine bu açık runtime kontrolü var) daraltmanın TEK yolu budur.
 */
function isMailMessageKey(key: string): key is MailMessageKey {
  return Object.hasOwn(MAIL_MESSAGE_CATALOG, key)
}

/**
 * Katalogdan içerik üretir. FIX turu 1, madde 9 (solid M-4, medium) —
 * imza ARTIK `MailMessageKey`'e DARALTILMIŞ (ÖNCEDEN `string` idi,
 * var OLMAYAN bir tüketici — v0.0.11 kuyruğu — İÇİN derleme zamanı
 * garantisi FEDA EDİLMİŞTİ). Katalogdaki bir anahtar YENİDEN ADLANDIRILIRSA
 * bu fonksiyonun ÇAĞIRANLARI artık `pnpm typecheck`'te KIRILIR — ÖNCEDEN
 * hata ancak GERÇEK bir kayıt/sıfırlama isteğinde (üretim anında, 503
 * olarak) ortaya çıkıyordu.
 */
export function renderMailMessage(
  key: MailMessageKey,
  variables: MailMessageVariables,
): MailContent {
  return MAIL_MESSAGE_CATALOG[key](variables)
}

/**
 * Dış kaynaklı (henüz derleme zamanı garantisi OLMAYAN — ör. v0.0.11'in
 * kuyruk payload'ından okunacak `messageKey`) bir dizeyi `MailMessageKey`'e
 * daraltır. Katalogda yoksa throw eder (AC11) — sessizce boş içerik DÖNMEZ.
 * `renderMailMessage`'ın kendisi artık bu daraltmayı YAPMAZ (yukarıdaki
 * yorum) — dış kaynaklı bir anahtarla çalışan kod ÖNCE bunu çağırır, SONRA
 * `renderMailMessage`'a geçer.
 */
export function parseMailMessageKey(raw: string): MailMessageKey {
  if (!isMailMessageKey(raw)) {
    throw new Error(`bilinmeyen e-posta mesaj anahtarı: ${raw}`)
  }

  return raw
}
