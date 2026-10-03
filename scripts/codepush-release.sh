#!/usr/bin/env bash
# Release Trove's current JavaScript to Codemagic's hosted CodePush server.
#
#   scripts/codepush-release.sh <ios|android> [Staging|Production] [extra code-push release flags]
#
# Examples:
#   scripts/codepush-release.sh ios Staging --description "Fix task card spacing"
#   scripts/codepush-release.sh ios Production --description "Hotfix" --mandatory --rollout 20
#
# Prerequisites: npm install -g @codemagic/code-push-cli, then
#   code-push login "https://codepush.pro" --accessKey <your Codemagic CodePush access key>
#
# Why not `code-push release-react`? It shells out to `react-native bundle`
# (from @react-native-community/cli), which Expo projects don't ship, and it
# would skip Expo Router's entry point and Expo's Metro config. So this script
# builds the bundle exactly like the Xcode/Gradle build does (`expo export:embed`,
# Hermes bytecode) and uploads the folder with `code-push release`.
set -euo pipefail

PLATFORM="${1:?usage: scripts/codepush-release.sh <ios|android> [deployment] [code-push flags]}"
DEPLOYMENT="${2:-Staging}"
shift $(( $# >= 2 ? 2 : 1 ))

case "$PLATFORM" in
  ios) APP_NAME="Trove-iOS"; BUNDLE_NAME="main.jsbundle" ;;
  android) APP_NAME="Trove-Android"; BUNDLE_NAME="index.android.bundle" ;;
  *) echo "Platform must be ios or android" >&2; exit 1 ;;
esac

cd "$(dirname "$0")/.."

# CodePush targets the binary's marketing version (CFBundleShortVersionString /
# versionName). Trove takes it from app.json.
TARGET_BINARY_VERSION="${TARGET_BINARY_VERSION:-$(node -p "require('./app.json').expo.version")}"

# The OTA bundle must be built with the same public env as the store build,
# or the app starts without its Supabase config. Read it from the production
# profile in eas.json unless it's already set.
eval "$(node -e '
  const env = require("./eas.json").build.production.env;
  for (const k of ["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY"]) {
    if (!process.env[k]) console.log(`export ${k}=${JSON.stringify(env[k])}`);
  }
')"

OUT_DIR="build/codepush/$PLATFORM"
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

npx expo export:embed \
  --platform "$PLATFORM" \
  --dev false \
  --entry-file node_modules/expo-router/entry.js \
  --bundle-output "$OUT_DIR/$BUNDLE_NAME" \
  --assets-dest "$OUT_DIR" \
  --bytecode \
  --reset-cache

code-push release "$APP_NAME" "$OUT_DIR" "$TARGET_BINARY_VERSION" \
  --deploymentName "$DEPLOYMENT" \
  "$@"
