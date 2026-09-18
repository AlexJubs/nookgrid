await globalThis.nookgridReady;

export const native = globalThis.nookgridNative || null;

export function savedValue(key) {
  try { return native?.storage ? native.storage.getItem(key) : localStorage.getItem(key); }
  catch { return null; }
}

export function saveValue(key,value) {
  if (native?.storage) return value === null ? native.storage.removeItem(key) : native.storage.setItem(key,value);
  value === null ? localStorage.removeItem(key) : localStorage.setItem(key,value);
}
