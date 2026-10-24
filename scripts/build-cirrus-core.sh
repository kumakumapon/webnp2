#!/usr/bin/env bash
# Rebuild the bundled core with the minimal Cirrus frontend patch.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
core_commit=714f0bef3a24aa419d4cdb0dac9ad02d30855280
build_root="${NP2KAI_WORK_DIR:-$root/.work/cirrus-core}"
mkdir -p "$build_root"
source_dir="$build_root/source"
if [[ ! -d "$source_dir/.git" ]]; then
  git init --quiet "$source_dir"
  git -C "$source_dir" remote add origin https://github.com/uraraworks/NP2kai-wasm.git
  git -C "$source_dir" fetch --depth=1 origin "$core_commit"
  git -C "$source_dir" checkout --quiet --detach FETCH_HEAD
fi
[[ "$(git -C "$source_dir" rev-parse HEAD)" == "$core_commit" ]] || { echo 'Unexpected core source commit' >&2; exit 1; }
if ! git -C "$source_dir" apply --reverse --check "$root/patches/np2kai-cirrus-display.patch" 2>/dev/null; then
  git -C "$source_dir" diff --quiet || { echo 'Use a clean NP2KAI_WORK_DIR for the updated patch' >&2; exit 1; }
  git -C "$source_dir" apply "$root/patches/np2kai-cirrus-display.patch"
fi
# Requires Emscripten 3.1.64, CMake 3.31.x and Ninja on PATH.
emcc --version | head -1 | grep -F '3.1.64' >/dev/null || { echo 'Use Emscripten 3.1.64' >&2; exit 1; }
emcmake cmake -S "$source_dir" -B "$build_root/build" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release -DUSE_SDL=2
cmake --build "$build_root/build" --target emnp21kai_sdl2 --parallel "${BUILD_JOBS:-4}"
cp "$build_root/build/emnp21kai_sdl2.js" "$root/public/core/"
cp "$build_root/build/emnp21kai_sdl2.wasm" "$root/public/core/"
python3 "$root/scripts/record-cirrus-core.py"
sha256sum "$root/public/core/emnp21kai_sdl2.js" "$root/public/core/emnp21kai_sdl2.wasm"
