// @arkesoft/errors — Vitest yapılandırması (ROADMAP v0.0.4, T-002/ST-3b)
//
// Bu paket herhangi bir dış kaynağa (DB, Redis) bağlanmaz — tüm testler saf
// fonksiyon/sınıf birim testidir. packages/db'deki seri koşum kısıtının (V6/A-V14)
// burada karşılığı yok; varsayılan Vitest paralellik davranışı yeterli.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
    // ROADMAP v0.0.7 (T-008/S1, borç 1442): paket-yerel `fsModuleCachePath`.
    // Vitest'in VARSAYILANI ("node_modules/.vitest-cache") paketlerin
    // kendi dizinine göre DEĞİL, otomatik algılanan ÇALIŞMA ALANI KÖKÜNE
    // göre çözülüyor (vitest'in kendi tipi: "projects that don't override
    // it fall back to the root's cache directory") — bu yüzden ÖLÇÜLDÜ:
    // top-level Vite `cacheDir` seçeneği (ilk denenen, YANLIŞ) bu paylaşımı
    // DEĞİŞTİRMİYOR (ayrı bir ayar — Vite'ın bağımlılık ön-paketleme
    // önbelleği). Birden fazla paket EŞZAMANLI bu paylaşılan dizini silip
    // yeniden oluşturduğunda ENOTEMPTY doğuyordu — v0.0.7 kök önbelleği
    // paylaşan yeni bir test koşan paket (`packages/ui`) ekleyerek bu
    // yarışın olasılığını artırdı. Çözüm: `test.fsModuleCachePath`'i paket
    // kendi dizinine (`node_modules/.vitest-cache`, bu paketin cwd'sine
    // göre) sabitler — paylaşılan tek dizin kalkar (ÖLÇÜLDÜ: `find` ile
    // paket-yerel dizinin oluştuğu doğrulandı, devops raporunda kanıt).
    fsModuleCachePath: 'node_modules/.vitest-cache',
  },
})
