// @arkesoft/superadmin — TwoFactorSetupController (ROADMAP v0.0.20.1,
// T-022/S4, `apps/admin/src/features/two-factor/two-factor-setup-
// controller.ts`'in BİREBİR aynısı — cross-app import yasak olduğu için
// yerel kopya; iki kopyanın BİLİNÇLİ korunması ADR-0024 Karar 6'da
// kayıtlı, ortaklaştırma v0.0.22'ye bırakıldı).
//
// DÜZELTME (ADR-0024 — canlıda bulunan hata): ÖNCEKİ sözleşmede çift-çağrı
// koruması (`hasCalledEnable`) MOUNT ÖMRÜNE bağlıydı; sayfa yenilemesi bu
// bayrağı sıfırlıyor, `enable` İKİNCİ KEZ çağrılıyor ve Better Auth YENİ bir
// TOTP sırrı üretiyordu — kullanıcının authenticator'ına okuttuğu ilk anahtar
// ÖLÜYORDU. Yeni sözleşme: `submitPassword` HER ZAMAN `get-totp-uri` ile
// BAŞLAR (sır KORUNUR, Better Auth var olan sırrı çözüp AYNI URI'yi döner);
// `enable`'a düşüş YALNIZCA sunucunun `TOTP_NOT_ENABLED` koduyla cevap
// verdiği (yani GERÇEKTEN taze bir kurulum olduğu) durumda gerçekleşir. Karar
// artık mount ömrüne değil SUNUCU DURUMUNA dayanır — sayfa yenilemesi, sekme
// çoğaltma, geri/ileri gitme ve çökme sonrası kurtarma hepsi doğru çalışır.
//
// SAF, React'TEN BAĞIMSIZ durum makinesi — "enable yalnızca gerçekten taze
// kurulumda çağrılır, tekrar gösterim get-totp-uri ile" + "verify-totp
// sonrası platform.session invalidation" davranışlarını DOM/render
// GEREKMEDEN test edilebilir kılar.
//
// `TwoFactorSetupWizard.tsx` bu sınıfı `useState`'in LAZY başlangıç değeri
// ile sarar; TÜM karar mantığı burada yaşar, bileşen yalnızca RENDER eder.
//
// DÜZELTME (T-022/S4-FIX, Orkestratör ölçtü): "Vazgeç" (`goBackToPasswordStep`)
// → şifreyi TEKRAR gönderme AYNI mount içinde `get-totp-uri`'yi bu kez
// BAŞARILI kılıyordu (sır artık kurulu), bu da `backupCodes: null`
// üretiyordu — kullanıcının BİRAZ ÖNCE `enable`'dan aldığı yedek kodlar
// EKRANDAN KAYBOLUYORDU, sayfa hiç yenilenmeden. `backupCodesCapturedFor
// Display` bunu SADECE GÖSTERİM için önbellekler — KONTROL AKIŞINA
// (`resolveTotpUriAction`, `enable` çağrılıp çağrılmayacağı) DOKUNMAZ; o
// karar HER ZAMAN sunucu durumuna dayanır (ADR-0024 Karar 2). Önbellek bu
// SINIFIN ÖRNEĞİNE bağlıdır (instance field) — `TwoFactorSetupWizard`
// controller'ı `useState`'in LAZY başlangıcıyla BİR KEZ yaratır, yani sayfa
// yenilemesi/sekme çoğaltma YENİ bir controller örneği (ve dolayısıyla BOŞ
// önbellek) demektir; ADR-0024 Karar 5'in "get-totp-uri yedek kod
// DÖNDÜRMEZ, bu sınır gizlenmeyecek" kuralı RELOAD vakasında AYNEN geçerli
// kalır.
import type { PanelError } from '../../errors/panel-error.js'
import type {
  EnableTwoFactorResult,
  GetTotpUriResult,
  VerifyTwoFactorResult,
} from '../../api/two-factor-rest.js'

export interface TwoFactorSetupDeps {
  readonly enable: (password: string) => Promise<EnableTwoFactorResult>
  readonly getTotpUri: (password: string) => Promise<GetTotpUriResult>
  readonly verifyTotp: (code: string) => Promise<VerifyTwoFactorResult>
  /** `verify-totp` BAŞARILI olduğunda BİR KEZ çağrılır (çağıran oturum/sekans verisini invalidate eder). */
  readonly onVerified: () => void
}

export type TwoFactorSetupState =
  | {
      readonly step: 'password'
      readonly isSubmitting: boolean
      readonly errorMessage: string | null
    }
  | {
      readonly step: 'totp'
      readonly totpURI: string
      /**
       * `get-totp-uri` BAŞARILI olduğunda SUNUCUDAN gelmez (ADR-0024 Karar
       * 2/5 — bu uç yedek kod DÖNDÜRMEZ). Burada görünen değer, AYNI mount
       * içinde daha önce `enable`'dan alınmış kodların SADECE GÖSTERİM
       * önbelleğidir (`backupCodesCapturedForDisplay`); önbellek boşsa
       * (reload/yeni controller) `null` — bu durumda `setupResumedNotice`
       * gösterilir.
       */
      readonly backupCodes: readonly string[] | null
      readonly isSubmitting: boolean
      readonly errorMessage: string | null
    }
  | {
      readonly step: 'backup-codes'
      readonly backupCodes: readonly string[]
    }
  | {
      readonly step: 'completed'
    }

export class TwoFactorSetupController {
  private state: TwoFactorSetupState = { step: 'password', isSubmitting: false, errorMessage: null }
  /**
   * SADECE GÖSTERİM önbelleği (T-022/S4-FIX) — `enable` başarılı olduğunda
   * doldurulur, mount ömrü (bu sınıfın örnek ömrü) boyunca kalır.
   * `resolveTotpUriAction`/`enable` çağrılıp çağrılmayacağı kararı BUNA
   * BAKMAZ — o karar HER ZAMAN sunucu durumuna (`TOTP_NOT_ENABLED` kodu)
   * dayanır (ADR-0024 Karar 2). Bu alan yalnızca `get-totp-uri` başarılı
   * döndüğünde EKRANDA NE GÖSTERİLECEĞİNİ belirler.
   */
  private backupCodesCapturedForDisplay: readonly string[] | null = null

  constructor(
    private readonly deps: TwoFactorSetupDeps,
    private readonly mapError: (error: PanelError) => string,
    private readonly onChange: (state: TwoFactorSetupState) => void,
  ) {}

  getState(): TwoFactorSetupState {
    return this.state
  }

  private setState(next: TwoFactorSetupState): void {
    this.state = next
    this.onChange(next)
  }

  /**
   * SAF karar — `get-totp-uri` hatayla sonuçlandığında `enable`'a DÜŞÜLÜP
   * düşülmeyeceğini belirler (ADR-0024 Karar 2/3). TEK koşul:
   * `error.kind === 'known' && error.code === 'TOTP_NOT_ENABLED'` —
   * `INVALID_PASSWORD` dahil başka hiçbir hata `enable`'a düşürmez, aksi
   * hâlde yanlış şifre girişi sırrı YENİDEN üretirdi.
   *
   * R-A5 — SÖZLEŞME NEDEN DEĞİŞTİ: önceki imza `(): 'enable' | 'get-totp-
   * uri'` idi ve `submitPassword`'un HANGİ REST çağrısıyla BAŞLAYACAĞINI,
   * mount ömrüne bağlı bir `hasCalledEnable` bayrağına bakarak
   * kararlaştırıyordu — sayfa yenilemesi bu bayrağı SIFIRLIYOR, `enable`
   * İKİNCİ KEZ çağrılıp Better Auth YENİ bir TOTP sırrı üretiyordu
   * (ADR-0024 Bağlam, kullanıcının canlı denemesinde bulundu). Yeni
   * sözleşme SUNUCU DURUMUNA dayanır: `submitPassword` HER ZAMAN
   * `get-totp-uri` ile BAŞLAR (mount'a bağlı bayrak YOK); bu metot artık o
   * çağrının DÖNDÜĞÜ hatayı SAF biçimde yorumlar — sayfa yenilense, sekme
   * çoğaltılsa veya geri/ileri gidilse de SONUÇ aynıdır.
   */
  resolveTotpUriAction(error: PanelError): 'enable' | 'show-error' {
    return error.kind === 'known' && error.code === 'TOTP_NOT_ENABLED' ? 'enable' : 'show-error'
  }

  /**
   * ADR-0024 Karar 2 — ÖNCE `get-totp-uri` denenir (sır KORUNUR, yedek kod
   * DÖNMEZ ⇒ `backupCodes: null`). Yalnızca `resolveTotpUriAction` 'enable'
   * derse `enable`'a düşülür (yalnızca GERÇEKTEN taze bir kurulumda — TOTP
   * henüz etkin değilken — gerçekleşir).
   */
  async submitPassword(password: string): Promise<void> {
    if (this.state.step !== 'password') {
      return
    }
    this.setState({ ...this.state, isSubmitting: true, errorMessage: null })

    const totpUriResult = await this.deps.getTotpUri(password)

    if (totpUriResult.kind === 'retrieved') {
      // SADECE GÖSTERİM — `enable` AYNI mount içinde daha önce çalıştıysa
      // (ör. "Vazgeç" ile adım 1'e dönüp şifreyi TEKRAR gönderme) alınmış
      // kodlar burada hâlâ bellekte; onları TEKRAR göster. Önbellek boşsa
      // (reload/yeni controller örneği) `null` kalır — ADR-0024 Karar 5.
      this.setState({
        step: 'totp',
        totpURI: totpUriResult.totpURI,
        backupCodes: this.backupCodesCapturedForDisplay,
        isSubmitting: false,
        errorMessage: null,
      })
      return
    }

    if (this.resolveTotpUriAction(totpUriResult.error) === 'show-error') {
      this.setState({
        step: 'password',
        isSubmitting: false,
        errorMessage: this.mapError(totpUriResult.error),
      })
      return
    }

    const enableResult = await this.deps.enable(password)

    if (enableResult.kind === 'error') {
      this.setState({
        step: 'password',
        isSubmitting: false,
        errorMessage: this.mapError(enableResult.error),
      })
      return
    }

    // SADECE GÖSTERİM önbelleğine YAZ — kontrol akışı (bu satıra NE ZAMAN
    // ulaşılacağı) yukarıdaki `resolveTotpUriAction` kararına bağlı, bu
    // satır o kararı DEĞİŞTİRMEZ; yalnızca sonraki bir `get-totp-uri`
    // tekrar gösteriminde kodları KAYBETMEMEK için saklar.
    this.backupCodesCapturedForDisplay = enableResult.backupCodes
    this.setState({
      step: 'totp',
      totpURI: enableResult.totpURI,
      backupCodes: enableResult.backupCodes,
      isSubmitting: false,
      errorMessage: null,
    })
  }

  async submitCode(code: string): Promise<void> {
    if (this.state.step !== 'totp') {
      return
    }
    const backupCodes = this.state.backupCodes
    this.setState({ ...this.state, isSubmitting: true, errorMessage: null })

    const result = await this.deps.verifyTotp(code)

    if (result.kind === 'error') {
      this.setState({
        ...this.state,
        isSubmitting: false,
        errorMessage: this.mapError(result.error),
      })
      return
    }

    this.deps.onVerified()

    // T-022/S10 FIX turu 1 (`solid` L-3) — kurulum BAŞARIYLA bittiği ANDA
    // SADECE GÖSTERİM önbelleği temizlenir: yedek kodlar artık `backup-
    // codes`/`completed` adımına TAŞINDI, bu alanın mount ömrü boyunca
    // kalmasına gerek YOK (kimlik doğrulama sırrı gerekenden uzun bellekte
    // tutulmasın). ⚠ "Vazgeç" (S4-FIX) senaryosuyla ÇAKIŞMAZ: o senaryo
    // `submitCode` hiç ÇAĞRILMADAN `goBackToPasswordStep`'e gider — bu satır
    // yalnızca `verifyTotp` BAŞARILI olduğunda çalışır, kurulum TAMAMLANMAMIŞ
    // bir geri dönüşte DOKUNULMAZ.
    this.backupCodesCapturedForDisplay = null

    if (backupCodes !== null) {
      this.setState({ step: 'backup-codes', backupCodes })
    } else {
      this.setState({ step: 'completed' })
    }
  }

  /** Kullanıcı adım 2'den (uygulama bağlama) adım 1'e (şifre) GERİ döner. */
  goBackToPasswordStep(): void {
    if (this.state.step !== 'totp') {
      return
    }
    this.setState({ step: 'password', isSubmitting: false, errorMessage: null })
  }
}
