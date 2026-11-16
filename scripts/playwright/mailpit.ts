// scripts/playwright/mailpit.ts — Paylaşılan e2e Mailpit okuyucusu (ROADMAP
// v0.0.20, T-021/S10 FIX turu 1, dalga 2, `solid` M2 bulgusu — bağlayıcı).
//
// NEDEN BU DOSYA VAR: `findVerificationToken` + onun iki tip guard'ı + dört
// Mailpit arayüzü + `MAILPIT_BASE_URL` DÖRT yerde BİREBİR kopyaydı:
//   - apps/superadmin/e2e/fixtures/platform-admin.ts
//   - apps/admin/e2e/helpers/verified-fixture-user.ts
//   - apps/admin/e2e/panel-flow.spec.ts
//   - apps/admin/e2e/session-security-dialog-focus.qa.spec.ts
// ROADMAP:3267/R4'ün KENDİ kalibrasyonu (2 kopya = low, 3+ = medium) DÖRDÜNCÜ
// kopyada `solid` M2'yi (medium) tetikledi. `apps/admin/e2e/helpers/
// verified-fixture-user.ts`'in dosya başı notu bu dördüncü kopyayı BİLEREK
// KABUL ETMİŞTİ ("apps/* → apps/* ithalatı YASAK, bu yüzden REFAKTÖR
// EDİLMEDİ") — ama o gerekçe yalnızca "admin'den import edilemez"i
// kapatıyordu, "scripts/playwright/'e KONMASIN"ı GEREKÇELENDİRMİYORDU. Bu
// alanın (`scripts/playwright/`) fixture'lardan GÖRELİ yolla import
// edilebilirliği `sql.ts`/`totp.ts`'in (S9) ÖLÇÜMÜYLE zaten KANITLI —
// mimari bir engel YOK, yalnızca o turda sorulmamış bir soru vardı.
//
// YER SEÇİMİ: `sql.ts`/`totp.ts`/`base.ts` ile AYNI gerekçe (o dosyaların
// başlıklarında TEKRARLANAN nokta burada TEKRARLANMIYOR) — Playwright'ın
// TypeScript dönüştürücüsü `node_modules`'ü hariç tutar, bir workspace
// paketinden (`packages/*`) ham `.ts` ihraç edilip fixture'dan import
// EDİLEMEZ; `scripts/` zaten `scripts/tsconfig.json`'ın `include: ["*.ts",
// "playwright/*.ts"]`'i sayesinde tip+lint kapsamında birinci sınıf bir
// TypeScript alanı.
//
// NE TAŞINDI / NE KALDI: taşınan `findVerificationToken` gövdesi + iki tip
// guard (`isMailpitMessagesListResponse`/`isMailpitMessageDetail`) + dört
// arayüz (`MailpitAddress`/`MailpitMessageSummary`/
// `MailpitMessagesListResponse`/`MailpitMessageDetail`) + `MAILPIT_BASE_URL`.
// Kalan (çağıran başına, BU DOSYADA DEĞİL): dört çağıranın HER BİRİNİN kendi
// e-posta/kullanıcı üretim mantığı, kendi `sign-up`/`sign-in` zinciri — bu
// dosya SADECE "bir e-postaya gönderilmiş doğrulama bağlantısının token'ını
// oku" sorumluluğunu taşır, dört çağıranın hiçbirinin İŞ mantığına GİRMEZ.
// `label` parametresi YOK (sql.ts'in aksine) — dört kopyanın hata metinleri
// BİREBİR aynıydı (ölçüldü, taşımadan önce), bu yüzden `sql.ts`'in
// "çağıran kendi önekini verir" deseni burada GEREKMİYOR; her çağıran
// yalnızca KENDİ aramasına özgü parametreyi (`email`) geçirir.
//
// `apps/api/src/__tests__/helpers/mailpit-client.ts` BİLEREK AYRI/DOKUNULMADI:
// o, backend'in KENDİ Vitest yardımcısı (farklı test çerçevesi, farklı sahip,
// bu alt görevin `apps/api/**` DOKUNMA kısıtının dışında) — AYNI disiplin
// (token okunana kadar polling) BAĞIMSIZ bir implementasyon olarak kalıyor,
// `totp.ts`'in `apps/api`'ye bağımlı OLMAMA gerekçesiyle AYNI sınıf.
//
// ⚠ K1(d)-BENZERİ BİR KAPI EKLENMEDİ (devops kararı, T-021/S10 FIX turu 1,
// dalga 2 — gerekçeli; ⚠ LİTERAL-JETON DİSİPLİNİ: aşağıdaki açıklama K1(d)'nin
// taradığı kabuk-çağrısı jetonlarını BİLEREK bitişik YAZMIYOR — bu dosya
// K1(d)'nin allowlist'inde DEĞİL, o jetonları taşırsa `pnpm guards` bu
// dosyayı "üçüncü/ek bir kopya" sanıp KIRMIZI verir, AC8/AC16 ile AYNI
// disiplin): ADR-0022 K1(d)'nin "tam olarak BİR modül" kapısı,
// `scripts/playwright/sql.ts`'in sarmaladığı konteyner-içi kabuk çağrısı
// MEKANİZMASI için var çünkü o mekanizma AYRICALIKLI bir YAZMA yoludur (bir
// kabuk alt süreci + canlı veritabanı konteynerine serbest metin komut —
// `apps/*/src/**`'e SIZARSA komut/sorgu enjeksiyonu yüzeyi AÇAR, ADR-0022
// Karar 1(d)). Mailpit okuyucusu NİTELİKSEL OLARAK FARKLI: (a) salt OKUMA —
// yalnızca `GET /api/v1/messages`/`GET /api/v1/message/:id`, hiçbir
// yazma/komut YOK; (b) hedef yerel, GELİŞTİRME-ONLY bir e-posta yakalama
// servisi (Mailpit) — üretimde KARŞILIĞI yok, `apps/*/src/**`'e SIZMASI
// anlamlı bir senaryo DEĞİL (üretim kodu asla Mailpit'e bağlanmaz, o konteyner
// komutunun aksine "biri kolaylık için prod'a sızdırabilir" riski YOK);
// (c) mekanizma düz `fetch` — ne kabuk alt süreci ne serbest metin
// interpolasyonu, komut/sorgu enjeksiyonu yüzeyi YOK. K1(d)'nin var olma
// nedeni ("ayrıcalıklı yazma yolu sızıntısı") burada YOK ⇒ eşdeğer bir
// mekanik kapı eklemek bu turda YENİ bir koruma kazandırmaz, yalnızca
// `guards.sh`'e bakım yükü ekler. Borç kaydı (düşük öncelik, `docs`'a
// taşınacak): üçüncü bir Mailpit kopyası doğarsa bunu yakalayacak mekanik bir
// kapı YOK — bugünkü tespit yöntemi (`grep -rn findVerificationToken`) `solid`
// gate'inin bu turda kullandığı AYNI elle yapılan tarama; mekanikleştirme
// ihtiyacı doğarsa K1(d)'nin deseni (allowlist eşitliği) emsal alınabilir.

interface MailpitAddress {
  readonly Address: string
}
interface MailpitMessageSummary {
  readonly ID: string
  readonly To: readonly MailpitAddress[]
}
interface MailpitMessagesListResponse {
  readonly messages: readonly MailpitMessageSummary[]
}
interface MailpitMessageDetail {
  readonly Text: string
}

function isMailpitMessagesListResponse(value: unknown): value is MailpitMessagesListResponse {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  return Array.isArray((value as Record<string, unknown>)['messages'])
}

function isMailpitMessageDetail(value: unknown): value is MailpitMessageDetail {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  return typeof (value as Record<string, unknown>)['Text'] === 'string'
}

/**
 * Mailpit'in (`infra/docker-compose.yml`'in açtığı `:8025`) HTTP API tabanı —
 * dört taşınan çağıranın hepsinde BİREBİR aynı değerdi.
 */
export const MAILPIT_BASE_URL = 'http://127.0.0.1:8025'

/**
 * Mailpit'ten belirli bir alıcıya gönderilmiş e-postadaki doğrulama
 * bağlantısının `token` sorgu parametresini okur. "Token üretildi"
 * varsayımıyla sessizce boş DÖNMEZ — bulunamazsa throw eder (dört taşınan
 * kopyanın AYNI disiplini). `label` parametresi YOK — dosya başı notuna bkz.
 */
export async function findVerificationToken(email: string): Promise<string> {
  const target = email.toLowerCase()

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const listResponse = await fetch(`${MAILPIT_BASE_URL}/api/v1/messages?limit=50`)
    const listRaw: unknown = await listResponse.json()

    if (isMailpitMessagesListResponse(listRaw)) {
      const match = listRaw.messages.find((message) =>
        message.To.some((address) => address.Address.toLowerCase() === target),
      )

      if (match !== undefined) {
        const detailResponse = await fetch(`${MAILPIT_BASE_URL}/api/v1/message/${match.ID}`)
        const detailRaw: unknown = await detailResponse.json()

        if (!isMailpitMessageDetail(detailRaw)) {
          throw new Error('Mailpit mesaj gövdesi beklenen şekilde değil')
        }

        const urlMatch = /https?:\/\/\S+/.exec(detailRaw.Text)
        if (urlMatch === null) {
          throw new Error('Doğrulama e-postasında bağlantı bulunamadı')
        }

        const token = new URL(urlMatch[0]).searchParams.get('token')
        if (token === null) {
          throw new Error("Doğrulama bağlantısında 'token' sorgu parametresi bulunamadı")
        }

        return token
      }
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 250)
    })
  }

  throw new Error(`Mailpit'te ${email} alıcısına gönderilmiş mesaj bulunamadı`)
}
