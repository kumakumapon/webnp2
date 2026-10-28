#!/usr/bin/env bash
set -euo pipefail

source_commit=382e3ab299a7ae50c5560ed05c2417d6b578e3d6
source_dir="$(mktemp -d)"
trap 'rm -rf "$source_dir"' EXIT

git -C "$source_dir" init --quiet
git -C "$source_dir" remote add origin https://github.com/kumakumapon/MS-DOS.git
git -C "$source_dir" fetch --quiet --depth=1 origin "$source_commit"
git -C "$source_dir" checkout --quiet --detach FETCH_HEAD

python3 scripts/update-msdos4-cpanel.py "$source_dir" --with-window

python3 scripts/update-k386.py "$source_dir"
