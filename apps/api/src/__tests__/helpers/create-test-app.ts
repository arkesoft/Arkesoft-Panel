// @arkesoft/api — test uygulaması fabrikası (ROADMAP v0.0.4, T-002/ST-2)
//
// `Test.createTestingModule` sarmalayıcısı. SIRALI PAYLAŞIMLI DOSYA (PO dosya
// sahipliği): ST-6 → ST-5 → ST-7 bu imzaya SADECE EKLEME yapacak (additive
// opsiyon alanları) — mevcut alanlar KIRILMAZ.
//
// `stream`: AC9/AC10'un bellek `Writable`'ı — verilirse `ROOT_LOGGER`
// provider'ı override edilip `createRootLogger`'a enjekte edilir, test NDJSON
// log satırlarını parse edebilir.
// `apiEnv`: `API_ENV` provider'ının TAMAMINI override eder — gerçek
// `parseEnv(process.env)` çağrılmaz (global mutasyonsuz, K-A4/AC6 — `NODE_ENV`
// testte `process.env`'e dokunmadan değiştirilebilir).
// `healthChecks` (T-002/ST-6 EKLEMESİ, additive): `HEALTH_CHECKS` provider'ının
// TAMAMINI override eder — AC3'ün 503/zaman aşımı testleri gerçek DB/Redis'e
// dokunmadan sahte `HealthCheck` nesneleri (hata fırlatan veya hiç dönmeyen
// `check()`) enjekte edebilir.
// `smokeControllers` (T-002/ST-7 EKLEMESİ, additive): AC5/AC7/AC14'ün HTTP
// seviyesinde gözlemi için teste özel controller'lar. ÜRETİM KODUNA UÇ
// EKLENMEZ — ST-5'in kendi duman testinde DOĞRULADIĞI desen: `AppModule`'ü
// İTHAL EDEN geçici bir `SmokeTestModule` kurulur, `AppModule`'ün kendisi
// hiçbir satırda değiştirilmez. Middleware zinciri (`'*path'` ile TÜM
// yollara bağlı) ve `APP_GUARD`/`APP_FILTER`/`APP_INTERCEPTOR` global
// provider'ları `AppModule`'den geldiği için bu controller'lara da AYNEN
// uygulanır.
//
// T-006/S8 EKLEMESİ (additive, koşulsuz — hiçbir YENİ opsiyon alanı YOK):
// `app.init()` SONRASI `platform:auth:*` Redis anahtarları FLUSH edilir.
// GEREKÇE (ÖLÇÜLDÜ): `RateLimitGuard` artık GLOBAL (`APP_GUARD`,
// `AuthModule`) ve sayaçlar PAYLAŞILAN tek Redis'te PLATFORM kapsamlı
// (R1) — her `createTestApp()` çağrısı AYRI bir Nest örneği kursa da HEPSİ
// AYNI Redis'e, AYNI loopback IP'den bağlanır. S8 ÖNCESİ hiçbir test
// dosyası bu sayaçların VARLIĞINI bilmiyordu (henüz doğmamıştı); S8
// SONRASI, tek bir test dosyasının biriktirdiği sayaç bir SONRAKİ dosyanın
// `createAuthenticatedSession()`/`sign-up`/`sign-in` çağrılarını 429'a
// düşürüp 8 ÖNCEDEN YAZILMIŞ testi KIRDI (ÖLÇÜLDÜ, `pnpm test` çıktısı —
// `auth-flow`/`auth-guard`/`auth-sessions`/`auth-secret-leak`/
// `concurrency`/`log-correlation`). Bu flush HİÇBİR mevcut testin
// DAVRANIŞINI/ASSERT'İNİ değiştirmez (S8 öncesi bu anahtarlar hiç yoktu,
// hiçbir test onların KALICILIĞINA bağımlı DEĞİL) — yalnızca HER test
// uygulamasına, rate-limit sayaçları açısından TEMİZ bir başlangıç verir.
// `SCAN` kullanılır (`KEYS` DEĞİL — büyük anahtar uzayında bloklamaz,
// production-safe desen, burada gerekli olmasa da tutarlılık için).
//
// T-009/S8 EKLEMESİ — İKİ FAIL-CLOSED KAPI (security T-008 tur2 medium +
// solid tur2 low, ÖLÇÜLDÜ: bu dosyada `NODE_ENV` kontrolü YOKTU, Redis host
// allowlist'i YOKTU — `grep -c NODE_ENV` → 0). Senaryo: biri paylaşılan/canlı
// bir ortamı teşhis ederken `REDIS_URL`'i o ortama işaret eder HÂLDE zorunlu
// kapı komutu `pnpm test` koşulursa, 30 çağıran dosyanın HER `createTestApp()`'i
// `platform:auth:*` NAMESPACE'İNİ dakikalarca TEKRAR TEKRAR siler — sign-in
// (20/15dk), sign-up (10/saat), şifre sıfırlama sayaçları SÜREKLİ sıfırlanır
// → credential-stuffing botu PRATİKTE SINIRSIZ deneme kazanır. `solid`'in
// değerlendirmesi: "kabul edilebilir dev kolaylığı DEĞİL, test izolasyon
// defekti." Kapılar `flushRateLimitCounters`'ın İLK satırlarında, Redis'e
// HİÇBİR komut gitmeden önce çalışır:
//   (a) `process.env.NODE_ENV !== 'test'` → fırlat.
//   (b) çözülen Redis host'u (`new URL(apiEnv.REDIS_URL).hostname`) loopback
//       allowlist'inde (`127.0.0.1`/`::1`/`localhost`) DEĞİLSE → fırlat.
//
// T-019/S7 EKLEMESİ (K7, backend — ÖNCE ÜRET SONRA DÜZELT) — ÜÇÜNCÜ bir
// FAIL-CLOSED kapı: EŞZAMANLI KOŞUM TESPİTİ. ÖLÇÜLDÜ (ham kanıt KARARLAR'da):
// bu dosyanın flush'ı GLOBAL'dir (`platform:auth:*`, tenant/koşuma kapsamsız)
// — iki `createTestApp()` ÖRNEĞİ AYNI Redis'e bağlıyken biri flush ederse
// DİĞERİNİN o ana kadar biriktirdiği sayaçları SİLER (tek-süreç içi kontrollü
// simülasyonla kanıtlandı: A 15 istek → B'nin createTestApp() flush'ı → A
// 6 istek daha → kümülatif 21. istek BEKLENEN 429'u ÜRETMEDİ). Bu GERÇEK bir
// risktir ÇÜNKÜ (a) `apps/api`'nin KENDİ `test:isolation` görevi (dört
// `*.isolation.test.ts` dosyası) de `createTestApp()` + gerçek sign-in/sign-up
// çağırır, AYNI loopback IP'den, AYNI paylaşılan Redis'e — (b) bu repo'nun
// ÇOK-AJANLI geliştirme akışında birden fazla ajan/terminal AYNI yerel
// Postgres/Redis'i paylaşır (bu T-019 Task'ının "Postgres/Redis MÜNHASIR"
// kuralları TAM BU RİSKİ TANIR). CI'da bu KOŞMAZ (`turbo.json`'ın
// `test:isolation` yorumu: run-gates'in SIRALI adım tasarımı `test` ve
// `test:isolation`'ı AYNI invocation'da asla birlikte planlamaz) — risk
// YEREL/ÇOK-AJANLI geliştirmeye ÖZGÜDÜR.
//
// SAYAÇ ANAHTAR UZAYINI KOŞUMA KAPSAMLAMA (R-PO5'in istediği minimal
// düzeltme) — DOĞRUDAN `platform:auth:*` anahtar BİÇİMİNİ (production
// `rate-limit.service.ts`'in sabiti) değiştirmek bu alt görevin DOKUNACAĞI
// dosya listesinin DIŞINDA bir DI kayıt dosyası (`auth.module.ts`) gerektirir
// — ÖLÇÜLDÜ, Orkestratör'e raporlandı (KARARLAR), kendi başına EKLENMEDİ.
// Bunun yerine `process.ppid` KULLANILIR: ÖLÇÜLDÜ (KARARLAR) — vitest
// `isolate: true` HER test DOSYASINI kendi `process.pid`'inde ayrı bir
// alt süreçte koşturur AMA hepsi AYNI `process.ppid`'i (TEK `pnpm test`/
// `pnpm test:isolation` invocation'ının koordinatör süreci) PAYLAŞIR; bu
// değer FARKLI invocation'lar arasında FARKLIDIR. Bu yüzden `process.ppid`
// "KOŞUM" kimliği olarak KULLANILABİLİR: flush'tan ÖNCE paylaşılan bir
// "run-owner" anahtarı KONTROL EDİLİR — sahibi YOKSA veya BENİM ppid'imse
// (AYNI koşumun BAŞKA bir dosyası) flush GÜVENLİDİR; sahibi BAŞKA bir ppid
// İSE VE o ppid HÂLÂ YAŞIYORSA (`process.kill(pid, 0)`) flush GÜVENSİZDİR —
// SESSİZCE silmek YERİNE LOUD fırlatılır (dosyanın MEVCUT iki fail-closed
// kapısıyla AYNI felsefe). Sahibi ÖLÜ bir ppid İSE (önceki koşum çökmüş/
// bitmiş) marker KALINTI sayılır ve SESSİZCE DEVRALINIR (yanlış-pozitif
// ÖNLENİR) — TTL (120 sn, her çağrıda TAZELENİR) bu kalıntının EBEDİ
// kalmasına karşı İKİNCİ bir savunma katmanıdır.
//
// ⚠ Bu, PROVEN mekanizmayı (aynı anda YAŞAYAN bir YABANCI koşum) SESSİZ
// VERİ KAYBINDAN TEŞHİS EDİLEBİLİR bir HATAYA çevirir — sayaçların
// KENDİSİNİ süreçler arası İZOLE ETMEZ (bu, production `rate-limit.
// service.ts`'in anahtar biçimini değiştirmeyi gerektirir, yukarıdaki
// gerekçeyle bu alt görevde YAPILMADI). ROADMAP:3095 EKSENİYLE İLİŞKİ
// (Orkestratör'ün istediği rapor): O satır ÜRETİM `rate-limit.guard.ts`'in
// sayaç SCOPE'unun (IP/hesap) port/origin/süreç bileşeni TAŞIMADIĞINI
// anlatıyor — PRODUCTION kodu, GERÇEK trafik. BU düzeltme TEST HARNESS'İN
// KENDİ flush mekanizmasına bir koşum kimliği ekliyor; AYNI EKSEN (scope'a
// bir "hangi çalıştırma" bileşeni eklemek) ama FARKLI KOD YÜZEYİ (üretim
// sayaç anahtarı DEĞİL, test flush'ının eşzamanlılık KORUMASI). Bu yüzden
// ROADMAP:3095'in satırı bu düzeltmeyle KAPANMAZ — AYRI kalır (Orkestratör
// kararı, bu Task'ın kapsamı değil).
//
// T-019 GATE TUR1 DÜZELTMESİ (solid, medium) — "ÜÇÜNCÜ fail-closed kapı"nın
// KENDİSİ bir YARIŞ KOŞULU taşıyordu: `GET` (karar) → `SET` (yaz) İKİ AYRI
// komuttu, aralarında başka bir koşum da AYNI `GET`i okuyup AYNI kararı
// (`"sahip yok/ölü, devral"`) verebiliyordu — iki `SET` de yazılır ama
// hiçbiri DİĞERİNİN varlığından haberdar OLMADAN "sahibim" sanır (tam olarak
// bu kapının KORUMAK için var olduğu senaryo). Düzeltme — aşağıdaki
// `assertSoleRunOwnership`: (1) ilk iddia artık TEK, ATOMİK `SET … NX`
// komutu (Redis TEK İŞ PARÇACIKLIDIR — `NX` ile iki eşzamanlı çağırandan EN
// FAZLA biri `'OK'` alabilir, DÖNÜŞ DEĞERİ kontrol edilerek bu garanti
// KULLANILIR); (2) "sahip ÖLÜ/anahtar yok → devral" dalı artık bir
// Lua CAS betiği (`TAKEOVER_IF_UNCHANGED_SCRIPT`) — yalnızca anahtarın
// değeri BEN OKUDUĞUM hâliyle AYNIYSA yazar, aksi hâlde `'CONFLICT'` döner
// ve çağıran YENİDEN dener; (3) "zaten BENİM" dalı `SET … XX` (yalnızca
// anahtar VARSA güncelle) — ayrı bir `NX`/`CAS` gerektirmez, zararı en fazla
// gereksiz bir no-op'tur.
//
// KALINTI RİSKLER (solid'in işaret ettiği İKİ ek kusur, ÖLÇÜLEMEYEN/TAM
// ÇÖZÜMÜ orantısız karmaşıklık gerektiren, bu yüzden BİLİNÇLİ SINIRLANDIRMA
// olarak kayda geçirilen): (a) PID YENİDEN KULLANIMI — `isForeignProcessAlive`
// yalnızca "bu numaralı pid ŞU AN canlı mı" sorar, "bu pid HÂLÂ AYNI
// koordinatör süreç mi" sorusuna cevap VEREMEZ; işletim sistemi önceki
// koşumun ÖLÜ pid'ini TTL penceresi (120 sn) içinde İLGİSİZ, canlı bir
// sürece YENİDEN ATARSA bu kapı YANLIŞ-POZİTİF (gürültülü, ama GÜVENLİ
// YÖNDE — fazladan bir "sırayla çalıştır" fırlatması) üretebilir. Gerçek
// çözüm (pid + süreç BAŞLANGIÇ ZAMANI fingerprint'i, `ps`/`/proc` ile
// platformlar arası elde edilir) bu dosyanın KENDİSİNE yeni bir OS syscall
// bağımlılığı ekler — ÖLÇÜLMEDİ, EKLENMEDİ; pencere TTL ile SINIRLI kalır.
// (b) MARKER ÖMRÜ — `RUN_OWNER_TTL_SECONDS` (120) bir koşumun BİTTİĞİ anı
// BİLEMEZ (tek bir `createTestApp()` çağrısının "son çağrı" olup olmadığını
// gösteren bir sinyal YOKTUR, vitest `isolate: true` her dosyayı AYRI bir
// alt süreçte koşturduğu için); marker en kötü durumda koşumdan 120 sn SONRA
// hâlâ "sahipli" görünebilir. TTL'i düşürmek bu riski KÜÇÜLTMEZ, TERSİNE
// yavaş bir test dosyasının iki `createTestApp()` çağrısı arasında marker'ın
// ERKEN DOLMASI riskini BÜYÜTÜR (o durumda YENİ bir koşum "sahip yok" sanıp
// AYNI ANDA devam eden eski koşumla ÇARPIŞIR — tam olarak önlenmek istenen
// senaryo). Bu yüzden TTL DEĞİŞTİRİLMEDİ; kalıntı risk olarak kayda geçti
// (backend T-019 gate tur1 raporu).
const RUN_OWNER_KEY = 'platform:test-harness:run-owner'
const RUN_OWNER_TTL_SECONDS = 120

/**
 * {@link assertSoleRunOwnership}'in "sahip ÖLÜ veya anahtar YOK → devral"
 * dalının CAS (compare-and-swap) betiği — `GET` ile okunan `current`,
 * `ARGV[1]`'de taşınan "son görülen değer" İLE AYNIYSA yazar (atomik: Redis
 * `EVAL` TEK iş parçacıklı yürütülür). `ARGV[1]` boş dize İSE "anahtar YOK"
 * beklentisini taşır (`redis.call('GET', …)` yoksa `false` döner, Lua'da
 * `nil`'e eşdeğer — JS tarafındaki `null`'un Lua karşılığı). Eşleşmezse
 * (biri BENDEN ÖNCE devraldı) `'CONFLICT'` döner, çağıran YENİDEN dener.
 */
const TAKEOVER_IF_UNCHANGED_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if (current == false and ARGV[1] == '') or (current == ARGV[1]) then
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
  return 'OK'
end
return 'CONFLICT'
`

/** `EVAL` sonucu dış kaynaklı (Redis) veridir — tip verilmeden GÜVENİLMEZ, `rate-limit.service.ts`'in BİREBİR deseni (Zod ile doğrulama). */
const takeoverResultSchema = z.enum(['OK', 'CONFLICT'])

/**
 * T-019 GATE TUR 3 DÜZELTMESİ (Q-1, Orkestratör'ün bağımsız ölçümü + bu
 * dosyanın KENDİ önceki raporu) — `assertSoleRunOwnership`'in "① başarısız →
 * ② zaten benim → tazele" dalını TEK round-trip'e indirir. ÖNCESİ: `GET`
 * (oku) + `SET … XX` (tazele) İKİ AYRI komuttu — Orkestratör'ün bağımsız
 * ölçümünde (3 kök `pnpm test` koşumundan 1'i, `validation.test.ts` 1310/
 * 1335ms ↔ 6151ms arası ~4.7× sıçrama, Vitest 5000ms timeout'uyla düştü) bu
 * ek round-trip'in aritmetiği (`1500ms 'health' commandTimeout × round-trip
 * sayısı ≈ 5s eşiği`) en güçlü aday olarak işaretlendi. Bu betik `GET`+
 * (eşleşiyorsa) `SET … EX` kararını ATOMİK TEK komutla verir — ① ile AYNI
 * atomiklik garantisini taşır (Redis `EVAL` tek iş parçacıklı), round-trip
 * sayısını 3'ten (`SET-NX` başarısız + `GET` + `SET-XX`) 2'ye düşürür
 * (`SET-NX` başarısız + bu betik). Dönüş: anahtar BENİMSE → `'MINE'`
 * (TTL BU ÇAĞRIDA tazelenmiş olur, ayrı bir `SET` gerekmez); anahtar YOKSA
 * → `''` (JS tarafı `null`'a eşler, "sahipsiz" anlamına gelir); aksi hâlde
 * → anahtarın GÜNCEL değeri (yabancı sahip, çağıran `isForeignProcessAlive`
 * ile karar verir — bu karar `process.kill` syscall'ı GEREKTİRDİĞİ için Lua
 * içine TAŞINAMAZ, Node tarafında kalmak ZORUNDA).
 *
 * ⚠ ÖLÇÜLMÜŞ RİSK/FAYDA DENGESİ (dürüstçe kayda geçirilen): bu düzeltme
 * Orkestratör'ün bağımsız gözlemiyle TUTARLI bir aritmetiğe dayanır, ama
 * backend'in KENDİ enstrümantasyonu (TEŞHİS-T019-Q1, 11 ardışık enstrümante
 * kök/izole koşum, HEPSİ yeşil, en yüksek tek-komut gecikmesi ~124ms) bu
 * round-trip'lerin stalling YAPTIĞINI DOĞRUDAN YAKALAYAMADI — yani bu, kanıtlanmış
 * bir kök neden düzeltmesi DEĞİL, Orkestratör'ün ölçümüyle TUTARLI, SIFIR
 * davranış riski taşıyan (round-trip azaltımı mevcut ATOMİKLİK/fail-closed
 * garantisini DEĞİŞTİRMEZ, SADECE komut sayısını azaltır) bir sertleştirmedir.
 * Raporun KARARLAR bölümünde bu nüans AÇIKÇA işaretlendi.
 */
const REFRESH_IF_MINE_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
  return 'MINE'
end
if current == false then
  return ''
end
return current
`

/** `process.kill(pid, 0)` sinyal GÖNDERMEZ, yalnızca süreç VARLIĞINI/izin durumunu sınar. */
function isForeignProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') {
      return false
    }
    // `EPERM` (süreç YAŞIYOR ama sinyal izni yok) veya TANINMAYAN bir hata —
    // temkinli varsayım YAŞIYOR'dur: yanlış-pozitif FAIL (gereksiz durdurma)
    // yanlış-negatif SESSİZ KİRLENMEden daha güvenlidir.
    return true
  }
}

/**
 * Flush'tan ÖNCE çağrılır (Redis'e platform:auth:* DOKUNULMADAN ÖNCE).
 * Yabancı VE YAŞAYAN bir koşum tespit edilirse fırlatır (LOUD, dosya başı
 * yorumun gerekçesi) — aksi hâlde marker'ı KENDİ `process.ppid`'ime
 * (TTL tazelenmiş) yazıp SESSİZCE devam eder.
 *
 * T-019 gate tur1 düzeltmesi (solid, medium) — dosya başı yorumu: atomik
 * dallar, hiçbiri "oku → kararver → yaz" ARALIĞINDA Redis'e BAŞKA bir komut
 * göndermez. T-019 GATE TUR 3 DÜZELTMESİ (Q-1) — `REFRESH_IF_MINE_SCRIPT`
 * dosya başı yorumu: ② artık `GET`+`SET … XX` İKİLİSİ DEĞİL, TEK bir Lua
 * çağrısı (round-trip azaltımı):
 *   ① `SET … NX` — anahtar YOKSA tek komutla iddia et (atomik, DÖNÜŞ
 *     DEĞERİ `'OK'`/`null` kontrol edilir).
 *   ② `REFRESH_IF_MINE_SCRIPT` — anahtar BENİMSE TEK komutla oku+tazele
 *     (`'MINE'` döner); anahtar YOKSA (`''`) veya YABANCI sahipliyse
 *     (sahibin `ppid`'i) ③'e geçilir.
 *   ③ sahip YABANCI ve ÖLÜ (veya ② ile ③ arasında TTL dolduysa YOK) —
 *     `TAKEOVER_IF_UNCHANGED_SCRIPT` (Lua CAS) ile devral; biri BENDEN
 *     ÖNCE devraldıysa (`'CONFLICT'`) YENİDEN dene.
 */
/** `REFRESH_IF_MINE_SCRIPT`'in dönüşü dış kaynaklı (Redis) veridir — serbest metin (anahtar yoksa `''`, benimse `'MINE'`, aksi hâlde yabancı `ppid` string'i), Zod `z.string()` ile tip DOĞRULANIR (diğer iki betiğin BİREBİR deseni). */
const refreshIfMineResultSchema = z.string()

async function assertSoleRunOwnership(redisService: RedisService): Promise<void> {
  const myRunId = String(process.ppid)

  const claimed = await redisService.client.set(
    RUN_OWNER_KEY,
    myRunId,
    'EX',
    RUN_OWNER_TTL_SECONDS,
    'NX',
  )

  if (claimed === 'OK') {
    return
  }

  // T-019 GATE TUR 3 DÜZELTMESİ (Q-1) — `REFRESH_IF_MINE_SCRIPT` dosya başı
  // yorumu: ÖNCEKİ `GET` + `SET … XX` İKİLİSİ'nin TEK, atomik round-trip'e
  // indirilmiş hâli. ② ve ③'ün "oku" adımını BİRLEŞTİRİR.
  const currentOwnerRaw = await redisService.client.eval(
    REFRESH_IF_MINE_SCRIPT,
    1,
    RUN_OWNER_KEY,
    myRunId,
    String(RUN_OWNER_TTL_SECONDS),
  )
  const refreshResult = refreshIfMineResultSchema.parse(currentOwnerRaw)

  if (refreshResult === 'MINE') {
    return
  }

  const currentOwner = refreshResult === '' ? null : refreshResult

  if (currentOwner !== null) {
    const foreignPid = Number.parseInt(currentOwner, 10)

    if (Number.isInteger(foreignPid) && isForeignProcessAlive(foreignPid)) {
      throw new Error(
        `flushRateLimitCounters: BAŞKA BİR test koşumu (ppid=${currentOwner}) bu Redis'i ŞU ANDA kullanıyor — eşzamanlı 'pnpm test' / 'pnpm test:isolation' (veya iki ayrı 'pnpm --filter @arkesoft/api test') çalıştırması TESPİT EDİLDİ. 'platform:auth:*' flush'ı o koşumun sayaçlarını SİLERDİ (ÖLÇÜLMÜŞ çapraz-koşum kirlenmesi, T-019/S7/K7). Testleri SIRAYLA çalıştırın.`,
      )
    }
    // Yabancı sahip ÖLÜ (önceki koşum çökmüş/bitmiş) — kalıntı marker,
    // CAS ile SESSİZCE devral (yanlış-pozitif önlenir), ③'e devam.
  }

  const takeoverRaw = await redisService.client.eval(
    TAKEOVER_IF_UNCHANGED_SCRIPT,
    1,
    RUN_OWNER_KEY,
    currentOwner ?? '',
    myRunId,
    String(RUN_OWNER_TTL_SECONDS),
  )
  const takeoverResult = takeoverResultSchema.parse(takeoverRaw)

  if (takeoverResult === 'CONFLICT') {
    // Biri BENDEN ÖNCE devraldı (anahtar değişti) — YENİDEN oku/karar ver.
    // Tek seviye özyineleme: eşzamanlı koşum sayısı pratikte TEKTİR (bu
    // dosyanın KENDİSİ zaten çarpışmayı "sırayla çalıştır" fırlatmasıyla
    // ÖNLÜYOR), sonsuz döngü riski YOK.
    await assertSoleRunOwnership(redisService)
  }
}

// `NODE_ENV` KAYNAĞI — `process.env` (ApiEnv DEĞİL), ÖLÇÜLEREK seçildi —
// İLK denemede `ApiEnv.NODE_ENV` kullanıldı (`tenant-resolver.service.ts:11-13`
// ve `auth-instance.ts:17-33`'ün AYNI kuralını taşıdığı düşünülerek: "NODE_ENV
// API_ENV PROVIDER'INDAN okunur") ve bu `pnpm --filter @arkesoft/api test`'i
// KIRDI: `auth-flow.test.ts`/`tenant-resolution.test.ts` gibi BAŞKA, İLGİSİZ
// davranışları (üretim çerez modu, dev-header baypas'ı, açık yönlendirme
// koruması) doğrulamak için `apiEnv: { ...BASE_ENV, NODE_ENV: 'development'
// }`/`'production'` OVERRIDE EDEN GERÇEK, ÖNCEDEN VAR OLAN testleri KIRDI —
// bu testler GERÇEKTEN vitest altında (`process.env.NODE_ENV` HER ZAMAN
// `'test'`) koşuyor, yalnızca DI'YA enjekte edilen `ApiEnv.NODE_ENV`'i KENDİ
// SENARYOLARI için override ediyorlar; bu flush kapısının AMACI (gerçekten
// test SÜRECİNDE miyiz?) ile bu testlerin AMACI (DI'ya başka bir `NODE_ENV`
// enjekte ETMEK) ÇAKIŞIYOR. Doğru kaynak `process.env.NODE_ENV` —
// vitest'in KENDİSİ bunu HER ZAMAN `'test'` kurar (bu dosyanın ÜSTÜNDEKİ
// `apiEnv` alanı yorumunun aksine, bu DEĞER testler tarafından DI üzerinden
// ASLA override EDİLEMEZ — tam olarak istenen özellik: kapı, hiçbir testin
// kendi senaryosu için enjekte ettiği `ApiEnv.NODE_ENV`'den ETKİLENMEZ). Bu
// aynı zamanda "helper DI'dan ÖNCE koşabilir" riskini YAPISAL olarak ortadan
// kaldırır — `process.env` DI GRAFİĞİNE bağımlı değildir, HER ZAMAN erişilir.
// `REDIS_URL` için AYNI risk YOK (hiçbir test `apiEnv.REDIS_URL`'i KENDİ
// senaryosu için override ETMİYOR, ÖLÇÜLDÜ — `rg REDIS_URL __tests__`); bu
// yüzden (b) `apiEnv.REDIS_URL`'den OKUMAYA devam eder (DI'dan gelen GERÇEK
// bağlantı hedefi, `RedisModule`'ün `REDIS_CLIENT` provider'ının AYNI
// değerden kurduğu istemciyle TUTARLI). Negatif testler (`create-test-app-
// fail-closed.test.ts`): (a) `process.env.NODE_ENV`'i GEÇİCİ olarak
// mutasyona uğratıp `finally`'de GERİ ALIR (fileParallelism:false — BAŞKA
// bir dosyayla eşzamanlı KOŞMAZ, sızıntı riski YOK); (b) `apiEnv.REDIS_URL`
// override'ı (global mutasyonsuz, K-A4/AC6 deseni). Allowlist MODÜL SABİTİ
// (env'den OKUNMAZ, K-A8 emsali — eşik gevşetilemez disiplini).

import type { Server } from 'node:http'
import type { Writable } from 'node:stream'

import { Module } from '@nestjs/common'
import type { INestApplication, Type } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { Redis } from 'ioredis'
import type { Logger } from 'pino'
import { z } from 'zod'

import { AppModule } from '../../app.module.js'
import { AuthPrismaClientResource } from '../../auth/auth.module.js'
import type { ApiEnv } from '../../config/api-env.js'
import { API_ENV } from '../../config/config.tokens.js'
import type { HealthCheck } from '../../health/health-check.types.js'
import { HEALTH_CHECKS } from '../../health/health.tokens.js'
import { ArkesoftNestLogger } from '../../logging/arkesoft-nest-logger.js'
import { ROOT_LOGGER } from '../../logging/logging.tokens.js'
import { createRootLogger } from '../../logging/root-logger.js'
import { REDIS_CLIENT } from '../../redis/redis.tokens.js'
import { RedisService } from '../../redis/redis.service.js'
import { AuthPrismaClientResourceBootProbeFixture } from './auth-prisma-client-resource-boot-probe-fixture.js'
import { createTestHarnessRedisConnection } from './create-test-redis-connection.js'

/** `platform:auth:*` anahtarları `redisService.client.scanStream`'den TOPLU `del`'e geçer — `KEYS` KULLANILMAZ. */
const RATE_LIMIT_KEY_SCAN_PATTERN = 'platform:auth:*'

/** `scanStream` TÜM Node `Readable`'lar gibi tip bilgisi TAŞIMAZ — her grup Zod ile doğrulanır, `as` KULLANILMAZ. */
const scanBatchSchema = z.array(z.string())

/**
 * T-009/S8 EKLEMESİ — FAIL-CLOSED allowlist, MODÜL SABİTİ (env'den OKUNMAZ,
 * dosya başı yorumu). `flushRateLimitCounters` yalnızca bu üç loopback
 * hostname'inden birine çözülen `REDIS_URL` için çalışır.
 */
const RATE_LIMIT_FLUSH_ALLOWED_REDIS_HOSTS: ReadonlySet<string> = new Set([
  '127.0.0.1',
  '::1',
  'localhost',
])

/**
 * T-006/S8 EKLEMESİ, T-009/S8'de İKİ FAIL-CLOSED KAPI eklendi — dosya başı
 * yorumu. Kapılar Redis'e HİÇBİR komut gitmeden ÖNCE, fonksiyonun İLK
 * satırlarında çalışır.
 */
async function flushRateLimitCounters(apiEnv: ApiEnv, redisService: RedisService): Promise<void> {
  // Dosya başı yorumu — KASITLI OLARAK `process.env.NODE_ENV` (ApiEnv DEĞİL):
  // testler KENDİ senaryoları için `apiEnv.NODE_ENV`'i override EDEBİLİR
  // (ör. üretim çerez modu testleri) — bu kapı o override'dan ETKİLENMEMELİ.
  const realNodeEnv = process.env['NODE_ENV']
  if (realNodeEnv !== 'test') {
    throw new Error(
      `flushRateLimitCounters yalnızca NODE_ENV=test ortamında koşabilir — fail-closed kapı tetiklendi (ölçülen process.env.NODE_ENV: ${String(realNodeEnv)})`,
    )
  }

  const redisHost = new URL(apiEnv.REDIS_URL).hostname

  if (!RATE_LIMIT_FLUSH_ALLOWED_REDIS_HOSTS.has(redisHost)) {
    throw new Error(
      `flushRateLimitCounters yalnızca loopback Redis'e (127.0.0.1/::1/localhost) karşı koşabilir — fail-closed kapı tetiklendi (çözülen host: ${redisHost})`,
    )
  }

  // T-019/S7 EKLEMESİ (K7) — ÜÇÜNCÜ kapı: EŞZAMANLI KOŞUM TESPİTİ. Dosya başı
  // GÜNCELLEME yorumuna bkz. İKİ ÖNCEKİ kapının AKSİNE bu kapı Redis'e İKİ
  // komut gönderir (`GET`+`SET`, `platform:test-harness:run-owner` anahtarı)
  // AMA bunlar `platform:auth:*` NAMESPACE'İNİN DIŞINDADIR — SCAN+DEL'DEN
  // ÖNCE çalışır, yıkıcı adımdan ÖNCE fırlar.
  await assertSoleRunOwnership(redisService)

  const stream = redisService.client.scanStream({ match: RATE_LIMIT_KEY_SCAN_PATTERN, count: 100 })

  for await (const batch of stream) {
    const keys = scanBatchSchema.parse(batch)
    if (keys.length > 0) {
      await redisService.client.del(...keys)
    }
  }
}

export type CreateTestAppOptions = {
  /** Bellek stream'i — verilirse pino buraya yazar (AC9/AC10 NDJSON parse). */
  readonly stream?: Writable
  /** `API_ENV` provider'ının TAMAMINI override eder — `parseEnv` çağrılmaz. */
  readonly apiEnv?: ApiEnv
  /** `HEALTH_CHECKS` provider'ının TAMAMINI override eder (T-002/ST-6, AC3). */
  readonly healthChecks?: readonly HealthCheck[]
  /**
   * T-002/ST-7 EKLEMESİ (additive): teste özel controller'lar (bkz. dosya başı
   * yorumu). Verilmezse (varsayılan) davranış ÖNCEKİ sürümle BİREBİR aynıdır —
   * `AppModule` doğrudan kök modül olarak kullanılır.
   */
  readonly smokeControllers?: readonly Type<unknown>[]
  /**
   * T-015 FIX turu 2 EKLEMESİ (additive, solid'in SRP reçetesi — qa QA-3/QA-4,
   * solid SD-9): `true` verilirse `AuthPrismaClientResource`'un ÜRETİM
   * `onModuleInit`'i (gerçek `assertAuthRoleIsRestricted` DB probu, fail-closed)
   * `AuthPrismaClientResourceBootProbeFixture` İLE DEĞİŞTİRİLİR — açılış artık
   * `DATABASE_AUTH_URL`'in DOĞRULUĞUNA bağımlı DEĞİLDİR, bu yüzden istek-fazı
   * testleri bozuk bir bağlantıyı İLK SORGU anında (istek sırasında) gözlemleyebilir.
   * Verilmezse (varsayılan, `false`) davranış ÖNCEKİ sürümle BİREBİR aynıdır —
   * gerçek üretim boot kapısı devrede kalır. Üretim sınıfının KENDİSİ bu
   * seçenekten BAĞIMSIZ, DEĞİŞMEDEN kalır (fixture yorumu, ayrı dosya).
   */
  readonly bypassAuthBootProbe?: boolean
}

export type TestApp = {
  /** `TServer` açıkça `http.Server` — `supertest`'in `App` tipiyle `any` kullanmadan eşleşir. */
  readonly app: INestApplication<Server>
}

/**
 * `AppModule`'ü İTHAL EDEN, verilen controller'ları TAŞIYAN geçici bir test
 * kökü üretir. `AppModule`'ün kendisi hiçbir satırda değiştirilmez/devralınmaz
 * — yalnızca SARILIR (ST-5'in kendi duman testinde doğruladığı desen).
 */
function buildSmokeTestModule(smokeControllers: readonly Type<unknown>[]): Type<unknown> {
  class SmokeTestModule {
    /** `no-extraneous-class`'ı atlatmak İÇİN DEĞİL — bu sınıfın tek amacını
     * (AppModule'ü değiştirmeden sarmak) teşhis edilebilir kılan, okunabilir
     * bir işaretleyici. */
    readonly purpose = 'T-002/ST-7 teste özel kök modül — AppModule değişmeden controller ekler'
  }

  Module({ imports: [AppModule], controllers: [...smokeControllers] })(SmokeTestModule)

  return SmokeTestModule
}

/**
 * `AppModule` grafiğini `Test.createTestingModule` ile kurar, gerekli
 * override'ları uygular ve `app.init()` çağırır. Çağıran, dönen `app`'i
 * testin sonunda `app.close()` ile kapatmalıdır.
 */
export async function createTestApp(options: CreateTestAppOptions = {}): Promise<TestApp> {
  const rootModule =
    options.smokeControllers !== undefined && options.smokeControllers.length > 0
      ? buildSmokeTestModule(options.smokeControllers)
      : AppModule

  const moduleBuilder = Test.createTestingModule({
    imports: [rootModule],
  })

  if (options.apiEnv !== undefined) {
    moduleBuilder.overrideProvider(API_ENV).useValue(options.apiEnv)
  }

  if (options.stream !== undefined) {
    const stream = options.stream
    moduleBuilder.overrideProvider(ROOT_LOGGER).useFactory({
      factory: (env: ApiEnv): Logger => createRootLogger({ level: env.LOG_LEVEL, stream }),
      inject: [API_ENV],
    })
  }

  if (options.healthChecks !== undefined) {
    moduleBuilder.overrideProvider(HEALTH_CHECKS).useValue(options.healthChecks)
  }

  if (options.bypassAuthBootProbe === true) {
    moduleBuilder
      .overrideProvider(AuthPrismaClientResource)
      .useClass(AuthPrismaClientResourceBootProbeFixture)
  }

  // T-019 DÜZELTME TURU 4 EKLEMESİ (Q-1, kullanıcı kararı — dosya başı
  // yorumuna EKLENMEDİ, çünkü KOŞULSUZ: hiçbir opsiyon bayrağı YOK, HER
  // `createTestApp()` çağrısı bunu alır. GEREKÇE: `REDIS_CLIENT`
  // provider'ının ÜRETİM fabrikası (`redis.module.ts`) her zaman `'health'`
  // profilini (1500ms `commandTimeout`, R-A4 pinli, BİLİNÇLİ fail-fast)
  // seçer — bu PRODUCTION'da DOĞRUDUR ama test harness'ı bunu MİRAS ALINCA
  // ÖLÇÜLMÜŞ bir flake üretir (bkz. `create-test-redis-connection.ts` dosya
  // başı yorumu: `auth-flow.test.ts`/`rate-limit.test.ts`, İKİ AYRI yük
  // altında koşum, İKİSİNDE de `RATE_LIMIT_STORE_UNAVAILABLE`/"Command
  // timed out", `qa` tur 2'nin GERÇEK yük altında gözlediği İMZANIN BİREBİR
  // AYNISI). Bu override `REDIS_CLIENT`'ı test-only, DAHA TOLERANSLI bir
  // `commandTimeout`'a (4000ms, ÖLÇÜME DAYALI) sahip bir istemciyle
  // DEĞİŞTİRİR — `'health'` profilinin KENDİSİ (`buildRedisConnectionOptions`)
  // DEĞİŞMEDEN kalır, mekanik izolasyon `create-test-redis-connection.ts`'in
  // dosya başı yorumunda (dört katman). `inject` DİZİSİ `redis.module.ts`'in
  // KENDİ `redisClientProvider`'ıyla BİREBİR aynı (`API_ENV`, `ROOT_LOGGER`)
  // — `apiEnv` override edilmişse (yukarıdaki `options.apiEnv` dalı) bu
  // fabrika da O override edilmiş `REDIS_URL`'i okur, K-A4/AC6 deseniyle
  // TUTARLI.
  moduleBuilder.overrideProvider(REDIS_CLIENT).useFactory({
    factory: (env: ApiEnv, logger: Logger): Redis =>
      createTestHarnessRedisConnection(env.REDIS_URL, logger),
    inject: [API_ENV, ROOT_LOGGER],
  })

  const moduleRef = await moduleBuilder.compile()
  const app: INestApplication<Server> = moduleRef.createNestApplication()

  app.useLogger(app.get(ArkesoftNestLogger))

  await app.init()

  // T-006/S8 EKLEMESİ — dosya başı yorumu: HER test uygulaması rate-limit
  // sayaçları açısından TEMİZ başlar (çapraz dosya birikimi, ÖLÇÜLDÜ).
  // T-009/S8: `apiEnv` DI'DAN (override edilmiş olabilir, K-A4/AC6) okunur —
  // iki fail-closed kapı bu değere göre karar verir. Kapı fırlatırsa (negatif
  // testler, `create-test-app-fail-closed.test.ts`) `app` ZATEN `init()`
  // edilmiş olur — KAPATILMADAN fırlatmak DB/Redis bağlantısını SIZDIRIR;
  // bu yüzden hata burada YAKALANIR, `app.close()` ile temizlenir, SONRA
  // orijinal hata (sarmalanmadan, `catch {}` DEĞİL) yeniden fırlatılır.
  try {
    await flushRateLimitCounters(app.get<ApiEnv>(API_ENV), app.get(RedisService))
  } catch (error) {
    await app.close()
    throw error
  }

  return { app }
}
