#!/usr/bin/env bash
# @arkesoft — "run:" bloğu içi şablon ifadesi (${{ ... }}) yasağının TEK
# mantık kaynağı (ROADMAP T-016/S12 fix turu 1, solid M-2).
#
# ÖNCEDEN bu 34 satırlık awk programı `scripts/guards.sh` VE
# `.github/workflows/ci.yml`'nin "run bloğu içi şablon ifadesi yasağı"
# adımında BİREBİR KOPYA olarak iki yerde yaşıyordu (solid T-016 fix turu 1
# M-2 ölçtü). Bu, hedef küme türetiminin ci.yml'de TEK YERDEN (AC13 adımının
# yazdığı `/tmp/ac-workflow-action-targets.txt`) okunurken `guards.sh`'ın
# kendi `find`'ını BAĞIMSIZ koşturmasıyla birleşince, iki kopyanın birbirinden
# SESSİZCE SAPMA riski taşıyordu: biri güncellenip diğeri unutulabilirdi.
# Çözüm: awk programının KENDİSİ artık burada, TEK dosyada yaşıyor; her iki
# çağıran (guards.sh ve ci.yml) sadece bu script'i her hedef dosya için
# çağırır. Mantık BİREBİR taşındı — davranışta (ne bulduğu, ne döndürdüğü)
# hiçbir değişiklik YOK.
#
# Kullanım: check-run-block-template-expression.sh <needle> <dosya>
#   <needle>  — aranan şablon ifadesi öneki (çağıran BİLEREK PARÇALI kurar,
#               bkz. AGENT_BASELINE.md §5 "Literal-jeton kuralı" — bu script
#               `.sh` olduğu için AC13'ün BUGÜNKÜ `.yml`/`.yaml` tarama
#               hedefinin dışında, ama disiplin tutarlılık için korunuyor).
#   <dosya>   — taranacak tek bir iş akışı/composite action dosyası.
#
# Çıkış: 0 — ihlal yok. 1 — ihlal var (eşleşen satır(lar) stdout'a, "NUMARA:
# satır" biçiminde, basılır — çağıran kendi mesaj/ek bağlamını bunun üstüne
# ekler).
set -uo pipefail

if [ "$#" -ne 2 ]; then
  echo "Kullanım: $0 <needle> <dosya>" >&2
  exit 2
fi

needle="$1"
file="$2"

awk -v needle="$needle" '
  BEGIN { in_run = 0; run_indent = -1; bad = 0 }
  {
    line = $0
    trimmed = line
    sub(/^[ \t]*/, "", trimmed)
    indent = length(line) - length(trimmed)
    if (in_run) {
      if (trimmed == "") next
      if (indent <= run_indent) {
        in_run = 0
      } else {
        if (index(line, needle) > 0) { print NR": "line; bad = 1 }
        next
      }
    }
    if (trimmed ~ /^run:[ \t]*\|/ || trimmed ~ /^run:[ \t]*>/) {
      in_run = 1; run_indent = indent; next
    }
    if (trimmed ~ /^run:/) {
      rest = trimmed
      sub(/^run:[ \t]*/, "", rest)
      if (index(rest, needle) > 0) { print NR": "line; bad = 1 }
    }
  }
  END { exit (bad ? 1 : 0) }
' "$file"
