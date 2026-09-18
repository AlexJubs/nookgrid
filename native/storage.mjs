export async function createNativeStorage(preferences) {
  const {keys} = await preferences.keys();
  const entries = await Promise.all(keys.map(async key => [key,(await preferences.get({key})).value]));
  const values = new Map(entries);
  let pending = Promise.resolve();
  function enqueue(action) {
    const result = pending.catch(() => {}).then(action);
    pending = result;
    return result;
  }
  return {
    getItem:key => values.get(key) ?? null,
    setItem(key,value) { values.set(key,String(value)); return enqueue(() => preferences.set({key,value:String(value)})); },
    removeItem(key) { values.delete(key); return enqueue(() => preferences.remove({key})); },
    async flush() {
      let current;
      do { current = pending; await current; } while (current !== pending);
    }
  };
}
