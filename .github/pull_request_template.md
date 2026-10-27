<!--
  Bu şablon CLAUDE.md §5 (Commit ve PR) ve T-003 K-B7'nin bağlayıcı kararına göre
  hazırlanmıştır. Her alanı doldurun; "Değişiklik yok" / "Muaf" gibi gerekçeli
  kısa cevaplar da kabul edilir.
-->

## 1. Hangi ROADMAP versiyonu?

<!-- Örnek: [v0.0.12] -->

## 2. Kabul kriteri çıktısı

<!-- İlgili versiyonun kabul kriterini çalıştırdığınız komut(lar) ve gerçek çıktı
     özeti. "Çalıştı" demek yetmez — komut + sonuç yapıştırın. -->

## 3. Tenant izolasyon kontrol listesi (CLAUDE.md §7)

- [ ] Tabloda `tenant_id` kolonu var ve `NOT NULL`
- [ ] RLS etkin, politika `current_setting('app.tenant_id')` ile karşılaştırıyor
- [ ] `(tenant_id, ...)` bileşik indeksi var
- [ ] `tenantProcedure`/`permissionProcedure` kullanılıyor, `publicProcedure` değil
- [ ] Sorgular `withTenant(tenantId)` üzerinden; ham `prisma.*` çağrısı yok
- [ ] Girdideki `id` doğrudan güvenilmiyor, sahiplik doğrulanıyor
- [ ] Kuyruk işi payload'ında `tenantId` var
- [ ] Önbellek/arama/depolama anahtarı tenant'a kapsamlı
- [ ] Hata mesajı başka tenant'ın varlığını sızdırmıyor
- [ ] Bu PR tenant verisine dokunmuyor / yukarıdakiler ilgisiz (gerekçe yazın)

## 4. Changeset

- [ ] Eklendi (`pnpm changeset`)
- [ ] Muaf — sebep: <!-- docs/test/chore muafiyeti ya da başka gerekçe -->

## 5. UI değişikliği var mı?

- [ ] Yok
- [ ] Var — ekran görüntüsü aşağıda eklendi

## 6. `ci-gate` yeşil mi?

- [ ] Evet
- [ ] Hayır — neden ve ne zaman düzeltileceği:

## 7. Yeni bir CI job'u eklediysen `ci-gate.needs` listesine eklendi mi?

<!--
  Gerekçe: ci-gate varsayılan-reddet mantığıyla çalışır ama needs listesine
  eklenmemiş bir job'u hiç görmez — sessizce atlanır. Bu maddenin mekanik bir
  doğrulaması yok, bu yüzden burada insan kontrolü olarak duruyor.
-->

- [ ] Yeni job eklemedim
- [ ] Yeni job ekledim ve `ci-gate.needs` listesine ekledim
