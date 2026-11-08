import {describe,it,expect} from 'vitest';
import {guiCleanupPublished} from '../scripts/gui-cleanup-state.mjs';

describe('native GUI cleanup publication',()=>{
 it('rejects the merge-CI failure window even though state already says ended',()=>{
  expect(guiCleanupPublished({state:3,ready:0,busy:0,completed:0,dosBefore:18826,dosAfter:0})).toBe(false);
 });
 it('requires the producer to finish the complete record',()=>{
  expect(guiCleanupPublished(null)).toBe(false);
  expect(guiCleanupPublished({state:1,ready:1,busy:0,completed:0})).toBe(false);
  expect(guiCleanupPublished({state:3,ready:0,busy:1,completed:1})).toBe(false);
  for(const state of [3,4,6])expect(guiCleanupPublished({state,ready:0,busy:0,completed:1})).toBe(true);
 });
 it('does not hide genuine resource mismatches behind a polling retry',()=>{
  expect(guiCleanupPublished({state:3,ready:0,busy:0,completed:1,dosBefore:18826,dosAfter:0,cpu:{handle:7}})).toBe(true);
 });
});
