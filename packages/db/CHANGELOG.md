# @arkesoft/db

## 0.7.0

### Patch Changes

- @arkesoft/config@0.7.0
  - @arkesoft/errors@0.7.0

## 0.6.0

### Minor Changes

- İki faktörlü kimlik doğrulama (TOTP) eklendi: QR kodla kurulum, girişte doğrulama kodu
  isteme, yedek kodlarla kurtarma ve 2FA'yı kapatma. Mağaza sahipleri (owner) için 2FA'yı
  zorunlu kılma kuralı sisteme kazandırıldı — bu kuralı açıp kapatan panel ekranı sonraki
  bir sürümde gelecek. Art arda 10 başarısız doğrulama denemesinde hesap bir süreliğine
  kilitleniyor. 2FA ile ilgili tüm işlemler (kurulum, doğrulama, kapatma, yedek kod
  oluşturma) artık otomatik olarak sınırlandırılıyor; 2FA'yı kapatma ve yedek kodları
  yenileme işlemleri artık güvenlik kayıtlarına doğru şekilde yazılıyor. Panel, 2FA
  durumunu artık sunucudan güvenilir biçimde okuyor — birden fazla sekme açıkken kurulum
  sihirbazının kazara tekrar çalışması giderildi. [v0.0.15]

### Patch Changes

- Updated dependencies
  - @arkesoft/errors@0.6.0
  - @arkesoft/config@0.6.0

## 0.5.0

### Minor Changes

- Parola, oturum ve doğrulama belirteçlerini tutan tablolar artık veritabanı seviyesinde de
  ayrı ve en az yetkili bir kimlik doğrulama rolüyle korunuyor; uygulamanın günlük
  çalıştığı rol bu tablolara artık hiç erişemiyor. Operatör notu: kurulumunuzda yeni bir
  ortam değişkeni (`DATABASE_AUTH_URL`) zorunlu hale geldi — `.env` dosyanıza
  `.env.example`'daki satırı ekleyip `pnpm db:bootstrap`'i yeniden çalıştırmanız gerekiyor,
  aksi halde giriş/kayıt akışı açılışta hata verir. [v0.0.14.1]

### Patch Changes

- Updated dependencies
  - @arkesoft/config@0.5.0
  - @arkesoft/errors@0.5.0

## 0.4.0

### Minor Changes

- Ekip yönetimi geldi: mağaza sahibi artık ekibini panele davet edebiliyor, davet e-posta ile
  gidiyor, davet edilen kişi kabul ettiğinde üyeliği oluşuyor; üyelerin rolü değiştirilebiliyor ve
  üyeler ekipten çıkarılabiliyor.

  Beş mağaza rolü (`owner`, `admin`, `staff`, `support`, `readonly`) bu sürümle gerçekten
  uygulanmaya başladı. Bir rolün ne yapabileceği tek bir izin kataloğundan okunuyor; izni olmayan
  istek, isteği yapan kişi mağazanın üyesi olsa bile 403 ile reddediliyor. Salt okunur bir üye
  hiçbir yazma ucunu çağıramaz. Yeni bir rol eklendiğinde rolün izinleri yazılmadan proje
  derlenmiyor, yani bir rolün yanlışlıkla izinsiz (ya da fazla izinli) kalması mümkün değil.

  Her yetki değişikliği denetim kaydına yazılıyor: kim, hangi mağazada, hangi zaman, kimi davet
  etti, kimin rolünü değiştirdi, kimi çıkardı. Denetim kaydı yalnızca eklenir — güncellenmez ve
  silinmez; her kaydın içeriği kapalı bir sözlükten geçtiği için parola, oturum belirteci veya
  e-posta adresi gibi veriler kayda sızamıyor. İstek IP'si ve tarayıcı bilgisi denetim kaydında
  saklanıyor ama hiçbir log satırına geçmiyor.

  Her mağazanın her zaman tam olarak bir sahibi var: son sahip ekipten çıkarılamıyor, sahiplik
  devri iki adım yerine tek bir atomik işlemde yapılıyor ve eşzamanlı iki devir denemesinden
  yalnızca biri başarılı oluyor. Böylece sahipsiz mağaza oluşması engellendi.

  Davet, kabul ve denetim kayıtları mağazaya kapsamlı: bir mağazanın davetleri ve denetim izi başka
  bir mağazadan ne okunabiliyor ne yazılabiliyor (veritabanı seviyesinde RLS ile zorlanıyor).
  Mağaza başına bekleyen davet sayısı sınırlı ve aynı davet çok kısa aralıkla tekrar gönderilemiyor.

  Operatör notu: bu sürüm yeni bir ortam değişkeni veya yeni bir kurulum adımı getirmiyor; mevcut
  kurulumlar yalnızca veritabanı göçünü uygular. [v0.0.14]

### Patch Changes

- @arkesoft/config@0.4.0
  - @arkesoft/errors@0.4.0

## 0.3.0

### Minor Changes

- Arka plan iş altyapısı kuruldu: uzun süren işler artık HTTP isteğinin dışına taşınabiliyor.
  BullMQ tabanlı bir kuyruk, kendi Redis bağlantısı, üst sınırlı exponential backoff ile tekrar
  deneme ve başarısız işlerin düştüğü ayrı bir ölü mektup kuyruğu (DLQ) eklendi. İşler ayrı bir
  worker sürecinde (`pnpm dev:worker`) koşuyor; `pnpm dev` worker'ı bilinçli olarak başlatmaz.

  Her iş artık veritabanında birinci sınıf, mağazaya kapsamlı bir kayıt: durum, ilerleme (0-100),
  hata ve zaman damgaları saklanıyor. İlk iş türü olarak "mağaza kurulumu" iskeleti eklendi —
  adımlarını loglayıp ilerlemesini yazıyor, gerçek kurulum işini henüz yapmıyor (o iş v0.2.0'da).
  `Job` tablosu Postgres RLS ile korunuyor; bir mağazanın işleri başka bir mağazadan ne okunabilir
  ne yazılabilir, worker her işi işin kendi mağaza bağlamı altında koşturuyor.

  SIGTERM sonrası temiz kapanış garantisi (v0.0.4) yeni worker süreci için de korundu: devam eden
  iş sınırlı süre beklenir, kuyruk ve Redis bağlantıları kapatılır, açık handle bırakılmaz.

  Operatör notu: kuyruk testleri `pnpm infra:up` ile gelen compose Redis'ini gerektirir. Redis
  `appendonly yes` ve `noeviction` ile yapılandırılmamışsa kuyruk testleri Türkçe, okunur bir
  mesajla **başlamadan** durur — 6379 portunda ikinci bir Redis (ör. `brew services start redis`)
  çalışıyorsa onu durdurmak gerekiyor. Ayrıntı: `docs/development.md` → "Kuyruk worker'ı". [v0.0.11]

### Patch Changes

- @arkesoft/config@0.3.0
  - @arkesoft/errors@0.3.0

## 0.2.0

### Minor Changes

- Mağazanın seçtiği tema artık kendi vitrininde gerçekten render ediliyor: ilk tema paketi
  (`modern`) ana sayfa ve "sayfa bulunamadı" şablonlarıyla storefront'a bağlandı, tema rengi ve
  yazı tipi ayarları sayfaya otomatik uygulanıyor. Mağaza sahibi bu sürümde henüz bir yüzey
  görmüyor (tema seçimi her mağaza için şimdilik sabit) — bu, "tema seç, siteyi kur" vaadinin
  temel alt yapısını kuruyor. [v0.0.10]

### Patch Changes

- @arkesoft/config@0.2.0
  - @arkesoft/errors@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies
  - @arkesoft/config@0.1.1
  - @arkesoft/errors@0.1.1

## 0.1.0

### Minor Changes

- 08ba11d: Tenant izolasyonu artık veritabanı seviyesinde zorluyoruz. Postgres RLS (Row Level Security) ve FORCE RLS ile her sorgu otomatik olarak mağazanın verilerine filtrelenir. İkinci bir rol (`arkesoft_app`) ayarlanarak uygulama en az yetkisi ilkesiyle koşuyor. Yeni `withTenant()` fonksiyonu transaction'lara tenant context'i bağlar; context'siz sorgu sıfır satır döner (hata değil). Linter 20 kural ile izolasyon ihlalini CI'da yakalar. Test komutu `pnpm test:isolation` yeni ve zorunlu.

  ⚠ OPERATÖR KIRILMASI: `.env` dosyasına iki yeni değişken gerekiyor (`DATABASE_MIGRATION_URL`, `DATABASE_BOOTSTRAP_URL`) ve adım olarak çalıştırılması zorunlu olan `pnpm db:bootstrap` adımı geldi. Mevcut `.env`'de bu değişkenler yoksa `pnpm env:check` kırmızıya düşecek. Geçiş talimatları ve geri alma adımları `docs/development.md`'de açıklanmıştır. [v0.0.13]

### Patch Changes

- Updated dependencies [7b41a06]
- Updated dependencies [b072657]
  - @arkesoft/config@0.1.0
  - @arkesoft/errors@0.1.0
