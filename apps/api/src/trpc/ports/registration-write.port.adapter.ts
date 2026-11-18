// @arkesoft/api — RegistrationWritePort adaptörü (ROADMAP v0.1.0, T-019/S9a)
//
// Port `packages/trpc`'de BİLDİRİLİR (`ports/registration-write.port.ts`),
// burada UYGULANIR. `MemberWritePortAdapter`'ın AYNI SINIR NESNESİ deseni —
// bu dosya İŞ MANTIĞI TAŞIMAZ (`withNewTenant()` tek transaction'ı, slug
// doğrulaması, kabul oracle'ı — HEPSİ `RegistrationService`'te).

import { Inject, Injectable } from '@nestjs/common'
import type { CreateTenantInput, CreateTenantResult } from '@arkesoft/trpc'
import type { RegistrationWritePort } from '@arkesoft/trpc/server'

import { RegistrationService } from '../../registration/registration.service.js'

@Injectable()
export class RegistrationWritePortAdapter implements RegistrationWritePort {
  constructor(@Inject(RegistrationService) private readonly registration: RegistrationService) {}

  createTenant(actorUserId: string, input: CreateTenantInput): Promise<CreateTenantResult> {
    return this.registration.createTenant(actorUserId, input)
  }
}
