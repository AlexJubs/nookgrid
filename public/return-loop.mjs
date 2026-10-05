// The schedule stays at UTC midnight; presentation uses the player's local time.
export function nextPuzzleAvailability(now, availableDates, {locale = 'en-US', timeZone} = {}) {
  const current = new Date(now);
  if (!Number.isFinite(current.getTime())) return null;
  const next = new Date(Date.UTC(current.getUTCFullYear(),current.getUTCMonth(),current.getUTCDate() + 1));
  const date = next.toISOString().slice(0,10);
  if (!availableDates.includes(date)) return null;
  const day = new Intl.DateTimeFormat(locale,{year:'numeric',month:'numeric',day:'numeric',timeZone});
  const when = day.format(current) === day.format(next) ? 'today' : 'tomorrow';
  const time = new Intl.DateTimeFormat(locale,{hour:'numeric',minute:'2-digit',timeZone}).format(next);
  return {date,at:next.toISOString(),label:`Next puzzle ${when} at ${time}`};
}

export function dailyContinuation({available, solved, hasAttempt}) {
  return !available ? null : solved ? {state:'replay',label:"View today's result",icon:'grid-four'} : hasAttempt ?
    {state:'resumed',label:"Continue today's puzzle",icon:'play-circle'} :
    {state:'fresh',label:"Play today's puzzle",icon:'play-circle'};
}
