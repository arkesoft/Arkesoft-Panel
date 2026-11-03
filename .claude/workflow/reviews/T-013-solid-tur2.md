# T-013 · solid gate · tur 2 (DAR)

Tarih: 2026-11-03 · Sürüm: **v0.0.11** · Task: **T-013** · Kapsam: **yalnızca M-1'in kapanışı**
Araçlar: **okuma + grep** (Bash yok — test/lint/build KOŞTURULMADI)

```
GATE: solid
SONUÇ: PASS
```

Yeni tarama yapılmadı. Sekiz `low`, M-2 ve `qa` bulguları bu turun konusu değil.

---

## (a) M-1 KAPANDI MI — NET CEVAP

**M-1 KAPANDI.** İki yarısının ikisi de kaynak okunarak doğrulandı:

1. **Asimetri — GİDERİLDİ.** `job-runner.ts:522` artık
   `where: { id: jobId, status: { in: [JobStatus.queued, JobStatus.running] } }`;
   ADIM 3'ün yüklemi (`:462`) ile **birebir aynı**. Tur 1'de bulgunun mekanik çekirdeği
   olan "ADIM 5 `where: { id: jobId }` ile koşulsuz `completed` yazıyor" ifadesi artık
   **tutmuyor** — dosyada o hâli kalmamış.
2. **Beyan — DARALTILDI.** `job-summary.schema.ts:97-112`; bkz. (b).

Üçüncü yarı (tur 1'de istediğim test): `qa-job-completed-error-invariant.test.ts:162`
(YOL 1) ve `:226` (YOL 2) — ikinci test terminal→yeniden teslim yolunu ölçüyor ve
beklentisi `expect({ isCompleted, hasError }).not.toEqual({ isCompleted: true, hasError: true })`
(`:264-267`) ile **tel değişmezinin kendisini**, durumdan türetmeden assert ediyor.
Bu, "kusurun fotoğrafı" değil **değişmezin bekçisi** — doğru assertion seçimi.
`:270-272` ayrıca ADIM 5'in üç yazımının **bir bütün olarak** atlandığını
(`failed` · `progress: 0` · `completedAt: null`) pinliyor → `failed` + `progress: 100`
gibi yeni bir çelişki doğmadığı **ölçülmüş**, beyan edilmemiş.

## (b) Beyan gerçekten daraltıldı mı — EVET

`packages/trpc/src/schemas/job-summary.schema.ts`:

- `:97-105` garantiyi **iki mekanik dayanağıyla** yazıyor ((1) hata yazan tek yol terminal
  deneme, (2) `'completed'` yazımı yalnızca `queued|running` kayıtta).
- `:107-112` **garanti edilmeyeni açıkça** yazıyor: *"terminal muhasebeden SONRA yeniden
  teslim edilip BAŞARAN bir iş `'failed'` + dolu `error` olarak KALIR… `status` son
  denemenin sonucunu değil, KAYDEDİLMİŞ TERMİNAL sonucu söyler."*

**Karşılanmayan garanti kalmadı.** Beyan edilen tek değişmez (`completed` + dolu `error`
birlikte görülemez) artık ADIM 5'in yüklemiyle **mekanik**; doğruluğu `:264-267` ile
test altında. Beyan ile gerçeklik boşluğu — tur 1'de M-1'i açan kusur sınıfı — **yok**.

## (c) Reddime uyuldu mu — EVET

`packages/db/src/index.ts:52` hâlâ `export type { Prisma } from '#prisma'` — **tip-only**.
Paket yüzeyinde `Prisma` **değer** export'u yok (grep: `index.ts`'te `Prisma` geçen tek
export satırı `:52`); `DbNull`/`JsonNull` dışa açılmamış, `client.ts` allowlist disiplini
dokunulmamış. Düzeltme `error` kolonunu NULL'a çekmeye **çalışmadı** — tur 1'in
*"`packages/db`'ye `DbNull` eklemek daha doğru OLMAZDI"* notuna uyuldu.

## (d) R-FIX1-1 — `low` DOĞRU, yarım simetri KABUL EDİLEBİLİR

Ters yön doğrulandı: `recordTerminalFailure` (`job-runner.ts:328-331`) `where: { id: params.jobId }`
ile **koşulsuz** yazıyor. (⚠ brief `:325-330` diyor; gerçek satırlar **`:328-331`** — içerik
tutuyor, numara 3 satır kaymış.)

**Gerekçe geçerli, `low` doğru:**

- Düzeltilen **tel** garantisi ihlal edilmiyor: bu yazım `status: failed` + `error` üretir,
  `completed` + dolu `error` **üretemez**. `jobSummarySchema`'nın beyan ettiği tek değişmez
  her iki yönde de ayakta.
- `completedAt`'in anlamı hiçbir yerde sözleşme olarak beyan edilmemiş
  (`schema.prisma:275` yalnızca `DateTime?`), dolayısıyla `failed` + dolu `completedAt`
  **beyan edilmiş bir** değişmezi kırmıyor — tele çıkıyor ama garanti altında değil.
- Simetriyi aynı turda tamamlamak AC6'nın terminal muhasebe yüzeyinde **test edilmemiş** bir
  davranış değişikliği olurdu; dar kapsam kuralı gereği ertelenmesi tutarlı.

Bu bir **tutarsızlık bırakmadı**, **dar bir eksiklik** bıraktı: fark, bırakılanın
beyan edilmiş bir garantiyi ihlal etmemesi.

## (e) Düzeltmenin kendi getirdiği kusur — bir `low`

Değişen üç dosya dışına çıkılmadı. `any` **0**, `@ts-ignore` **0**, yeni `as` **0**
(`job-runner.ts`'te `as` hâlâ tek: `:212`, Zod `parse` hemen sonrası, gerekçesi `:206-210`;
yeni test dosyasında `as` **0**). Tek bulgu aşağıda.

---

## BULGULAR

### L-9 · [SEV: low] `packages/trpc/src/schemas/job-summary.schema.ts:112` + `apps/api/src/queue/job-runner.ts:513,516-517`

**Ne:** FIX 1'in **gerekçe metni**, kurduğu mekanizmadan **bir yön daha geniş**.
Üç cümle terminal kaydı **genel olarak** dokunulmaz ilan ediyor:

- şema `:112` — *"terminal kaydı dokunulmaz tutmak SEÇİLDİ"*
- runner `:513` — *"kayıtlı terminal sonuç tek kalır"*
- runner `:516-517` — *"`startedAt`'in 'olgusal kayıt ÜZERİNE YAZILMAZ' kuralıyla aynı
  yöndedir"*

Oysa dokunulmazlık **tek yönlü**: `failed` bir kayıt `completed`'e dönmez, ama `completed`
bir kayıt `recordTerminalFailure` (`:328-331`) ile `failed` + `error`'a **dönebilir**
(R-FIX1-1'in ta kendisi). `startedAt` benzetmesi de bu yüzden yarım: `startedAt`
**her iki yönde** `where: { startedAt: null }` ile korunuyor, terminal durum ise değil.

**Neden kusur:** tur 1'de M-1'i açan sınıfın (beyan > mekanizma) **küçük kalıntısı**.
`medium` değil, çünkü (i) tele çıkan bir garantiyi ihlal etmiyor — `jobSummarySchema`'nın
beyanı doğru ve dar; (ii) metin bir iç kaynak yorumu, sözleşme yüzeyi değil. Ama
R-FIX1-1 kapatılırken **düzeltilecek şey yalnızca `where` değil, bu üç cümle de**.

**Önerilen yön:** üç cümleye yönü ekle (*"terminal BAŞARISIZLIK kaydı `completed`'e
dönmez; ters yön bugün korunmuyor — R-FIX1-1"*) veya R-FIX1-1 ile birlikte simetriyi
tamamla ve cümleleri olduğu gibi bırak. **Vade:** v0.0.12 (R-FIX1-1 ile aynı satırda).
**Sorumlu ajan:** `backend`

### Borç satırı metni — R-FIX1-1 (teyit, yeni bulgu değil)

`[SEV: low] apps/api/src/queue/job-runner.ts:328-331` — `recordTerminalFailure` durum
yüklemi taşımıyor; `completed` bir satır teorik yeniden teslimde `failed` + `error`'a
dönebilir (`completedAt` dolu kalır). Tel garantisini ihlal etmez. **Sorumlu:** `backend`.
**Vade:** v0.0.12. ⚠ Kapatılırken L-9'un üç cümlesi de aynı düzenlemede güncellenmeli.

### Bilgi notu — R-FIX1-2

`job-runner.ts:531` `logger.info({ attemptNumber, completedRowCount: completion.count }, …)`
doğrulandı. Log şemasının sözleşme **olmadığı** iddiası bu turda ölçülmedi (yeni tarama
yasak) — `backend`'in ölçümü kabul edildi. Bulgu değil.

---

## ÖLÇÜMLER

```
İncelenen dosya            5 (job-runner.ts hedefli 300 satır · job-summary.schema.ts tam ·
                              qa-job-completed-error-invariant.test.ts tam ·
                              queue-tenant-context.isolation.test.ts blok (6) · db/src/index.ts)
`any` sayısı (değişen diff) 0
`@ts-ignore` / `@ts-expect-error` 0
`as` tip zorlaması          1 — job-runner.ts:212 (Zod `parse` sonrası, gerekçeli); yeni testte 0
En büyük fonksiyon          createJobProcessor 244 satır (290-533); iç kapanış 170 satır (363-532)
                            ⚠ tur 1: 224/150 → FIX 1'in yorumları +20 satır (kod artışı: 1 satır,
                            `where` yüklemi + `completion` bağlaması). L-3 borcu geçerli kalır.
Yeni/değişen test           2 dosya · 3 test (YOL 1, YOL 2, izolasyon blok (6))
`packages/db` değer export'u 0 (`index.ts:52` tip-only)
test/lint/build             KOŞTURULMADI (Bash yok)
```

**§4 kararı:** 0 critical · 0 high · **0 medium** · 1 low → **PASS**, bulgu teknik borca.
