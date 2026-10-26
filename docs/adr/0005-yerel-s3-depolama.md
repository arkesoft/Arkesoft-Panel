# ADR-0005 — Yerel geliştirmede S3 uyumlu depolama: MinIO yerine SeaweedFS

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-26
- **Karar verenler:** Arkesoft mühendislik
- **İlgili versiyon:** `v0.0.2` (bkz. `ROADMAP.md`)
- **İlgili karar:** [ADR-0001](./0001-teknoloji-yigini.md) — yığının bu bölümünü günceller

---

## Bağlam

ADR-0001, nesne depolama için "S3 uyumlu depolama (geliştirmede MinIO, üretimde
Cloudflare R2)" kararını verdi. `v0.0.2`'de yerel altyapıyı docker-compose ile
kurarken MinIO imajlarının artık anonim olarak çekilemediği tespit edildi:

```
$ docker manifest inspect minio/minio:latest
HAYIR

$ curl -H "Authorization: Bearer <anonim token>" \
    https://registry-1.docker.io/v2/minio/minio/tags/list
{"errors":[{"code":"UNAUTHORIZED","message":"authentication required", ...}]}
```

Aynı sorgu `library/postgres` için tam etiket listesi döndürüyor — yani ağ
erişimi çalışıyor, sorun MinIO deposuna özgü. `minio/mc` (bucket kurulumu için
gereken istemci) da aynı durumda.

Bu, `pnpm infra:up` komutunun her geliştirici makinesinde kimlik doğrulaması
olmadan çalışması gereksinimini karşılamıyor. Yeni katılan bir geliştiricinin
veya CI işinin MinIO hesabı olmasını zorunlu kılmak kabul edilemez.

**Önemli kısıt:** Bu karar yalnızca **yerel geliştirmeyi** etkiler. Üretim
depolaması Cloudflare R2'dir ve değişmemiştir. `StorageAdapter` soyutlaması
(ADR-0001, ROADMAP v0.0.16) sağlayıcıyı uygulama kodundan gizler.

---

## Karar

Yerel geliştirmede S3 uyumlu depolama olarak **SeaweedFS** (`chrislusf/seaweedfs:4.51`)
kullanılacak.

Tek konteyner, `weed server -dir=/data -s3` komutuyla S3 API'sini `8333`
portunda sunar. Bucket kurulumu aynı imajın `weed shell` aracıyla yapılır; ek
bir S3 istemcisine (MinIO'nun `mc`'si gibi) gerek kalmaz.

Karar öncesi doğrulanan davranışlar:

| İşlem                                 | Sonuç                                           |
| ------------------------------------- | ----------------------------------------------- |
| `PUT` nesne                           | `200`                                           |
| `GET` nesne                           | içerik doğru döndü                              |
| `GET` bucket listesi (`?list-type=2`) | doğru `ListBucketResult` XML'i                  |
| `DELETE` nesne                        | `204`                                           |
| Volume ile kalıcılık                  | `infra:down` + `infra:up` sonrası nesne korundu |
| `infra:reset` sonrası                 | nesne silindi, bucket yeniden oluşturuldu       |

### Değerlendirilen alternatifler

| Alternatif                           | Neden seçilmedi                                                                                                                                                                                                                                                            |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MinIO (kimlik doğrulamalı çekme)** | Her geliştirici ve CI işi için Docker Hub kimlik bilgisi zorunlu hale gelirdi. Tek komutla kurulum hedefini bozuyor.                                                                                                                                                       |
| **LocalStack**                       | S3 API uyumluluğu en yüksek seçenek ve `ready.d` kancasıyla bucket kurulumu zarif. Ancak **veri kalıcılığı (`PERSISTENCE`) ücretli sürüme taşındı**; community sürümünde `infra:down` sonrası yüklenen tüm medya kaybolurdu. `v0.0.2` kapsamı "kalıcı volume'lar" istiyor. |
| **Garage**                           | S3 uyumlu, hafif ve AGPL. Ancak başlatmadan önce küme düzeni (`garage layout assign`) atanması gerekiyor; compose içinde çok adımlı ve kırılgan bir kurulum demek.                                                                                                         |
| **Zenko CloudServer**                | Bakım hızı ve belgelendirme SeaweedFS'e göre zayıf; ek bir Redis/metadata bağımlılığı getiriyor.                                                                                                                                                                           |
| **Üretimde de SeaweedFS**            | Gereksiz. R2 yönetilen, çıkış maliyeti yok ve CDN'le aynı ekosistemde. Depolamayı kendimiz işletmenin karşılığı yok.                                                                                                                                                       |

---

## Sonuçlar

### Olumlu

- `pnpm infra:up` kimlik doğrulaması olmadan, tek komutla çalışıyor.
- İmaj hafif ve açılış hızlı; healthcheck ~10 saniyede yeşile dönüyor.
- Bucket kurulumu ek istemci gerektirmiyor (`weed shell` imajın içinde).
- Veri isimli volume'da kalıcı — `infra:down` medyayı kaybetmiyor.
- Üretim yolu (R2) etkilenmedi; `StorageAdapter` sayesinde uygulama kodu
  sağlayıcıdan bağımsız kalıyor.

### Olumsuz ve kabul edilen maliyetler

- **S3 API uyumluluğu MinIO ve LocalStack'ten düşük.** `ListBuckets` anonim
  erişimde boş döner (SeaweedFS yalnızca kimliği doğrulanmış kullanıcının
  bucket'larını listeler). Uygulama kodu `ListBuckets` çağırmadığı için bu bir
  engel değil; bucket adı yapılandırmadan gelir.
- **Ön imzalı (presigned) URL ve CORS davranışı `v0.0.16`'da ayrıca
  doğrulanmalı.** Medya yükleme akışının çekirdeği bu; uyumsuzluk çıkarsa
  seçenekler: SeaweedFS'e `-s3.config` ile kimlik tanımlamak, ya da yalnızca
  bu akışın testleri için LocalStack'e geçmek (kalıcılığı kaybederek).
- **Geliştirme ile üretim arasında depolama motoru farkı artıyor.** MinIO da
  R2 değildi, ama SeaweedFS daha uzak bir akraba. Karşı önlem: `StorageAdapter`
  için sözleşme (contract) testleri yazılacak ve bunlar hem SeaweedFS'e hem —
  CI'da gizli bilgi mevcutsa — gerçek bir R2 test bucket'ına karşı koşacak
  (ROADMAP v0.0.16).
- **Varsayılan kurulumda S3 kimlik doğrulaması yok.** Yerelde imzasız istekler
  kabul edilir; üretimdeki yetkilendirme davranışı taklit edilmiyor.
  `v0.0.16`'da `-s3.config` ile kimlik tanımlanması değerlendirilecek.

### Etkilenen sonraki kararlar

- `v0.0.16` (medya ve dosya servisi): `StorageAdapter` sözleşme testleri bu
  farkı kapatmakla yükümlü.
- `v0.18.0` (üretim altyapısı): etkilenmiyor; R2 kararı geçerli.

## Gözden geçirme koşulları

- MinIO imajları yeniden anonim erişime açılırsa.
- `v0.0.16`'da ön imzalı URL veya CORS davranışında kapatılamayan bir uyumsuzluk
  çıkarsa.
- LocalStack community sürümünde S3 kalıcılığı yeniden ücretsiz hale gelirse.
