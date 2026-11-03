// @arkesoft/storefront — storefrontEnv: K17'nin açılış-kritik eager
// `process.env` okuma noktası (ROADMAP v0.0.8, T-009/S6, architect K17).
// ⚠ T-011/S2'den itibaren bu TEK değil — `src/**` altında ikinci bir okuma
// noktası var; ayrıntı aşağıdaki `process.env` okuma noktaları envanterinde.
//
// Dış dünyadan gelen her veri Zod ile parse edilir (CLAUDE.md §4). Ortam
// değişkenleri de dış veridir — bu modül YÜKLENİRKEN (import zamanında) BİR
// KEZ parse edilir; geçersizse süreç AÇILIŞTA durur (`apps/api/src/config/
// api-env.ts`'in fail-fast DESENİ emsal alındı — aşağıdaki not bu desenin
// NEDEN birebir `@arkesoft/config/env`'in `parseEnv`/`EnvValidationError`'ını
// YENİDEN KULLANMADIĞINI açıklıyor).
//
// ⚠ BAĞIMLILIK KARARI (RİSKLER'de de işaretli): `@arkesoft/config`,
// `apps/storefront/package.json`'da (S3'ün dosyası — DOKUNULMADI, bu alt
// görevin DOKUNMA kısıtı) `devDependencies` altında, `dependencies` altında
// DEĞİL. Üretim imajı ileride `pnpm install --prod` ile devDependencies'i
// BUDARSA, bu AÇILIŞ-KRİTİK yoldan `@arkesoft/config/env`'i import etmek
// süreci sessizce kırardı (modül bulunamaz). Bu yüzden `parseEnv`/
// `EnvValidationError` BURADA TEKRAR KULLANILMIYOR — yalnızca AYNI
// davranışın (tek seferlik Zod parse, değer sızdırmayan hata mesajı, açılışta
// fail-fast) BAĞIMSIZ, küçük bir kopyası. `apps/storefront` bu paketin tek
// tüketicisi değilse ve ileride gerçek bir Dockerfile yazılırsa, devops bu
// kararı (`@arkesoft/config`'i `dependencies`'e taşımak vs. bu bağımsız
// kopyayı sürdürmek) gözden geçirmeli.
//
// `process.env`, ÜRETİM KODUNDA (`__tests__/**` hariç — oradaki test
// dosyaları da `src/**` altındadır ve meşru kurulum için `process.env`'i
// okur/yazar, ama bu envanterin kapsamı dışıdır) `src/**` altında iki
// dosyada okunur: bu dosyada (K17, açılış-kritik eager parse — HER
// `command` dalında çalışır) ve `root-env-integration.ts`'te (YALNIZCA
// `dev` dalında — önce `loadEnvFile` ile YAZAR, sonra AYNI
// `parseStorefrontEnv` ile OKUR; `command !== 'dev'` olduğunda o dosya
// `process.env`'e hiç dokunmaz).
//
// ⚠ `eslint.config.mjs`'teki `no-restricted-globals` kuralı bu okumayı
// MEKANİK olarak ZORLAMAZ — adı da gösteriyor (*restricted*, *required*
// değil): yalnızca `src/components/**` kapsamında `process`/`Buffer`/
// `__dirname`/`__filename`'in DOĞRUDAN kullanımını YASAKLAR. Kapsam
// DIŞINDA kalan yollar — `src/pages/**`, `src/middleware.ts`,
// `src/layouts/**`, `src/lib/**` (bu dosya dahil) — kuralın etki alanında
// DEĞİL; bu yollardan birine `process.env[...]` eklenirse lint bunu
// YAKALAMAZ. Bu yüzden yukarıdaki envanter lint tarafından pinlenmiyor —
// elle (gözden geçirerek) güncel tutulur.
//
// ⚠ T-011/S2 (orkestratör düzeltmesi): şema ve saf ayrıştırıcı
// (`parseStorefrontEnv`) `storefront-env-schema.ts`'e TAŞINDI — o dosya
// YAN ETKİSİZ (içe aktarılması `process.env`'e dokunmaz), `root-env-
// integration.ts`'in `dev`-only hook'u bu yüzden ONU statik import edip
// `build`/`preview`/`sync` dallarını kazara TETİKLEMEDEN kullanabiliyor.
//
// ⚠ T-011/S2 DÜZELTME TUR 2 (solid M2): `parseStorefrontEnv` ve `StorefrontEnv`
// tipi BURADAN artık re-export EDİLMİYOR. Ölçüldü (`rg`, repo çapında, hem
// `apps/**` hem `packages/**`): bu ikisini `storefront-env.js` ÜZERİNDEN
// ithal eden SIFIR tüketici var — tüm tüketiciler (`root-env-integration.ts`,
// bu dosyanın kendisi) zaten doğrudan `storefront-env-schema.js`'ten alıyor.
// Re-export'u TUTMAK şu tuzağı canlı tutuyordu: `root-env-integration.ts`
// bir gün bu dosyadan `parseStorefrontEnv` almaya "sadeleştirilseydi", bu
// dosyanın modül-yükleme-anı eager `parseStorefrontEnv(process.env)`
// çağrısı (K17) o dosyayı HER `command` dalında (`build`/`preview`/`sync`
// dahil) tetikler ve AC8'i ihlal ederdi. Yalnızca `storefrontEnvSchema` —
// GERİYE UYUMLULUK için (ölçülen tek tüketici:
// `__tests__/storefront-env.test.ts`) — AYNI isimle buradan da erişilebilir
// tutuluyor.
//
// ⚠ F1 (security + solid, tur 3 — ikisi bağımsız ölçtü): yukarıdaki satır
// yalnızca `storefrontEnvSchema`'yı re-export ettiği için bu dosyayı yan
// etkisiz bir "şema barrel'ı" SANMA — DEĞİL. ES modül anlambilimi bir
// modülden TEK bir adı (sadece bunu) ithal etmeyi bile o modülün TÜM üst
// seviye kodunu DEĞERLENDİRMEYE zorlar; yani `storefrontEnvSchema`'yı
// buradan ithal etmek aşağıdaki (:70) açılış-kritik eager
// `parseStorefrontEnv(process.env)` çağrısını DA tetikler. Ölçüldü:
// `__tests__/storefront-env.test.ts`'in `storefrontEnvSchema` describe
// bloğundaki (şema-only, parse MANTIĞINI test eden) HER test, bu dosyayı
// ithal etmeden ÖNCE zorunlu olarak `setValidEnv()` çalıştırıyor — aksi
// halde ambient test ortamında eksik değişkenler yüzünden import'un
// kendisi fırlardı. Yan etkisiz şema/ayrıştırıcı erişimi isteyen bu
// dosyadan DEĞİL, `storefront-env-schema.js`'i DOĞRUDAN ithal etmeli.
export { storefrontEnvSchema } from './storefront-env-schema.js'

import { parseStorefrontEnv } from './storefront-env-schema.js'
import type { StorefrontEnv } from './storefront-env-schema.js'

/** Modül YÜKLENİRKEN bir kez parse edilir (K17) — tüketiciler bu sabiti import eder. */
export const storefrontEnv: StorefrontEnv = parseStorefrontEnv(process.env)
