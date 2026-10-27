# ADR-0006 — CI/CD Mimarisi ve Changesets Sürüm Akışı

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-27
- **Karar verenler:** Architect, PM, DevOps, Orkestratör
- **İlgili versiyon:** `v0.0.12`
- **Supersedes:** —
- **Superseded by:** —

---

## Bağlam

Arkesoft v0.0.1–v0.0.11 monorepo iskeletini, altyapıyı ve çekirdeği inşa etti. v0.0.12, platformun ilk otomatik doğrulama ve sürüm mekanizmasını kurar.

Karşılaşılan tasarım sorunları:

1. **Monorepo yapısı:** 15 paket/uygulama. Dört uygulama (`api`, `admin`, `superadmin`, `storefront`) bağımsız olarak dağıtılacak; her değişiklik kendi test kapısından geçmeli. Geleneksel tek iş akışı + path filtresi seçeneği, **job seviyesinde raporlanmama** riski doğurur (GitHub check) → branch koruması eksik kalır.

2. **Sürüm altyapısı:** 11 özel paket + kök `package.json`. Changesets **private paketleri sürümlendirmediği için** (varsayılan) ve kök workspace üyesi olmadığı için, platform sürümü elle yönetim gerektirir.

3. **Paket sürümü vs. kilometre taşı ayrışması:** ROADMAP v0.0.1–v0.0.4 sırası takip etti, birebir çakıştı. v0.0.12 **sırası dışında** yapılıyor (başka versiyonlara bağımlılığı yalnızca v0.0.1) → bu tasarım bundan sonra **sırası dışında yapılabilir** varsayımını merkezileştirmelidir.

4. **Sürüm özeti:** Changeset'in Türkçe özet disiplini, ROADMAP kilometre taşı ve sürüm notları arasındaki ilişki.

---

## Karar

Bu sürüm aşağıdaki yedi tasarım kararını yapar:

### 1. **İş Akışı Mimarisi: Tek Dosya, Path Filtreli Dört Bağımsız Hat + Beşinci Hat**

**Karar:** GitHub Actions tek `ci.yml` dosyasında beş bağımsız job'u çalıştırır:

| Hat          | Tetikleyici                                          | İçerik                                                  | Servis |
| ------------ | ---------------------------------------------------- | ------------------------------------------------------- | ------ |
| `api`        | `apps/api/**`, paylaşılan paketler, kök dosya        | lint, typecheck, test (212 test, Postgres+Redis), build | ✓      |
| `admin`      | `apps/admin/**`, paylaşılan paketler, kök dosya      | lint, typecheck, build                                  | —      |
| `superadmin` | `apps/superadmin/**`, paylaşılan paketler, kök dosya | lint, typecheck, build                                  | —      |
| `storefront` | `apps/storefront/**`, paylaşılan paketler, kök dosya | lint, typecheck, build                                  | —      |
| `shared`     | `packages/*`, kök dosya                              | lint, typecheck, build (test yok)                       | —      |

**Tetikleme mekanizması:**

- GitHub `pull_request` tetikleyicisine `paths:` filtresi **konmaz** (filter eşleşmezse iş akışı hiç koşmaz → check raporlanmaz → branch koruması "pending" kalır).
- Bunun yerine **`plan` job'u** `fetch-depth: 0` ile base commit'i çözer, `turbo run build --affected --dry=json` çalıştırır ve yol→hat eşlemesi üretir.
- Her hat **kendi başına** kırmızı/yeşil olur — birinin kırmızısı diğerini bloklamaz.

**Paylaşılan paketler ayrımı:**

- `turbo --affected` bağımlılık grafiğini kullanır: değişen paket **ve dependent'ları** affected kümesine girer.
- `packages/db` değişirse `api` hattı etkilenir (`api` bağımlı) — mekanik.
- `packages/ui` değişirse yalnızca `shared` hattı koşar (`ui` herhangi uygulama hattının direct dependent'ı değil) — doğru.

**Beşinci hat `shared` neden vardır:**

Dört uygulama hattının dependent'ları 11 paketin yalnızca 5'ini kapsar (`errors`, `db`, `config`, `trpc`, `integrations`). Diğer altı paket (`ui`, `theme-sdk`, `versioning`, `i18n`) hiçbir hatta görünmediğinden, o paketlerdeki değişiklik CI'da lint/typecheck görmez. `shared` hattı bu boşluğu kapatır.

**Reddedilen alternatifler:**

| Alternatif                                                        | Neden seçilmedi                                                                                                                                                      |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub `paths:` iş akışı filtresinde                              | Filtre eşleşmezse iş akışı koşmaz, check raporlanmaz, branch koruması eksik kalır. İş akışı seviyesinde filtre (değil job seviyesinde) mekanizsel kusur doğurur.     |
| `dorny/paths-filter` üçüncü taraf action'ı                        | Elle yol listesi bağımlılık grafiğinden sapması riski. Turbo'dan grafiği okuması daha doğru. Architect reddi (K-B2).                                                 |
| Dört hat için iş akışı dosyası (`ci-api.yml`, `ci-admin.yml` vb.) | Polyrepo gibi davranır; paylaşılan adımları (setup, format:check, env:check) hatta bağlı kılar (tekrar, ölçeklenme sorunu). Tek dosya ortak adımları merkezleştirir. |
| Job seviyesinde `if:` koşul (`matrix` ile)                        | `services:` bloğu YAML'da koşullandırılamaz — api hattı Postgres/Redis ister, diğerleri istemez. Koşulsuz job bölüşümü (composite action'lar) yapı.                  |
| `linked` Changesets grubu                                         | `linked` yalnızca yükselen paketleri eşitler, geride kalanlar sapma halinde → 0.0.1 sapması kalıcılaşır. `fixed` tüm üyeleri grubun en yükseğinden ilerletir.        |

### 2. **Changesets: `fixed` Grubu + Private Paketler + `scripts/sync-platform-version.ts`**

**Karar:** Changesets yapılandırması:

```json
{
  "privatePackages": { "version": true, "tag": false },
  "fixed": [["@arkesoft/api", "@arkesoft/db", ... (9 paket)]],
  "changelog": "@changesets/cli/changelog",
  "commit": false
}
```

**Grup üyeleri (9):**

1. `@arkesoft/api`, `@arkesoft/db`, `@arkesoft/errors`
2. `@arkesoft/config`, `@arkesoft/ui`, `@arkesoft/integrations`
3. `@arkesoft/admin`, `@arkesoft/superadmin`, `@arkesoft/storefront`

**Bağımsız (grup dışı):**

- `@arkesoft/theme-sdk` (tema sözleşmesi, tema geliştiriciler tüketir)
- `@arkesoft/trpc` (public API sözleşmesi, SDK ve üçüncü taraflar tüketir)

**Kök sürümü (`@arkesoft`):**

Workspace üyesi değil, komut satırı `pnpm release:version`:

```bash
node scripts/sync-platform-version.ts --collect  # .changeset/*.md → .changeset/.platform-notes.json
changeset version                                 # sürüm yükselt, changeset'leri sil
node scripts/sync-platform-version.ts --apply    # .platform-notes.json → kök package.json + CHANGELOG.md
```

**Gerekçe:**

1. 11 paket yalnızca `version: true` ile Changesets sürüm `--check`'i geçer.
2. `tag: false` + `changeset publish` asla çağrılmaz → registry yayını yapısal kapalı.
3. Kök workspace üyesi yapmak `--filter` ve turbo grafiklerini kirletir; çalışmayan varsayılan.
4. `fixed` grubu tamamı v0.0.5'e hizalanır; sapma (`api/db/errors` 0.0.4, diğer 0.0.1 olan hali) CI **kontrolsüz** kalır.

**Reddedilen alternatifler:**

| Alternatif                              | Neden seçilmedi                                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `linked` grubu                          | Sapma kalıcılaşır; "elle düzeltme yok" ilkesi ihlal edilir.                                     |
| Kök'ü workspace üyesi yapmak            | pnpm + turbo tasarımına aykırı; bağımlılık hedefi olur ve filter'i kirletir.                    |
| `changeset publish` ile registry yayını | Kullanıcı Kararı #1: hiçbir paket publish edilmez. Private paketler değil, **bilinçli tercih**. |

### 3. **Toplayıcı Check: `ci-gate`**

**Karar:** Tüm hatların sonucunu `ci-gate` adlı tek bir job toplayıcısı raporlar:

```yaml
ci-gate:
  if: always()
  needs: [plan, repo, guards, api, admin, superadmin, storefront, shared]
```

**Değerlendirme:** `toJSON(needs)` jq ile gezilir. Her job'un `result` alanı `success` veya `skipped` ise toplayıcı başarılı (çıkış 0). Diğer her değer (`failure`, `cancelled` vb.) kırmızıya döndürür.

**Avantajlar:**

1. **Asimetrik hata:** Plan çökerse hatlar `skipped` olur, ama plan `needs`'te olduğu için toplayıcı kırmızı kalır (sahte yeşil yolu kapalı).
2. **Atlanan hatlar çıkarılmaz:** `services:` sebeple koşamayan `api` hattı `skipped` olabilir (v0.18.0 öncesi), toplayıcı yeşil bırakır — doğru.
3. **Yapılandırma hataları kırmızı:** Job adı yanlış yazılırsa toplayıcı tanımlanamaz ve iş akışı hata verir.

**Reddedilen alternatifler:**

| Alternatif                                                 | Neden seçilmedi                                                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `contains(needs.*.result, 'failure')` koşul                | `cancelled`, `timed_out`, ileride yeni bir sonuç değeri → hepsi yeşile kaçar. `success` ve `skipped` dışı her şey çıkart daha kesin. |
| Her hattı independent branch korumasında `required` yapmak | Atlanan hat raporlanmadığından "required check pending" kalır, PR merge edilemez. Toplayıcı tek required check o yüzden zorunlu.     |
| Path filtre iş akışı seviyesinde                           | Branch koruması yapılamaz.                                                                                                           |

### 4. **Servis Bağımlı Test Koşumu: `api` Hattında Postgres + Redis**

**Karar:** `api` hattında `services:` başlığı altında iki container açılır. İş container'da koşmaz (host runner'da).

**Yapılandırma:**

- `postgres:17.11-alpine` — seed'lenmiş demo tenant ile
- `redis:8.10-alpine` — boş
- Job container'ında koşma yasağı → mekanik grep (`ci.yml`'de `container:` araması) + guard policy allowlist (`localhost|127.0.0.1|::1`)

**Servis yapılandırması** `.env.example` ve `infra/docker-compose.yml` ile birebir (V3 varsayımı):

```
DATABASE_URL=postgresql://arkesoft:arkesoft_dev_only@localhost:5432/arkesoft
REDIS_URL=redis://localhost:6379
```

**Kapalı kalabilir:** `test` çalışmazsa o hattın tamamı `skipped` → toplayıcı yeşil bırakır (doğru davranış).

**Reddedilen alternatifler:**

| Alternatif                                       | Neden seçilmedi                                                                                                                                                            |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Servis **container içinde** (job container'ında) | `postgres` host adı allowlist'ten çıkarıldı (guard policy A-V18). Container'da `postgres` service name ile bağlan → guard redder. Açık mekanizma gerekliydi; kapalı olmaz. |
| Externe Postgres (cloud)                         | CI hızı ve izolasyon. Her koşu yeni snapshot. Geliştirici makinesi kurulumuyla uyum.                                                                                       |

### 5. **Sürüm Özeti: Türkçe, ROADMAP Kilometre Taşı Etiketli**

**Karar:** Changeset'in `---` bloğu altındaki özet:

```
Sipariş iptal akışı eklendi. Kısmi iade desteği dahil. [v0.9.0]
```

**Kurallar:**

1. Özet Türkçe, kullanıcıya dönük ("API endpoint'i eklendi", "Refactor edildi" değil).
2. Sonunda köşeli parantezde ROADMAP kilometre taşı: `[v0.X.Y]`.
3. Bu özet doğrudan sürüm notuna (CHANGELOG.md) girer.

**Gerekçe:** Kullanıcı v0.0.12 uyguladığında "v0.0.12 sürümüne geçiyorum" bilmek ister — etiket bu açıklığı sağlar. Paket sürümü 0.0.5 olsa da ROADMAP imzası kalır.

### 6. **Platform Sürümü vs. ROADMAP Kilometre Taşı Ayrışması**

**Karar:** v0.0.12'den itibaren **sırası dışında yapılan versiyonlar** paket sürümü ve ROADMAP etiketi ayrışabilir.

**Örnek:**

- **ROADMAP kilometre taşı:** v0.0.12 (v0.0.5–v0.11 yapılmadı)
- **Paket sürümü:** 0.0.4 → 0.0.5 (Changesets fixed grubu)

**Doğrulama:** `scripts/sync-platform-version.ts --check`:

```
HATA: kök version ≠ max(fixed grup)
HATA: paket ne fixed grupta ne bağımsız kümede
UYARI: fixed grup içi sapma
```

**Gerekçe:**

1. v0.0.1–v0.0.4 sırası takip etti → birebir çakıştı, adım adım yapıldı.
2. v0.0.12 başka sürümlere bağımlılığı yalnızca v0.0.1 olduğu için, **sırası dışında kurulabilir** ve **sonraki sürümlere de koruma sağlar** (CI erken).
3. Sürümler sıra takip ederse tekrar çakışır. Sıra dışı yapılırsa ayrışabilir. **Bu tasarım ikincisine hazırdır.**

### 7. **Sürüm PR'ı ve Tag Akışı: `release.yml`**

**Karar:** `main` push'una tetiklenen `release.yml`:

1. `main` branch'inde pending changeset'ler varsa sürüm PR'ı açar.
2. PR merge'lendiğinde (`main`'e push) tag'ler yazar ve release oluşturur.
3. Bu sürümde **gerçek tag atılmaz** (denetim amacıyla iş akışı yazıldı, çalışmaz).

**Özellikleri:**

- `changeset publish` **hiçbir iş akışında çağrılmaz**.
- Tag atma `ARKESOFT_RELEASE_TAGGING=enabled` repo değişkenine bağlı (henüz tanımsız).
- Sürüm PR'ı açabilmesi için GitHub ayarı: "Allow GitHub Actions to create and approve pull requests" (kullanıcı eylemi).

**Reddedilen alternatifler:**

| Alternatif                       | Neden seçilmedi                                                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Polyrepo, dört ayrı deploy hattı | CLAUDE.md §3 monorepo **bağlayıcı**. Dört paket shared `packages/*`'den bağımlı; `workspace:*` aralıkları (v0.6 tRPC) bu tasarım gerektirir. |
| Turbo remote cache               | Dış hesap/self-hosted sunucu. Build süresi bugün saniyeler mertebesinde. v0.18.0'a bırakıldı.                                                |

---

## Sonuçlar

### Olumlu

- **Otomatik doğrulama:** Her PR lint, typecheck, test, build'den geçer.
- **Dört bağımsız hat:** Değişiklik yalnızca ilgili uygulama hattını koşturur; diğerleri atlanır.
- **Sürüm altyapısı:** Changesets + custom script kök sürümü elle yönetimsiz ilerletir.
- **Türkçe, açık sürüm notu:** Kullanıcı ROADMAP imzası ile ne olduğunu görür.
- **Ölçeklenebilir:** v0.0.13 (`test:isolation` job'u additive), v0.0.19 (`e2e.yml`), v0.18.0 (deploy adımı) kolayca eklenebilir.

### Olumsuz ve kabul edilen maliyetler

- **Kök paket manuel senkronizasyon:** `pnpm release:version` canonical komut; `pnpm changeset version` tek başına kökü bozar. **Maliye:** script + `--check` guard. **Karşı önlem:** PR şablonunda not.
- **Beşinci hat `shared`:** PM'in "dört hat" ifadesinin üzerine ekleme (architect bağımsız kararı; Orkestratör uyarısı gerekmedi çünkü eklemeli ve gerçek boşluğu kapsar).
- **Literal-jeton tuzağı:** Kendi kendini eşleyen grep kontrollerinin üç örnekçesi (ST-7, ST-6, FIX 1) → AGENT_BASELINE.md kuralı.
- **GitHub ayarlarına bağımlılık:** Branch koruması, Actions izni, repo değişkeni — **uygulanması kullanıcı eylemi** (v0.18.0'a bırakıldı).

### Etkilenen sonraki kararlar

- **v0.0.13:** RLS şema linter job'u `ci.yml`'e additive.
- **v0.0.16:** Yeni jeton borçları (actionlint, scripts workspace, ci-gate.needs mekanik doğrulama).
- **v0.0.19:** `e2e.yml` (ayrı dosya) + Playwright job'ları.
- **v0.18.0:** Deploy adımları, Kubernetes/Helm integrasyon.
- **Gelecek:** Sürüm az sınıflandırması (commit-lint, PR etiketi) changeset'siz PR'ları bloklamak için.

---

## Gözden geçirme koşulları

1. **`turbo --affected` şeması değişirse:** `plan` job'unun JSON ayrıştırması kırmızıya döner.
2. **Changesets sürüm algoritması değişirse:** `--check` kurallarını güncelle.
3. **Paket eklenirse:** Drift guard (`--check`) yeni paketleri gruba eklemeyi zorlar.
4. **Branch koruması GitHub ayarlarında uygulanırsa:** PR şablonunda ve `docs/development.md`'de notlar güncelle.
5. **Sırası takip eden yeni versiyon yapılırsa:** Sürüm imzası ve paket sürümü tutarlılığını kontrol et.
