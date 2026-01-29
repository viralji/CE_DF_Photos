#!/usr/bin/env bash
# Run from CE_DF_Photos (project root). Copies all app content from pwa/ to root, then removes pwa/.
# Usage: bash scripts/flatten-to-root.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -d "pwa/app" ]; then
  echo "Error: pwa/app not found. Ensure the pwa folder contains the full app (app, components, lib, etc.)."
  exit 1
fi

echo "Copying pwa contents to project root..."

# Copy directories
for dir in app components lib public scripts data; do
  if [ -d "pwa/$dir" ]; then
    rm -rf "$dir"
    cp -R "pwa/$dir" .
    echo "  $dir"
  fi
done

# Copy root-level files
for f in package.json package-lock.json next.config.ts tsconfig.json eslint.config.mjs postcss.config.mjs middleware.ts README.md DEPLOYMENT.md; do
  if [ -f "pwa/$f" ]; then
    cp "pwa/$f" .
    echo "  $f"
  fi
done

# Copy dotfiles if present
[ -f "pwa/.gitignore" ] && cp "pwa/.gitignore" .
[ -f "pwa/.env" ] && cp "pwa/.env" .

echo "Removing pwa folder..."
rm -rf pwa

echo "Done. Run from project root: npm install && npm run db:setup && npm run seed:checkpoints && npm run dev"
echo "Update .env DATABASE_PATH if needed (e.g. data/ce_df_photos.db)."
