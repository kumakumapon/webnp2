// Publication only: resource equality must still be asserted by the caller.
/** @param {{completed: number, busy: number, ready: number, state: number, [key: string]: unknown} | null} gui */
export function guiCleanupPublished(gui){
 return gui?.completed===1&&gui.busy===0&&gui.ready===0&&[3,4,6].includes(gui.state);
}
