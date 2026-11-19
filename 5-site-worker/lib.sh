# Zamienia nazwę firmy na slug repo: "Salon Łucja" -> salon-lucja
slugify() {
  printf '%s' "$1" | iconv -f utf-8 -t ascii//TRANSLIT 2>/dev/null \
    | tr 'A-Z' 'a-z' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g'
}
