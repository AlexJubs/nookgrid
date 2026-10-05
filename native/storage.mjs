const journalKey = 'nookgrid:save-journal:v1', backupKey = `${journalKey}:backup`;
const protectedKey = key => /^nookgrid:(?:test:)?v1:/.test(key) || ['nookgrid:analytics','nookgrid:analytics-withdrawn'].includes(key);
const checksum = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2,'0')).join('');
async function decode(raw,digest = checksum) {
  try {
    const envelope = JSON.parse(raw), body = JSON.parse(envelope.body);
    if (envelope.checksum !== await digest(envelope.body) || body.version !== 1 || !Number.isSafeInteger(body.revision) || body.revision < 1 || !Array.isArray(body.entries) || body.entries.some(entry => !Array.isArray(entry) || entry.length !== 2 || !protectedKey(entry[0]) || typeof entry[1] !== 'string') || new Set(body.entries.map(entry => entry[0])).size !== body.entries.length) return null;
    return {raw,body};
  } catch { return null; }
}

export async function createNativeStorage(preferences,{journal} = {}) {
  const digest = journal?.checksum ? async body => (await journal.checksum({body})).checksum : checksum;
  const {keys} = await preferences.keys();
  const entries = await Promise.all(keys.map(async key => [key,(await preferences.get({key})).value]));
  const values = new Map(entries);
  // The file journal is an atomic, durable mirror. Preferences remains the native
  // compatibility store; browser storage is never a native recovery substitute.
  const mirror = journal ? await journal.readJournal() : {};
  const candidates = await Promise.all([values.get(journalKey),values.get(backupKey),mirror.primary,mirror.backup].map(raw => decode(raw,digest)));
  let last = candidates.filter(Boolean).sort((a,b) => b.body.revision - a.body.revision)[0] || null;
  if (last) {
    for (const key of values.keys()) if (protectedKey(key)) values.delete(key);
    for (const [key,value] of last.body.entries) values.set(key,value);
  }
  let pending = Promise.resolve();
  function enqueue(action) {
    const result = pending.catch(() => {}).then(action);
    pending = result;
    return result;
  }
  function setItems(changes) {
    if (!Array.isArray(changes) || changes.some(([key,value]) => !protectedKey(key) || value !== null && typeof value !== 'string')) throw Error('Invalid save transaction');
    for (const [key,value] of changes) value === null ? values.delete(key) : values.set(key,value);
    const snapshot = [...values].filter(([key]) => protectedKey(key)).sort(([a],[b]) => a.localeCompare(b));
    return enqueue(async () => {
      const body = JSON.stringify({version:1,revision:(last?.body.revision || 0)+1,entries:snapshot});
      const raw = JSON.stringify({body,checksum:await digest(body)});
      if (journal) await journal.writeJournal({primary:raw,backup:last?.raw || null});
      if (last) await preferences.set({key:backupKey,value:last.raw});
      await preferences.set({key:journalKey,value:raw});
      last = {raw,body:JSON.parse(body)};
      // A failed compatibility write still reports failure, but restart recovers
      // the complete transaction rather than half of a completion.
      for (const [key,value] of changes) await (value === null ? preferences.remove({key}) : preferences.set({key,value}));
    });
  }
  return {
    recovered:Boolean(last),
    getItem:key => values.get(key) ?? null,
    setItems,
    setItem(key,value) {
      if (protectedKey(key)) return setItems([[key,String(value)]]);
      values.set(key,String(value)); return enqueue(() => preferences.set({key,value:String(value)}));
    },
    removeItem(key) {
      if (protectedKey(key)) return setItems([[key,null]]);
      values.delete(key); return enqueue(() => preferences.remove({key}));
    },
    async flush() {
      let current;
      do { current = pending; await current; } while (current !== pending);
    }
  };
}
