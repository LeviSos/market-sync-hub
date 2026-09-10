/** Small gate so live drops only appear once the case animation has finished. */
let locked = 0;
const listeners = new Set<() => void>();

export function lockLiveDrops() {
  locked += 1;
}

export function unlockLiveDrops() {
  locked = Math.max(0, locked - 1);
  if (locked === 0) listeners.forEach((l) => l());
}

export function liveDropsLocked() {
  return locked > 0;
}

export function onLiveDropsUnlock(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
