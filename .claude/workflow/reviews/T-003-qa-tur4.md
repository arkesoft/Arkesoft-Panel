# T-003 — qa gate — tur 4 (dar doğrulama: FIX 3'ün bozmadığını kanıtlama)

Tarih: 2026-10-27
ROADMAP sürümü: v0.0.12
Dal: chore/ajan-altyapisi (commit edilmemiş)
Kapsam: Bu çağrı yeni bir denetim DEĞİL — üç gate'in tur 3'te PASS verdiği
duruma karşı FIX 3'ün (gönüllü cila turu) bir şey bozmadığının dar
doğrulaması. Yüzey: `ci.yml`'in dört bölümü (AC13 guards adımı, plan.decide,
sahte yeşil dedektörü, run-bloğu-içi-ifade taraması) + iki `.txt` dosyanın
başlıkları + `run-gates/action.yml:11` + `scripts/{tsconfig.json,
sync-platform-version.ts}`. Tur 3'te zaten doğrulanan AC5/AC6/AC8/AC10/
AC12b/AC12c/AC4 bu turda TEKRAR EDİLMEDİ (talimat gereği). Gerçek CI koşumu,
`git push`, `gh pr create`, `gh workflow run`, `pnpm release:version`, yıkıcı
veritabanı komutu bu turda da **çalıştırılmadı**.

GATE: qa
SONUÇ: PASS (FIX 3, dar yüzeyde hiçbir regresyon doğurmadı; tur 3'ün
`medium` bulgusu — AC13'ün tek-yönlü senkron koruması — altı senaryonun
hepsinde doğrulanan şekilde KAPANDI; yeni bulgu yok; dokuz `BEKLEMEDE —
ST-9 kanıtı` madde bu turda da PASS/FAIL işaretlenmedi)

---

## 1. AC13 — tur 3 `medium` bulgusunun kapanışı (en önemli madde)

Gerçek `guards` adımının mantığı (`.github/workflows/ci.yml:338-469`) BİREBİR
kopyalanıp scratch'teki parametrize edilebilir bir script'e taşındı
(`run-ac13.sh`), gerçek `.github/{workflows,actions}` + iki `.txt` dosya
scratch'e kopyalandı; her senaryo için ayrı bir scratch kopyası üzerinde
çalıştırıldı. **Gerçek repo dosyalarına hiç dokunulmadı.**

| Senaryo | Açıklama                                                           | Beklenen                        | Gerçek sonuç                                              |
| ------- | ------------------------------------------------------------------ | ------------------------------- | --------------------------------------------------------- |
| (a)     | Kalıcı jeton (`pull_request_target`) **yalnızca ana listeden** sil | exit 1                          | **exit 1** ✅ — `diff -u` farkı doğru üretti              |
| (b)     | Kalıcı jeton **yalnızca referanstan** sil                          | **exit 1** (tur 3'te exit 0'dı) | **exit 1** ✅ — tur 3'teki asimetri KAPANDI               |
| (c)     | Ana listeye yeni kalıcı jeton ekle, referansa **ekleme**           | **exit 1** (tur 3'te exit 0'dı) | **exit 1** ✅ — tur 3'teki asimetri KAPANDI               |
| (d)     | **İki dosyadan da birlikte** sil (aynı PR)                         | exit 0 — bilinçli sınır, borçta | **exit 0** ✅ — belgelenen bilinçli sınırla tam örtüşüyor |
| (e)     | `# >>> PERMANENT` işaretçisini sil                                 | **exit 1** (fail-closed)        | **exit 1** ✅ — `MISSING_BEGIN` ile yakalandı             |
| (f)     | Hiçbir şey değiştirme                                              | exit 0                          | **exit 0** ✅                                             |

**Sonuç: altı senaryonun ALTISI da beklenen davranışı gösterdi.** Tur 3'ün
tek bulgusu (AC13'ün tek-yönlü senkron koruması, (b) ve (c) senaryolarında
yakalanamıyordu) **artık kapalı** — `diff -u` tabanlı çift yönlü karşılaştırma
gerçekten çift yönlü çalışıyor.

**Başlık yorumları doğrulandı (iddia ≠ gerçek sorusu):**
`.github/ci-forbidden-tokens.txt` satır 77-97 ve
`.github/ci-forbidden-tokens-permanent.txt` satır 1-27 okundu. Her ikisi de
şimdi şunu açıkça ve doğru şekilde söylüyor: "BUGÜN GARANTİ EDİLEN" (çift
yönlü `diff -u`; sadece-sil, sadece-ekle, sıra değişikliği, işaretçi silme —
hepsi yakalanır) ve "BUGÜN GARANTİ EDİLMEYEN (bilinçli borç)" (aynı PR'da
İKİ dosyadan BİRLİKTE silme — CODEOWNERS gerektirir). Bu metin, tur 3'te
tespit edilen fazla-iddialı önceki metnin ("KALICI bölümden satır silmek
mekanik olarak engelleniyor" — ki bu YANLIŞTI) **tam yerine** geçmiş ve
senaryo (d)'nin gerçek davranışıyla (exit 0) birebir örtüşüyor. **Yeni bulgu
yok.**

**R-6 doğrulandı:** `find .github/workflows .github/actions -type f \(
-name '*.yml' -o -name '*.yaml' \)` gerçek repo üzerinde çalıştırıldı —
çıktıda beş dosya var (`ci.yml`, `release.yml`, üç `action.yml`), **iki
`.txt` dosyadan hiçbiri yok.** Tarama hedefi ikisini de doğal olarak
dışlıyor.

## 2. AC1/AC2 mekanizması — `jq -re` düzeltmesi (C5)

Gerçek kabukta ölçüldü:

| Komut                                                                   | Gerçek çıkış kodu |
| ----------------------------------------------------------------------- | ----------------- |
| `echo '{"packages":[]}' \| jq -re '.packages[]'` (ESKİ, kusurlu)        | **4**             |
| `echo '{"packages":[]}' \| jq -e '.packages' >/dev/null` (YENİ, varlık) | **0**             |
| `echo '{"packages":[]}' \| jq -r '.packages[]'` (YENİ, `-e` yok)        | **0**             |
| `echo '{"packages":null}' \| jq -e '.packages'` (gerçek şema hatası)    | **1**             |
| `echo '{}' \| jq -e '.packages'` (alan hiç yok)                         | **1**             |

Ayrıca `plan.decide`'ın `schema_ok`/`shared_names` mantığı (ci.yml:122-190)
BİREBİR kopyalanıp üç sentetik JSON ile çalıştırıldı:

- Boş `packages`/`tasks`: `schema_ok=true, names='', shared_names=''` →
  **fail-open TETİKLENMEZ**, `shared=false` (doğrulandı — kod okuması +
  simülasyon birebir örtüşüyor).
- Dolu `packages`, kesişmeyen `tasks`: `schema_ok=true` kalıyor, `shared_names`
  boş kalıyor — kesişim mantığı (M2-2 ayrımı) korunuyor.
- Gerçek şema hatası (`.packages` hiç yok): `schema_ok=false` — fail-open
  **hâlâ** tetikleniyor.

**Sonuç: C5 düzeltmesi doğrulandı, M2-2 ayrımı (hata ≠ geçerli-boş) bozulmadı.**

## 3. Teşhis edilebilirlik (B)

`ci.yml:197-250` okundu: dört `/tmp/plan-*.log` dosyası artık `fail_open=true`
dallarında (`root_rule_unresolved`/`dry_ok=false`/`schema_ok=false`)
`$GITHUB_STEP_SUMMARY`'ye gerçekten `cat` ediliyor (satır 223-249); metin
artık "ayrıntı aşağıda" diyor, "job loglarında" **demiyor** (tur 3'ün bulduğu
yanlış yönlendirme düzeltildi). "Sahte yeşil dedektörü" adımında
(`ci.yml:614-644`) `2>/dev/null` **kalmadı** — `turbo_test_dry_log` değişkeni
`mktemp` ile oluşturuluyor, hata dalında `cat` ediliyor.

**Kanıt (simülasyon):** özet-üretme bloğu birebir kopyalanıp sahte log
içeriği (`"KASITLI BOZULAN turbo HATASI..."`) ile çalıştırıldı — çıktıda bu
metin **gerçekten** göründü (bkz. aşağıdaki komut tablosu). Teşhis
edilebilirlik iddiası doğrulandı, beyan değil.

## 4. `actionlint` ve yeni ifade tuzağı

- `actionlint .github/workflows/*.yml` (homebrew 1.7.12) → **exit 0, 0
  bulgu.**
- `guards`'ın run-içi-`${{ }}` taraması (`ci.yml:489-563`'teki awk mantığı)
  BİREBİR kopyalanıp gerçek beş hedef dosyaya karşı çalıştırıldı →
  `violation=false` — **temiz.**
- Dosyada kalan tüm `${{ }}` kullanımları (`grep -n '\${{' ...`) tek tek
  listelendi: `ci.yml:60` ve `ci.yml:890`'daki literal `${{ }}` metinleri
  (actionlint'i kıran önceki hatanın kaynağı) **`env:` bloğunun içindeki bir
  YAML YORUMU satırında**, `run:` bloğunun dışında — satır numaraları ve
  girinti doğrudan okunarak doğrulandı. devops'un "zararsız, `env:`
  bloğunda" iddiası **doğru.** `run-gates/action.yml`'deki tüm `${{ }}`
  kullanımları `env:`/`if:` içinde; `setup-workspace/action.yml`'deki
  kullanımlar `with:`/`env:`/`if:`/yorum içinde — hiçbiri `run:` bloğunun
  gövdesinde değil.

## 5. Küçük kalemler

- `run-gates/action.yml:11` → açıklama metni `./packages/**` örneğini
  içeriyor; gerçek çağrı yeri `ci.yml:869` → `filter: './packages/**'` —
  **eşleşiyor.**
- `scripts/tsconfig.json`: `"types": ["node"]` **yok** — kod okumasıyla
  doğrulandı, `@arkesoft/config/tsconfig/node.json`'ın zaten tanımladığı
  belirtiliyor. `pnpm exec tsc -p scripts/tsconfig.json` → **exit 0.**
- `scripts/sync-platform-version.ts:39` — sentinel yorumu artık "satır
  numarasına değil, içeriğe atıf" diyor ve pratikte dizenin kendisini
  arıyor (`CHANGELOG_SENTINEL` birebir metin eşleşmesi) — satır numarası
  atfı kalmamış.
- `ci.yml`'deki iki `find` çağrısı: `447` satırındaki AC13 taraması hedef
  kümeyi `/tmp/ac-workflow-action-targets.txt`'e yazıyor (satır 455); run-
  bloğu-içi-ifade taraması adımı (satır 516) bunu dosyadan OKUYOR, tekrar
  `find` ÇALIŞTIRMIYOR — tanım gereği **aynı sonuç** (tek hesaplama, iki
  tüketici).

## 6. Regresyon kapısı

| Komut                                           | Sonuç                                                             | Exit |
| ----------------------------------------------- | ----------------------------------------------------------------- | ---- |
| `pnpm lint`                                     | 15/15 successful (FULL TURBO)                                     | 0    |
| `pnpm typecheck`                                | 15/15 successful (FULL TURBO)                                     | 0    |
| `pnpm build`                                    | 12/12 successful (FULL TURBO)                                     | 0    |
| `pnpm format:check`                             | "All matched files use Prettier code style!"                      | 0    |
| `pnpm test`                                     | errors 35 + db 65 + api 112 = **212 passed, 0 failed, 0 skipped** | 0    |
| `node scripts/sync-platform-version.ts --check` | UYARI (bilinen fixed-grup drift, tur 1-3 ile aynı) + doğrulandı   | 0    |
| `pnpm exec tsc -p scripts/tsconfig.json`        | temiz                                                             | 0    |
| `actionlint .github/workflows/*.yml`            | 0 bulgu                                                           | 0    |

Tur 1/2/3 ile **birebir aynı sayılar** — regresyon yok. `pnpm test:isolation`
ve `pnpm test:e2e` bu sürümde henüz yok (`package.json`'da script yok,
doğrulandı) — "komut bu sürümde henüz yok".

`ci.yml` `concurrency.cancel-in-progress: true` (satır 25) ve `release.yml`
`concurrency.cancel-in-progress: false` (satır 33) — ikisi de yerinde,
gerekçe yorumları tutarlı.

---

## BULGULAR

yok

## RİSKLER / NOTLAR (gate FAIL kuralına dahil değil, bulgu değil)

1. AC13 senaryo (d)'nin belgelenen bilinçli sınırı (aynı PR'da iki dosyadan
   birlikte silme) hâlâ mekanik olarak kapatılmadı — kapatmanın yolu
   CODEOWNERS/branch protection, bu Orkestratör/kullanıcı kararı gerektiren
   bilinçli borç olarak işaretli kalıyor (tur 3'ten taşındı, bu turda
   senaryo (d) ile ampirik olarak yeniden doğrulandı, değişmedi).
2. `actionlint` için bu turda da önceden SHA256 doğrulanmış izole bir ikili
   indirilmedi; homebrew 1.7.12 kullanıldı (tur 3 ile aynı not).

## Hâlâ BEKLEMEDE olan dokuz madde (bu turda da PASS/FAIL işaretlenmedi)

| AC                                 | Durum                                       |
| ---------------------------------- | ------------------------------------------- |
| AC1                                | BEKLEMEDE — ST-9 kanıtı (gerçek PR gerekli) |
| AC2                                | BEKLEMEDE — ST-9 kanıtı (gerçek PR gerekli) |
| AC3 (CI ayağı)                     | BEKLEMEDE — ST-9 kanıtı                     |
| AC4 (CI ayağı)                     | BEKLEMEDE — ST-9 kanıtı                     |
| AC5 (CI ayağı)                     | BEKLEMEDE — ST-9 kanıtı                     |
| AC7 (iki koşum kanıtı)             | BEKLEMEDE — ST-9 kanıtı                     |
| AC9 (success+failure gerçek koşum) | BEKLEMEDE — ST-9 kanıtı                     |
| AC10 (uyarı ayağı)                 | BEKLEMEDE — ST-9 kanıtı                     |
| AC12d (CI exit 0 kanıtı)           | BEKLEMEDE — ST-9 kanıtı                     |

Push ve örnek PR (ST-9) henüz yapılmadı; bu dokuzu bu turda da **PASS/FAIL
olarak işaretlemedim** — talimat gereği.

---

## ÖLÇÜMLER

- **KABUL KRİTERİ EŞLEMESİ (bu tur, dar kapsam):**
  | Kriter/mekanizma                                                        | Test/kanıt                                                                         | Sonuç       |
  | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------- |
  | AC13 — tur 3 `medium`'un kapanışı (çift yönlü senkron)                  | 6 senaryo (a-f), scratch, gerçek `guards` mantığının birebir kopyası               | GEÇTİ (6/6) |
  | AC13 — iki `.txt` başlık yorumlarının doğruluğu                         | dosya okuma + senaryo (d) ile çapraz doğrulama                                     | GEÇTİ       |
  | AC13 — R-6 (tarama hedefi iki `.txt`'yi de dışlıyor)                    | gerçek `find`                                                                      | GEÇTİ       |
  | AC1/AC2 — `jq -re` → `jq -e`+`jq -r` düzeltmesi                         | 5 gerçek `jq` ölçümü + plan.decide mantığının 3 senaryolu simülasyonu              | GEÇTİ       |
  | Teşhis edilebilirlik — 4 log dosyası `GITHUB_STEP_SUMMARY`'ye `cat`     | kod okuma + özet-bloğunun birebir simülasyonu (sahte hata metni gerçekten göründü) | GEÇTİ       |
  | Teşhis edilebilirlik — "Sahte yeşil dedektörü" `2>/dev/null` kaldırıldı | kod okuma                                                                          | GEÇTİ       |
  | `actionlint` 0 bulgu                                                    | gerçek `actionlint`                                                                | GEÇTİ       |
  | `run:`-içi-`${{ }}` taraması temiz                                      | awk mantığının birebir kopyası, gerçek 5 hedef dosyaya karşı                       | GEÇTİ       |
  | Kalan `${{ }}` kullanımları `run:` dışında (env/with/if)                | `grep` + satır/girinti okuması                                                     | GEÇTİ       |
  | `run-gates/action.yml:11` ↔ gerçek çağrı yeri eşleşmesi                 | `grep`                                                                             | GEÇTİ       |
  | `scripts/tsconfig.json`'dan `types` silindi + `tsc -p` exit 0           | dosya okuma + gerçek komut                                                         | GEÇTİ       |
  | `sync-platform-version.ts` satır→içerik atıf değişikliği                | dosya okuma                                                                        | GEÇTİ       |
  | İki `find` çağrısı tekilleştirildi, aynı sonuç                          | kod okuma (tek hesaplama, iki tüketici — tanım gereği aynı)                        | GEÇTİ       |
  | Regresyon (lint/typecheck/build/test/format/sync)                       | gerçek komutlar                                                                    | GEÇTİ       |
- **TEST SAYILARI:** `pnpm test` → **212 passed / 0 failed / 0 skipped**
  (errors 35 + db 65 + api 112) — tur 1/2/3 ile birebir aynı, bu turda bir
  kez koşturuldu (tekrar koşulmadı, talimat gereği tek koşum + tur
  karşılaştırması flaky kontrolü sayıldı — sayılar tur 1-3 ile birebir
  örtüşüyor, flaky belirtisi yok).
- **Hâlâ BEKLEMEDE (9 madde):** yukarıdaki tablo — değişmedi.
- **KOŞTURULAN KOMUTLAR (gerçek, bu turda, toplam 14 gerçek komut + 1
  gerçek `find`/`grep` kümesi + scratch simülasyonlar):**
  | Komut                                                                              | Exit        | Özet                                                                             |
  | ---------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------- |
  | `pnpm lint`                                                                        | 0           | 15/15 (FULL TURBO)                                                               |
  | `pnpm typecheck`                                                                   | 0           | 15/15 (FULL TURBO)                                                               |
  | `pnpm build`                                                                       | 0           | 12/12 (FULL TURBO)                                                               |
  | `pnpm format:check`                                                                | 0           | Prettier temiz                                                                   |
  | `pnpm test`                                                                        | 0           | 212 passed, 0 failed, 0 skipped                                                  |
  | `node scripts/sync-platform-version.ts --check`                                    | 0           | UYARI (bilinen drift) + doğrulandı                                               |
  | `pnpm exec tsc -p scripts/tsconfig.json`                                           | 0           | temiz                                                                            |
  | `actionlint .github/workflows/*.yml` (homebrew 1.7.12)                             | 0           | 0 bulgu                                                                          |
  | `find .github/workflows .github/actions -name '*.yml' -o -name '*.yaml'`           | —           | 5 dosya, iki `.txt` hariç (R-6)                                                  |
  | `grep -n '\${{' .github/workflows/*.yml .github/actions/*/action.yml`              | —           | tüm kullanımlar listelendi, `run:` dışı olduğu doğrulandı                        |
  | `grep -n -A1 'concurrency\|cancel-in-progress' ci.yml release.yml`                 | —           | `ci.yml`→true, `release.yml`→false                                               |
  | `pnpm run` (script listesi)                                                        | —           | `test:isolation`/`test:e2e` bu sürümde yok                                       |
  | 5× gerçek `jq` ölçümü (eski `-re` vs yeni `-e`/`-r` ikilisi, 2 gerçek şema hatası) | 4/0/0/1/1   | C5 düzeltmesi doğrulandı                                                         |
  | scratch: `plan.decide` şema mantığının 3 senaryolu simülasyonu                     | —           | boş-dizi→fail-open YOK, gerçek hata→fail-open VAR                                |
  | scratch: AC13 gerçek `guards` mantığının 6 senaryosu (a-f)                         | 1/1/1/0/1/0 | tur 3 bulgusu kapandı (b,c artık yakalıyor), (d) bilinçli sınır doğrulandı       |
  | scratch: teşhis edilebilirlik özet-bloğu simülasyonu                               | —           | sahte hata metni gerçekten göründü                                               |
  | `git status --porcelain` (başta ve sonda)                                          | —           | **özdeş** (`diff` exit 0) — hiçbir scratch testi gerçek repo dosyasına dokunmadı |
- **Flaky kontrolü:** `pnpm test` bir kez koşturuldu (talimat gereği); sonuç
  tur 1/2/3 ile birebir eşleşti (212/0/0) → flaky belirtisi yok.
- **Kasıtlı bozma testleri (bu tur, toplam 9):** AC13 (a) ana listeden sil,
  (b) referanstan sil, (c) referansa eklemeden ana listeye ekle, (d) ikisinden
  birlikte sil, (e) işaretçi sil — beşi de scratch kopyalarda; artı
  teşhis-edilebilirlik simülasyonunda enjekte edilmiş sahte hata metni
  (toplam 6. "bozma"); artı `jq` boş-dizi/gerçek-hata ayrımı için 2 sentetik
  JSON senaryosu (toplam 8); artı `plan.decide` mantığının 3. senaryosu
  (gerçek şema hatası) — hepsi **gerçek repo dosyalarına dokunmadan**
  scratch'te yapıldı; `git status` başta/sonda özdeş (kanıtlandı).
