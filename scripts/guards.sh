#!/usr/bin/env bash
# @arkesoft — yerel "guards" kapısı (ROADMAP T-016/S12, K-A14).
#
# AMAÇ: `.github/workflows/ci.yml`'deki "guards" job'u BUGÜN yalnızca CI'da
# koşuyor; yerel beşli kapı (lint/typecheck/test/test:isolation/build) onu
# HİÇ görmüyor. Bu, T-014 ve T-015'te AYNI mekanik hatayı (bir jetonun bir
# yorumda/JSDoc'ta BİTİŞİK yazılması) ÜÇ KEZ üretti — yazılı kural ve emsal
# bunu engellemedi, yalnızca MEKANİK yerel kapı engeller.
#
# Bu script "guards" job'unun MEKANİK (ağ gerektirmeyen, grep/dosya
# varlığı/sayım tabanlı, deterministik) adımlarını yerelde TEKRARLAR. Mantığın
# ÇOĞU hâlâ BİLİNÇLİ KOPYADIR (AC13, AC5, AC8, AC4, sahte-yeşil dedektörleri,
# scripts/ tip+lint kontrolü, sürüm tutarlılığı) — CI tarafı `.github/**`
# olduğu için bu adımların GÖVDESİ oraya taşınamaz (devops ajanı `.github/**`'e
# yazamaz; bu script yalnızca OKUYABİLİR). TEK İSTİSNA (T-016 fix turu 1,
# solid M-2): "run bloğu içi şablon ifadesi yasağı" kontrolünün 34 satırlık
# awk programı artık KOPYA DEĞİL — `scripts/check-run-block-template-
# expression.sh`'e taşındı ve `.github/workflows/ci.yml`'nin aynı adımı DA bu
# dosyayı çağırıyor (ci.yml'deki değişiklik DAR ve KOŞULLU: yalnızca bu TEK
# adımın awk gövdesi değiştirildi, hiçbir kontrol kaldırılmadı/zayıflatılmadı
# — bkz. devops T-016 fix turu 1 raporu, "KANIT" bölümü). Veri kaynakları
# (`.github/ci-*.txt`) zaten KOPYALANMIYOR — doğrudan okunur, bu yüzden
# listeler güncellenince İKİ YERİ de otomatik etkiler. Hedef küme türetimi
# (`find .github/workflows .github/actions ...`) de artık bu script İÇİNDE
# TEK YERDE yaşıyor (önceden AC13 ve run-block kontrolü KENDİ BAĞIMSIZ
# `find`'ını koşturuyordu — iki ayrı kopya sapma riski taşıyordu; solid ölçtü,
# `fail_if_targets_empty` ve `workflow_action_targets` ile kapatıldı). Geri
# kalan (bilinçli kopya olarak duran) kontroller için sapma riski hâlâ GEÇERLİ
# — her değişiklikte iki dosya elle senkron tutulmalı.
#
# KAPSAM DIŞI (gerekçeli):
#   - actionlint indirme/sürüm sabitleme — ağa bağımlı; yerelde kurulu bir
#     "actionlint" varsa AŞAĞIDA çalıştırılır (bulunamazsa uyarıyla atlanır,
#     BLOKLAMAZ — kurulum bu script'in sorumluluğu değil).
#   - AC12a (".env OLMADAN çalışma probu") — CI'ın ephemeral/.env'siz
#     ortamını simüle eder; yerel geliştirme ortamında GERÇEK bir ".env"
#     vardır ve bu script onu TAŞIMAZ/SAKLAMAZ (kullanıcının çalışma
#     ortamını bozmamak için bilinçli karar). CI'a özgü kalır.
#   - Changeset uyarısı (AC7) / PR gövdesi sürüm etiketi (AC10) — ikisi de
#     CI'da BİLE "engellemez" (danışma amaçlı) VE bir çekme isteği (PR)
#     olayının gövdesine bağımlı; yerelde karşılığı yok. (Not: bu satır
#     BİLEREK "pull" + "_request" yazımını BİTİŞİK kullanmıyor — aşağıdaki
#     AC8 kontrolünün üstündeki not ile AYNI gerekçe: bu dosya BUGÜN AC13'ün
#     tarama hedefinde değil ama hedef küme `scripts/**`'e genişlerse bu
#     yorum SESSİZCE kendini yakalardı; security T-016 fix turu 1 F5(c)
#     ölçümüyle doğrulandı.)
#
# Koşum: `pnpm guards` (kök `package.json`).

set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

overall_ok=true
declare -a step_names=()
declare -a step_results=()

# ---------------------------------------------------------------------------
# Hedef küme — iş akışı + composite action dosyaları (TEK YERDE türetilir).
#
# ci.yml'nin "guards" job'u bu kümeyi AC13 adımında TEK SEFER türetip
# `/tmp/ac-workflow-action-targets.txt`'e yazar; "run bloğu içi şablon
# ifadesi yasağı" adımı bunu TEKRAR `find` İLE türetmek yerine o dosyadan
# OKUR (T-003 düzeltme turu 3 C4). Bu script ÖNCEDEN aynı disiplini
# UYGULAMIYORDU: `check_ac13_forbidden_tokens` ve
# `check_run_block_template_expression` her biri KENDİ `find`'ını BAĞIMSIZ
# koşturuyordu — ikisi bugün AYNI komutu çalıştırdığı için sonuç aynı ama bu
# SAPMAYA AÇIK bir kopyaydı: biri güncellenip diğeri unutulabilirdi (solid,
# T-016 fix turu 1 M-2 ölçtü). Düzeltme: türetim TEK YERDE (burada) yapılır,
# her iki kontrol de AŞAĞIDAKİ değişkeni okur.
workflow_action_targets="$(find .github/workflows .github/actions -type f \( -name '*.yml' -o -name '*.yaml' \))"

# Yardımcı: hedef küme boşsa (ör. `.github/workflows` VE `.github/actions`
# ikisi de yok/boş) fail-closed, GÜRÜLTÜLÜ hata üretir — sessiz PASS ya da
# aşağıdaki `grep -nFf` çağrısının dosya argümanı OLMADAN kalıp STDIN'i
# okumaya başlayarak ASKIDA KALMASI yerine (security, T-016 fix turu 1 F5(b)
# ölçtü: tam da bu kilitlenme senaryosu). Hedef yoksa "hiçbir ihlal
# bulunamadı" demek YANLIŞ POZİTİF olurdu — bu yüzden "atlama" değil, "hata"
# seçildi (fail-closed tercih edilir; AGENT_BASELINE.md'nin fail-closed veri
# kaynağı koruması ile AYNI felsefe).
fail_if_targets_empty() {
  local caller_name="$1"
  if [ -z "$workflow_action_targets" ]; then
    echo "$caller_name taraması hata verdi: .github/workflows ve .github/actions dizinlerinin ikisi de yok/boş — tarama hedefi üretilemedi (fail-closed; sessiz atlama YOK)."
    return 1
  fi
  return 0
}

# Her adımı çalıştırır, adını ve PASS/FAIL'ini kaydeder; genel sonucu düşürür
# ama script'in KALAN adımlarını çalıştırmaya devam eder (tek bir adımda
# erken çıkmak diğer bulguların GİZLENMESİNE yol açar — sessiz atlama değil,
# hepsini raporlamak hedefi).
run_step() {
  local name="$1"
  shift
  echo ""
  echo "── $name ──────────────────────────────────────────────"
  if "$@"; then
    step_names+=("$name")
    step_results+=("PASS")
  else
    step_names+=("$name")
    step_results+=("FAIL")
    overall_ok=false
  fi
}

# ---------------------------------------------------------------------------
# AC13 — yasak jeton taraması (ci.yml "guards" job'unun BİREBİR aynı mantığı)
# ---------------------------------------------------------------------------
check_ac13_forbidden_tokens() {
  local tokens_file=".github/ci-forbidden-tokens.txt"
  local permanent_tokens_file=".github/ci-forbidden-tokens-permanent.txt"
  local pattern_file extracted_permanent marker_log
  pattern_file="$(mktemp)"
  extracted_permanent="$(mktemp)"
  marker_log="$(mktemp)"
  # Üç geçici dosya ÖNCEDEN hiç silinmiyordu — her koşu üç dosya bırakıyordu
  # (security, T-016 fix turu 1 F5(a) ölçtü). `trap ... RETURN` BİLEREK
  # KULLANILMIYOR: ampirik olarak ölçüldü ki bu fonksiyonun İÇİNDE kurulan bir
  # `RETURN` trap'i, fonksiyon kendi döndüğünde bir kere ateşlendikten SONRA
  # da aktif kalıyor ve kendisini çağıran `run_step`'in DÖNÜŞÜNDE TEKRAR
  # ateşleniyor — o noktada bu fonksiyonun `local` değişkenleri artık scope
  # DIŞI olduğu için "unbound variable" ile script'i ÇÖKERTTİ (gerçek,
  # ampirik olarak koşturulup görülmüş bir arıza, varsayım değil). Bunun
  # yerine her `return` noktasının HEMEN ÖNÜNDE `cleanup_tmp` açıkça çağrılır
  # — fonksiyonun HANGİ noktadan döndüğüne bakılmaksızın üçü de temizlenir.
  cleanup_tmp() {
    rm -f "$pattern_file" "$extracted_permanent" "$marker_log"
  }
  grep -v '^#' "$tokens_file" | grep -v '^[[:space:]]*$' >"$pattern_file"

  local required_permanent
  if ! required_permanent="$(grep -v '^#' "$permanent_tokens_file" | grep -v '^[[:space:]]*$')"; then
    echo "AC13 veri kaynağı bozuk: $permanent_tokens_file okunamadı."
    cleanup_tmp
    return 1
  fi

  local marker_begin='# >>> PERMANENT'
  local marker_end='# <<< PERMANENT'
  awk -v b="$marker_begin" -v e="$marker_end" '
    $0 == b { seen_begin++; flag = 1; next }
    $0 == e { seen_end++; flag = 0; next }
    flag { print }
    END {
      if (seen_begin == 0) print "MISSING_BEGIN" > "/dev/stderr"
      if (seen_end == 0) print "MISSING_END" > "/dev/stderr"
      if (seen_begin > 1) print "DUPLICATE_BEGIN" > "/dev/stderr"
      if (seen_end > 1) print "DUPLICATE_END" > "/dev/stderr"
    }
  ' "$tokens_file" >"$extracted_permanent" 2>"$marker_log"
  if [ -s "$marker_log" ]; then
    echo "AC13 veri kaynağı bozuk: işaretçiler eksik/bozuk."
    cat "$marker_log"
    cleanup_tmp
    return 1
  fi

  local permanent_diff
  if ! permanent_diff="$(diff -u <(printf '%s\n' "$required_permanent") "$extracted_permanent")"; then
    echo "AC13 veri kaynağı bozuk: KALICI bölüm ile $permanent_tokens_file çift yönlü eşit değil."
    printf '%s\n' "$permanent_diff"
    cleanup_tmp
    return 1
  fi

  if ! fail_if_targets_empty "AC13"; then
    cleanup_tmp
    return 1
  fi

  local target_array=()
  while IFS= read -r target_line; do
    [ -z "$target_line" ] && continue
    target_array+=("$target_line")
  done <<<"$workflow_action_targets"

  local match_output grep_exit
  match_output="$(grep -nFf "$pattern_file" "${target_array[@]}")"
  grep_exit=$?
  if [ "$grep_exit" -eq 0 ]; then
    echo "AC13 İHLALİ — yasak jeton .yml/.yaml dosyalarında bulundu:"
    printf '%s\n' "$match_output"
    cleanup_tmp
    return 1
  elif [ "$grep_exit" -gt 1 ]; then
    echo "AC13 taraması hata verdi (grep exit $grep_exit)."
    cleanup_tmp
    return 1
  fi
  echo "AC13: yasak jeton bulunmadı."
  cleanup_tmp
  return 0
}

# ---------------------------------------------------------------------------
# AC5 — .nvmrc dosya referansının GERÇEKTEN kullanıldığı (pozitif iddia)
# ---------------------------------------------------------------------------
check_ac5_node_version_file() {
  if ! grep -rn 'node-version-file' .github/actions/setup-workspace/action.yml; then
    echo "AC5 İHLALİ — .nvmrc dosya referansı hiçbir yerde kullanılmıyor."
    return 1
  fi
  echo "AC5: Node sürümü .nvmrc üzerinden okunuyor."
  return 0
}

# ---------------------------------------------------------------------------
# run: bloğu içi şablon ifadesi yasağı (security tur 1 B1)
#
# Awk programının KENDİSİ artık burada DEĞİL — `scripts/check-run-block-
# template-expression.sh`'e taşındı (T-016 fix turu 1, solid M-2): bu fonksiyon
# ile `.github/workflows/ci.yml`'nin aynı adımı BİREBİR aynı 34 satırlık awk
# programını İKİ YERDE taşıyordu; artık ikisi de TEK dosyayı çağırır, mantık
# TEK YERDE yaşar.
# ---------------------------------------------------------------------------
check_run_block_template_expression() {
  # Jeton BİLEREK iki parçaya bölünmüş kuruluyor (literal-jeton kuralı) —
  # bu kontrolün KENDİ metni (.sh dosyası) AC13'ün *.yml/*.yaml tarama
  # hedefinde OLMASA da aynı disiplin korunuyor.
  local needle_a='$'
  local needle_b='{{'
  local needle="${needle_a}${needle_b}"

  fail_if_targets_empty "run bloğu içi şablon ifadesi yasağı" || return 1

  local violation=false
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    if ! bash "$repo_root/scripts/check-run-block-template-expression.sh" "$needle" "$file"; then
      echo "İHLAL — ${file} içinde run: bloğu içinde \"$needle\" ile başlayan bir ifade bulundu."
      violation=true
    fi
  done <<<"$workflow_action_targets"

  if [ "$violation" = true ]; then
    return 1
  fi
  echo "run: bloklarının içinde \"$needle\" ile başlayan bir ifade bulunmadı."
  return 0
}

# ---------------------------------------------------------------------------
# AC8 — release.yml tetikleyici doğrulaması
# ---------------------------------------------------------------------------
check_ac8_release_trigger() {
  # Üç tetikleyici jeton BİLEREK PARÇALI kuruluyor (literal-jeton kuralı,
  # AGENT_BASELINE.md §5 — kural AÇIKLAMA YORUMLARINA da geçerli, bu yüzden
  # bu yorum da jetonları bitişik YAZMIYOR/ad içinde taşımıyor). AC13'ün
  # tarama hedefi BUGÜN yalnızca `.github/workflows`/`.github/actions`
  # altındaki `.yml`/`.yaml` dosyaları — bu `.sh` dosyası dışarıda. AMA hedef
  # küme ileride `scripts/**`'e genişletilirse (CLAUDE.md §7'nin "linter'ın
  # görüş alanını birlikte genişletmek" ruhuyla tutarlı bir senaryo), bu
  # kontrolün jetonlarını kendi metninde (değişken adları DAHİL) bitişik
  # taşıması kendi kendini eşletirdi (T3-5 dersiyle AYNI sınıf hata —
  # security T-016 fix turu 1 F5(c) ÖLÇTÜ ve İLK DÜZELTME denemesinde
  # değişken adlarının kendisi jetonu bitişik taşıdığı için YİNE eşleştiğini
  # gösterdi — bu yüzden değişken adları da jetonun TAM yazımını İÇERMEYECEK
  # şekilde seçildi). Kardeş kontrol (run bloğu içi şablon ifadesi yasağı)
  # AYNI sebepten BAŞTAN BERİ bölünmüş kuruluyordu; burada da AYNI disiplin
  # uygulanıyor. BİLEREK BİRLEŞTİRİLMEDİ — bir sonraki geliştirici
  # "sadeleştirip" bitişik yazmasın diye bu yorum burada duruyor.
  local trig1_a='pull_requ'
  local trig1_b='est'
  local trig2_a='workflow_disp'
  local trig2_b='atch'
  local trig3_a='sch'
  local trig3_b='edule'
  local trigger_pattern="${trig1_a}${trig1_b}|${trig2_a}${trig2_b}|${trig3_a}${trig3_b}"

  if grep -nE "$trigger_pattern" .github/workflows/release.yml; then
    echo "AC8 İHLALİ — release.yml yasaklı bir tetikleyici içeriyor."
    return 1
  fi
  if ! grep -nE '^\s*branches:\s*\[main\]' .github/workflows/release.yml; then
    echo "AC8 İHLALİ — release.yml 'branches: [main]' içermiyor."
    return 1
  fi
  echo "AC8: release.yml tetikleyicisi doğrulandı."
  return 0
}

# ---------------------------------------------------------------------------
# Platform sürüm tutarlılığı (--check)
# ---------------------------------------------------------------------------
check_platform_version_sync() {
  node scripts/sync-platform-version.ts --check
}

# ---------------------------------------------------------------------------
# scripts/ — erasable syntax + tip kontrolü (A4)
# ---------------------------------------------------------------------------
check_scripts_typecheck() {
  pnpm exec tsc -p scripts/tsconfig.json
}

# ---------------------------------------------------------------------------
# scripts/ — ESLint (A4)
# ---------------------------------------------------------------------------
check_scripts_eslint() {
  ./packages/config/node_modules/.bin/eslint --config scripts/eslint.config.mjs scripts
}

# ---------------------------------------------------------------------------
# Sahte yeşil dedektörü — test sahibi paket kümesi
# ---------------------------------------------------------------------------
check_fake_green_test_packages() {
  local expected actual
  expected="$(grep -v '^#' .github/ci-expected-test-packages.txt | grep -v '^[[:space:]]*$' | sort)"
  if ! actual="$(pnpm exec turbo run test --dry=json 2>/dev/null \
    | jq -r '.tasks[] | select(.task == "test" and .command != "<NONEXISTENT>") | .package' \
    | sort -u)"; then
    echo "Sahte yeşil dedektörü: turbo/jq hata verdi."
    return 1
  fi
  if [ "$expected" != "$actual" ]; then
    echo "Test sahibi paket kümesi .github/ci-expected-test-packages.txt ile eşleşmiyor."
    echo "Beklenen:"; printf '%s\n' "$expected"
    echo "Gerçek:"; printf '%s\n' "$actual"
    return 1
  fi
  echo "Test sahibi paket kümesi beyan ile eşleşiyor."
  return 0
}

# ---------------------------------------------------------------------------
# Sahte yeşil dedektörü — tenant izolasyon süiti paket kümesi
# ---------------------------------------------------------------------------
check_fake_green_isolation_packages() {
  local expected actual
  expected="$(grep -v '^#' .github/ci-expected-isolation-packages.txt | grep -v '^[[:space:]]*$' | sort)"
  if ! actual="$(pnpm exec turbo run test:isolation --dry=json 2>/dev/null \
    | jq -r '.tasks[] | select(.task == "test:isolation" and .command != "<NONEXISTENT>") | .package' \
    | sort -u)"; then
    echo "Sahte yeşil dedektörü (izolasyon): turbo/jq hata verdi."
    return 1
  fi
  if [ "$expected" != "$actual" ]; then
    echo "İzolasyon süiti sahibi paket kümesi .github/ci-expected-isolation-packages.txt ile eşleşmiyor."
    echo "Beklenen:"; printf '%s\n' "$expected"
    echo "Gerçek:"; printf '%s\n' "$actual"
    return 1
  fi
  echo "İzolasyon süiti sahibi paket kümesi beyan ile eşleşiyor."
  return 0
}

# ---------------------------------------------------------------------------
# AC4 — GUC jetonları yalnızca tenant-context.ts'te geçer (K-E12)
# Bu, T-014/T-015'in ÜÇ KEZ kırdığı KONTROL — bu script'in var olma sebebi.
# ---------------------------------------------------------------------------
check_ac4_guc_tokens() {
  local guc_setting_a='app.'
  local guc_setting_b='tenant_id'
  local guc_setting="${guc_setting_a}${guc_setting_b}"
  local guc_function_a='set_'
  local guc_function_b='config'
  local guc_function="${guc_function_a}${guc_function_b}"

  local allowed_file='packages/db/src/tenant-context.ts'
  local scan_targets
  scan_targets="$(find apps packages -type f -name '*.ts' -path '*/src/*' -not -path '*/__tests__/*')"

  local violation=false
  for needle in "$guc_setting" "$guc_function"; do
    local matches_outside_allowed
    matches_outside_allowed="$(printf '%s\n' "$scan_targets" \
      | grep -Fv "$allowed_file" \
      | xargs -r grep -ln -- "$needle" 2>/dev/null || true)"
    if [ -n "$matches_outside_allowed" ]; then
      echo "AC4 İHLALİ — \"$needle\" jetonu $allowed_file DIŞINDA bulundu:"
      printf '%s\n' "$matches_outside_allowed"
      violation=true
    fi
  done

  if [ "$violation" = true ]; then
    return 1
  fi
  echo "AC4: GUC jetonları yalnızca $allowed_file içinde geçiyor."
  return 0
}

# ---------------------------------------------------------------------------
# K8 — `.env` ↔ `.env.example` ANAHTAR ADI drift kontrolü (ROADMAP T-019/S12,
# kullanıcı kararı 2026-11-12, T-018'den iliştirildi).
#
# AMAÇ: yalnızca ANAHTAR ADLARI (`=` solu) karşılaştırılır — DEĞERLER bu
# fonksiyonun HİÇBİR satırında okunmaz/atanmaz/yazdırılmaz. Kanıt kodun
# kendisi: `cut -d= -f1` her satırın SOLUNU alır, sağı (değeri) hiçbir
# değişkene girmez ve `diff`/`echo` çağrılarının GİRDİSİ her zaman bu
# kesilmiş anahtar listesidir, ham satır değil.
#
# `.env` YOKSA (CI'ın ephemeral ortamı) ATLA, FAIL ETME — AC12a'nın
# gerekçesiyle AYNI sınıf (bkz. dosya başı yorumu, ":35-38"): CI'da gerçek
# bir `.env` yoktur ve bu kontrolün amacı "yerel .env bayatladı" sınıfı bir
# sapmayı yakalamaktır, CI'ın .env'siz çalışmasını değil.
# ---------------------------------------------------------------------------
check_k8_env_example_drift() {
  local env_file=".env"
  local example_file=".env.example"

  if [ ! -f "$env_file" ]; then
    echo "K8: $env_file bulunamadı — atlanıyor (CI'da normal, BLOKLAMAZ; AC12a ile aynı gerekçe)."
    return 0
  fi
  if [ ! -f "$example_file" ]; then
    echo "K8 taraması hata verdi: $example_file bulunamadı — fail-closed."
    return 1
  fi

  local env_keys example_keys
  env_keys="$(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$env_file" | cut -d= -f1 | sort -u)"
  example_keys="$(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$example_file" | cut -d= -f1 | sort -u)"

  local key_diff
  if key_diff="$(diff <(printf '%s\n' "$example_keys") <(printf '%s\n' "$env_keys"))"; then
    local key_count
    key_count="$(printf '%s\n' "$example_keys" | grep -c .)"
    echo "K8: .env ve .env.example anahtar ADLARI eşleşiyor ($key_count anahtar; değerler karşılaştırılmadı/okunmadı)."
    return 0
  fi
  echo "K8 İHLALİ — .env ve .env.example ANAHTAR ADLARI sapmış (yalnızca ad, DEĞER gösterilmiyor/okunmuyor):"
  printf '%s\n' "$key_diff"
  return 1
}

# ---------------------------------------------------------------------------
# Slug grameri tek-kaynak taraması (ROADMAP T-019/S12, architect KARAR 1,
# R-A3). `TENANT_SLUG_PATTERN` `packages/tenancy/src/slug.ts`'e TAŞINDI
# (kopyalanmadı) — bu kontrol o taşımanın GERİ KAYMADIĞINI (ikinci bir regex
# literalinin doğmadığını) mekanik olarak zorlar.
#
# ⚠⚠ TAM DESEN aranır, ÖNEKİ DEĞİL (Orkestratör ölçümü, S2 üretim logu):
# `^[a-z0-9]` öneki `apps/api/src/member/invitation-token.ts:74`'teki
# `TENANT_ID_PATTERN` (cuid2 karakter kümesi kontrolü, slug grameri DEĞİL)
# ile KALICI YANLIŞ POZİTİF üretir. Literal-jeton kuralı (AGENT_BASELINE.md
# §5): bu kontrol bir regex literalinin TEKİLLİĞİNİ denetliyor, deseni
# kendi metninde BİTİŞİK yazmaz — iki parçadan çalışma anında birleştirilir.
# ---------------------------------------------------------------------------
check_slug_grammar_single_source() {
  local pattern_a='/^[a-z0-9](?:[a-z0-9-]{0,61}'
  local pattern_b='[a-z0-9])?$/'
  local pattern="${pattern_a}${pattern_b}"

  local home_dir="packages/tenancy/src"
  if [ ! -d "$home_dir" ]; then
    echo "Slug grameri taraması hata verdi: $home_dir bulunamadı — fail-closed."
    return 1
  fi

  local home_matches home_count
  home_matches="$(grep -rnF -- "$pattern" "$home_dir" 2>/dev/null || true)"
  home_count="$(printf '%s\n' "$home_matches" | grep -c . || true)"
  if [ -z "$home_matches" ]; then
    home_count=0
  fi
  if [ "$home_count" != "1" ]; then
    echo "Slug grameri İHLALİ — $home_dir'de desen TAM BİR kez bekleniyordu, $home_count kez bulundu:"
    printf '%s\n' "$home_matches"
    return 1
  fi

  local other_dirs=("apps/api/src" "packages/trpc/src" "apps/admin/src")
  local violation=false
  local dir
  for dir in "${other_dirs[@]}"; do
    [ -d "$dir" ] || continue
    local outside_matches
    outside_matches="$(grep -rnF -- "$pattern" "$dir" 2>/dev/null || true)"
    if [ -n "$outside_matches" ]; then
      echo "Slug grameri İHLALİ — desen $dir İÇİNDE bulundu (tek kaynak ihlali):"
      printf '%s\n' "$outside_matches"
      violation=true
    fi
  done

  if [ "$violation" = true ]; then
    return 1
  fi
  echo "Slug grameri: desen yalnızca $home_dir'de tam bir kez (apps/api/src, packages/trpc/src, apps/admin/src'te sıfır)."
  return 0
}

# ---------------------------------------------------------------------------
# AC-16 — gerçek DNS çağrısı yokluğu taraması (ROADMAP T-019, `po`'nun
# R-PO7'si). Kapsam kararı: v0.1.0 "wildcard DNS VARSAYIMI"dır; gerçek DNS
# API yazımı v0.2.0'ın işi (`ROADMAP:1300`). Bu kontrol negatif bir kriteri
# mekanik hale getirir.
#
# Literal-jeton kuralı (AGENT_BASELINE.md §5): yasaklanan jeton ("dns" /
# "node:dns") bu kontrolün kendi metninde BİTİŞİK yazılmaz, çalışma anında
# iki parçadan birleştirilir — AC4/AC8 ile AYNI disiplin (bu dosya .ts
# taramasının hedefinde değil ama hedef küme genişlerse kendi kendini
# eşletirmez).
# ---------------------------------------------------------------------------
check_ac16_no_real_dns_call() {
  local dns_token_a='d'
  local dns_token_b='ns'
  local dns_token="${dns_token_a}${dns_token_b}"
  local pattern="(from|require)[[:space:]]*\\(?[\"']((node:)?${dns_token}(/promises)?)[\"']"

  local scan_targets
  scan_targets="$(find apps/api/src packages -type f -name '*.ts' -path '*/src/*' -not -path '*/__tests__/*' 2>/dev/null)"
  if [ -z "$scan_targets" ]; then
    echo "AC-16 taraması hata verdi: tarama hedefi (apps/api/src + packages/**/src) üretilemedi — fail-closed."
    return 1
  fi

  local target_array=()
  while IFS= read -r scan_line; do
    [ -z "$scan_line" ] && continue
    target_array+=("$scan_line")
  done <<<"$scan_targets"

  local matches
  matches="$(grep -nE -- "$pattern" "${target_array[@]}" 2>/dev/null || true)"
  if [ -n "$matches" ]; then
    echo "AC-16 İHLALİ — gerçek DNS modülü/SDK import jetonu bulundu (gerçek DNS yazımı v0.2.0'ın işi):"
    printf '%s\n' "$matches"
    return 1
  fi
  echo "AC-16: gerçek DNS modülü/SDK import jetonu bulunmadı (apps/api/src + packages/**/src)."
  return 0
}

# ---------------------------------------------------------------------------
# AC-1 — kök `test:e2e` / `test:visual` / `test:visual:update` script
# VARLIĞI (ROADMAP T-020/S7, İŞ ①).
#
# AMAÇ: `S3` ve `S6` bu üç script'i kök `package.json`'a ekledi; BUGÜNE
# KADAR hiçbir mekanizma varlıklarını KORUMUYORDU — biri silinse `pnpm
# guards` YEŞİL kalırdı ve CLAUDE.md §6'nın belgelediği komut sessizce
# "özlem" hâline dönerdi (AGENT_BASELINE.md §6'nın "kök `test:e2e` YOK"
# notuyla AYNI sınıf regresyon, bu sürüm tam o boşluğu kapatıyor). `jq`
# BURADA `.scripts["<ad>"]` anahtarını OKUR, DEĞERİN İÇERİĞİNİ
# yorumlamaz/çalıştırmaz — yalnızca BOŞ/YOK olmadığını doğrular (sahte
# yeşil dedektörlerinin KULLANDIĞI jq zaten bu script'te MEVCUT bağımlılık).
# ---------------------------------------------------------------------------
check_ac1_root_e2e_visual_scripts() {
  local package_json="package.json"
  if [ ! -f "$package_json" ]; then
    echo "AC-1 taraması hata verdi: $package_json bulunamadı — fail-closed."
    return 1
  fi

  local required_scripts=("test:e2e" "test:visual" "test:visual:update")
  local violation=false
  local script_name value
  for script_name in "${required_scripts[@]}"; do
    if ! value="$(jq -r --arg key "$script_name" '.scripts[$key] // ""' "$package_json")"; then
      echo "AC-1 taraması hata verdi: $package_json jq ile okunamadı — fail-closed."
      return 1
    fi
    if [ -z "$value" ]; then
      echo "AC-1 İHLALİ — kök $package_json 'scripts.$script_name' tanımlı değil (boş veya yok)."
      violation=true
    fi
  done

  if [ "$violation" = true ]; then
    return 1
  fi
  echo "AC-1: kök $package_json üçünü de tanımlıyor — test:e2e, test:visual, test:visual:update."
  return 0
}

# ---------------------------------------------------------------------------
# Bütçe pin tazeliği — `apps/admin/e2e/auth-budget.ts`'in BAĞIMSIZ
# `AUTH_IP_LIMITS` pin'i ↔ `rate-limit.policy.ts`'in gerçek sabitleri
# (ROADMAP T-020/S7, İŞ ②, AC-4'ün DÖRDÜNCÜ ayağı).
#
# `auth-budget.ts`'in dosya başı yorumu BİREBİR şunu söylüyor: "dördüncü
# değişmez (pin tazeliği) BU alt görevin kapsamı DIŞINDA — guards.sh'e
# gidiyor (T-020/S7)". `AUTH_IP_LIMITS = { signIn: 20, signUp: 10 }`
# `apps/admin`'in `apps/api`'ye KAYNAK bağımlılığı OLMADIĞI için BAĞIMSIZ
# (ithal edilmeden) yazılmış bir kopyadır — kaynak sabitlerin (`LOGIN_IP_LIMIT`,
# `EMAIL_IP_LIMIT`) ADI veya DEĞERİ değişirse bu kopya SESSİZCE bayatlar.
#
# Emsal (okunup uygulandı): `apps/storefront/e2e/storefront-theme.spec.ts`'in
# "bağımsız pin + tutarlılık pini" deseni (`EXPECTED_COLOR_PRIMARY_HEX`
# hardcoded, AYRI bir assertion onu kaynaktan türeyen değerle karşılaştırır).
# Buradaki fark: karşılaştırma bir e2e test'i İÇİNDE DEĞİL, bu mekanik
# kapıda yapılıyor — çünkü iki dosya da (`auth-budget.ts`/`rate-limit.
# policy.ts`) birbirini İTHAL EDEMEZ, bağımsız bir üçüncü gözlemci gerekir.
#
# `sign_in_pin`/`sign_up_pin` `auth-budget.ts`'TEN DİNAMİK OKUNUR (BURADA
# TEKRAR HARDCODE EDİLMEZ) — aksi hâlde bu kontrolün KENDİSİ üçüncü,
# koordinesiz bir pin olurdu ve amacını (tazelik denetimi, kopyalama DEĞİL)
# kaybederdi.
# ---------------------------------------------------------------------------
check_auth_budget_pin_freshness() {
  local admin_pin_file="apps/admin/e2e/auth-budget.ts"
  local api_policy_file="apps/api/src/auth/rate-limit/rate-limit.policy.ts"

  if [ ! -f "$admin_pin_file" ] || [ ! -f "$api_policy_file" ]; then
    echo "Bütçe pin tazeliği taraması hata verdi: $admin_pin_file veya $api_policy_file bulunamadı — fail-closed."
    return 1
  fi

  local sign_in_pin sign_up_pin
  sign_in_pin="$(grep -oE 'signIn:[[:space:]]*[0-9]+' "$admin_pin_file" | grep -oE '[0-9]+' | head -n 1)"
  sign_up_pin="$(grep -oE 'signUp:[[:space:]]*[0-9]+' "$admin_pin_file" | grep -oE '[0-9]+' | head -n 1)"

  if [ -z "$sign_in_pin" ] || [ -z "$sign_up_pin" ]; then
    echo "Bütçe pin tazeliği taraması hata verdi: $admin_pin_file'te AUTH_IP_LIMITS.signIn/signUp sayısal değeri okunamadı — fail-closed."
    return 1
  fi

  local violation=false
  if ! grep -nE "LOGIN_IP_LIMIT[[:space:]]*=[[:space:]]*${sign_in_pin}\\b" "$api_policy_file" >/dev/null; then
    echo "Bütçe pin tazeliği İHLALİ — $admin_pin_file'in AUTH_IP_LIMITS.signIn (${sign_in_pin}) değeri $api_policy_file'teki LOGIN_IP_LIMIT ile UYUŞMUYOR (ad veya değer değişmiş olabilir)."
    violation=true
  fi
  if ! grep -nE "EMAIL_IP_LIMIT[[:space:]]*=[[:space:]]*${sign_up_pin}\\b" "$api_policy_file" >/dev/null; then
    echo "Bütçe pin tazeliği İHLALİ — $admin_pin_file'in AUTH_IP_LIMITS.signUp (${sign_up_pin}) değeri $api_policy_file'teki EMAIL_IP_LIMIT ile UYUŞMUYOR (ad veya değer değişmiş olabilir)."
    violation=true
  fi

  if [ "$violation" = true ]; then
    return 1
  fi
  echo "Bütçe pin tazeliği: AUTH_IP_LIMITS.signIn/signUp (${sign_in_pin}/${sign_up_pin}) $api_policy_file'teki LOGIN_IP_LIMIT/EMAIL_IP_LIMIT ile UYUŞUYOR."
  return 0
}

# ---------------------------------------------------------------------------
# ADR-0022 Karar 1(d) — "fabrika sızma yasağı" + po'nun allowlist kararı
# (ROADMAP T-020/S7, İŞ ③; GATE DÜZELTME: devops, T-020 gate fix turu 1,
# 2026-11-15, `solid`+`security` tur 1'in bağımsız ölçtüğü S-2/İŞ ②).
#
# ADR-0022 Karar 1(d) BİREBİR: "`apps/*/src/**` içinden `child_process`+
# `psql` kullanımı `pnpm guards` taramasıyla YASAKLANIR — fabrika üretim
# koduna SIZAMAZ." Bugün İKİ MEŞRU fixture var (ikisi de `e2e/` altında,
# `src/` DEĞİL): `apps/storefront/e2e/fixtures/custom-domain-tenant.ts`
# (v0.0.8'den beri) ve `apps/admin/e2e/fixtures/tenant-cleanup.ts` (S5
# yazdı). Bu fonksiyon ÜÇ alt kontrol yapar (TEK `run_step` altında — İŞ
# ①/②/③ "üç yeni adım" sayısını KORUR, dörde ÇIKARMAZ):
#
#   1. `apps/*/src/**` (her `apps/<ad>/src` ağacı, İSTİSNASIZ — `__tests__`
#      DAHİL, bkz. gate fix notu altta) İÇİNDE "docker exec"/"psql"
#      jetonlarından BİRİ bile görünürse İHLAL.
#   2. `apps/**` + `packages/**` + `scripts/**` (`.ts`, `node_modules`/
#      `dist`/`generated`/`.turbo` hariç) genelinde GERÇEK kabuk-çağrısı
#      MEKANİZMASINI (aşağıya bkz.) taşıyan dosya KÜMESİNİN tam olarak
#      yukarıdaki İKİ fixture'a eşit olduğunu doğrular (po kararı, bağlayıcı
#      — "üçüncü kopya SESSİZCE doğamaz").
#   3. Yukarıdaki İKİ allowlist dosyasının HER İKİSİ de ADR-0022 K1'in (a)
#      ve (b) korumalarını (`assertDockerHostIsLoopback`/
#      `assertTestEnvironment`) GERÇEKTEN ÇAĞIRDIĞINI (ad geçişi değil) ve
#      İKİ dosyadaki gövdelerin (normalize edilmiş) BİREBİR eşit olduğunu
#      doğrular (aşağıya, GATE DÜZELTME S-8/İŞ ② bkz.).
#
# ⚠⚠⚠ GATE DÜZELTME (S-2, İŞ ②) — ALT KONTROL 2 ARTIK DÜZYAZIYI DEĞİL
# MEKANİZMAYI EŞLİYOR: önceki sürüm "docker exec" (bitişik, tek dizge)
# jetonunu arıyordu — ama GERÇEK çağrı `execFileSync('docker', ['exec', …,
# 'psql', …])`'dür, dizi öğeleri AYRI satırlardadır ve "docker exec" hiçbir
# zaman bitişik GEÇMEZ. `security` tur 1 ÖLÇTÜ: depodaki HER "docker exec"
# geçişi bir YORUM ya da bir hata mesajı METNİYDİ — tarama korumak istediği
# ÇAĞRIYI değil, YANINDAKİ AÇIKLAMA metnini eşliyordu; jetonu içermeyen
# ÜÇÜNCÜ bir kopya (gerçek mekanizmayı taşıyan ama yorumunda "docker exec"
# bitişik metni OLMAYAN) bu yüzden SESSİZCE doğabilirdi (sandbox'ta
# kanıtlandı, S-2 raporu). Düzeltme: artık dizi ÖĞESİ biçimindeki tek
# tırnaklı literalleri ('exec' VE 'psql' birlikte — bu, gerçek
# `execFileSync` dizi argümanının İKİ öğesidir) arıyor; `security`'nin
# ÖLÇTÜĞÜ hata-mesajı metinlerinde ("Denenen komut: docker exec … psql …")
# bu literaller TIRNAKSIZ geçtiği için ORADA EŞLEŞMEZ — tarama artık GERÇEK
# ÇAĞRIYI eşliyor, yanındaki METNİ değil (ölçüldü: `grep` bu literalleri
# yalnızca GERÇEK `execFileSync` dizilerinde buluyor, iki allowlist
# dosyasının HİÇBİR yorum/hata-mesajı satırında DEĞİL).
#
# ⚠⚠ GATE DÜZELTME (S-7, İŞ ①, devops, T-020 gate fix turu 2, 2026-11-15) —
# ALT KONTROL 2'NİN NEEDLE'I DÜZYAZIYI KAYBETMİŞTİ: gate fix turu 1 alt
# kontrol 2'yi düzyazıdan mekanizmaya ÇEVİRDİ ama düzyazı needle'larını
# (`$shellout_needle`/`$psql_needle`) alt kontrol 2'den TAMAMEN ÇIKARDI —
# onlar artık YALNIZCA alt kontrol 1'de (apps/*/src/**) kullanılıyordu.
# Sonuç (security tur 2, S-7, sandbox'ta ÖLÇÜLDÜ): `e2e/` altında
# `execSync` + şablon dizgiyle ("docker exec ${c} psql …") yazılmış
# ÜÇÜNCÜ bir kopya ne mekanizma needle'ını (dizi-öğesi literalleri hiç
# YOK) ne de düzyazı needle'ını (artık alt kontrol 2'nin ARADIĞI küme
# DIŞINDA) taşıyormuş gibi davranıyordu — iki kontrolün KESİŞİMİ dışında
# kalan bir kör nokta. Düzeltme: alt kontrol 2'nin İKİ grep deseni artık
# BİRLEŞİM — `"${exec_array_needle}|${shellout_needle}"` ve
# `"${psql_array_needle}|${psql_needle}"` — hem mekanizmayı hem düzyazıyı
# ARAR; bugünkü iki allowlist dosyası ikisini de taşıdığı için küme
# DEĞİŞMEZ (ölçüldü), ama `execSync`+şablon-dizgi kopyası artık "actual
# dosya kümesi" içine GİRER ve beklenen iki fixture'dan SAPTIĞI için
# İHLAL verir. Ek fayda: bu yazım biçimi `sql`'i kabuğa enterpole ettiği
# için (komut enjeksiyonu yüzeyi) bu düzeltme o sınıfı da YAKALAR.
#
# `scripts/**` KAPSAMA ALINDI (`solid` tur 1 bulgusu) — ADR-0022 Karar 6
# `scripts/`'i birinci sınıf bir TypeScript alanı yaptı (`scripts/
# playwright/base.ts`); allowlist taraması önceden bu dizini GÖRMÜYORDU.
#
# ALT KONTROL 1'İN `__tests__` İSTİSNASI KALDIRILDI (`solid` tur 1 bulgusu —
# önceki `--exclude-dir=__tests__` bu yorumun "HİÇBİR istisna dosya YOK"
# iddiasıyla ÇELİŞİYORDU). ÖLÇÜLDÜ (gate fix turu 1): `apps/*/src` altında
# `__tests__` DAHİL hiçbir dosyada "docker exec"/"psql" jetonu YOK — istisna
# kaldırmak bugün DAVRANIŞ DEĞİŞTİRMİYOR, yalnızca yorumla kodu HİZALIYOR.
#
# ⚠⚠ GATE DÜZELTME (S-8, İŞ ②, devops, T-020 gate fix turu 2, 2026-11-15) —
# ALT KONTROL 3 ADA DEĞİL MEKANİZMAYA BAĞLANDI: önceki sürüm `grep -q
# "assertDockerHostIsLoopback"` idi — dosyanın HER YERİNİ (yorumlar DAHİL)
# tarıyordu. `solid`+`security` tur 2 BAĞIMSIZ ÜÇ kaçış yolu ölçtü: (i)
# tanım+çağrıları SİL, dosya başı yorumunu BIRAK → ad hâlâ geçer → YEŞİL;
# (ii) tanımlar dursun, ÇAĞRILAR silinsin → ad hâlâ geçer → YEŞİL; (iii)
# adlar aynı kalsın, GÖVDE sapsın (ör. birinin allowlist'ine
# `host.docker.internal` eklensin) → YEŞİL. Üçü de alt kontrol 3'ün
# "S-1'in tekrarını MEKANİKLEŞTİRİR" iddiasıyla ÇELİŞİYORDU. Düzeltme ÜÇ
# ayrı mekanizma ekliyor (üçü BİRLİKTE üç kaçış yolunun ÜÇÜNÜ de kapatır):
#   (i)/(ii) → `^function <ad>(): void {` ANKORLU tanım araması (yorum
#     metni bu TAM biçimde geçmiyor) VE çağrı-biçimi sayımı
#     (`^\s*<ad>\(\)$`, en az 2 — bugünkü iki dosyanın ORTAK alt sınırı:
#     storefront 2/2, admin 3/3 çağrı noktası taşıyor).
#   (iii) → iki dosyadaki `assertDockerHostIsLoopback`/`assertTestEnvironment`
#     fonksiyon GÖVDELERİ (ve `DOCKER_HOST_ALLOWED_HOSTNAMES` Set'i) satır
#     satır çıkarılıp (awk, imzadan kapanış `}`'a kadar) backtick şablon
#     dizgelerinin İÇERİĞİ (tek legitimate fark — dosyaya özgü hata metni
#     öneki, ör. "e2e fixture:" ↔ "tenant-cleanup:") bir yer tutucuyla
#     NORMALİZE edilip (`sed`) karşılaştırılıyor; normalize edilmiş metin
#     SAPARSA İHLAL. Bu, `solid`'in önerdiği `shasum` yaklaşımının
#     (AGENT_BASELINE §5 yasak jeton disiplinine aykırı değil, şifreleme
#     DEĞİL) metinsel eşdeğeri — ek bağımlılık (örn. `shasum`'un her
#     platformda bulunması) GEREKTİRMİYOR.
#
# ⚠ DÜRÜST SINIR (DARALTILMIŞ KAPSAM, ADR'de YAZILI, burada TEKRARLANIYOR):
# iki `runSql`/`querySqlRows` gövdesinin METİNSEL SAPMASI (ör. `maxBuffer`,
# admin'in EK `querySqlRows`'u, farklı biçim regexleri) bu kontrolle HÂLÂ
# YAKALANMAZ — bu, `solid` tur 2'nin ÖLÇTÜĞÜ ve deponun bu sınıfta ZATEN
# KABUL ETTİĞİ, gerekçeli bir borçtur (ADR-0022, "iki kopya" kararı).
# Yukarıdaki (iii) düzeltmesi SADECE (a)+(b) koruma fonksiyonlarının VE
# allowlist Set'inin sapmasını kapatır — `runSql` gibi dosyaya özgü,
# GEREKÇELİ olarak farklılaşan kodu KAPSAMAZ (kapsasaydı iki dosyanın
# zaten MEŞRU farkını İHLAL sayardı). Bu tarama (a)/(b) EKSENİNDE
# ÇOĞALMAYI VE SAPMAYI kapatıyor; (c)/`runSql` EKSENİNDE yalnızca
# ÇOĞALMAYI kapatıyor, SAPMAYI değil.
#
# Literal-jeton kuralı (AGENT_BASELINE.md §5): bu fonksiyonun aradığı
# jetonlar KENDİ metninde (yorumlarda) BİTİŞİK/TIRNAKLI YAZILMAZ — AC8/AC16
# ile AYNI disiplin. Hedef küme `scripts/**`'i de kapsadığı için bu `.sh`
# dosyası `--include='*.ts'` yüzünden KENDİSİNİ asla eşlemez (yalnızca
# `.ts` dosyaları taranıyor), ama disiplin AYNI gerekçeyle sürdürülüyor.
# ---------------------------------------------------------------------------
check_adr22_k1d_shellout_boundary() {
  local token_a1='dock' token_a2='er exec'
  local shellout_needle="${token_a1}${token_a2}"
  local token_b1='ps' token_b2='ql'
  local psql_needle="${token_b1}${token_b2}"
  # Mekanizma jetonları (S-2 düzeltmesi) — GERÇEK execFileSync dizi
  # öğeleri: tek tırnaklı "exec" ve "psql" literalleri, parçalardan
  # kurulur (yukarıdaki AYNI literal-jeton disiplini).
  local token_c1="'ex" token_c2="ec'"
  local exec_array_needle="${token_c1}${token_c2}"
  local token_d1="'ps" token_d2="ql'"
  local psql_array_needle="${token_d1}${token_d2}"

  local violation=false

  # --- Alt kontrol 1: apps/*/src/** içinde SIFIR, İSTİSNASIZ ---
  local src_dirs
  src_dirs="$(find apps -maxdepth 2 -type d -name src 2>/dev/null)"
  if [ -z "$src_dirs" ]; then
    echo "ADR-0022 K1(d) taraması hata verdi: apps/*/src dizini bulunamadı — fail-closed."
    return 1
  fi
  local src_dir_array=()
  while IFS= read -r src_dir_line; do
    [ -z "$src_dir_line" ] && continue
    src_dir_array+=("$src_dir_line")
  done <<<"$src_dirs"

  local src_matches
  src_matches="$(grep -rnE --include='*.ts' -- \
    "${shellout_needle}|${psql_needle}" "${src_dir_array[@]}" 2>/dev/null || true)"
  if [ -n "$src_matches" ]; then
    echo "ADR-0022 K1(d) İHLALİ — apps/*/src/** içinde fabrika üretim koduna sızmış bir kabuk-çağrısı jetonu bulundu:"
    printf '%s\n' "$src_matches"
    violation=true
  fi

  # --- Alt kontrol 2 (T-021/S9 GÜNCELLEME — ADR-0022 Karar 1'in UYGULAMA
  #     birleştirmesi, `docs/adr/0022-*.md` ⭐ GÜNCELLEME bloğu): iki
  #     fabrikanın `runSql`/`querySqlRows` gövdeleri + dört korumanın
  #     ((a)-(d)) gövdeleri artık BAĞIMSIZ kopya DEĞİL — TEK paylaşılan
  #     modülde (`scripts/playwright/sql.ts`). GERÇEK kabuk-çağrısı
  #     mekanizmasını (execFileSync 'exec'+'psql' dizi öğeleri) VEYA
  #     düzyazı (bitişik "docker exec"/"psql" metni) kalıbını KULLANAN
  #     dosya kümesi artık TAM OLARAK BİR modül olmak ZORUNDADIR — eski
  #     "iki fixture arasında gövde eşitliği" denetimine (eski alt kontrol
  #     3/4) artık GEREK YOK, çünkü sapacak İKİNCİ bir gövde YOK. ---------
  local allowed_module='scripts/playwright/sql.ts'
  local consumer_file_1='apps/storefront/e2e/fixtures/custom-domain-tenant.ts'
  local consumer_file_2='apps/admin/e2e/fixtures/tenant-cleanup.ts'

  # S-7 düzeltmesi (T-020 gate fix turu 2) KORUNDU: needle'lar BİRLEŞİM —
  # mekanizma (dizi-öğesi literalleri) ∪ düzyazı (bitişik "docker exec"/
  # "psql" metni) — tek biçimi arayan bir tarama diğerini yazan bir kopyayı
  # KAÇIRIRDI. T-020'nin dersi: mekanizmaya geçerken düzyazı KALDIRILMAZ.
  local exec_candidate_needle="${exec_array_needle}|${shellout_needle}"
  local psql_candidate_needle="${psql_array_needle}|${psql_needle}"

  local exec_array_file_matches actual_files expected_files
  exec_array_file_matches="$(grep -rlE --include='*.ts' \
    --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=generated --exclude-dir=.turbo \
    -- "$exec_candidate_needle" apps packages scripts 2>/dev/null || true)"
  actual_files="$(printf '%s\n' "$exec_array_file_matches" | grep -v '^$' \
    | xargs -r grep -lE -- "$psql_candidate_needle" 2>/dev/null | sort)"
  expected_files="$allowed_module"

  if [ "$actual_files" != "$expected_files" ]; then
    echo "ADR-0022 K1(d) allowlist İHLALİ — gerçek kabuk-çağrısı mekanizmasını (execFileSync 'exec'+'psql') VEYA düzyazı (docker exec/psql) kalıbını kullanan dosya kümesi beklenen TEK modülden ($allowed_module) SAPTI (üçüncü/ek bir kopya doğmuş olabilir):"
    echo "Beklenen:"; printf '%s\n' "$expected_files"
    echo "Gerçek:"; printf '%s\n' "$actual_files"
    violation=true
  fi

  # --- Alt kontrol 3 (T-021/S9): paylaşılan modül GERÇEKTEN var, ADR-0022
  #     K1'in taşınan export'larını TANIMLIYOR; iki mevcut fabrika onu
  #     GÖRELİ YOLLA import ediyor (kendi kopyalarını başka bir biçimde
  #     saklamadıklarının ikinci kanıtı). -------------------------------
  if [ ! -f "$allowed_module" ]; then
    echo "ADR-0022 K1(d) İHLALİ — beklenen paylaşılan modül bulunamadı: $allowed_module"
    violation=true
  else
    local required_export
    for required_export in runSql querySqlRows assertDockerHostIsLoopback \
      assertTestEnvironment resolvePostgresContainerName DOCKER_HOST_ALLOWED_HOSTNAMES; do
      if ! grep -qE "^export (function|const) ${required_export}\\b" "$allowed_module"; then
        echo "ADR-0022 K1(d) İHLALİ — $allowed_module beklenen export'u taşımıyor: $required_export"
        violation=true
      fi
    done
  fi

  local consumer_file
  for consumer_file in "$consumer_file_1" "$consumer_file_2"; do
    if [ ! -f "$consumer_file" ]; then
      echo "ADR-0022 K1(d) İHLALİ — beklenen fabrika dosyası bulunamadı: $consumer_file"
      violation=true
      continue
    fi
    if ! grep -qE "from '(\\.\\./)+scripts/playwright/sql\\.js'" "$consumer_file"; then
      echo "ADR-0022 K1(d) İHLALİ — $consumer_file paylaşılan modülü (scripts/playwright/sql.js) göreli yolla import ETMİYOR."
      violation=true
    fi
  done

  if [ "$violation" = true ]; then
    return 1
  fi
  echo "ADR-0022 K1(d): apps/*/src/** istisnasız temiz; gerçek kabuk-çağrısı mekanizmasını/düzyazısını kullanan dosya kümesi TAM OLARAK bir modül ($allowed_module); iki mevcut e2e fabrikası ($consumer_file_1, $consumer_file_2) onu göreli yolla import ediyor."
  return 0
}

# ---------------------------------------------------------------------------
# Playwright `retries` tek-kaynak taraması (S-11, İŞ ④, devops, T-020 gate
# fix turu 2, 2026-11-15).
#
# AMAÇ: `scripts/playwright/base.ts`'in `retries: overrides.retries ?? 0`
# pini yalnızca ÜST SEVİYEDE etkili — Playwright `projects[].retries`'i
# de destekler ve o, üst seviyeyi PROJE BAZINDA EZER. `security`+`solid`
# tur 2 BAĞIMSIZ ölçtü: `base.ts`'e DOKUNMADAN `apps/admin/
# playwright.config.ts`'in `projects:` dizisine `retries: 2` eklemek
# `pnpm guards`'ı (bu kontrol EKLENMEDEN önce) YEŞİL bırakırdı ve
# başarısız bir koşumun `on-first-retry` trace'ini (oturum çerezi +
# `Authorization` başlığı taşır) PUBLIC bir Actions artefaktına
# yükleyebilirdi (R-9). BUGÜN ÖLÇÜLDÜ: `retries` jetonu `apps/**`/
# `packages/**`/`scripts/**` genelindeki TÜM `.ts` dosyalarında YALNIZCA
# `scripts/playwright/base.ts`'te geçiyor — bu kontrol o durumu MEKANİK
# olarak KORUR: jeton `base.ts` DIŞINDA (bir `projects[]` girdisi DAHİL)
# bir yerde görünürse İHLAL.
# ---------------------------------------------------------------------------
check_playwright_retries_single_source() {
  local home_file="scripts/playwright/base.ts"
  if [ ! -f "$home_file" ]; then
    echo "Playwright retries tek-kaynak taraması hata verdi: $home_file bulunamadı — fail-closed."
    return 1
  fi

  local scan_targets
  scan_targets="$(find apps packages scripts -type f -name '*.ts' \
    -not -path '*/node_modules/*' -not -path '*/dist/*' \
    -not -path '*/generated/*' -not -path '*/.turbo/*' 2>/dev/null)"
  if [ -z "$scan_targets" ]; then
    echo "Playwright retries tek-kaynak taraması hata verdi: tarama hedefi (apps/**, packages/**, scripts/**) üretilemedi — fail-closed."
    return 1
  fi

  local outside_matches
  outside_matches="$(printf '%s\n' "$scan_targets" \
    | grep -Fv "$home_file" \
    | xargs -r grep -ln "retries" 2>/dev/null || true)"

  if [ -n "$outside_matches" ]; then
    echo "Playwright retries tek-kaynak İHLALİ — 'retries' jetonu $home_file DIŞINDA bulundu (üst seviye PİN'i bir projects[] girdisi veya başka bir yapılandırma PROJE/DOSYA BAZINDA ezebilir, S-11):"
    printf '%s\n' "$outside_matches"
    return 1
  fi

  if ! grep -q "retries" "$home_file"; then
    echo "Playwright retries tek-kaynak taraması hata verdi: $home_file artık 'retries' jetonunu taşımıyor — pin kaybolmuş olabilir, fail-closed."
    return 1
  fi

  echo "Playwright retries tek-kaynak: jeton yalnızca $home_file içinde geçiyor — üst seviye PİN hiçbir projects[]/çağıran yapılandırma tarafından EZİLMİYOR."
  return 0
}

# ---------------------------------------------------------------------------
# `@axe-core/playwright` tek-kaynak taraması (ROADMAP v0.0.20.3, T-024,
# Orkestratör kararı A-T24-1, emsal BİREBİR: check_playwright_retries_single_source
# yukarıda).
#
# AMAÇ: depoda `eslint-plugin-import` YOK (architect ölçtü:
# `packages/config/eslint` → sıfır eşleşme) ⇒ bir spec `AxeBuilder`'ı
# `scripts/playwright/a11y.ts` DIŞINDA DOĞRUDAN import edip `include`/
# `exclude`/`disableRules` çağırabilir — yardımcının "tek daraltma yolu
# allowlist" sözleşmesi (R6-②) o zaman yalnızca TASARIMLA korunur, MEKANİK
# olarak DEĞİL. BUGÜN ÖLÇÜLDÜ: `@axe-core/playwright` jetonu `apps/**`/
# `packages/**`/`scripts/**` genelindeki TÜM `.ts` dosyalarında YALNIZCA
# `scripts/playwright/a11y.ts`'te geçiyor — bu kontrol o durumu MEKANİK
# olarak KORUR: jeton `a11y.ts` DIŞINDA bir yerde görünürse İHLAL.
# ---------------------------------------------------------------------------
check_axe_single_source() {
  local home_file="scripts/playwright/a11y.ts"
  if [ ! -f "$home_file" ]; then
    echo "axe tek-kaynak taraması hata verdi: $home_file bulunamadı — fail-closed."
    return 1
  fi

  local scan_targets
  scan_targets="$(find apps packages scripts -type f -name '*.ts' \
    -not -path '*/node_modules/*' -not -path '*/dist/*' \
    -not -path '*/generated/*' -not -path '*/.turbo/*' 2>/dev/null)"
  if [ -z "$scan_targets" ]; then
    echo "axe tek-kaynak taraması hata verdi: tarama hedefi (apps/**, packages/**, scripts/**) üretilemedi — fail-closed."
    return 1
  fi

  local outside_matches
  outside_matches="$(printf '%s\n' "$scan_targets" \
    | grep -Fv "$home_file" \
    | xargs -r grep -ln "@axe-core/playwright" 2>/dev/null || true)"

  if [ -n "$outside_matches" ]; then
    echo "axe tek-kaynak İHLALİ — '@axe-core/playwright' jetonu $home_file DIŞINDA bulundu (bir spec/dosya AxeBuilder'ı doğrudan import edip yardımcının allowlist sözleşmesini (R6-②) baypas edebilir):"
    printf '%s\n' "$outside_matches"
    return 1
  fi

  if ! grep -q "@axe-core/playwright" "$home_file"; then
    echo "axe tek-kaynak taraması hata verdi: $home_file artık '@axe-core/playwright' jetonunu taşımıyor — tek kaynak kaybolmuş olabilir, fail-closed."
    return 1
  fi

  echo "axe tek-kaynak: jeton yalnızca $home_file içinde geçiyor — hiçbir spec AxeBuilder'ı doğrudan import edip allowlist sözleşmesini baypas EDEMİYOR."
  return 0
}

# ---------------------------------------------------------------------------
# e2e env passthrough kontrolü (ROADMAP v0.0.20, T-021 FIX turu 2, devops —
# qa tur1 `high` bulgusunun İŞ ③'ü). "scripts/e2e-env-passthrough-check.ts"'in
# KENDİSİNE bkz. (kapsam, bilinen (B)-sınıfı kör nokta ve ikisinin NEGATİF
# testle doğrulandığı kanıt dosya başı yorumunda). `node` ile çalışır — Node
# 20.6+'nın yerel TS tip sıyırması (A4'ün diğer script'leriyle AYNI desen),
# ayrı bir derleme adımı YOK.
# ---------------------------------------------------------------------------
check_e2e_env_passthrough() {
  node scripts/e2e-env-passthrough-check.ts
}

# ---------------------------------------------------------------------------
# Çapraz-uygulama (admin ↔ superadmin) e2e oran sınırı bütçesi (ROADMAP
# v0.0.20.1, T-022/EK İŞ, devops). "scripts/cross-app-auth-budget-check.ts"'in
# KENDİSİNE bkz. (gerekçe, mekanizma (A)/(B), iki yönlü kanıt — dosya başı
# yorumunda). `node` ile çalışır — diğer `scripts/*.ts` kontrolleriyle AYNI
# desen (derlemesiz, erasable syntax).
# ---------------------------------------------------------------------------
check_cross_app_auth_budget() {
  node scripts/cross-app-auth-budget-check.ts
}

# ---------------------------------------------------------------------------
# Ham günlük (redaksiyonsuz "tee") ↔ artefakt yükleme sınırı + retention-days
# sınırı (ROADMAP v0.0.20.1, T-022/S7 FIX turu 2 — security tur 2 F1'in FIX
# turu 1 kuralını MUTASYONLA KÖR bulması üzerine YENİDEN TASARLANDI).
#
# FIX TURU 1'İN KURALININ security tur 2'de MUTASYONLA ÖLÇÜLEN İKİ KÖR NOKTASI:
#   (i) tarama yalnızca `.github/workflows/*.yml`'i görüyordu (`find
#       -maxdepth 1`, ayrı bir `find` — script başındaki PAYLAŞILAN
#       `$workflow_action_targets`'ı KULLANMIYORDU). ⭐ GERÇEK düzeltme ise
#       `.github/actions/run-gates/action.yml` İÇİNDEYDİ — composite
#       action'ların `jobs:` anahtarı YOKTUR, eski awk durum makinesi o
#       dosyayı HİÇ TARAMIYORDU. FIX turu 1'in "composite action'lar kapsam
#       DIŞI, çünkü `jobs:` yok" kararı security tarafından ÇÜRÜTÜLDÜ:
#       `jobs:` yokluğu kapsam dışı bırakmanın gerekçesi DEĞİL, BİRİMİN
#       "job" OLMAMASI gerektiğinin kanıtıydı.
#   (ii) kural bir job'da `secrets.` jetonunun LİTERAL GEÇMESİNİ şart
#       koşuyordu — ama gerçek risk (security F1'in kendi gerekçesi) bir
#       job'un KENDİ metninde `secrets.` YAZMASINA bağlı değil: ortam
#       değişkeni başka bir yoldan (devralınan `env:`, çağrılan bir script)
#       gerçek bir sırrı test çıktısına sızdırabilir ve `secrets.` jetonu
#       hiçbir zaman o job'un metninde GEÇMEZ. `ci.yml` genelinde `secrets.`
#       bugün yalnızca `release.yml:82`'de var (ölçüldü) — yani kural pratikte
#       HİÇBİR ZAMAN tetiklenemiyordu.
#
# ⇒ security'nin üç önerisi BİREBİR uygulandı:
#   1. Tarama hedefi artık script başında TEK YERDE türetilen
#      `$workflow_action_targets` (`.github/workflows` + `.github/actions`,
#      AC13/run-bloğu kontrolüyle AYNI küme) — composite action'lar DAHİL.
#   2. `secrets.` ŞARTI KALDIRILDI — redaksiyonsuz `tee` + `upload-artifact`
#      TEK BAŞINA ihlal sayılır.
#   3. `retention-days` ≤ 1 kontrolü EKLENDİ.
#
# BİRİM DEĞİŞTİ — "job" DEĞİL, "redaksiyon korumasının GERÇEKTEN yaşadığı
# yer" (security'nin önerisi, BİREBİR): her STEP (bir `steps:` listesinin
# HER liste öğesi) kendi İÇİNDE "ham tee" + "redaksiyon korumalı mı"
# değerlendirilir — FIX turu 1'in SATIR BAZLI eşleşmesi (`$0 !~
# /redact-test-log/`) GERÇEK dosyada HİÇBİR ZAMAN tutmuyordu, çünkü
# redaksiyon borusu (`| node scripts/redact-test-log.ts \`) ve `tee` komutu
# YAML'in çok satırlı `run:` bloğunda İKİ AYRI SATIRDIR — step bazlı
# değerlendirme bunu düzeltir. "Artefakt yükleniyor" ve "retention-days"
# ise STEP'İ KAPSAYAN BİRİME (workflow dosyasında `jobs:` anahtarı varsa
# JOB, YOKSA — composite action'da olduğu gibi — DOSYANIN TAMAMI) göre
# toplanır; bir job/dosya içinde HERHANGİ bir step korumasız `tee`
# taşıyorsa VE HERHANGİ bir step `upload-artifact` kullanıyorsa İHLAL (iki
# adımın AYNI step olması ŞART DEĞİL — bu, FIX turu 1'in zaten BİLİNÇLİ
# kabul ettiği "fazla-kapsama, az-kapsama DEĞİL" yönüyle AYNI tercih).
#
# ⚠⚠ FIX turu 3 (T-022/S7, security tur 3 M-1 + M-2) — İKİ DÜZELTME, AYNI
# awk BLOĞU, AYNI DÜZENLEME:
#
#   M-1 (adsız step bayrağı miras alıyordu): adım başlangıcı ÖNCEDEN
#   yalnızca `^[[:space:]]*- (name|uses):` İLE tanınıyordu. Korumalı bir
#   step'ten SONRA gelen ADSIZ bir step (`- run:`, `- id:`, `- shell:`) yeni
#   step SAYILMIYORDU; önceki step'in `protected`/`rawtee` bayrakları
#   DEVAM EDİYORDU ve adsız step'teki redaksiyonsuz `tee` MASKELENİYORDU.
#   DÜZELTME: adım başlangıcı artık anahtar ADINDAN BAĞIMSIZ — `steps:`
#   anahtarının AÇTIĞI bölgede (`in_steps_region`) HER `^[[:space:]]*- `
#   liste öğesi — ama GİRİNTİ TAKİBİYLE: yalnızca MEVCUT step'in girintisine
#   EŞİT veya ONDAN AZ girintili bir `- ` satırı yeni (kardeş) step sayılır.
#   `with:` altındaki İÇ İÇE bir dizi (ör. `files: [- a.txt, - b.txt]`
#   YAML sözdizimiyle) MEVCUT step'ten DAHA GİRİNTİLİ olduğu için yeni step
#   SAYILMAZ — aksi hâlde (girinti kontrolü OLMADAN "her `- ` yeni step"
#   sezgisi) bu tür iç içe diziler GERÇEK step'in bayraklarını YANLIŞLIKLA
#   SIFIRLARDI (M-1'i düzeltirken YENİ bir sınıf yanlış-pozitif açardı).
#   `in_steps_region` yalnızca bir `steps:` anahtarı GÖRÜLDÜKTEN SONRA
#   AKTİFTİR — `strategy: matrix: include: - …` gibi `steps:`'TEN ÖNCE
#   gelen iş/job seviyesi diziler bu yüzden step sayılmaz.
#
#   M-2 (yorum satırları jeton taraması ve adım sınırı tespitine giriyordu):
#   `tee`/`redact-test-log`/`upload-artifact`/`retention-days` jetonları
#   ÖNCEDEN yorum (`#`) satırlarında da eşleşiyordu — (a) ham `tee` taşıyan
#   bir step'in İÇİNE konan açıklayıcı bir yorum (`# … redact-test-log …`)
#   `protected` bayrağını SAHTE olarak ayağa kaldırıp gerçek ihlali
#   SUSTURABİLİYORDU (yanlış negatif); (b) gerçek dosyanın SALT-YORUM
#   yeniden sözcüklenmiş bir kopyası (yorum DIŞI sıfır fark) yorumların
#   jeton TAŞIMASINA bağlı TESADÜFİ bir sonuç üretebiliyordu (yanlış
#   pozitif/negatif riski — bugünkü yeşilin KANIT DEĞERİ düşüktü).
#   DÜZELTME: `^[[:space:]]*#` İLE başlayan satırlar hem jeton taramasından
#   hem adım-başlangıcı tespitinden TAMAMEN HARİÇ (yorumlanmış bir
#   `# - name: …` de bir adım AÇMAZ).
# ---------------------------------------------------------------------------
check_raw_log_upload_boundary() {
  fail_if_targets_empty "ham günlük ↔ artefakt yükleme sınırı" || return 1

  local violation=false
  local file
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    [ -f "$file" ] || continue

    local findings
    findings="$(awk '
      BEGIN {
        injobs = 0
        group = "__FILE__"
        norder = 0
        instep = 0
        step_indent = -1
        in_steps_region = 0
      }
      function flush_step() {
        if (instep) {
          if (!(group in seen)) {
            seen[group] = 1
            order[++norder] = group
          }
          if (rawtee && !protected) grp_unprotected[group] = 1
          if (rawtee) grp_rawtee[group] = 1
          if (uploads) grp_uploads[group] = 1
          if (retentions != "") grp_retentions[group] = grp_retentions[group] " " retentions
        }
        instep = 0
        rawtee = 0
        protected = 0
        uploads = 0
        retentions = ""
      }
      {
        line = $0
        if (line ~ /^jobs:[[:space:]]*$/) {
          flush_step()
          injobs = 1
          group = "__PREAMBLE__"
          in_steps_region = 0
          step_indent = -1
          next
        }
        if (injobs && line ~ /^  [A-Za-z0-9_-]+:[[:space:]]*$/) {
          flush_step()
          g = line
          sub(/^  /, "", g)
          sub(/:[[:space:]]*$/, "", g)
          group = g
          in_steps_region = 0
          step_indent = -1
          next
        }
        # M-2 — yorum satırları jeton taramasından VE adım-başlangıcı
        # tespitinden TAMAMEN hariç (bkz. fonksiyon başı yorumu).
        if (line ~ /^[[:space:]]*#/) {
          next
        }
        if (line ~ /^[[:space:]]*steps:[[:space:]]*$/) {
          flush_step()
          in_steps_region = 1
          step_indent = -1
          next
        }
        # M-1 — adım başlangıcı anahtar ADINDAN BAĞIMSIZ: steps
        # bölgesinde HER `- ` liste öğesi, AMA yalnızca mevcut adımın
        # girintisine eşit/ondan az girintiliyse (kardeş liste öğesi).
        # Daha girintili bir `- ` (ör. with altında iç içe bir dizi)
        # mevcut adımın İÇİNDE sayılır, yeni adım AÇMAZ (bkz. fonksiyon
        # başı yorumu).
        if (in_steps_region && line ~ /^[[:space:]]*- /) {
          tmp = line
          sub(/[^ ].*$/, "", tmp)
          indent = length(tmp)
          if (!instep || indent <= step_indent) {
            if (instep && indent <= step_indent) flush_step()
            instep = 1
            step_indent = indent
            rawtee = 0
            protected = 0
            uploads = 0
            retentions = ""
          }
        }
        if (instep) {
          if (line ~ /tee[[:space:]]/) rawtee = 1
          if (line ~ /redact-test-log/) protected = 1
          if (line ~ /actions\/upload-artifact@/) uploads = 1
          if (match(line, /retention-days:[[:space:]]*[0-9]+/)) {
            val = substr(line, RSTART, RLENGTH)
            sub(/^retention-days:[[:space:]]*/, "", val)
            retentions = retentions " " val
          }
        }
      }
      END {
        flush_step()
        for (i = 1; i <= norder; i++) {
          g = order[i]
          if (grp_unprotected[g] && grp_uploads[g]) {
            print "BOUNDARY\t" g
          }
          if (grp_rawtee[g] && grp_uploads[g]) {
            if (grp_retentions[g] == "") {
              print "RETENTION_MISSING\t" g
            } else {
              n = split(grp_retentions[g], parts, " ")
              for (j = 1; j <= n; j++) {
                if (parts[j] != "" && parts[j] + 0 > 1) {
                  print "RETENTION\t" g "\t" parts[j]
                }
              }
            }
          }
        }
      }
    ' "$file")"

    if [ -n "$findings" ]; then
      local kind grp val
      while IFS=$'\t' read -r kind grp val; do
        [ -z "$kind" ] && continue
        case "$kind" in
          BOUNDARY)
            echo "Ham günlük ↔ artefakt yükleme sınırı İHLALİ — $file / birim \"$grp\": redaksiyonsuz (\"redact-test-log\" YOK) bir \"tee\" çıktısı actions/upload-artifact İLE yükleniyor (secrets.* şartı YOK)."
            ;;
          RETENTION)
            echo "Ham günlük ↔ artefakt yükleme sınırı İHLALİ — $file / birim \"$grp\": 'retention-days' ${val} — 1'den büyük (ham test günlüğü artefaktının anonim indirme penceresi gereksiz uzatılıyor)."
            ;;
          RETENTION_MISSING)
            echo "Ham günlük ↔ artefakt yükleme sınırı İHLALİ — $file / birim \"$grp\": ham test günlüğü artefakt olarak yükleniyor ama 'retention-days' hiç tanımlı değil (varsayılan pencere çok uzun)."
            ;;
        esac
        violation=true
      done <<<"$findings"
    fi
  done <<<"$workflow_action_targets"

  if [ "$violation" = true ]; then
    return 1
  fi
  echo "Ham günlük ↔ artefakt yükleme sınırı: .github/workflows + .github/actions genelinde hiçbir birim redaksiyonsuz bir ham günlüğü artefakt olarak yüklemiyor; \"tee\" kullanan birimlerin tamamında retention-days ≤ 1."
  return 0
}

# ---------------------------------------------------------------------------
# actionlint — yalnızca kurulu ise (indirme CI'a özgü, kapsam dışı — bkz.
# dosya başı not). Yerelde yoksa BLOKLAMADAN uyarı verir.
# ---------------------------------------------------------------------------
check_actionlint_if_available() {
  if ! command -v actionlint >/dev/null 2>&1; then
    echo "actionlint yerelde kurulu değil — atlanıyor (BLOKLAMIYOR, indirme CI'a özgü/kapsam dışı)."
    return 0
  fi
  actionlint
}

# ---------------------------------------------------------------------------
# `pnpm test:contract` komut zinciri — script varlığı + sahte yeşil
# dedektörü + üretilen sözleşme dosyasının/üretici-serileştirici script'lerinin
# varlığı (ROADMAP v0.0.22, T-026/S3, devops).
#
# TEK `run_step` altında ÜÇ alt kontrol — emsal `check_adr22_k1d_shellout_
# boundary` (yukarıda): bu üç kontrol birbirinden BAĞIMSIZ veri kaynağı
# okusa da hepsi AYNI "test:contract komut zinciri çalışır durumda mı"
# sorusuna hizmet eder; TEK adım olarak sayılır (22. adımın ÜZERİNE tek bir
# 23. adım eklenir, üçe bölünmez).
#
# ⚠⚠ BAĞLAYICI KISIT (a) — `.github/ci-expected-test-packages.txt` DESENİ
# BURADA KULLANILAMAZ: `check_fake_green_test_packages`/`check_fake_green_
# isolation_packages` (yukarıda) beklenen paket kümesini `.github/` altında
# bir beyan dosyasından okuyor, ama `.github/**` bu T-026 alt görevinde
# DOKUNULMAZ (devops'un dosya listesi kök `package.json` + `packages/trpc/
# package.json` + `turbo.json` + bu dosya ile SINIRLI). ⇒ beklenen küme
# (`@arkesoft/trpc`) BİLİNÇLİ OLARAK bu script'in İÇİNE gömülüyor —
# `packages/trpc/package.json`'ın BUGÜN `test:contract`'ı SAHİPLENEN TEK
# paket olması (S1'in `contract:generate`'i ekleyişiyle AYNI yer, ölçüldü:
# `pnpm exec turbo run test:contract --dry=json | jq -r '.tasks[]|
# select(.task=="test:contract" and .command!="<NONEXISTENT>")|.package'`
# → tam olarak `@arkesoft/trpc`) bu gömülü sabiti doğruluyor. Bu sabit
# `.github/ci-expected-test-packages.txt`'e EKLENMEDİ çünkü o dosya
# `.github/**`'in bir parçası — CI tarafının bu kümeyi KENDİ sahte yeşil
# dedektöründe de doğrulaması gerekir, ama o değişiklik bu T-026/S3'ün
# KAPSAMI DIŞINDA (CI parite boşluğu — handoff raporunda BİLDİRİLDİ,
# `docs`/S4 vade v0.0.23 borcu yazacak).
#
# ⚠ BAĞLAYICI KISIT (b) — sayı pini (17 prosedür / 7 ad alanı) BURAYA
# KONULMUYOR: bu sayılar `docs/api-contract-surface.json`'ın İÇİNDEN
# okunsaydı bayat bir dosyanın kendi kendini doğrulaması olurdu (dosya
# üretici koşturulmadan da eski hâliyle kalabilir). Tazeliği ancak CANLI
# router kanıtlayabilir — o doğrulama `packages/trpc/src/__tests__/
# contract-surface.test.ts`'te ZATEN var (S1 ekledi) ve `pnpm test:contract`
# onu koşturur; bu script'in ÜÇÜNCÜ alt kontrolü yalnızca dosyanın VARLIĞINI
# ve üretici/serileştirici script'lerin VARLIĞINI denetler (fail-closed),
# İÇERİĞİN sayısal doğruluğunu DEĞİL.
# ---------------------------------------------------------------------------
check_test_contract_chain() {
  local violation=false

  # --- Alt kontrol 1: kök package.json scripts["test:contract"] DOLU ---
  # (emsal: check_ac1_root_e2e_visual_scripts, satır ~543 — jq ile oku,
  # boş/yok ise fail-closed İHLAL.)
  local root_package_json="package.json"
  if [ ! -f "$root_package_json" ]; then
    echo "test:contract zinciri İHLALİ — $root_package_json bulunamadı — fail-closed."
    violation=true
  else
    local root_script_value
    if ! root_script_value="$(jq -r '.scripts["test:contract"] // ""' "$root_package_json")"; then
      echo "test:contract zinciri taraması hata verdi: $root_package_json jq ile okunamadı — fail-closed."
      violation=true
    elif [ -z "$root_script_value" ]; then
      echo "test:contract zinciri İHLALİ — kök $root_package_json 'scripts[\"test:contract\"]' tanımlı değil (boş veya yok)."
      violation=true
    else
      echo "Alt kontrol 1: kök $root_package_json 'test:contract' script'i dolu (\"$root_script_value\")."
    fi
  fi

  # --- Alt kontrol 2: sahte yeşil dedektörü — turbo görevini GERÇEKTEN
  #     sahiplenen paket kümesi tam olarak "@arkesoft/trpc" (bilinçli gömülü
  #     sabit, yukarıdaki (a) gerekçesi). Bu olmadan packages/trpc'den
  #     script silinirse `pnpm test:contract` sıfır iş yapıp exit 0 verirdi.
  local expected_contract_test_packages="@arkesoft/trpc"
  local actual_contract_test_packages
  if ! actual_contract_test_packages="$(pnpm exec turbo run test:contract --dry=json 2>/dev/null \
    | jq -r '.tasks[] | select(.task == "test:contract" and .command != "<NONEXISTENT>") | .package' \
    | sort -u)"; then
    echo "test:contract zinciri İHLALİ: sahte yeşil dedektörü — turbo/jq hata verdi."
    violation=true
  elif [ "$actual_contract_test_packages" != "$expected_contract_test_packages" ]; then
    echo "test:contract zinciri İHLALİ — sahte yeşil dedektörü: görevi GERÇEKTEN sahiplenen paket kümesi beklenenden SAPTI."
    echo "Beklenen (bu script'in İÇİNE gömülü, (a) gerekçesi):"; printf '%s\n' "$expected_contract_test_packages"
    echo "Gerçek:"; printf '%s\n' "$actual_contract_test_packages"
    violation=true
  else
    echo "Alt kontrol 2: test:contract görevini GERÇEKTEN sahiplenen paket kümesi tam olarak \"$expected_contract_test_packages\"."
  fi

  # --- Alt kontrol 3: üretilen sözleşme dosyası + üretici/serileştirici
  #     script'lerin VARLIĞI (fail-closed; İÇERİĞİN sayısal tazeliği DEĞİL —
  #     (b) gerekçesi).
  local contract_surface_file="docs/api-contract-surface.json"
  local generator_script="packages/trpc/scripts/generate-contract-surface.ts"
  local serializer_script="packages/trpc/scripts/serialize-contract-surface.ts"

  if [ ! -s "$contract_surface_file" ]; then
    echo "test:contract zinciri İHLALİ — $contract_surface_file yok veya boş."
    violation=true
  fi
  if [ ! -f "$generator_script" ]; then
    echo "test:contract zinciri İHLALİ — üretici script bulunamadı: $generator_script"
    violation=true
  fi
  if [ ! -f "$serializer_script" ]; then
    echo "test:contract zinciri İHLALİ — serileştirici script bulunamadı: $serializer_script"
    violation=true
  fi
  if [ "$violation" != true ]; then
    echo "Alt kontrol 3: $contract_surface_file var ve boş değil; $generator_script ve $serializer_script mevcut."
  fi

  if [ "$violation" = true ]; then
    return 1
  fi
  return 0
}

# ---------------------------------------------------------------------------
# AC-45 + AC-46 — hata i18n anahtarı kataloğu drift kapısı (ROADMAP v0.0.18,
# T-027/S8). TEK adım, ÜÇ alt kontrol — emsal `check_adr22_k1d_shellout_
# boundary`/`check_test_contract_chain` (yukarıda): üç bağımsız ölçüm AYNI
# "35 anahtarlık katalog defterden okuma GERÇEKTEN korunuyor mu" sorusuna
# hizmet eder; TEK adım olarak sayılır (23. adımın ÜZERİNE tek bir 24. adım
# eklenir, üçe bölünmez).
#
# Alt kontrol 1 — literal atama taraması. Üretim kodu artık ERROR_MESSAGE_
# KEYS.<KOD> (@arkesoft/errors) kayıt defterinden okuyor (T-027/S2+S3); bir
# hata gövdesinin kullanıcı mesajı anahtarı alanına DOĞRUDAN bir dize
# literali atanması defterin atlandığı anlamına gelir ve katalog drift
# testini (AC-45) BAYPAS EDER. Bu, AC4'ün (yukarıda) BİREBİR KARDEŞİ — ikisi
# de "bir alan yalnızca TEK bir kaynaktan okunur" garantisini mekanik olarak
# zorluyor; bu kontrol `pnpm lint`'teki AYNI kısıtı denetleyen ESLint
# seçicisinden (alt kontrol 2) BAĞIMSIZ bir ikinci kanıt.
#
# ⚠⚠ KAPSAM KARARI (ölçülmüş, T-027/S3+S4): `apps/*/src`+`packages/*/src`
# genelinde bu literal atama BUGÜN 26 — hepsinin konumu `__tests__/` altı ve
# hepsi gerçek 35'lik katalogdan AYRIK sentetik PROBE anahtarları kullanıyor
# (S2'nin `errorMessageKeySchema.safeParse` negatif kanıtı bu ayrıklığı
# zaten gösteriyor — bkz. `packages/errors/src/error-message-keys.ts`).
# `__tests__` DIŞINDA bu alan ZATEN sıfır — bu yüzden yasak ÜRETİM yollarına
# uygulanıyor (S4'ün ESLint kapsamıyla BİREBİR aynı dizin istisnası,
# `PRODUCTION_ONLY_IGNORES`). Hedef küme `apps/*/src` + `packages/*/src`
# (themes kapsam DIŞI — R6/A-T27-5, i18n hiç almıyor).
#
# Jeton BİLEREK iki parçaya bölünmüş kuruluyor (literal-jeton kuralı,
# AGENT_BASELINE.md §5 — bu disiplin YORUMLARA da uygulanır, bu yüzden bu
# yorum da taranan hata gövdesi alanının adını bitişik YAZMAZ). Bu kural
# `pnpm guards`'ı ÜÇ KEZ kırdı (T-014, T-015×2) — AC4/AC8/AC16 ile AYNI
# disiplin.
#
# Alt kontrol 2 — ESLint seçicisinin `packages/config/eslint/base.js`'teki
# VARLIĞI, TEKLİĞİ ve kural dizisine GERÇEKTEN BAĞLI olması. Seçici silinirse
# `pnpm lint` SESSİZCE yeşil kalır (tam bir sahte yeşil) — emsal BİREBİR:
# `check_axe_single_source`, `check_slug_grammar_single_source` (yukarıda).
#
# ⚠⚠ ÖLÇÜLMÜŞ KÖR NOKTA (bu alt kontrolün KENDİ geliştirme turunda
# mutasyonla bulundu — AC seçicisinin DEĞER metnini (`Property[key.name=...]
# > Literal`) aramak YETERSİZ: `const <ad>LiteralSelector = {...}` TANIMI
# dursa ama `no-restricted-syntax` DİZİSİNDEN SİLİNSE (kural adı değişmez,
# seçici artık hiçbir TS dosyasına uygulanmaz), seçicinin METNİ dosyada
# HÂLÂ bir kez geçtiği için ESKİ kontrol YANLIŞ YEŞİL verirdi — tam S4'ün
# flat-config notunun ("sonraki eşleşen blok öncekini TAMAMEN geçersiz
# kılıyor") KARDEŞİ bir kaçış yolu. Düzeltme: seçiciyi TAŞIYAN DEĞİŞKEN
# ADININ (tanım + kullanım) dosyadaki TOPLAM geçiş sayısı sayılır — tanım
# TEK başına kalırsa (kullanımdan düşmüşse) sayı 1'e iner ve İHLAL verir.
#
# Alt kontrol 3 — `MONEY_NAME_SOURCE`'un TEK kopya olması (üç kopya = üç ayrı
# drift kaynağı, T-027/S4'ün dosya başı yorumu) + altı float-para fixture
# dosyasının VARLIĞI (`packages/config/eslint/__fixtures__`).
#
# ⚠⚠ DÜZELTME (T-027/S8 düzeltme turu 1, M2): alt kontrol 3'ün ilk hâli
# yalnızca `MONEY_NAME_SOURCE` ATAMASININ tekliğini sayıyordu; `moneyRestricted
# SyntaxSelectors`'ı TAŞIYAN değişkenin `no-restricted-syntax` KURAL DİZİSİNE
# GERÇEKTEN BAĞLI olup olmadığını denetlemiyordu — alt kontrol 2'nin kendi
# geliştirme turunda bulduğu kör nokta bu kardeş kontrole TAŞINMAMIŞTI. `qa`
# mutasyonla kanıtladı: dizideki `...moneyRestrictedSyntaxSelectors,`
# kullanım satırı silinirse tanım dosyada DURUR, eski 3a "tek kopya" der,
# `pnpm lint` SESSİZCE yeşil kalır ve AC-47'nin float-para koruması TAMAMEN
# kaybolur. Alt kontrol 3a-ii (aşağıda) bunu alt kontrol 2 ile BİREBİR AYNI
# desenle kapatır: değişken adının (tanım + kullanım) TOPLAM geçiş sayısı
# sayılır. Beklenen sayı her değişken için AYRI ÖLÇÜLÜR — `rawSqlRestricted
# SyntaxSelectors`'ın kendi geçiş sayısı (1 tanım + 2 kullanım = 3) buraya
# KÖRLEMESİNE kopyalanmaz.
#
# Tarama `-r` taşıyor (AGENT_BASELINE.md §5: "komut çıktısızlığı ≠ bulgu
# yokluğu" — bayraksız/derinliksiz bir tarama sessizce tek seviyede kalıp
# boş çıktıyı "temiz" sandırabilirdi).
# ---------------------------------------------------------------------------
check_ac45_ac46_error_catalog_and_money_lint_guards() {
  local violation=false

  # --- Alt kontrol 1: literal atama taraması (apps/*/src + packages/*/src,
  #     __tests__ HARİÇ) — SIFIR bekleniyor. ---
  local key_token_a='userMessage'
  local key_token_b='Key'
  local key_token="${key_token_a}${key_token_b}"
  local literal_matches
  literal_matches="$(grep -rnE --include='*.ts' --exclude-dir=__tests__ -- \
    "${key_token}:[[:space:]]*(['\"\`])" apps/*/src packages/*/src 2>/dev/null || true)"
  if [ -n "$literal_matches" ]; then
    echo "AC-45 alt kontrol 1 İHLALİ — hata gövdesinin kullanıcı mesajı anahtarı alanına üretim kodunda DOĞRUDAN bir dize literali atanmış (kayıt defteri ERROR_MESSAGE_KEYS.<KOD>, @arkesoft/errors, ATLANMIŞ):"
    printf '%s\n' "$literal_matches"
    violation=true
  else
    echo "AC-45 alt kontrol 1: apps/*/src + packages/*/src (__tests__ hariç) genelinde literal atama bulunamadı."
  fi

  # --- Alt kontrol 2: ESLint seçicisinin varlığı + kural dizisine BAĞLI
  #     olması. Seçiciyi taşıyan değişken adı İKİ KEZ geçmeli: bir
  #     `const <ad> = {...}` TANIMI + bir `no-restricted-syntax` dizisi
  #     İÇİNDE bir KULLANIM. Tanım TEK başına kalırsa (1) ya da seçici
  #     TAMAMEN silinirse (0) İHLAL — yalnızca seçici METNİNİ aramak bu
  #     ikisini AYIRT EDEMEZDİ (yukarıdaki ⚠⚠ notu). ---
  local eslint_base_file="packages/config/eslint/base.js"
  if [ ! -f "$eslint_base_file" ]; then
    echo "AC-45 alt kontrol 2 taraması hata verdi: $eslint_base_file bulunamadı — fail-closed."
    violation=true
  else
    local selector_var_name="${key_token}LiteralSelector"
    local selector_ref_count
    selector_ref_count="$(grep -cE -- "\\b${selector_var_name}\\b" "$eslint_base_file" || true)"
    if [ "$selector_ref_count" != "2" ]; then
      echo "AC-45 alt kontrol 2 İHLALİ — $eslint_base_file'ta literal yasağı seçicisinin değişkeni (tanım + kural dizisindeki kullanım) TAM İKİ geçiş bekleniyordu, $selector_ref_count kez bulundu (0 ise seçici silinmiş; 1 ise tanım dururken kural dizisinden DÜŞÜRÜLMÜŞ — sessiz sahte yeşil; >2 ise ikinci bir kopya doğmuş)."
      violation=true
    else
      echo "AC-45 alt kontrol 2: literal yasağı seçicisi $eslint_base_file'ta tanımlı VE kural dizisine bağlı (tam iki geçiş)."
    fi
  fi

  # --- Alt kontrol 3a: MONEY_NAME_SOURCE ataması TEK kopya. ---
  if [ -f "$eslint_base_file" ]; then
    local money_source_decl_count
    money_source_decl_count="$(grep -cE 'MONEY_NAME_SOURCE[[:space:]]*=' "$eslint_base_file" || true)"
    if [ "$money_source_decl_count" != "1" ]; then
      echo "AC-46 alt kontrol 3 İHLALİ — MONEY_NAME_SOURCE ataması $eslint_base_file'ta TAM BİR kez bekleniyordu, $money_source_decl_count kez bulundu (birden fazla kopya üç ayrı drift kaynağı açar)."
      violation=true
    else
      echo "AC-46 alt kontrol 3: MONEY_NAME_SOURCE $eslint_base_file'ta tek kopya."
    fi
  fi

  # --- Alt kontrol 3a-ii (T-027/S8 düzeltme turu 1, M2 — bu kardeş kontrole
  #     alt kontrol 2'nin dersi UYGULANMAMIŞTI): yukarıdaki 3a yalnızca
  #     `MONEY_NAME_SOURCE` ATAMASININ tekliğini sayıyordu — üç float-para
  #     seçicisini TAŞIYAN `moneyRestrictedSyntaxSelectors` değişkeninin
  #     `no-restricted-syntax` KURAL DİZİSİNE GERÇEKTEN BAĞLI olup olmadığını
  #     DENETLEMİYORDU. `qa` mutasyonla kanıtladı: dizideki
  #     `...moneyRestrictedSyntaxSelectors,` kullanım satırı SİLİNİRSE tanım
  #     (`const moneyRestrictedSyntaxSelectors = [...]`) dosyada DURUR, 3a
  #     hâlâ "tek kopya" der, `pnpm lint` SESSİZCE yeşil kalır ve AC-47'nin
  #     float-para koruması tamamen kaybolur. Düzeltme alt kontrol 2'yle
  #     BİREBİR AYNI desen: değişken ADININ (tanım + kullanım) TOPLAM geçiş
  #     sayısı sayılır.
  #
  #     ⚠⚠ Beklenen sayı KÖRLEMESİNE kopyalanmaz — ÖLÇÜLÜR. Bugün dosyada
  #     `moneyRestrictedSyntaxSelectors` TAM İKİ kez geçiyor (`:190` tanım +
  #     `:386` kural dizisi içi kullanım) ⇒ beklenen 2. (Kardeş
  #     `rawSqlRestrictedSyntaxSelectors`'ın kendi geçiş sayısı FARKLI —
  #     bir tanım + İKİ kullanım yeri (`:254`, `:384`) = 3 — bu yüzden o
  #     sabite buradaki "2" sayısı KOPYALANMAZ; bu kontrol yalnızca
  #     `moneyRestrictedSyntaxSelectors`'ı denetler.)
  if [ -f "$eslint_base_file" ]; then
    local money_selectors_var_name="moneyRestrictedSyntaxSelectors"
    local money_selectors_ref_count
    money_selectors_ref_count="$(grep -cE -- "\\b${money_selectors_var_name}\\b" "$eslint_base_file" || true)"
    if [ "$money_selectors_ref_count" != "2" ]; then
      echo "AC-46 alt kontrol 3a-ii İHLALİ — $eslint_base_file'ta float-para seçicilerinin değişkeni ($money_selectors_var_name; tanım + kural dizisindeki kullanım) TAM İKİ geçiş bekleniyordu, $money_selectors_ref_count kez bulundu (0 ise seçiciler silinmiş; 1 ise tanım dururken kural dizisinden DÜŞÜRÜLMÜŞ — sessiz sahte yeşil, AC-47'nin TÜM float-para koruması kaybolur; >2 ise ikinci bir kopya doğmuş)."
      violation=true
    else
      echo "AC-46 alt kontrol 3a-ii: float-para seçicilerinin değişkeni ($money_selectors_var_name) $eslint_base_file'ta tanımlı VE kural dizisine bağlı (tam iki geçiş)."
    fi
  fi

  # --- Alt kontrol 3b: altı float-para fixture dosyasının VARLIĞI. ---
  local fixture_dir="packages/config/eslint/__fixtures__"
  local required_fixtures=(
    "money-pozitif-1.ts" "money-pozitif-2.ts" "money-pozitif-3.ts"
    "money-negatif-1.ts" "money-negatif-2.ts" "money-negatif-3.ts"
  )
  local fixture_violation=false
  local fixture_name
  for fixture_name in "${required_fixtures[@]}"; do
    if [ ! -f "$fixture_dir/$fixture_name" ]; then
      echo "AC-46 alt kontrol 3 İHLALİ — beklenen float-para fixture'ı bulunamadı: $fixture_dir/$fixture_name"
      fixture_violation=true
      violation=true
    fi
  done
  if [ "$fixture_violation" = false ]; then
    echo "AC-46 alt kontrol 3: altı float-para fixture'ı ($fixture_dir) mevcut."
  fi

  if [ "$violation" = true ]; then
    return 1
  fi
  return 0
}

# ---------------------------------------------------------------------------
# AC-61 — Sentry DSN sızıntısı + reddedilen OpenTelemetry meta-paketi taraması
# (ROADMAP v0.0.17, T-028/S10, architect AC-61; S2'nin ölçümü AC-61'i üç alt
# kontrolden İKİYE daralttı — "`--import` yolu ↔ `preload.ts` sabiti eşitliği"
# alt kontrolü S6 `preload.ts` YAZMADIĞI için DÜŞTÜ, bkz. handoff).
#
# Depo PUBLIC (⚠⚠ `gh repo view` ile ölçüldü) ⇒ bir sır/anahtar sızıntısı
# herkese açık okunabilir olur. `SENTRY_DSN` BUGÜN `apps/api/src/config/
# api-env.ts`'te yalnızca OPSİYONEL tutulur ve `.env.example`'a BİLEREK
# EKLENMEDİ (S5 kararı, K-A28-2) — bu kontrol o kararın GERİ KAYMADIĞINI
# (ör. birinin yerel/sandbox bir DSN'i yanlışlıkla commit etmesini) mekanik
# olarak zorlar. İkinci alt kontrol kullanıcı tarafından AÇIKÇA REDDEDİLEN
# OpenTelemetry "auto" + "-instrumentations-node" meta-paketinin (onlarca
# enstrümantasyonu tedarik zincirine tek seferde sokar) ne bir
# `package.json`'da ne bir import/require ifadesinde doğmadığını zorlar —
# jetonun bu yorumdaki yazımı da (AŞAĞIDAKİ kodla AYNI disiplin) BİLEREK
# PARÇALI.
#
# Literal-jeton kuralı (AGENT_BASELINE.md §5, AC4/AC8/AC16/AC-45 ile AYNI
# disiplin) — S1'in İLK denemesinde `pnpm-workspace.yaml`'a yazdığı KENDİ
# açıklama yorumunun jetonu bitişik taşıdığı için tarama KENDİ notunu ÖLÇÜLMÜŞ
# bir örnekle bulmuştu (bkz. handoff BAĞLAM ÖZETİ) — meta-paket jetonu (alt
# kontrol 2) BU YÜZDEN aşağıda PARÇALI kurulur; bu yorumun KENDİSİ de onu
# BİTİŞİK YAZMAZ. ⚠ DÜZELTME (T-028 düzeltme turu 1, `security` G6): DSN alt
# kontrolü (alt kontrol 1) artık BARINDIRICIYA ÖZGÜ bir jeton TAŞIMIYOR —
# desen genel bir "32-hex@alan-adı/sayısal-id" biçimi arıyor (self-hosted
# dahil); bölünmüş değişken çifti bu yüzden KALDIRILDI, kuralı ihlal eden bir
# literal de YOK.
#
# Tarama hedefi `git ls-files` (TEK seferde türetilir, iki alt kontrol de
# AYNI listeyi kullanır) — depo TAKİP EDİLEN dosyalarının TAMAMı (node_modules/
# dist/.turbo zaten .gitignore ile hariç); hedef `.ts`/`.yml` gibi dar bir
# uzantı kümesiyle SINIRLANMADI çünkü bir DSN/paket adı herhangi bir dosyada
# (örn. bir `.md`, bir `.json`, bir yorum) sızabilir. `grep -r` BİLEREK
# KULLANILMADI: hedef küme zaten `git ls-files` ile (tüm depo ağacı DAHİL)
# türetildiği için `grep`'e DOĞRUDAN bir DİZİN verilmiyor — AGENT_BASELINE.md
# §5'in "`-r` eksikse dizine inmez" uyarısı `grep`'e dizin verilen çağrılar
# İÇİNDİR (bu dosyadaki `check_adr22_k1d_shellout_boundary`/
# `check_slug_grammar_single_source` gibi); burada `xargs` AÇIK DOSYA LİSTESİ
# üzerinde çalışıyor, AC4/AC16/`check_playwright_retries_single_source` ile
# AYNI (önceden ölçülmüş, dizin-atlama riski taşımayan) desen.
# ---------------------------------------------------------------------------
check_ac61_sentry_dsn_and_rejected_otel_metapackage() {
  local violation=false

  local tracked_files
  if ! tracked_files="$(git ls-files)"; then
    echo "AC-61 taraması hata verdi: 'git ls-files' çalışmadı — fail-closed."
    return 1
  fi
  if [ -z "$tracked_files" ]; then
    echo "AC-61 taraması hata verdi: depo takip edilen dosya listesi boş — fail-closed."
    return 1
  fi

  local tracked_array=()
  while IFS= read -r tracked_line; do
    [ -z "$tracked_line" ] && continue
    tracked_array+=("$tracked_line")
  done <<<"$tracked_files"

  # --- Alt kontrol 1: gerçek biçimli Sentry DSN — SIFIR bekleniyor. --------
  # Biçim: 32 hex karakterlik genel anahtar + "@" + herhangi bir barındırma
  # alan adı + "/" + sayısal proje id'si.
  #
  # ⚠ DÜZELTME (T-028 düzeltme turu 1, `security` G6 — ÖLÇÜLDÜ): önceki desen
  # alan adını "*.sentry.io" barındırmasına SABİTLİYORDU — self-hosted bir DSN
  # (ör. 32 hex anahtar + "@" + arkesoft'un KENDİ alan adı + "/" + proje id'si)
  # KÖR NOKTADA kalıyordu, çünkü o alan adı "sentry.io" ile BİTMİYOR. Desen
  # genel barındırma alan adını kabul edecek şekilde genişletildi — artık HER
  # alan adı için 32-hex + "@" + alan-adı + "/" + sayısal-id biçimini arıyor.
  # Barındırıcıya özgü jeton artık YOK (önceki "sentry"+".io" bölünmüş
  # değişken çifti GEREKSİZ hâle geldi, kaldırıldı) — literal-jeton kuralı
  # (AGENT_BASELINE.md §5) zaten ihlal edilmiyor çünkü aşağıdaki desenin
  # kendisi hiçbir barındırıcı adını BİTİŞİK taşımıyor.
  local dsn_pattern="[0-9a-f]{32}@[A-Za-z0-9.-]+/[0-9]+"

  local dsn_matches
  dsn_matches="$(printf '%s\0' "${tracked_array[@]}" \
    | xargs -0 grep -nE --binary-files=without-match -- "$dsn_pattern" 2>/dev/null || true)"
  if [ -n "$dsn_matches" ]; then
    echo "AC-61 alt kontrol 1 İHLALİ — depo PUBLIC; gerçek biçimli bir Sentry DSN bulundu (sır sızıntısı):"
    printf '%s\n' "$dsn_matches"
    violation=true
  else
    echo "AC-61 alt kontrol 1: gerçek biçimli bir Sentry DSN bulunamadı (git ls-files genelinde)."
  fi

  # --- Alt kontrol 2: reddedilen OpenTelemetry meta-paketi — SIFIR
  #     bekleniyor (ne package.json'da ne import/require'da).
  local otel_pkg_a='@opentelemetry/auto-instrumen' otel_pkg_b='tations-node'
  local otel_pkg="${otel_pkg_a}${otel_pkg_b}"

  local otel_matches
  otel_matches="$(printf '%s\0' "${tracked_array[@]}" \
    | xargs -0 grep -nF --binary-files=without-match -- "$otel_pkg" 2>/dev/null || true)"
  if [ -n "$otel_matches" ]; then
    echo "AC-61 alt kontrol 2 İHLALİ — reddedilen OpenTelemetry meta-paketi ($otel_pkg) bulundu (onlarca enstrümantasyonu tedarik zincirine sokar, kullanıcı tarafından REDDEDİLDİ):"
    printf '%s\n' "$otel_matches"
    violation=true
  else
    echo "AC-61 alt kontrol 2: reddedilen OpenTelemetry meta-paketi ($otel_pkg) hiçbir package.json/import/require'da bulunamadı."
  fi

  if [ "$violation" = true ]; then
    return 1
  fi
  return 0
}

run_step "AC13 — yasak jeton taraması" check_ac13_forbidden_tokens
run_step "AC5 — sabit Node sürümü yazımı yasağı" check_ac5_node_version_file
run_step "run: bloğu içi şablon ifadesi yasağı" check_run_block_template_expression
run_step "AC8 — release.yml tetikleyici doğrulaması" check_ac8_release_trigger
run_step "Platform sürüm tutarlılığı (--check)" check_platform_version_sync
run_step "scripts/ tip kontrolü (A4)" check_scripts_typecheck
run_step "scripts/ ESLint (A4)" check_scripts_eslint
run_step "Sahte yeşil dedektörü — test paket kümesi" check_fake_green_test_packages
run_step "Sahte yeşil dedektörü — izolasyon paket kümesi" check_fake_green_isolation_packages
run_step "AC4 — GUC jetonları yalnızca tenant-context.ts'te" check_ac4_guc_tokens
run_step "K8 — .env ↔ .env.example anahtar adı drift kontrolü" check_k8_env_example_drift
run_step "Slug grameri tek-kaynak taraması" check_slug_grammar_single_source
run_step "AC-16 — gerçek DNS çağrısı yokluğu taraması" check_ac16_no_real_dns_call
run_step "AC-1 — kök test:e2e/test:visual/test:visual:update script varlığı" check_ac1_root_e2e_visual_scripts
run_step "Bütçe pin tazeliği — AUTH_IP_LIMITS ↔ rate-limit.policy.ts" check_auth_budget_pin_freshness
run_step "ADR-0022 K1(d) — fabrika sızma yasağı + allowlist" check_adr22_k1d_shellout_boundary
run_step "Playwright retries tek-kaynak taraması (S-11)" check_playwright_retries_single_source
run_step "e2e env passthrough — process.env ⊆ turbo.json test:e2e (T-021 İŞ ③)" check_e2e_env_passthrough
run_step "Çapraz-uygulama e2e oran sınırı bütçesi (admin ↔ superadmin, T-022/EK İŞ)" check_cross_app_auth_budget
run_step "Ham günlük ↔ artefakt yükleme + retention-days sınırı (T-022/S7 FIX2)" check_raw_log_upload_boundary
run_step "actionlint (yerelde kuruluysa)" check_actionlint_if_available
run_step "axe tek-kaynak taraması (T-024, A-T24-1)" check_axe_single_source
run_step "test:contract komut zinciri — script + sahte yeşil + sözleşme dosyası (T-026/S3)" check_test_contract_chain
run_step "AC-45 + AC-46 — hata i18n anahtarı kataloğu drift kapısı (T-027/S8)" check_ac45_ac46_error_catalog_and_money_lint_guards
run_step "AC-61 — Sentry DSN sızıntısı + reddedilen OpenTelemetry meta-paketi (T-028/S10)" check_ac61_sentry_dsn_and_rejected_otel_metapackage

echo ""
echo "════════════════════════════════════════════════════════"
echo "guards — özet"
echo "════════════════════════════════════════════════════════"
for i in "${!step_names[@]}"; do
  printf '%-55s %s\n' "${step_names[$i]}" "${step_results[$i]}"
done

if [ "$overall_ok" = true ]; then
  echo ""
  echo "guards: TÜM mekanik adımlar PASS."
  exit 0
else
  echo ""
  echo "guards: EN AZ BİR adım FAIL — yukarıdaki özete bakın."
  exit 1
fi
