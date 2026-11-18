// @arkesoft/api — RegistrationReadPort adaptörü (ROADMAP v0.1.0, T-019/S9a)
//
// Port `packages/trpc`'de BİLDİRİLİR (`ports/registration-read.port.ts`),
// burada UYGULANIR. `MembershipReadPortAdapter`'ın AYNI SINIR NESNESİ deseni
// — bu dosya İŞ MANTIĞI TAŞIMAZ, `RegistrationService`'e DELEGE EDER. Gerekçe
// `MemberWritePortAdapter`'ın BİREBİR notu: adaptör bir sınır nesnesidir,
// servis HTTP-dışı bir çağırandan (ileride bir kuyruk işi) da çağrılabilir
// kalır.

import { Inject, Injectable } from '@nestjs/common'
import type { OnboardingChecklist, SlugAvailability } from '@arkesoft/trpc'
import type { RegistrationReadPort } from '@arkesoft/trpc/server'

import { RegistrationService } from '../../registration/registration.service.js'

@Injectable()
export class RegistrationReadPortAdapter implements RegistrationReadPort {
  constructor(@Inject(RegistrationService) private readonly registration: RegistrationService) {}

  checkSlugAvailability(slug: string): Promise<SlugAvailability> {
    return this.registration.checkSlugAvailability(slug)
  }

  onboardingChecklist(actorUserId: string, slug: string): Promise<OnboardingChecklist> {
    return this.registration.onboardingChecklist(actorUserId, slug)
  }
}
