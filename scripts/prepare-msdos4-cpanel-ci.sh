#!/usr/bin/env bash
set -euo pipefail

source_commit=f0571d26b86bf168e503c874d46960bcc368ed25
source_dir="$(mktemp -d)"
trap 'rm -rf "$source_dir"' EXIT

git -C "$source_dir" init --quiet
git -C "$source_dir" remote add origin https://github.com/kumakumapon/MS-DOS.git
git -C "$source_dir" fetch --quiet --depth=1 origin "$source_commit"
git -C "$source_dir" checkout --quiet --detach FETCH_HEAD

python3 scripts/update-msdos4-cpanel.py "$source_dir" --with-window
