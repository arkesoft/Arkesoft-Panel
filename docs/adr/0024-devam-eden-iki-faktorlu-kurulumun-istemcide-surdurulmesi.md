# ADR-0024 — Devam eden 2FA kurulumunun istemcide sürdürülmesi

- **Durum:** Kabul edildi
- **Tarih:** 2026-11-17
- **Karar verenler:** architect (T-022); kaynak: kullanıcının canlı denemesi (2026-11-17),
  kullanıcı kapsam kararları (ROADMAP v0.0.20.1 üçe bölündü, `apps/admin` dahil edildi)
- **İlgili versiyon:** `v0.0.20.1`

---

## Bağlam

2FA kurulum sihirbazının çift-çağrı koruması (`hasCalledEnable`) **MOUNT BAŞINADIR**:
kontrolcü `TwoFactorSetupWizard.tsx`'te `useState`'in tembel başlangıç değeriyle
kurulur. Sayfa yeniden yüklendiğinde bayrak sıfırlanır, `enable` **ikinci kez** çağrılır
ve Better Auth **yeni bir TOTP sırrı** üretir — kullanıcının QR'dan okuttuğu ilk anahtar
**ölür**.

⭐ **Hata canlıda, kullanıcının kendi denemesinde bulundu** (2026-11-17); hiçbir süit
yakalamadı, çünkü fixture'lar `enable → kod → verify` zincirini **tek sayfa
yüklemesinde** yürütüyor. ⚠ Aynı kök neden **İKİ** uygulamada var:
`apps/superadmin/.../two-factor-setup-controller.ts:51` ve
`apps/admin/.../two-factor-setup-controller.ts:64`.

ROADMAP v0.0.20.1 düzeltmeyi *"(a) sunucu sinyali + (b) kullanıcıya metin, **ikisi
birden**"* olarak yazıyordu. ⚠ Ölçüm **(a)'nın pahalı** olduğunu gösterdi: istemcinin
elindeki tek bit `platform.session`'ın `twoFactorEnabled`'ı
(`packages/trpc/src/schemas/platform.schema.ts:61`) ve o bit *"kurulum hiç başlamadı"*
ile *"`enable` çağrıldı, `verify` bekliyor"* durumlarının **İKİSİNDE DE `false`**.
Yeni bir sunucu sinyali `packages/trpc` + `apps/api` + iki frontend'i, yani
**PUBLIC API'yi** de hareket ettirirdi.

## Karar

1. **Tel sözleşmesine DOKUNULMAYACAK.** `platformSessionSchema` ve `session.me`
   çıktısına *"kurulum beklemede"* alanı **EKLENMEYECEK**; `packages/trpc` bu sürümde
   **değişmeyecek**.
2. **Sihirbaz, şifre adımında ÖNCE `POST /auth/two-factor/get-totp-uri` çağıracak**;
   ⚠ **yalnızca** yanıt `TOTP_NOT_ENABLED` koduyla başarısız olursa
   `POST /auth/two-factor/enable`'a düşecek.
   ⭐ **Ölçüm** (`better-auth@1.7.14`, `dist/plugins/two-factor/totp/index.mjs:85-114`):
   `getTOTPURI` satırı **yalnızca `userId`** ile arar, ⚠ `user.twoFactorEnabled` ve
   `twoFactor.verified` alanlarını **KONTROL ETMEZ**, ve var olan şifreli sırrı çözüp
   **AYNI URI'yi** döner. ⇒ *"`enable` çağrıldı, `verify` bekliyor"* durumunda
   **çalışır ve sırrı KORUR**.
3. ⚠ **`TOTP_NOT_ENABLED` dışındaki hiçbir hata `enable`'a düşürmeyecek** — aksi hâlde
   yanlış şifre girişi sırrı yeniden üretirdi.
4. ⚠⚠ **Literal bir sözleşme testiyle pinlenecek:** `apps/api`'de, **gerçek Better Auth
   zincirine** karşı, `twoFactor` satırı olmayan bir kullanıcı için yanıt gövdesinin
   `code === 'TOTP_NOT_ENABLED'` olduğu doğrulanacak.
   ⭐ **Bu test olmadan bir Better Auth yükseltmesi fallback'i sessizce öldürür ve
   SIFIRDAN kurulumu TAMAMEN KIRAR.**
5. **Yedek kodların tekrar gösterilemeyeceği kullanıcıya AÇIKÇA söylenecek**
   (`MESSAGES.auth.twoFactor`, **iki** uygulamada). ⚠ `get-totp-uri` yedek kod
   **DÖNDÜRMEZ**; bu sınır **gizlenmeyecek**.
6. **İki kontrolcü kopyası BİLİNÇLİ olarak korunacak**, ⭐ **tek alt görevde birlikte**
   değiştirilecek; ortaklaştırma `ROADMAP:3406` borcuyla **v0.0.22**'ye bırakılacak.

### Değerlendirilen alternatifler

| Alternatif | Neden seçilmedi |
| --- | --- |
| **(a)** `platform.session`/`session.me`'ye *"kurulum beklemede"* biti eklemek | ⚠ **PUBLIC API** birimini (`@arkesoft/trpc`) hareket ettirir, **dört** paket dokunur; ⭐ ve ölçüm aynı sonucun **SIFIR tel değişikliğiyle** elde edilebildiğini gösterdi (Karar 2) |
| **(b)** Yalnızca *"anahtar yenilendi"* metni yazmak | ⚠ **AC-1'i KARŞILAMAZ** (*"reload sonrası `secret=` EŞİT"*); kullanıcının authenticator'ındaki ilk kayıt **yine ölür** |
| Kontrolcü durumunu `sessionStorage`'a yazmak | ⚠⚠ TOTP **sırrı/URI'si istemci deposuna** yazılmış olurdu — CLAUDE.md §4'ün **sır saklama yasağı** |
| İki kontrolcüyü yeni bir pakette ortaklaştırmak | `packages/ui` **veri çekme yapamaz** (CLAUDE.md §3), `apps/*`→`apps/*` **yasak** ⇒ yeni paket + **beş** destek modülünün taşınması gerekir; ⭐ bu sürümden **büyük** ve CI kırmızısının **atfını belirsizleştirir** |

## Sonuçlar

### Olumlu

- ⭐ **PUBLIC API değişmiyor** ⇒ sürüm etkisi **`patch`**, `pnpm test:contract`'ın
  (v0.0.22) ilk snapshot'ı **etkilenmiyor**.
- Kapsam **dört paketten iki frontend'e** iniyor.
- Sır artık sayfa yüklemeleri arasında **KARARLI**; kullanıcı QR'ı **bir kez** okutuyor.
- ⭐⭐ *"`enable` yalnızca bir kez"* kuralı **mount ömrüne değil SUNUCU DURUMUNA**
  dayanıyor — yani **sekme çoğaltma, geri/ileri ve çökme sonrası kurtarma** da doğru
  çalışıyor.

### Olumsuz ve kabul edilen maliyetler

- ⚠ **Gerçekten taze** her kurulum denemesi **BİR ekstra istek** harcıyor ve `enable`
  ile `get-totp-uri` **AYNI `login` oran-sınırı kovasında**
  (`rate-limit.policy.ts:217-239`). ⭐ **Reload yolunda prob başarılı** olduğu için
  ek maliyet **YOK**. Karşı önlem: e2e bütçe kontrolü (`qa`).
- ⚠ **Sağlayıcıya özgü bir hata kodu literaline bağımlılık** doğuyor.
  Karşı önlem: **Karar 4'ün sözleşme testi**.
- ⚠ Yeniden gösterimde **yedek kodlar gelmiyor**. Karşı önlem: Karar 5'in metni.
- ⚠ **İki kontrolcü kopyası kalıyor.** Karşı önlem: `ROADMAP:3406` borcu
  **`low` → `medium`** yükseltiliyor, vade **v0.0.22**.

### Etkilenen sonraki kararlar

- **v0.0.22**'nin panel ortak katmanı kararı: ortaklaştırılacak birim artık yalnızca
  kontrolcü **değil**, `PanelError` + REST istemcisi + hata normalleştirici **üçlüsüdür**.
- **ADR-0018** (iki faktörlü doğrulama) **tamamlanıyor, değiştirilmiyor**: oradaki
  *"`enable` bir kez çağrılır"* kuralının **ZORLAYICISI mount ömrü değil SUNUCU
  DURUMUDUR**.

## Gözden geçirme koşulları

1. Better Auth, `get-totp-uri`'ye `twoFactorEnabled`/`verified` **koşulu eklerse** veya
   `TOTP_NOT_ENABLED` kodunu **yeniden adlandırırsa** (⭐ Karar 4'ün testi **kırmızı
   verir** — test dosyası:
   `apps/api/src/__tests__/two-factor-get-totp-uri-contract.test.ts`).
2. `platform.session`/`session.me` **başka bir gerekçeyle** kurulum durumu taşımaya
   başlarsa — o zaman prob **gereksizleşir** ve Karar 2 sadeleştirilebilir.
3. **Yedek kodların yeniden gösterimi** ürün gereksinimi hâline gelirse.
