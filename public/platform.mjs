await globalThis.nookgridReady;

export const native = globalThis.nookgridNative || null;

export function savedValue(key) {
  try { return native ? native.storage?.getItem(key) ?? null : localStorage.getItem(key); }
  catch { return null; }
}

export function saveValue(key,value) {
  if (native && !native.storage) throw new Error('Native saves unavailable');
  if (native?.storage) return value === null ? native.storage.removeItem(key) : native.storage.setItem(key,value);
  value === null ? localStorage.removeItem(key) : localStorage.setItem(key,value);
}

export async function saveValues(entries) {
  if (native && !native.storage) throw new Error('Native saves unavailable');
  if (native?.storage?.setItems) return native.storage.setItems(entries);
  await Promise.all(entries.map(([key,value]) => saveValue(key,value)));
}
