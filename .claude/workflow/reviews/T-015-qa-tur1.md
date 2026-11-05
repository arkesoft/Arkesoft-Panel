# T-015 — QA Gate · Tur 1

Tarih: 2026-11-05 · Sürüm: ROADMAP v0.0.14.1 (`arkesoft_auth` rolü + kolon bazlı yetki
ayrımı, hotfix) · Versiyon etkisi: `minor`

GATE: qa
SONUÇ: PASS

Dal: `main` (ölçüldü: `git branch --show-current` → `main`)

## AJAN: qa · TUR: 1 · SONUÇ: PASS

### KABUL KRİTERİ DOĞRULAMASI

| AC | Durum | Nasıl ölçtüm | Vacuity kanıtı |
| -- | ----- | ------------ | --------------- |
| **AC1** — `arkesoft_auth` üç tabloyu okur, `arkesoft_app` okumaz (2×2 matris) | **GEÇTİ** | (i) `packages/db/src/__tests__/auth-role-privileges.isolation.test.ts` içindeki dört test (`a/b/c/d`) okundu ve `--force` ile koştu. (ii) **Bağımsız olarak** dört hücreyi kendi `docker exec arkesoft-postgres psql` komutlarımla birebir tekrarladım: `arkesoft_app→account` = `permission denied for table account`; `arkesoft_auth→tenant` = `permission denied for table tenant`; `arkesoft_app→tenant` = satır döndü; `arkesoft_auth→account` = satır döndü. | (c)/(d) hücreleri canlı psql ile ayrıca doğrulandı — ne "altyapı her şeyi düşürüyor" ne "auth blanket yetkili" senaryosu mümkün. `count(*)` hiçbir yerde kullanılmadı (T-013 tuzağı yok). |
| **AC2** — Linter iki yönlü (taban: bulgu yok / sapma: bulgu var) | **GEÇTİ** | Fixture testleri (`catalog-lint.test.ts`, 191/191) + canlı α/β/γ/δ testleri (`auth-role-privileges.isolation.test.ts`) okundu ve koştu. **İki tuzak bağımsız mutasyonla sınandı** — aşağıda ayrı bölüm. | Tuzak 1 (kolon `GRANT` sözdizimi sızıntısı) **kapandı** — canlı psql ile reprodüksiyon yapıldı, düzeltilmiş `%1$I` pozisyonel biçim doğru çalışıyor. Tuzak 2 (opsiyonel alan vacuity) **tip seviyesinde kapanmadı** — somut mutasyon probuyla kanıtlandı, bkz. BULGULAR QA-1. |
| **AC3** — `DATABASE_AUTH_URL` koşulsuz fail-fast, `DATABASE_URL`'e düşmek yasak | **GEÇTİ** | c1 (`database-auth-url-fail-fast.test.ts`) okundu/koştu. c2 (`database-auth-url-anti-fallback.test.ts`) okundu/koştu. c3 (`database-auth-url-no-fallback-literal.test.ts`) okundu/koştu. **İki canlı mutasyon** kendim uyguladım (aşağıda). `env:check` iki yönlü canlı doğrulandı. | c2'nin "tek yük taşıyan kanıt" iddiası **kendi mutasyonumla** doğrulandı: `??` fallback'i eklediğimde c1/c2 yeşil kaldı (mimari karar sayesinde yapısal olarak erişilemez dal), ama c3 **anında** kırmızı oldu. Tam geri alma (`env.DATABASE_URL`) mutasyonunda ise c2 kırmızı oldu (`500 to be less than 300`). İkisi birlikte gerçek bir kapatma kanıtı. |
| **AC4** — kademe 4 koşturuldu, katalog başlangıç durumuna döndü | **GEÇTİ** | `rollback-auth-role.isolation.test.ts` okundu: `toEqual`/`arrayContaining`+`length`, `S_healthy ≠ S_rolledback` açık assert'i, `ROLLBACK` sonrası kalıntısızlık — hepsi mevcut. Gerçek script koşumu (ST-G'nin raporu) + benim bağımsız `pnpm db:bootstrap` tekrar koşumum (idempotency doğrulandı, exit 0) + ardından `test:isolation` 64/8 yeşil. | "0 bulgu" tek başına kullanılmamış — `snapshot.tables.length>0`, `columnPrivileges` satır sayısı türetilmiş, en az bir `columnOnly` örneği assert edilmiş. `MISSING_TABLE` platform tablosu genişlemesi fixture ile (`session` silindiğinde MISSING_TABLE üretiyor) doğrulandı. |

### MUTASYON TESTLERİ

| ID | Mutasyon | Hangi test yakalamalı | Yakaladı mı | Not |
| -- | -------- | ---------------------- | ----------- | --- |
| M1 | `apps/api/src/auth/auth.module.ts:87` → `env.DATABASE_AUTH_URL ?? env.DATABASE_URL` | AC3-c3 (mekanik grep) | **EVET** — `database-auth-url-no-fallback-literal.test.ts` anında kırmızı, ihlal satırı birebir raporlandı | c1/c2 bu mutasyonda **yeşil kaldı** — mimari kararın ("koşulsuz zorunlu" → `??`'nin sağ tarafı yapısal olarak erişilemez) doğru öngörüsü. Dosya `cp` ile geri alındı, `git diff` orijinal pending diff'e birebir döndü. |
| M2 | `apps/api/src/auth/auth.module.ts:87` → `env.DATABASE_URL` (ST-F'nin TAM geri alınması) | AC3-c2 (tek yük taşıyan kanıt) | **EVET** — `database-auth-url-anti-fallback.test.ts` kırmızı: `expected 500 to be less than 300`, log'da `account` için `42501` göründü | Dosya geri alındı, `git diff` doğrulandı. |
| M3 | Canlı DB: `GRANT SELECT, INSERT, UPDATE (id) ON public.account TO arkesoft_auth` (parantez yalnızca `UPDATE`'e uygulanan **hatalı** söz dizimi) | Üretim `bootstrap-roles.sql`'in **düzeltilmiş** biçiminin bu hataya düşmediğini doğrulamak | **EVET (reprodüksiyon)** — `has_table_privilege(…,'SELECT')=true`, `has_table_privilege(…,'INSERT')=true` (tablo seviyesine sızma teyit edildi); `BEGIN…ROLLBACK` ile kalıntısız | `bootstrap-roles.sql:316-326`'nın gerçek biçimi (`%1$I` pozisyonel, HER privilege kendi parantezini taşıyor) bu hataya **düşmüyor** — canlı `relacl`'de doğrulandı (`account`/`session`/`verification` → yalnızca `arkesoft_auth=d`, SELECT/INSERT/UPDATE tablo seviyesinde YOK). |
| **M4 (BULGU — SURVIVED)** | `LintCatalogOptions`'tan `authRoleName` alanını **omit** ederek (TypeScript tip hatası YOK) `lintCatalog()`'u bozuk bir senaryoya (α — `arkesoft_auth` tablo seviyesi tam DML) karşı çağırmak | `AUTH_ROLE_TABLE_LEVEL_PRIVILEGE_ON_SECRET_TABLE` kuralı | **HAYIR — mutasyon hiçbir test tarafından yakalanmadı, derleme de geçti** | Geçici prob dosyası (`packages/db/src/__tests__/zz-qa-vacuity-probe.test.ts`) yazıldı, koşuldu (2/2 yeşil — ikinci test "boş findings" bekliyordu ve BOŞ döndü), sonra silindi (`git status` temiz). **Aynı bozuk veri, üç alandan biri eksik olunca görünmez.** Bkz. BULGU QA-1. |

### YENİ TEST DOSYALARI

Bu turda `qa` tarafından **kalıcı** yeni test dosyası eklenmedi — mevcut testler (ST-C/ST-D/ST-E/ST-F/ST-G'nin ürettiği) kabul kriterlerinin tamamını kapsıyor ve mutasyonla doğrulandı (yukarıdaki tablo). Geçici vacuity probu (`zz-qa-vacuity-probe.test.ts`) **koşum sonrası silindi**, commit edilmedi.

### BULGULAR

| ID | SEV | Dosya:satır | Açıklama | Sorumlu ajan |
| -- | --- | ----------- | -------- | ------------ |
| QA-1 | **medium** | `packages/db/src/catalog-lint.ts:172-183` (`LintCatalogOptions.authRoleName?`/`authSecretBearingTables?`/`authRoleTablePrivilegeExpectations?`) | Üç yeni alan **bağımsız opsiyonel** — birlikte/hep ya da hiç zorunluluğu TypeScript tarafından **zorlanmıyor**. Somut mutasyon probuyla (M4) kanıtlandı: `authRoleName` tek başına eksik bırakılınca (derleme hatası YOK) `AUTH_ROLE_TABLE_LEVEL_PRIVILEGE_ON_SECRET_TABLE` dahil **beş yeni kural** aynı bozuk veri karşısında sessiz kalıp `[]` döner. Bugün canlıda **0 gerçekleşme** var — repodaki **tüm 9 `lintCatalog()` çağrı noktası** tek bir `lintOptions()` üreticisi üzerinden geçiyor (mekanik doğrulandı: `grep -rn "lintCatalog("` → 5 dosya, hepsi incelendi) ve hepsi üç alanı birlikte taşıyor. Risk **ileriye dönük**: yeni bir çağrı noktası (örn. gelecekteki bir ST) üç alandan birini unutursa derleme geçer ve güvenlik kuralları o nokta için sessizce devre dışı kalır — T-014'ün `procedure-surface.ts`'te discriminated union ile **kasıtlı olarak engellediği** sınıfın birebir aynısı, burada uygulanmamış. Düzeltme önerisi: üç alanı tek bir zorunlu `authRoleConfig?: { authRoleName, authSecretBearingTables, authRoleTablePrivilegeExpectations }` nesnesine indirgemek (hâlâ opsiyonel olabilir — dondurulmuş eski çağrı noktası için — ama en azından "hep ya da hiç" tip seviyesinde zorlanır) **veya** dondurulmuş çağrı noktasını da güncelleyip üç alanı koşulsuz zorunlu yapmak. | db |
| QA-2 | **low** | `apps/api/src/__tests__/tenant-resolver.test.ts` (ioredis zaman aşımı flake) | Bkz. aşağıdaki FLAKE DEĞERLENDİRMESİ. | backend/devops (teknik borç, bu turda düzeltme talep edilmiyor) |

Toplam: 1 medium, 1 low. (AGENT_BASELINE §4: 1–2 medium → PASS, borca kaydedilir; ancak
bir medium bulgusu kural olarak bir düzeltme turu açar — bu karar Orkestratöre bırakılmıştır,
bkz. not aşağıda.)

**Not (Orkestratöre):** QA-1, AGENT_BASELINE §4'ün *"bir medium düzeltme turu AÇAR
(sayısı kaç olursa olsun)"* kuralına göre teknik olarak bir düzeltme turu tetikler. Ancak
şu bağlamı da kayda geçiriyorum: (a) bugün **sıfır** canlı gerçekleşme var — mekanik
olarak doğrulandı, mutasyon yalnızca *hipotetik gelecekteki* bir çağrı noktası için risk
taşıyor; (b) risk saf `packages/db` test/CI araçlarında yaşıyor, üretim çalışma zamanı
yolunda (`apps/api` vb.) hiçbir tüketici yok; (c) `db`/ST-E bu riski handoff'ta **zaten
kendiliğinden** disclosure etmişti ("hâlâ bir boşluk; borç adayı"). Kararı
Orkestratöre bırakıyorum — bu üç gerekçeyle teknik borca kaydedip bu turu PASS'te
tutmak da savunulabilir bir okuma, ama kural metni "sayısı kaç olursa olsun" diyor.

### FLAKE DEĞERLENDİRMESİ (`tenant-resolver.test.ts`)

- **Koşum sayım:** izole 3× (`npx vitest run src/__tests__/tenant-resolver.test.ts`) → 3/3 yeşil (16/16 test). Tam `apps/api` paketi 2× (`npx vitest run`, 62 dosya) → 2/2 yeşil (488/488). **Toplam 5 bağımsız koşum, 0 başarısızlık** — flake bende hiç reprodüklenmedi.
- **İlişki:** `git diff --stat apps/api/src/__tests__/tenant-resolver.test.ts` → **boş** (bu turda dosyaya dokunulmadı); `git log` dosyayı v0.0.8'e (`d83bb92`) kadar takip ediyor — **T-015'ten önce var, bu task'la nedensel ilişkisi yok.**
- **Sınıflandırma:** ioredis komut zaman aşımı, muhtemelen paylaşılan Redis örneği üzerinde zamanlama/kaynak çekişmesi (worker-başına-dosya izolasyon modeliyle 62 paralel worker'ın aynı Redis'e bağlanması). ST-F ve ST-H2 bağımsız olarak birer kez gözlemiş, ikisinde de bir sonraki ardışık koşumda tekrarlanmamış.
- **SEV: low.** Gerekçe: pre-existing, bu task'ın kapsamı/değişiklikleriyle ilişkisiz, benim 5 bağımsız koşumumda hiç reprodüklenmedi (gözlenen/toplam oran çok düşük). CLAUDE.md §6'nın "flaky test düzeltilir veya kaldırılır" ilkesi geçerliliğini sürdürüyor, ama bu düzeltme T-015'in kapsamına **girmez** — ROADMAP teknik borç tablosuna, `backend`/`devops`'a (ioredis bağlantı havuzu/zaman aşımı ayarlarının gözden geçirilmesi önerisiyle) düşülmesini öneriyorum.
- **Öneri:** Teknik borç olarak kaydet; `test.skip` ile susturulmadı (doğrulandı — grep boş), bu doğru.

### §7 TENANT İZOLASYON KONTROL LİSTESİ

- Yeni tablo/kolon/prosedür/kuyruk işi/dış kaynak **yok** → maddelerin çoğu **N/A** (architect'in gerekçesi bağımsız doğrulandı).
- `TENANT_SCOPED_TABLES` **dört üyede kaldığı** ölçüldü (`tenant_membership`, `job`, `audit_log`, `tenant_invitation` — değişmedi).
- `createTenantIsolationSuite()`'in gerçek çağrı noktası **tek** (`packages/db/src/__tests__/tenant-membership.isolation.test.ts`) — `tenancy.ts`/`catalog-lint.ts`'teki diğer eşleşmeler yalnızca **yorum** metni, kod çağrısı değil (mekanik doğrulandı).
- `packages/db/src/catalog-snapshot.ts`'te taksonomi/rol adı literal sızıntısı **yok** (`grep -nE "'(account|session|verification|app_user|arkesoft_auth)'"` → 0 eşleşme).
- `catalog-lint.ts`'te `appRole` ölü alanı tamamen tüketildi (`grep "appRole"` → yalnızca `appRoleName` kalıntıları, mekanik doğrulandı).
- GUC adı (`app.tenant_id`/`set_config`) hiçbir yeni dosyada literal yazılmadı (`grep` → 0); CI'ın literal-jeton kapısı (`ci.yml:755-781`) bu PR'ın yeni dosyalarını kırmayacak.
- `42501` mesajının yanıt gövdesine/loga ham çıkıp çıkmadığının **derin** güvenlik analizi bu gate'in kapsamı dışında — `security` gate'in özel hedefi (task handoff'u bunu açıkça `security`'ye devrediyor); ben yalnızca ilgili testin var olduğunu ve okunabilir olduğunu doğruladım.

### TABAN SAYILARIN KORUNDUĞU

```
pnpm build --force                                 → 13/13 başarılı
pnpm lint --force                                   → 21/21 başarılı
pnpm typecheck --force                              → 21/21 başarılı
pnpm format:check                                   → exit 0
DATABASE_AUTH_URL=... pnpm test --env-mode=loose --force
    → 18/18 görev · db 191/8 dosya · api 488/62 dosya · TOPLAM 1289/128   (taban BİREBİR korunmuş)
DATABASE_AUTH_URL=... pnpm test:isolation --env-mode=loose --force
    → 10/10 görev · db 46/4 dosya · api 18/4 dosya · TOPLAM 64/8          (taban BİREBİR korunmuş — ST-H2'nin ölçtüğü sayıyla aynı)
env -u DATABASE_AUTH_URL pnpm env:check             → exit 1, mesajda değişken adı VAR (c1 canlı teyit)
DATABASE_AUTH_URL=... pnpm env:check                → exit 0, dördüncü blok görünüyor
pnpm db:seed                                        → exit 0 (arkesoft_app ile hâlâ geçiyor, A2'nin 3. ölçümü teyit)
pnpm db:bootstrap (bağımsız tekrar koşum)           → exit 0 (idempotency bağımsız doğrulandı)
AC12a yerel eşdeğeri (DATABASE_URL ile, AUTH_URL YOK) → dört adım da exit 0 (R-PO2 bağımsız doğrulandı)
```

### KOŞTURULAN KOMUTLAR

| Komut | Exit | Özet |
| ----- | ---- | ---- |
| `git branch --show-current` | 0 | `main` |
| `git status --porcelain` (başta ve sonda) | 0 | Beklenen 17 değişmiş + 8 yeni dosya; QA sonunda **birebir aynı** (geçici dosyalar temizlendi) |
| `docker ps --filter` | 0 | `arkesoft-postgres` (5432) doğru konteyner olarak teyit edildi (yanlış `cnc_proje-postgres-1`/55432 tuzağına düşülmedi) |
| `pnpm build --force` | 0 | 13/13 |
| `pnpm lint --force` | 0 | 21/21 |
| `pnpm typecheck --force` | 0 | 21/21 |
| `DATABASE_AUTH_URL=... pnpm test --env-mode=loose --force` | 0 | 18/18 görev, 1289/128 test |
| `DATABASE_AUTH_URL=... pnpm test:isolation --env-mode=loose --force` (iki kez, bootstrap tekrarından önce/sonra) | 0 / 0 | 64/8 her ikisinde |
| `pnpm format:check` | 0 | Tüm dosyalar Prettier uyumlu |
| `env -u DATABASE_AUTH_URL pnpm env:check` | **1** | Beklenen fail-fast |
| `DATABASE_AUTH_URL=... pnpm env:check` | 0 | Dördüncü blok yeşil |
| `docker exec arkesoft-postgres psql …` (AC1 4 hücre, relacl, has_*_privilege, GRANT sözdizimi reprodüksiyonu — hepsi `BEGIN…ROLLBACK` içinde) | 0 | Tüm canlı ölçümler yukarıdaki tabloda |
| `npx vitest run src/__tests__/database-auth-url-*.test.ts` (M1/M2 mutasyonlarıyla, sonra orijinaline geri alınarak) | değişken | M1: c3 kırmızı/c1-c2 yeşil · M2: c2 kırmızı |
| `npx vitest run src/__tests__/tenant-resolver.test.ts` ×3 | 0×3 | 16/16 her koşumda |
| `npx vitest run` (apps/api tam paket) ×2 | 0×2 | 488/488 her koşumda |
| `pnpm db:seed` | 0 | Demo tenant/kullanıcı oluşturuldu |
| `pnpm db:bootstrap` | 0 | İdempotent, bağımsız tekrar koşum |
| AC12a yerel eşdeğeri (4 adım) | 0 | `vitest list` × 2, `prisma validate`, `.env` olmadan node |
| Geçici `zz-qa-vacuity-probe.test.ts` yazıldı → koşturuldu → silindi | 0 (koşumda) | M4 bulgusunun kanıtı; dosya commit edilmedi |

**Koşulmayan komutlar (gerekçeli):**
- `pnpm test:e2e` / `pnpm test:visual` — kök `package.json`'da bu script'ler **yok** (bu sürümde henüz yok, handoff'ta da açıkça işaretli).
- `pnpm db:rollback-roles` (kademe 3) — handoff'un açık yasağı (geliştirme veritabanını kill-switch'e sokar).
- `pnpm db:rollback-auth-role` (kademe 4) — ST-G bunu zaten gerçekten koşturup raporladı (ham çıktı + idempotency + A1-c teyidi); ben tekrar koşturup riske atmak yerine **sonucun kalıcılığını** (`test:isolation` 64/8, canlı AC1 matrisi) bağımsız doğruladım. Sonuç aynı yöne işaret ediyor.

### DOĞRULANAMADI

- `42501` mesajının yanıt gövdesine veya `root-logger.ts`/`errors/redaction.ts` üzerinden loga **ham** çıkıp çıkmadığının derinlemesine analizi — bu, task handoff'unun `security` gate'ine açıkça devrettiği hedef; ben yalnızca ilgili testin varlığını/okunabilirliğini doğruladım, güvenlik analizini tekrarlamadım.
- CI'daki gerçek iki-geçişli `prepare-db` akışının **sıfırdan** (fresh DB, `migrate reset` ile) davranışı — bu komut onay jetonu gerektirdiği için koşturulmadı; ST-H2'nin "zaten converge olmuş veritabanında idempotency" ölçümüyle aynı sınırlamayı paylaşıyorum.
- `tenant-resolver.test.ts` flake'inin **kök nedeni** (ioredis bağlantı havuzu mu, worker spawn zamanlaması mı) — 5 koşumda reprodüklenemediği için teşhis edilemedi, yalnızca sınıflandırma yapıldı.
