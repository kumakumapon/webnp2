#!/usr/bin/env bash
set -euo pipefail
# Separate pin: the normal KGUI/KDESK image source remains unchanged.
source_commit=5537f61b29ec1722fc0cf721afe5489e4f0a0143
source_dir="$(mktemp -d)"
trap 'rm -rf "$source_dir"' EXIT

git -C "$source_dir" init --quiet
git -C "$source_dir" remote add origin https://github.com/kumakumapon/MS-DOS.git
git -C "$source_dir" fetch --quiet --depth=1 origin "$source_commit"
git -C "$source_dir" checkout --quiet --detach FETCH_HEAD
python3 scripts/update-pc98-hdd-proof.py "$source_dir"
