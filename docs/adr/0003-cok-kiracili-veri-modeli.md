# ADR-0003 — Çok Kiracılı Veri Modeli ve Şema Konvansiyonları

**Tarih:** 2026-10-26  
**Durum:** KABUL EDILDI  
**Etkilenen sürümler:** v0.0.3 (uygulanır), v0.0.13 (RLS mekanizması)

---

## Bağlam

Arkesoft'un çok kiracılı (multi-tenant) mimarisi veri tabanı şemasına dört temel zorluk getiriyor:

1. **Kimlik belirsizliği:** Farklı tenant'ların aynı ID alanlarına sahip olması (örneğin, tenant A'nın user@123 ve tenant B'nin user@123'ü), tablo katmanında ayırt edilmesi gerekir.
2. **Sorgu hatası riski:** Her sorguya `tenant_id` filtresi eklemeyi unutmak, istemeden çapraz tenant veri sızıntısı oluşturur.
3. **Veritabanı seviyesi garantisi:** Uygulama katmanı hatası veri sızıntısına dönüşmesin diye, veri tabanı seviyesinde izolasyon zorunlu (v0.0.13'ün RLS politikaları).
4. **Şema değişimi karmaşıklığı:** Tenant'a bağlı tablolarla ilgili migrasyonlar, gerekli indeks, kısıt ve tahkiklemeleri içermek zorundadır.

Bu kararname, **v0.0.3'te uygulanacak olan** konvansiyonları ve v0.0.13'te RLS mekanizmasının üzerine inşa edileceği temelleri tanımlar.

---

## Karar

Çok kiracılı veritabanı şemasında aşağıdaki yedi ilkeyi uyguluyoruz:

### 1. **Birincil Anahtar Formatı: cuid2, Ön Eksiz, Text Tipi**

- Tüm tablolarda `id` alanı `String @default(cuid(2))` olur; PG tarafında `text` tipi.
- **Neden text?** UUID (36 byte) ve ULID (26 byte) gibi diğer formatların aksine, cuid2 (12 byte) uzunluğu değişebilir. `text` kolonu uzunluk sınırı getirmez. ID formatı değişirse (v0.1.0'da hexadecimal cuid2'ye geçilirse), migration gerekmiyor.
- **Neden ön ek yok?** Geliştirme kolaylığı dısında hiçbir işlevsel kazanç yoktur. Örneğin, `tnt_` ön eki eklemek log taramasında noise üretir ve index boyutunu artırır. Platform ve istemci açıları açık ID değerini taşıabilir; ön ek isteğe bağlı bir cosmetik uygulama-katmanı katmanıdır.
- **Ham SQL insert garantisi:** Prisma `@default(cuid(2))`'nin DDL üretmiyor, istemci tarafında ID üretir. Ham SQL `INSERT ... VALUES (id)` kullanmak gerekiyorsa çağrı yerinde ID hazırlanır.

### 2. **Zaman Alanları: Timestamptz, Trigger Yok**

- `createdAt` ve `updatedAt` her tabloda `DateTime @db.Timestamptz(3)` olur.
- `createdAt` `@default(now())` — ham SQL insert'te bile default olarak sistem saati yazılır.
- `updatedAt` `@default(now()) @updatedAt` — Prisma uygulamaya ve gelecek `@db.GeneratedValue("ALWAYS")` (Prisma 7+'de) PostgreSQL'in kendi tetiklemesine hazır.
- **Neden trigger değil?** Tetiklemeler elle SQL'de yazıldığından şema migrasyonunun otomatik algılanması (`prisma migrate diff`) kırılır ve elle SQL kodu elle mimari denetime sunulmasının karmaşıklığını getirir. v0.0.3'te tetik yazılmaz; v0.0.13 `@db.GeneratedValue` ile otomatlığı sağlayacak.

### 3. **Soft Delete: Yalnızca Varlık Tablolarında, Tekillik Serbest Kalmaz**

- Varlık tablosu (Tenant, User): `deletedAt` alanı bulunur; soft delete uygulanabilir.
- Saf ilişki tablosu (TenantMembership): `deletedAt` yoktur; üyelik kaldırma **hard delete** ile yapılır.
- **Tekillik davranışı:** Slug / e-posta gibi unique alanları soft delete sonrası **serbest bırakılmaz** — silinmiş varlığın adı / alan adı başkası tarafından devralınamaz. `deletedAt` henüz **not null olmadığı için**, unique constraint yalnızca aktif satırlara (deleted IS NULL) uygulanmaz; tüm satırlara bakıyor ve `deleted=t` satır varlığında çakışma reddediyor.
- **Neden saf ilişki tablolarında yok?** Kaldırma geçmişi `AuditLog` v0.0.14'ün sorumluluğu. Hard delete / trigger silme yazılmaması hard delete'i yapısal olarak basit tutar.

### 4. **Tablo Adlandırması: snake_case, Ayrılmış Kelime Kaçışı: `app_` Öneki**

- Tüm tablo ve kolon adları `snake_case` olur; `@@map()` ile PG adı belirtilir.
- PostgreSQL'in ayrılmış kelimesi olan tablo adlarına (`user`, `session`) `app_` öneki konur — ör. `app_user`.
- **Neden `"user"` tırnakları değil?** Tırnaklar elle SQL script'lerde, v0.0.13'ün RLS politika yazılarında, linter araçlarında ve psql konsolunda tutarlı biçimde yazılması gerekir. Konvansiyon, tırnaktan kurtarır.
- Ayrılmış kelimeler listesi: [PostgreSQL ayrılmış sözcükler](https://www.postgresql.org/docs/current/sql-syntax-lexical.html#SQL-PRECEDENCE).

### 5. **Taksonomisi: İki Kategori, Makine Okunur**

- **Platform seviyesi** (tenant'sız): `Tenant`, `User`
- **Tenant'a bağlı:** `TenantMembership`, ve gelecek tüm işletme tabloları (v0.0.4+: Order, Product vs.)
- `src/tenancy.ts` iki `as const` dizi tutar:
  ```typescript
  export const PLATFORM_LEVEL_TABLES = ['tenant', 'app_user']
  export const TENANT_SCOPED_TABLES = ['tenant_membership']
  ```
- v0.0.3'te test (`migration-sql.test.ts`) diziyi okuyor ve şemanın uyumluluğunu doğruluyor.
- v0.0.13 **şema linter'ı** bu dizileri allowlist olarak tüketir; yeni tabloda RLS politikası zorunluyken, liste hatası şemayı kapatır.

### 6. **Numaralandırmalar: Native PG Enum, Küçük Harf Üyeler**

- Her soyut veri tipi PG `CREATE TYPE … AS ENUM` kullanır.
- Enum üyeleri küçük harfli, `snake_case` olur: `'active'`, `'pending'`, `'archived'`.
- **Neden eşleme katmanı değil?** Türk–İngilizce eşleme, kolon kimliği yazarken ve RLS politika yazarken eşleme katmanını gerektirir — kırılgan. Tek doğruluk kaynağı enum değeridir.
- Silinmişlik enum'da temsil **edilmez** (ör. `TenantStatus`'ta `'deleted'` olmaz); `deletedAt` alanı, semantic'tir — durumla değil, varlıkla ilgilidir.

### 7. **Migration'lar: Prisma Üretir, Elle Düzenlenmez, Expand/Contract Zorunlu**

- Prisma `prisma migrate dev --name <açıklama>` ile migration dosyası üretir; **elle SQL düzenlemesi yapılmaz.**
- İlk migration (`_init`) yalnızca `CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE ... FOREIGN KEY` içerir.
- **Yıkıcı değişiklik kuralı:** Sonraki her migration'da:
  - Yeni kolon eklemek → nullable veya `DEFAULT` ile
  - Kolon silmek → ayrı PR, v0.0.N'de silinir, v0.0.(N+2)'de kaldırılır (2 sürüm penceresi)
  - `NOT NULL` ekleme → v0.0.N'de kolon, v0.0.(N+1)'de constraint
  - Kolon yeniden adlandırma → `ADD new_col`, `UPDATE ... SET new_col = old_col`, `DROP old_col` (üç adım)
- Amaç: **Şema rollback'i alabilmek**. Kod geri alınırsa (v0.0.N'den v0.0.(N-1)'e) şema rollback gerekmiyor; v0.0.(N-1) veritabanı ortadaki `_N` migration'ı siliyeli yoksayıyor.

---

## Alternatifler Değerlendirmesi

| Seçenek                | UUID v4/v7               | ULID           | Cuid2 (Seçildi)       |
| ---------------------- | ------------------------ | -------------- | --------------------- |
| **Boyut**              | 36 byte (text)           | 26 byte (text) | 12 byte (değişken)    |
| **Sıralama**           | Random                   | Zamansal       | Random                |
| **Çatışma olasılığı**  | ~0%                      | ~0%            | ~0%                   |
| **Format stabilliği**  | ✓ sabit, 40 yıl standart | ✓ sabit spec   | ⚠ Prisma native       |
| **Zaman bilgisi**      | ✗                        | ✓ (ilk 48 bit) | ✗                     |
| **Ön ek (ör. `usr_`)** | İsteğe bağlı             | İsteğe bağlı   | İsteğe bağlı (karşıt) |

**Seçme nedenleri:**

- Prisma native `@default(cuid(2))` — ekstra bağımlılık yok.
- Platform'dan bağımsız, taşınabilir.
- UUID/ULID'nin zamansal yararı (sıralama, çakışma hızı) mimariye gerekmiyor; RLS izolasyon yeterli.

| Seçenek                   | Zorunlu RLS (v0.0.13) | Uygulama Güvenliği  | Başlık Kontrolü                |
| ------------------------- | --------------------- | ------------------- | ------------------------------ |
| **Database rollü ayrımı** | ✓ (Seçildi)           | ✓ kesin             | ✓ PG güvenliği                 |
| **Uygulama koşulları**    | ✗                     | ⚠ bir katmana bağlı | ✗ uygulama hatasını kapsayamaz |
| **Hepsi hybrid**          | ✓ (v0.0.13+ hedef)    | ✓ savunmalı         | ✓                              |

---

## Olumlu Sonuçlar

1. **Şema stabilitesi:** ID formatı değişirse, kolon tipini değiştirmek gerekmez.
2. **Otomatik tooling:** Prisma migration'lar elle SQL gerektiğinde karmaşıklaşmaz.
3. **Tenant izolasyon temeli:** RLS v0.0.13 için:
   - `tenant_id TEXT NOT NULL` ad sabitleriyle kolay sorgu yazma
   - `tenant_id` ön kolon indeks hızlı filtreleme
   - Üyelik tablosuna saf bağlantıların uyumlu PK
4. **Operasyon esnekliği:** Soft delete / hard delete karışımı yönetim ve tarih denetim sorumluluk sınırlarını açıkça çizer.
5. **Denetim ve raporlama:** `createdAt` / `updatedAt` / `deletedAt` tutarlı biçimde mevcuttur; günlük raporlamaya esas.

---

## Olumsuz Sonuçlar

1. **v0.0.3 eksiklikleri:**
   - **RLS yok:** v0.0.3 şema, v0.0.13'in politikalarına hazırlanmış olsa da, bu sürümde bir uygulama hatası çapraz tenant erişimine yol açabilir. Bu **bilinçli bir risk kabul edilmesidir**. Koruma v0.0.13'te zorlayıcı olur.
   - **Tek rol:** `CREATE TABLE` ve `BYPASSRLS` aynı rol'ün, migration (shadow DB) ve uygulama aynı bağlantı dizesi. v0.0.13'te ayrılacak.
   - **Taksonomi uyumlaştırması:** Test ve linter yalnızca `TENANT_SCOPED_TABLES`'ı kontrolüne alır. Tersine kontrol (table var ama dizi yok) v0.0.13'ten sonra gerekir. **T2-1 borcunun temeli.**

2. **Soft delete kompleksliği:**
   - Unique constraint'ler soft delete sonrası tekillik serbest bırakmaz; bu veritabanı seviyesinde yapılmaz. **Uygulama katmanında** (v0.0.4+ repository'ler) `deletedAt IS NULL` filtresi gerekir.
   - Partial unique index `(slug) WHERE deleted_at IS NULL` istenmesi Prisma'nın desteklememesi → elle SQL veya işlem kaybı.

3. **Expand/contract zorlama:**
   - Kolon silme 3 aşamalı; en az iki sürüm boyunca ortada tutulan kolon gerekir.
   - Kısa yaşam döngüsü projeler bu kuralla çatışabilir; platform 1+ yıl desteklenecek için gerekli.

---

## Gözden Geçirme Koşulları

Bu karar doğrulanmış sayılır, ancak **iki kısıt altında:**

1. **v0.0.13 uyumlaştırması:** v0.0.13 sürümü:
   - Rol ayrımını (migration + uygulama) dökmeli
   - `ENABLE` + `FORCE ROW LEVEL SECURITY`'yi her tenant tabloya eklemeeli
   - `SET LOCAL app.tenant_id` işlemesi kurmalı
   - Yukarıda görülen **olumsuz sonuçlar** bölümündeki üç kalemden en az ikisini (RLS zorlama + taksonomi ters kontrolü) kapalı hale getirmeeli.

   Bunlar yapılmadan, ADR sonraki oturumda yeniden açılacak ve alternatifler tartışılacaktır.

2. **Linter tamamlanması:** T2-1 borcunun (migration-sql testi) v0.0.13'ten hemen önce kapatılması, şema linter'ının `TENANT_SCOPED_TABLES` / `PLATFORM_LEVEL_TABLES` uyumunu **zorunlu hale getirmesi** gerekir.

---

## Sorular ve Notlar

- **Neden `updated_at` v0.0.3'te tetik değil?** Prisma ile trigger yazımı elle SQL gerektirir; migrate diff'in otomatik algılaması bozulur. v0.0.13'in `@db.GeneratedValue('ALWAYS')` Postgres kendi güncellemesini yapabilir.
- **Neden `planId` nullable?** Plan v0.17.0'da gelecek; FK + constraint v0.0.3'te önceden yazılmaz (migration başına bir büyük değişiklik).
- **Neden soft delete User tablosunda?** Better Auth v0.0.5 kullanıcı silme desteği isteyecek; history + tentative recovery denetim alanı için gerekli.
