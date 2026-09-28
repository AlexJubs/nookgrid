export function createCompletionAds(ads,{saveTimeout = 1000} = {}) {
  const attempted = new Set();
  let generation = 0;
  let pendingOpportunity;
  return {
    cancel() {
      generation++;
      try { return Promise.resolve(ads.cancel?.({opportunity:pendingOpportunity})).catch(() => {}); }
      catch { return Promise.resolve(); }
    },
    async complete({key,saved,isCurrent,opportunity}) {
      if (attempted.has(key)) return false;
      attempted.add(key);
      const current = generation;
      const presentAt = Date.now() + 3000;
      pendingOpportunity = opportunity;
      let timer;
      try {
        const didSave = await Promise.race([saved,new Promise(resolve => { timer = setTimeout(() => resolve(false),saveTimeout); })]);
        if (!didSave || generation !== current || !isCurrent()) return false;
        clearTimeout(timer);
        await new Promise(resolve => { timer = setTimeout(resolve,Math.max(0,presentAt - Date.now())); });
        if (generation !== current || !isCurrent()) return false;
        await ads.present({opportunity,expiresAt:Date.now() + 500});
        return true;
      } catch { return false; }
      finally { clearTimeout(timer); }
    }
  };
}
