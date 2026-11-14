#!/bin/sh
title="$1"
file="$2"
shift 2
body=$(grep "$@" "$file" | cut -c1-220 | head -c 3500 | awk '{printf "%s%%0A", $0}')
echo "::notice title=${title}::${body}"
