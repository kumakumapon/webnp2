#!/usr/bin/env bash
set -euo pipefail

source_commit=a618590d63f36d31b5a9b2192a1960b7aaf82396
source_dir="$(mktemp -d)"
trap 'rm -rf "$source_dir"' EXIT

git -C "$source_dir" init --quiet
git -C "$source_dir" remote add origin https://github.com/kumakumapon/MS-DOS.git
git -C "$source_dir" fetch --quiet --depth=1 origin "$source_commit"
git -C "$source_dir" checkout --quiet --detach FETCH_HEAD

# Build the separate HDD OEM profile from source. It needs only SYSINIT's
# message generation/assembly, not a rebuild of the original DOS utilities.
hdd_dosbox="${DOSBOX:-$(command -v dosbox || true)}"
if [[ -z "$hdd_dosbox" ]]; then
  if [[ "${GITHUB_ACTIONS:-}" != true ]]; then
    echo 'Set DOSBOX to an installed DOSBox executable to build the HDD OEM profile.' >&2
    exit 1
  fi
  timeout 60 sudo -n python3 "$source_dir/.github/scripts/apt-https.py"
  timeout 120 sudo -n apt-get -o APT::Update::Error-Mode=any -o Acquire::Retries=0 update
  timeout 180 sudo -n apt-get -o Acquire::Retries=0 install -y dosbox
  hdd_dosbox="$(command -v dosbox)"
fi
hdd_jwasm="${JWASM:-$source_dir/.work/pc98-tools/JWasm/GccUnixR/jwasm}"
if [[ ! -x "$hdd_jwasm" ]]; then
  python3 "$source_dir/ports/pc98/toolchain.py" --output "$source_dir/.work/pc98-tools"
fi
hdd_sysinit_base="$(python3 -c 'import runpy,sys; print(runpy.run_path(sys.argv[1])["BASE"])' "$source_dir/tools/dos4/build.py")"
if ! git -C "$source_dir" cat-file -e "$hdd_sysinit_base^{commit}" 2>/dev/null; then
  git -C "$source_dir" fetch --quiet --depth=1 origin "$hdd_sysinit_base"
fi
SDL_VIDEODRIVER=dummy SDL_AUDIODRIVER=dummy python3 "$source_dir/ports/pc98/hdd/oem.py" \
  --dosbox "$hdd_dosbox" --jwasm "$hdd_jwasm"

python3 scripts/update-msdos4-cpanel.py "$source_dir" --with-window

python3 scripts/update-k386.py "$source_dir"
python3 scripts/update-kgui32.py "$source_dir"
