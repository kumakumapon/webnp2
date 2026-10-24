import {afterEach,expect,it,vi} from 'vitest';
import {coreReadTvram} from '../src/core/module';
afterEach(()=>vi.unstubAllGlobals());
it('does not poison lazy WASM exports while screen text is polled before runtime initialization',()=>{
 const ccall=vi.fn(()=>{throw new Error('lazy export replaced with undefined');});
 vi.stubGlobal('window',{Module:{ccall}});
 for(let i=0;i<3;i++)expect(()=>coreReadTvram()).toThrow('core runtime is not initialized');
 expect(ccall).not.toHaveBeenCalled();
});
