#!/usr/bin/env bash
. "$(dirname "$0")/lib.sh"
check() { [ "$(slugify "$1")" = "$2" ] || { echo "FAIL: '$1' -> '$(slugify "$1")' (want '$2')"; exit 1; }; }
check "Salon Fryzjerski Łucja" "salon-fryzjerski-lucja"
check "  Auto  &  Moto,  Żółć!! " "auto-moto-zolc"
check "Kraków--Café" "krakow-cafe"
echo OK
