#!/usr/bin/env bash
# Re-runnable pre-publication gate.
#
# Scans BOTH the working tree and the full git history for anything that must
# not ship publicly: secrets, personal data, and traces tying the project to a
# specific organisation. Exits non-zero on the first category that fails, so it
# is safe to wire into CI.
#
#   ./tools/publish_check.sh
set -uo pipefail
cd "$(dirname "$0")/.."
fail=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; fail=1; }
section() { printf '\n\033[1m%s\033[0m\n' "$1"; }

ALL_COMMITS=$(git rev-list --all)

section "أ. الأسرار"
for pat in "BEGIN RSA PRIVATE KEY" "BEGIN PRIVATE KEY" "BEGIN OPENSSH PRIVATE KEY" \
           "BEGIN EC PRIVATE KEY" "sk_live_" "pk_live_" "rk_live_" "ghp_" \
           "github_pat_" "AKIA" "AIza" "xoxb-" "xoxp-" "eyJhbGciOi"; do
  n=$(git log --all --oneline -S"$pat" -- . ":(exclude)tools/publish_check.sh" 2>/dev/null | wc -l | tr -d ' ')
  [ "$n" = "0" ] || bad "\"$pat\" موجود في $n commit"
done
[ "$fail" = "0" ] && ok "صفر أسرار في كل التاريخ"

# .env must be ignored in the very first commit, not merely today.
first=$(git rev-list --max-parents=0 HEAD | head -1)
if git show "$first:.gitignore" 2>/dev/null | grep -qE '^\.env$'; then
  ok ".env مُتجاهَل منذ أول commit"
else
  bad ".env غير مُتجاهَل في أول commit ($first)"
fi

section "ب. البيانات الشخصية والملفات الثنائية"
bins=$(git -c core.quotepath=off log --all --diff-filter=A --name-only --format="" \
        | grep -iE '\.(pdf|xlsx?|docx?|zip)$' | sort -u)
if [ -z "$bins" ]; then ok "صفر مستندات ثنائية في التاريخ"
else bad "مستندات ثنائية في التاريخ:"; echo "$bins" | sed 's/^/      /'; fi

section "ج. نسبة الجهة"
for pat in "EPDA" "epda" "SDA-WH" "epda.gov.sa" "sda.gov.sa" "epda.local" \
           "هيئة تطوير المنطقة الشرقية" "Sharqia" "Eastern Province Development"; do
  n=$(git grep -il "$pat" $ALL_COMMITS -- . ":(exclude)tools/publish_check.sh" 2>/dev/null | wc -l | tr -d ' ')
  [ "$n" = "0" ] || bad "\"$pat\" في $n ملف عبر التاريخ"
done
# `SDA` alone, excluding the weekday words that legitimately contain it.
n=$(git grep -hoE '(^|[^A-Za-z])SDA([^A-Za-z]|$)' $ALL_COMMITS -- . ':(exclude)tools/publish_check.sh' 2>/dev/null | wc -l | tr -d ' ')
[ "$n" = "0" ] || bad "\"SDA\" منفردة في $n موضع"
n=$(git log --all --format='%s%n%b' | grep -icE 'epda|sda-wh|هيئة تطوير' || true)
[ "$n" = "0" ] || bad "رسائل commit تذكر الجهة ($n)"
[ "$fail" = "0" ] && ok "صفر أثر للجهة في الشجرة والتاريخ"

section "د. جاهزية النشر"
[ -f LICENSE ] && ok "LICENSE موجود" || bad "LICENSE مفقود"
[ -f .env.example ] && ok ".env.example موجود" || bad ".env.example مفقود"
declared=$(grep -oE "^[A-Z][A-Z0-9_]*=" .env.example 2>/dev/null | tr -d '=' | sort -u)
used=$(grep -rhoE 'getEnv\("[A-Z0-9_]+"|process\.env\.[A-Z][A-Z0-9_]*' \
        apps/webapp/app apps/webapp/server packages 2>/dev/null \
        | sed -E 's/getEnv\("//; s/process\.env\.//' | tr -d '"' | sort -u)
missing=$(comm -13 <(echo "$declared") <(echo "$used") \
          | grep -vE '^(NODE_ENV|CI|VITEST|npm_|PATH|HOME|TZ|PORT|X)$' || true)
[ -z "$missing" ] && ok "‎.env.example مكتمل" \
  || { bad "متغيّرات ناقصة في .env.example:"; echo "$missing" | sed 's/^/      /'; }
grep -q "Epda@\|Org@Admin#" -r --include='*.ts' --include='*.ps1' . 2>/dev/null \
  && bad "كلمات مرور نصّية في الكود" || ok "صفر كلمات مرور نصّية"

printf '\n'
[ "$fail" = "0" ] && { printf '\033[32m✅ جاهز للنشر\033[0m\n'; exit 0; } \
                  || { printf '\033[31m❌ لا تنشر — عالج ما سبق\033[0m\n'; exit 1; }
