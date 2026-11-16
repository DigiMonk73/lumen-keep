#!/bin/sh
# Builds index.html, the whole game in one file, from src/.
set -e
cd "$(dirname "$0")"
{
  echo '<!doctype html>'
  echo '<html lang="en">'
  echo '<head>'
  echo '<meta charset="utf-8">'
  echo '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
  grep -v 'claude:viewport-fit-sides' src/head.html
  # Clear the notch and home bar on phones.
  echo '<style>#app { padding-top: max(8px, env(safe-area-inset-top, 0px)); padding-bottom: max(8px, env(safe-area-inset-bottom, 0px)); }</style>'
  echo '</head>'
  echo '<body>'
  cat src/body.html
  echo '<script>'
  cat src/0*.js
  echo '</script>'
  echo '</body>'
  echo '</html>'
} > index.html
echo "built index.html ($(wc -c < index.html) bytes)"
