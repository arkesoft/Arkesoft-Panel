#!/usr/bin/env bash
# @arkesoft — görsel regresyon koşucusu (ROADMAP v0.0.19, T-020/S6,
# ADR-0022 Karar 4/5).
#
# AMAÇ: `pnpm test:visual` / `pnpm test:visual:update` BU script'i çağırır
# (`turbo run test:visual` → `@arkesoft/storefront#test:visual` →
# `bash ../../scripts/run-visual.sh`). Görevi:
#   1. `@arkesoft/storefront`'u ÜRETİM modunda derler (`astro build`).
#   2. Üretilen `dist/server/entry.mjs`'i HOST makinede (Docker DIŞINDA)
#      açık kabuk değişkenleriyle (R-11: `APP_BASE_DOMAIN`/
#      `STOREFRONT_API_BASE_URL` — `.env`'E YAZILMAZ) başlatır ve sağlıklı
#      olduğunu doğrular.
#   3. `pnpm-workspace.yaml`'daki `@playwright/test` catalog sürümüne
#      PİNLİ Playwright Docker imajını (ADR Karar 4) kullanarak
#      `storefront-visual-desktop`/`storefront-visual-mobile`
#      projelerini KONTEYNER İÇİNDE çalıştırır — "yerelde kırmızı = CI'da
#      kırmızı" tanım gereği doğru olsun diye YEREL koşum da BU imajın
#      dışına ÇIKMAZ.
#   4. HOST sunucusunu (başarı/başarısızlık farketmeksizin) KAPATIR.
#
# ⚠⚠ `exit 0` İLE SESSİZCE GEÇMEK KESİN YASAK (ADR'nin "ön yetkilendirilmiş
# geri çekilme" maddesi) — Docker/host-gateway kurulamazsa bu script
# GÜRÜLTÜLÜ (çıkış kodu ≠ 0) bir Türkçe teşhis ile başarısız olur ve
# `AC-8`/`AC-9` kanıtının CI'da (`S9`) üretileceğini SÖYLER; sessiz
# yanlış-yeşil ÜRETMEZ.
#
# ⚠⚠ BRIEF'TE OLMAYAN, BU ALT GÖREVDE ÖLÇÜLMÜŞ BULGU (bkz. `apps/storefront/
# e2e/visual/visual-port.ts` dosya başı yorumu, AYRINTILI ölçüm): Chromium
# `*.localhost` ana bilgisayar adlarını KENDİ dahili döngüsel-adres
# kısayoluyla çözer, konteynerin `/etc/hosts`'una `--add-host … host-
# gateway` ile eklenen GERÇEK host-gateway IP'sini BAYPAS EDER. Bu script
# bu yüzden host-gateway IP'sini AYRI bir adımda (adım 3) ÇÖZER ve
# `ARKESOFT_STOREFRONT_VISUAL_HOST_GATEWAY_IP` ortam değişkeniyle test
# konteynerine GEÇİRİR — `playwright.config.ts` bunu Chromium
# `--host-resolver-rules` bayrağına ÇEVİRİR.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STOREFRONT_DIR="$REPO_ROOT/apps/storefront"

# ⚠ CWD'ye GÜVENİLMEZ (AGENT_BASELINE §4 ders 4'ün AYNI disiplini) — bu
# script hangi paketin `package.json`'ından (`cd apps/storefront && bash
# ../../scripts/run-visual.sh`) ya da kök dizinden çağrılırsa çağrılsın
# AYNI davranır.
cd "$REPO_ROOT"

MODE="test"
for arg in "$@"; do
  case "$arg" in
    --update)
      MODE="update"
      ;;
    *)
      echo "run-visual.sh: tanınmayan argüman: $arg (desteklenen: --update)" >&2
      exit 1
      ;;
  esac
done

log() {
  echo "[run-visual.sh] $1"
}

fail() {
  echo "" >&2
  echo "⚠⚠ [run-visual.sh] GÖRSEL REGRESYON KOŞUMU BAŞARISIZ (gürültülü, bilinçli — ADR-0022'nin 'exit 0 ile sessizce geçme YASAK' maddesi):" >&2
  echo "    $1" >&2
  echo "" >&2
  echo "    Geçerli alternatif: AC-8/AC-9 kanıtı CI'da (T-020/S9, '.github/workflows/ci.yml'in 'e2e' job'u) üretilir." >&2
  echo "    Bu makinede görsel testler koşturulamıyor; devops raporuna 'geri çekilme' olarak işlendi." >&2
  exit 1
}

# ───────────────────────────────────────────────────────────────────────
# ADIM 0 — ön koşullar: docker CLI + daemon.
# ───────────────────────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  fail "docker CLI bulunamadı — ADR-0022 Karar 4 görsel regresyon için Docker'ı ÖN KOŞUL sayıyor."
fi

if ! docker info >/dev/null 2>&1; then
  fail "docker daemon'a erişilemiyor (\`docker info\` başarısız) — Docker Desktop/daemon çalışıyor mu kontrol edin."
fi

# ───────────────────────────────────────────────────────────────────────
# ADIM 1 — imaj etiketini `pnpm-workspace.yaml` catalog sürümüne PİN'le
# (ADR Karar 4: "etiket @playwright/test catalog sürümüne pinli").
# ───────────────────────────────────────────────────────────────────────
PLAYWRIGHT_CATALOG_VERSION="$(
  grep -E "^[[:space:]]*'@playwright/test':[[:space:]]*[0-9]+\.[0-9]+\.[0-9]+" "$REPO_ROOT/pnpm-workspace.yaml" \
    | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' \
    | head -n 1
)"

if [ -z "$PLAYWRIGHT_CATALOG_VERSION" ]; then
  fail "pnpm-workspace.yaml içinde '@playwright/test' catalog sürümü bulunamadı — imaj etiketi PİNLENEMEDİ."
fi

INSTALLED_PLAYWRIGHT_VERSION="$(node -p "require('$STOREFRONT_DIR/node_modules/@playwright/test/package.json').version" 2>/dev/null || true)"
if [ -n "$INSTALLED_PLAYWRIGHT_VERSION" ] && [ "$INSTALLED_PLAYWRIGHT_VERSION" != "$PLAYWRIGHT_CATALOG_VERSION" ]; then
  fail "pnpm-workspace.yaml catalog sürümü ($PLAYWRIGHT_CATALOG_VERSION) kurulu @playwright/test sürümüyle ($INSTALLED_PLAYWRIGHT_VERSION) UYUŞMUYOR — 'pnpm install' gerekebilir."
fi

PLAYWRIGHT_IMAGE="mcr.microsoft.com/playwright:v${PLAYWRIGHT_CATALOG_VERSION}-noble"
log "Pinli Playwright imajı: $PLAYWRIGHT_IMAGE (catalog sürümü: $PLAYWRIGHT_CATALOG_VERSION)"

# ───────────────────────────────────────────────────────────────────────
# ADIM 2 — imajı çek, indirme süresini ÖLÇ (R-13: >5 dk ⇒ Orkestratöre
# bildirim gerektirir, bu script KENDİ kararını VERMEZ — yalnızca ÖLÇER ve
# UYARIR).
# ───────────────────────────────────────────────────────────────────────
PULL_START_EPOCH=$(date +%s)
if ! docker pull "$PLAYWRIGHT_IMAGE" >/tmp/arkesoft-run-visual-pull.log 2>&1; then
  cat /tmp/arkesoft-run-visual-pull.log >&2
  fail "'docker pull $PLAYWRIGHT_IMAGE' başarısız oldu (ağ/erişim sorunu olabilir)."
fi
PULL_END_EPOCH=$(date +%s)
PULL_SECONDS=$((PULL_END_EPOCH - PULL_START_EPOCH))
log "İmaj indirme/doğrulama süresi: ${PULL_SECONDS}s"
if [ "$PULL_SECONDS" -gt 300 ]; then
  log "⚠⚠ R-13: imaj indirme 5 dakikayı AŞTI (${PULL_SECONDS}s) — bu, bu script'in kendi başına karar vereceği bir durum DEĞİL; devops raporu bunu Orkestratöre BİLDİRMEK ZORUNDADIR."
fi

# ───────────────────────────────────────────────────────────────────────
# ADIM 3 — host-gateway IP'sini çöz (bkz. dosya başı "BRIEF'TE OLMAYAN
# BULGU" notu). Çözülemezse bu, host-gateway köprüsünün bu makinede
# KURULAMADIĞI anlamına gelir ⇒ ÖN YETKİLENDİRİLMİŞ GERİ ÇEKİLME tetiklenir.
# ───────────────────────────────────────────────────────────────────────
GATEWAY_SENTINEL_HOST="arkesoft-host-gateway.internal"
# ⚠ ÖLÇÜLDÜ: `getent hosts` bu konteynerde (Docker Desktop macOS) BAZEN
# yalnızca IPv6 host-gateway adresini döndürür (sıralama deterministik
# DEĞİL) — `getent ahostsv4` AÇIKÇA IPv4 ailesini ister, GÜVENİLİR.
HOST_GATEWAY_IP="$(
  docker run --rm \
    --add-host "${GATEWAY_SENTINEL_HOST}:host-gateway" \
    "$PLAYWRIGHT_IMAGE" \
    getent ahostsv4 "$GATEWAY_SENTINEL_HOST" 2>/dev/null \
    | awk '{print $1}' \
    | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' \
    | head -n 1 \
    || true
)"

if [ -z "$HOST_GATEWAY_IP" ]; then
  fail "host-gateway köprüsü bu makinede kurulamadı (konteynerden host'a IPv4 adresi ÇÖZÜLEMEDİ) — ADR-0022'nin geri çekilme maddesi: görsel testler bu makinede YALNIZCA Linux/Docker host-gateway destekleyen ortamda çalışır."
fi
log "Host-gateway IPv4 adresi: $HOST_GATEWAY_IP"

# ───────────────────────────────────────────────────────────────────────
# ADIM 4 — üretim derlemesi (ADR Karar 5: astro dev DEĞİL).
# ⚠⚠ R-G (po) ÖLÇÜLDÜ VE ÇÜRÜTÜLDÜ (devops, bu alt görev — ayrıntı
# `turbo.json`'ın `test:visual` görevindeki NOTTA): `npx turbo run
# test:visual --dry=json` görev grafiğinde `@arkesoft/storefront#build`
# HİÇ YOK — `dependsOn: ["^build", "generate"]` yalnızca BAĞIMLI paketleri
# derler, bu paketin KENDİ `astro build`'ini DEĞİL. Bu satır tek `astro
# build` çağrısıdır (TEK doğruluk kaynağı) — "çift derleme" riski
# GERÇEKLEŞMİYOR.
# ───────────────────────────────────────────────────────────────────────
log "Üretim derlemesi başlıyor (astro build)…"
BUILD_START_EPOCH=$(date +%s)
pnpm --filter @arkesoft/storefront build
BUILD_END_EPOCH=$(date +%s)
log "Derleme süresi: $((BUILD_END_EPOCH - BUILD_START_EPOCH))s"

if [ ! -f "$STOREFRONT_DIR/dist/server/entry.mjs" ]; then
  fail "'astro build' sonrası 'dist/server/entry.mjs' bulunamadı — derleme beklenenden farklı bir çıktı üretti."
fi

# ───────────────────────────────────────────────────────────────────────
# ADIM 5 — üretim sunucusunu HOST makinede başlat (R-11: APP_BASE_DOMAIN /
# STOREFRONT_API_BASE_URL kabuk değişkeniyle AÇIKÇA — .env'E YAZILMAZ).
# ⚠ S3'ün ölçtüğü tuzak: kök `.env`'deki `STOREFRONT_API_BASE_URL=http://
# 127.0.0.1:3000` API'nin GERÇEK portuyla (3100) UYUŞMUYOR — bu script bu
# yüzden kendi varsayılanını (3100) kullanır, çağıran override edebilir.
# ───────────────────────────────────────────────────────────────────────
VISUAL_PORT="${ARKESOFT_STOREFRONT_VISUAL_PORT:-4322}"
APP_BASE_DOMAIN_FOR_VISUAL="${APP_BASE_DOMAIN:-arkesoft.localhost}"
STOREFRONT_API_BASE_URL_FOR_VISUAL="${STOREFRONT_API_BASE_URL_OVERRIDE:-http://127.0.0.1:3100}"

log "Üretim sunucusu başlatılıyor — PORT=$VISUAL_PORT APP_BASE_DOMAIN=$APP_BASE_DOMAIN_FOR_VISUAL STOREFRONT_API_BASE_URL=$STOREFRONT_API_BASE_URL_FOR_VISUAL"

# ⚠⚠ BRIEF'TE OLMAYAN, BU ALT GÖREVDE ÖLÇÜLMÜŞ ÜÇÜNCÜ BULGU: `e2e/global-
# setup.ts` (DEĞİŞTİRİLMEDİ) `STOREFRONT_API_BASE_URL`'i KONTEYNER İÇİNDE
# de okur (API hazırlık probu Playwright'ın KENDİ sürecinde, webServer'dan
# BAĞIMSIZ çalışır — bkz. storefront-theme.spec.ts emsali) — `127.0.0.1`
# konteynerin KENDİ loopback'i olduğu için bu URL konteyner İÇİN AYRI,
# host-gateway sentinel'ine haritalanmış bir biçimde VERİLMEK ZORUNDADIR.
API_PORT_FOR_VISUAL="$(node -p "new URL('$STOREFRONT_API_BASE_URL_FOR_VISUAL').port || 80")"
STOREFRONT_API_BASE_URL_FOR_CONTAINER="http://${GATEWAY_SENTINEL_HOST}:${API_PORT_FOR_VISUAL}"

SERVER_LOG="$(mktemp -t arkesoft-visual-server.XXXXXX.log)"
# ⚠⚠ BRIEF'TE OLMAYAN, BU ALT GÖREVDE ÖLÇÜLMÜŞ DÖRDÜNCÜ BULGU (ÖNEMLİ,
# AC-8'in KENDİSİNİ SESSİZCE GEÇERSİZ KILIYORDU): alt kabuk `(cd … && node
# …) &` biçiminde başlatılırsa `$!` SUBSHELL'in pid'ini yakalar, `node`
# süreci subshell'in İÇİNDE ayrı bir ÇOCUK olarak doğar (`exec` OLMADAN).
# `kill $SERVER_PID` bu durumda yalnızca SUBSHELL'i öldürür — `node` süreci
# init'e REPARENT olup ÇALIŞMAYA DEVAM eder (ÖLÇÜLDÜ: `lsof -iTCP:<port>`
# bir SONRAKİ koşumdan SONRA bile AYNI pid'i gösterdi). Sonuç: her "yeni"
# koşum aslında İLK (artık) sunucuya karşı test ediyordu — `astro build`
# yeniden çalışsa BİLE sunucu YENİDEN BAŞLATILMADIĞI için YENİ bundle HİÇ
# devreye girmiyordu (AC-8'in renk mutasyonu bu yüzden İLK denemede
# SESSİZCE YEŞİL kaldı). Düzeltme: `exec` — subshell'in PROCESS İMAJI
# `node` ile DEĞİŞTİRİLİR, `$!` ARTIK GERÇEK `node` pid'idir, `kill` onu
# DOĞRUDAN sonlandırır.
(
  cd "$STOREFRONT_DIR" && \
  exec env \
    PORT="$VISUAL_PORT" \
    HOST=0.0.0.0 \
    APP_BASE_DOMAIN="$APP_BASE_DOMAIN_FOR_VISUAL" \
    STOREFRONT_API_BASE_URL="$STOREFRONT_API_BASE_URL_FOR_VISUAL" \
    node dist/server/entry.mjs
) >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

cleanup() {
  if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    log "Üretim sunucusu (pid $SERVER_PID) kapatılıyor…"
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

READY=0
for _ in $(seq 1 30); do
  if curl -s -o /dev/null -H "Host: demo-magaza.arkesoft.localhost:${VISUAL_PORT}" "http://127.0.0.1:${VISUAL_PORT}/" -w '%{http_code}' 2>/dev/null | grep -q '^200$'; then
    READY=1
    break
  fi
  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if [ "$READY" != "1" ]; then
  echo "--- sunucu günlüğü ($SERVER_LOG) ---" >&2
  cat "$SERVER_LOG" >&2 || true
  fail "Üretim sunucusu ${VISUAL_PORT} portunda sağlıklı hâle gelmedi (30 deneme × 0.5s)."
fi
log "Üretim sunucusu sağlıklı (http://demo-magaza.arkesoft.localhost:${VISUAL_PORT}/ → 200)."

# ───────────────────────────────────────────────────────────────────────
# ADIM 6 — konteyner içinde Playwright'ı çalıştır.
# ───────────────────────────────────────────────────────────────────────
PLAYWRIGHT_ARGS=(test --project=storefront-visual-desktop --project=storefront-visual-mobile)
if [ "$MODE" = "update" ]; then
  PLAYWRIGHT_ARGS+=(--update-snapshots)
fi

log "Konteyner içinde Playwright koşuluyor (${PLAYWRIGHT_ARGS[*]})…"
set +e
docker run --rm \
  --add-host "demo-magaza.arkesoft.localhost:host-gateway" \
  --add-host "yok.arkesoft.localhost:host-gateway" \
  --add-host "${GATEWAY_SENTINEL_HOST}:host-gateway" \
  -v "$REPO_ROOT:/work" \
  -w "/work/apps/storefront" \
  -e "ARKESOFT_STOREFRONT_VISUAL_RUN=1" \
  -e "ARKESOFT_STOREFRONT_VISUAL_PORT=${VISUAL_PORT}" \
  -e "ARKESOFT_STOREFRONT_VISUAL_HOST_GATEWAY_IP=${HOST_GATEWAY_IP}" \
  -e "STOREFRONT_API_BASE_URL=${STOREFRONT_API_BASE_URL_FOR_CONTAINER}" \
  -e "APP_BASE_DOMAIN=${APP_BASE_DOMAIN_FOR_VISUAL}" \
  -e "CI=${CI:-}" \
  "$PLAYWRIGHT_IMAGE" \
  npx playwright "${PLAYWRIGHT_ARGS[@]}"
PLAYWRIGHT_EXIT_CODE=$?
set -e

log "Playwright çıkış kodu: $PLAYWRIGHT_EXIT_CODE"
exit "$PLAYWRIGHT_EXIT_CODE"
