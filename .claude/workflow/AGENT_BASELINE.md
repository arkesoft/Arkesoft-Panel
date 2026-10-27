# Ajan Ortak Temeli

> **Her ajan çalışmaya başlamadan önce bu dosyayı okur.** Ortak bağlam, değiştirilemez
> kısıtlar, çıktı şablonları ve genel yasaklar burada tutulur; ajan dosyalarında
> tekrarlanmaz.

---

## 1. Okunacak dosyalar

Sırayla:

| Dosya                          | Ne için                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `ARKESOFT_PROJECT_BRIEF.md`    | Ürün nedir, hedef kullanıcılar, rakipler, modüller                             |
| `CLAUDE.md`                    | Yığın, yasaklar, monorepo haritası, kod standartları, tenant izolasyon listesi |
| `ROADMAP.md`                   | Sürüm planı, kabul kriterleri, sürüm politikası, varsayımlar (A1–A17)          |
| `.claude/workflow/WORKFLOW.md` | Döngünün tamamı ve kendi yerin                                                 |

Görevle ilgili önceki ajan çıktıları handoff paketinde dosya yolu olarak verilir.
**Verilmeyen dosyayı varsayma — oku veya `NEEDS_INPUT` döndür.**

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
pnpm test:e2e        # Playwright (v0.0.19'dan itibaren)
pnpm format:check    # Prettier
pnpm env:check       # ortam değişkeni şeması
pnpm infra:up        # yerel altyapı (Postgres, Redis, Meilisearch, SeaweedFS, Mailpit)
```

Henüz var olmayan komutu çalıştırmaya çalışma — hangi sürümde geldiğini `ROADMAP.md`'den
doğrula. Yoksa `ÖLÇÜMLER` alanına "komut bu sürümde henüz yok" yaz.
