# Ajan Ortak Temeli

> **Her ajan çalışmaya başlamadan önce bu dosyayı okur.** Ortak bağlam, değiştirilemez
> kısıtlar, çıktı şablonları ve genel yasaklar burada tutulur; ajan dosyalarında
> tekrarlanmaz.

---

## 1. Okunacak dosyalar

> **Token disiplini (2026-11-01).** Bu liste eskiden koşulsuzdu ve her ajan `ROADMAP.md`'nin
> tamamını (1400+ satır) okuyordu. Ölçüm: ~25 ajan çağrısı × taban okuma ≈ **1M token**, tek
> sürümde. Liste artık **rol bazlı ve hedefli**. Handoff paketindeki **BAĞLAM ÖZETİ** bloğu
> geniş okumaların yerini tutar — Orkestratör onu zaten sentezliyor, ham kaynağı tekrar
> taramak işi iki kez yapmaktır.

**Her ajan — zorunlu:**

| Dosya                                      | Ne için                                               |
| ------------------------------------------ | ----------------------------------------------------- |
| `.claude/workflow/AGENT_BASELINE.md`       | Bu dosya: kısıtlar, şablonlar, FAIL kuralı, yasaklar  |
| Handoff paketindeki **BAĞLAM ÖZETİ**       | Görevin durumu, ölçülmüş sayılar, önceki turların özü |
| `CLAUDE.md` — **yalnızca ilgili bölümler** | Handoff hangi bölümlere atıf yaptıysa (§ numarasıyla) |

**Role göre ek — yalnızca gerekeni oku:**

| Rol                                   | Ek okuma                                                                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `pm`, `architect`, `po`               | `ROADMAP.md`'nin **ilgili sürüm bölümü** + `Sürüm Politikası`; `ARKESOFT_PROJECT_BRIEF.md` yalnızca `pm`                                  |
| `ux`, `ui`                            | `docs/ux/<task>.md` / `docs/ui/<task>.md` ve kendi kapsamındaki bileşenler                                                                |
| `frontend`, `backend`, `db`, `devops` | **Yalnızca kendi dosya listesi** + handoff'un atıf verdiği ADR'ler                                                                        |
| Gate ajanları                         | **Yalnızca BAĞLAM ÖZETİ + denetlenecek dosyalar.** Önceki gate raporlarını **okuma** — ilgili bulgular handoff'a kopyalanmış olarak gelir |
| `docs`, `release`                     | `ROADMAP.md`'nin ilgili bölümleri + değişen dosyaların listesi                                                                            |

**`WORKFLOW.md`'yi okuma zorunluluğu kaldırıldı** — kendi yerini handoff paketi söylüyor.
Döngünün tamamını bilmek yalnızca Orkestratör'ün işi.

Görevle ilgili önceki ajan çıktıları handoff paketinde dosya yolu olarak verilir.
**Verilmeyen dosyayı varsayma — oku veya `NEEDS_INPUT` döndür.** Ama handoff'ta **özeti
verilmiş** bir raporu ham hâlde okumak için gerekçe yaz; gerekçesiz geniş okuma israftır.

---

## 2. Değiştirilemez kısıtlar

Bunlar tartışmaya kapalıdır. İhlal eden çıktı gate'lerde FAIL alır.

- **Next.js yok.** Hiçbir koşulda.
- **Tipsiz JavaScript kaynak dosyası yok.** `any` yok, `@ts-ignore` yok.
- **Sınıf tabanlı React bileşeni yok.** Fonksiyon bileşeni + hook.
- **Tenant izolasyonu her katmanda zorunlu.** `tenant_id` filtresiz sorgu yok; RLS politikası olmayan tenant tablosu yok.
- **Para tamsayı kuruş.** Float ile para tutulmaz, hesaplanmaz.
- **Sır loglanmaz, saklanmaz.** Kart verisi, parola, token, API anahtarı, TCKN.
- **Dil:** yorum ve dokümantasyon Türkçe, kod/değişken/dosya adları İngilizce. Kullanıcıya dönük metin i18n kataloğundan gelir.
- **Yeni ana bağımlılık** eklemek Orkestratör onayı gerektirir — kendi başına ekleme, `NEEDS_INPUT` döndür.
- **Kapsam dışına çıkma.** Handoff'ta verilen alt görev neyse o. "Yolum üstündeydi" refactor'u yasak.

---

## 3. Çıktı şablonları

Serbest metin rapor **yasak**. Aşağıdaki şablonlardan birini birebir kullan.

### 3.1 Üretim ve tasarım ajanları (pm, po, architect, ux, ui, frontend, backend, db, devops, docs, release)

```
AJAN: <ad>
DURUM: DONE | BLOCKED | NEEDS_INPUT
ÇIKTILAR: <dosya listesi — yol:açıklama>
KARARLAR: <aldığın kararlar ve gerekçeleri, 1–5 madde>
VARSAYIMLAR: <doğrulanması gerekenler; yoksa "yok">
RİSKLER: <sonraki ajanların bilmesi gerekenler; yoksa "yok">
SONRAKİ AJAN İÇİN NOT: <isteğe bağlı>
```

### 3.2 Gate ajanları (qa, security, solid, wcag, perf)

```
GATE: <ad>
SONUÇ: PASS | FAIL
BULGULAR:
  - [SEV: critical|high|medium|low] <dosya:satır> — <açıklama> — <önerilen düzeltme> — <sorumlu ajan>
ÖLÇÜMLER: <test sayısı, kapsam, skor vb.>
```

Bulgu yoksa `BULGULAR: yok` yaz.

**Gate ajanları raporu diske de yazar:**
`.claude/workflow/reviews/<task>-<gate>-tur<n>.md` (örn. `T-001-security-tur2.md`).
Dosyanın başına tarih, sürüm ve `GATE:`/`SONUÇ:` bloğunu koy; gövdede bulguları ve
`ÖLÇÜMLER`'i aynen tekrarla. Handoff paketini **ayrıca** Orkestratöre döndür — dosya kalıcı
denetim kaydı, handoff ise döngünün taşıyıcısı.

---

## 4. Gate FAIL kuralı

Kararı sen verme, kurala uy:

| Durum                                      | Sonuç                                   |
| ------------------------------------------ | --------------------------------------- |
| En az bir `critical` **veya** `high` bulgu | **FAIL**                                |
| 3 veya daha fazla `medium` bulgu           | **FAIL**                                |
| 1–2 `medium`                               | PASS — bulgular teknik borca kaydedilir |
| Yalnızca `low`                             | PASS — bulgular teknik borca kaydedilir |

Önem derecesi seçerken:

- **critical** — veri sızıntısı, tenant izolasyon ihlali, kimlik doğrulama atlatma, para kaybı, veri kaybı.
- **high** — yanlış davranış üreten hata, eksik yetki kontrolü, kabul kriterini karşılamama, bütçe aşan performans gerilemesi.
- **medium** — kenar durumda hata, eksik test, standart ihlali, erişilebilirlik engeli.
- **low** — isimlendirme, ölü kod, iyileştirme önerisi.

Önem derecesini şişirme veya küçültme. Emin değilsen bir alt seviyeyi seç ve gerekçesini açıklamaya yaz.

### Bulgunun sonucu ne olur (2026-11-01)

FAIL/PASS kararı ile **düzeltme turu açılması** ayrı şeylerdir:

| Bulgu    | Gate sonucu | Düzeltme turu açar mı                              |
| -------- | ----------- | -------------------------------------------------- |
| critical | FAIL        | **Evet** — derhal                                  |
| high     | FAIL        | **Evet**                                           |
| medium   | ≥3 FAIL     | **Evet** (sayısı kaç olursa olsun)                 |
| low      | PASS        | **Hayır** — doğrudan ROADMAP teknik borç tablosuna |

**`low` bulgular için düzeltme turu koşturulmaz.** Gerekçe ölçülmüş: T-008'de PASS almış
gate'lerin `low`'larını kapatmak için koşturulan ikinci düzeltme turu **0.63M token ve ~45 dakika**
harcadı ve hiçbir davranış hatası düzeltmedi. Borç tablosu bu iş için var.

**İstisna:** bir `low`, aynı turda açılmış bir `high`/`medium` düzeltmesiyle **aynı dosyada ve aynı
düzenlemede** kapanıyorsa, uygulayan ajan onu da kapatır — ayrı tur açılmaz. Bunu handoff'ta
"yolu üstündeyse kapat" diye işaretle.

**Gate ajanı için sonuç:** `low` yazdığında düzeltme beklemiyorsun; **borç satırının metnini**
yaz (SEV, `dosya:satır`, açıklama, sorumlu ajan, vade önerisi) ki `docs` kopyalayabilsin.

---

## 5. Her ajan için geçerli yasaklar

- **Rolünün dışına çıkma.** Gate ajanları kod düzeltmez, bulgu yazar. Üretim ajanları kapsam değiştirmez.
- **Başka ajan çağırma.** Ajanlar birbirini çağırmaz; her şey Orkestratör üzerinden geçer.
- **Kullanıcıyla doğrudan konuşma.** Soruyu `DURUM: NEEDS_INPUT` ile Orkestratöre döndür.
- **Git commit / push yapma.** Commit mesajını yalnızca `release` ajanı hazırlar; commit'i kullanıcı onaylar.
- **Testi gevşetme.** Kabul kriterini geçirmek için eşik düşürme, `skip`, görsel referans güncelleme yasak.
- **Sonuç uydurma.** Komut çalıştırdıysan gerçek çıktısını raporla. Çalıştırmadıysan "çalıştırılmadı" yaz.
- **Başka ajanın dosyasını değiştirme — biçimlendirme komutu dahil.** `prettier --write`,
  `eslint --fix`, `prisma format` gibi komutlar **dosyayı değiştirir**; teşhis amacıyla bile
  sahibi olmadığın bir dosyada çalıştırma. Teşhis için `--check`/`--list-different` kullan,
  bulguyu `RİSKLER`de bildir ve düzeltmeyi dosya sahibine bırak.
  (T-001'de `release` ajanı `docs`'un ADR dosyasında `prettier --write` çalıştırdı; dosya git'te
  takip edilmediği için geri alınamadı.)
- **Yıkıcı veritabanı komutlarında kullanıcı onayı tek kullanımlıktır.** `prisma migrate reset`
  gibi komutlar bir AI ajanı tarafından çağrıldığında Prisma kullanıcının onay mesajının
  **birebir metnini** `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` içinde ister. Bu kapıyı
  atlatmak **yasak**; ortam değişkenini kendin üretme, önceki bir onayı yeniden kullanma.
  Onay gerekiyorsa `DURUM: NEEDS_INPUT` ile Orkestratöre dön.
- **Literal-jeton kuralı (v0.0.12'den itibaren).** Bir jeton yasağını **denetleyen kontrol** (grep, regex vb.), kendi metninde o jetonu **bitişik yazamaz**. Örneğin, `pull_request` yasağını denetleyen bir job'un iş akışı dosyasında metne gömülü `pull_request` varsa grep bunu kendisi bulur → kalıcı False Positive. Jetonu çalışma anında iki parçadan birleştir (`needle_a + needle_b`) ve gerekçesini yorumla belgele. Aynı kural açıklama yorumlarına da geçerlidir.
  **Özel durum:** `run:` bloğu içindeki `${{ }}` ifadeleri, `#` ile başlayan shell yorumunun **içinde olsa bile** GitHub'ın expression engine'i tarafından değerlendirilir. İfadeleri `env:`/`with:`/`if:`/`outputs:` bloklarına taşı veya shell koşul olarak başka yerde tanımla. (T-003 ST-6, ST-7 kanıtlarından; T-002'de 2 örnek daha — toplam dört çıkış).

---

## 6. Komut referansı

Doğrulama için kullanılacak komutlar (repo kökünden):

```bash
pnpm lint            # ESLint, tip bilgisine dayalı katı kurallar
pnpm typecheck       # tsc --noEmit
pnpm build           # tüm paketler
pnpm test            # Vitest (v0.0.3'ten itibaren)
pnpm test:isolation  # tenant izolasyon süiti (v0.0.13'ten itibaren)
pnpm --filter @arkesoft/<app> test:e2e   # Playwright — PAKET BAZINDA (v0.0.7'den itibaren)
                     # KÖK `pnpm test:e2e` script'i YOK (pm T-009'da ölçtü, R6).
                     # Bugün yalnızca apps/admin'de var; borç: devops/docs.
pnpm format:check    # Prettier
pnpm env:check       # ortam değişkeni şeması
pnpm infra:up        # yerel altyapı (Postgres, Redis, Meilisearch, SeaweedFS, Mailpit)
```

Henüz var olmayan komutu çalıştırmaya çalışma — hangi sürümde geldiğini `ROADMAP.md`'den
doğrula. Yoksa `ÖLÇÜMLER` alanına "komut bu sürümde henüz yok" yaz.
