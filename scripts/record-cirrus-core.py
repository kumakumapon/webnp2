#!/usr/bin/env python3
"""Record the exact core source, patch and bundled binary digests."""
import hashlib,json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
metadata={
 'source_repository':'https://github.com/uraraworks/NP2kai-wasm',
 'source_commit':'714f0bef3a24aa419d4cdb0dac9ad02d30855280',
 'patch_sha256':digest(root/'patches/np2kai-cirrus-display.patch'),
 'compiler':'Emscripten 3.1.64',
 'files':{n:digest(root/'public/core'/n) for n in ('emnp21kai_sdl2.js','emnp21kai_sdl2.wasm')},
}
(root/'public/core/cirrus-build.json').write_text(json.dumps(metadata,indent=2)+'\n')
