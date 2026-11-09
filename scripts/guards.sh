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
