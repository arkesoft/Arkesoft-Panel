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
#      `assertTestEnvironment`) TAŞIDIĞINI POZİTİF olarak doğrular.
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
# ⚠ DÜRÜST SINIR (ADR'de YAZILI, burada da TEKRARLANIYOR): iki `runSql`
# gövdesinin (custom-domain-tenant.ts / tenant-cleanup.ts) METİNSEL SAPMASI
# bu kontrolle YAKALANMAZ — bu, deponun bu sınıfta ZATEN KABUL ETTİĞİ bir
# borç (ADR-0022). Bu tarama ÇOĞALMAYI kapatıyor, SAPMAYI değil.
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

  # --- Alt kontrol 2: GERÇEK execFileSync mekanizmasını ('exec'+'psql' dizi
  #     öğeleri) KULLANAN dosya kümesi TAM OLARAK bu ikisi (po kararı —
  #     üçüncü kopya sessizce doğmasın); hedef apps+packages+scripts ------
  local allowed_file_1='apps/storefront/e2e/fixtures/custom-domain-tenant.ts'
  local allowed_file_2='apps/admin/e2e/fixtures/tenant-cleanup.ts'

  local exec_array_file_matches actual_files expected_files
  exec_array_file_matches="$(grep -rlE --include='*.ts' \
    --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=generated --exclude-dir=.turbo \
    -- "$exec_array_needle" apps packages scripts 2>/dev/null || true)"
  actual_files="$(printf '%s\n' "$exec_array_file_matches" | grep -v '^$' \
    | xargs -r grep -lE -- "$psql_array_needle" 2>/dev/null | sort)"
  expected_files="$(printf '%s\n' "$allowed_file_1" "$allowed_file_2" | sort)"

  if [ "$actual_files" != "$expected_files" ]; then
    echo "ADR-0022 K1(d) allowlist İHLALİ — gerçek kabuk-çağrısı mekanizmasını (execFileSync 'exec'+'psql') kullanan dosya kümesi beklenen İKİ fixture'dan SAPTI (üçüncü bir kopya doğmuş olabilir):"
    echo "Beklenen:"; printf '%s\n' "$expected_files"
    echo "Gerçek:"; printf '%s\n' "$actual_files"
    violation=true
  fi

  # --- Alt kontrol 3 (S-2'nin POZİTİF iddiası): her allowlist dosyası
  #     ADR-0022 K1'in (a)+(b) koruma fonksiyonlarının İKİSİNİ de taşımalı
  #     — S-1'in (storefront kopyasının bu ikisini TAŞIMADAN eklenmesi)
  #     tekrarını MEKANİKLEŞTİRİR. ----------------------------------------
  local allowed_file
  for allowed_file in "$allowed_file_1" "$allowed_file_2"; do
    if [ ! -f "$allowed_file" ]; then
      echo "ADR-0022 K1(d) İHLALİ — beklenen allowlist dosyası bulunamadı: $allowed_file"
      violation=true
      continue
    fi
    if ! grep -q "assertDockerHostIsLoopback" "$allowed_file"; then
      echo "ADR-0022 K1(d) İHLALİ — $allowed_file içinde koruma (a) (assertDockerHostIsLoopback) YOK."
      violation=true
    fi
    if ! grep -q "assertTestEnvironment" "$allowed_file"; then
      echo "ADR-0022 K1(d) İHLALİ — $allowed_file içinde koruma (b) (assertTestEnvironment) YOK."
      violation=true
    fi
  done

  if [ "$violation" = true ]; then
    return 1
  fi
  echo "ADR-0022 K1(d): apps/*/src/** istisnasız temiz; gerçek kabuk-çağrısı mekanizmasını kullanan dosya kümesi TAM OLARAK beklenen iki fixture ($allowed_file_1, $allowed_file_2) VE ikisi de (a)+(b) korumalarını taşıyor."
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
run_step "actionlint (yerelde kuruluysa)" check_actionlint_if_available

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
