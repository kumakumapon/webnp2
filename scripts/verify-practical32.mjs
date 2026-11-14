// No server is started here. GitHub Actions owns the finite test server.
import assert from 'node:assert/strict';
import {practicalHarness} from './practical32-harness.mjs';
import {runtimeTests} from './practical32-runtime-tests.mjs';
import {ioTests} from './practical32-io-tests.mjs';
import {imageTests} from './practical32-image-tests.mjs';
import {imeTests} from './practical32-ime-tests.mjs';
const [base='http://127.0.0.1:4173/',output='test-results/practical32',video='pegc',suite='runtime']=process.argv.slice(2);
assert(['runtime','io','surfaces','images','ime'].includes(suite));const p=await practicalHarness(base,output,video);
assert.equal(p.h.manifest.practical_sdk.abi,258);assert.equal(p.h.manifest.common_io.gui_independent,true);assert.equal(p.h.manifest.bitmap_sdk.version,2);assert.equal(p.h.manifest.ime.common_input_api,1);
try{await({runtime:runtimeTests,io:ioTests,surfaces:imageTests,images:imageTests,ime:imeTests})[suite](p,video,suite);await p.finish();}catch(e){await p.fail(e).catch(()=>{});throw e;}finally{await p.h.close();}
