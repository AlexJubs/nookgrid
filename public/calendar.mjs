const monthLabel = new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'});
const dateLabel = new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric',timeZone:'UTC'});
const weekdays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function parseDate(value) {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value ? date : null;
}

export function getWeekDates(today) {
  const date = parseDate(today);
  if (!date) return [];
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return Array.from({length:7},() => {
    const value = date.toISOString().slice(0,10);
    date.setUTCDate(date.getUTCDate() + 1);
    return value;
  });
}

export function getCalendarMonths(firstDate,today) {
  const first = parseDate(firstDate), month = parseDate(today);
  if (!first || !month || first > month) return [];
  first.setUTCDate(1);
  month.setUTCDate(1);
  const months = [];
  while (month >= first) {
    const key = month.toISOString().slice(0,7);
    const last = new Date(month);
    last.setUTCMonth(last.getUTCMonth() + 1,0);
    const days = Array((month.getUTCDay() + 6) % 7).fill(null);
    for (let day = 1; day <= last.getUTCDate(); day++) days.push(`${key}-${String(day).padStart(2,'0')}`);
    months.push({month:key,label:monthLabel.format(month),days});
    month.setUTCMonth(month.getUTCMonth() - 1);
  }
  return months;
}

export function renderCalendar({dates,today,completedDates = [],streakDays = [],currentDate,isTest = false}) {
  const fragment = document.createDocumentFragment();
  if (!parseDate(today)) return fragment;
  const available = new Set(dates.filter(date => parseDate(date) && date <= today));
  const firstDate = [...available].sort()[0];
  const completed = new Set(completedDates), earned = new Set(streakDays);
  for (const month of getCalendarMonths(firstDate,today)) {
    const section = document.createElement('section');
    section.className = 'calendar-month';
    const heading = document.createElement('h3');
    heading.id = `calendar-${month.month}`;
    heading.textContent = month.label;
    section.setAttribute('aria-labelledby',heading.id);
    const labels = document.createElement('div');
    labels.className = 'calendar-weekdays';
    labels.setAttribute('aria-hidden','true');
    for (const weekday of weekdays) {
      const label = document.createElement('span');
      label.textContent = weekday;
      labels.append(label);
    }
    const grid = document.createElement('div');
    grid.className = 'calendar-grid';
    for (const date of month.days) {
      const isAvailable = available.has(date);
      const cell = document.createElement(isAvailable ? 'a' : 'span');
      cell.className = 'calendar-day';
      if (!date) {
        cell.classList.add('is-empty');
        cell.setAttribute('aria-hidden','true');
        grid.append(cell);
        continue;
      }
      cell.dataset.puzzleDate = date;
      const isCompleted = isAvailable && completed.has(date), isStreak = isAvailable && earned.has(date);
      const isToday = date === today, isCurrent = isAvailable && date === currentDate;
      cell.classList.toggle('is-completed',isCompleted);
      cell.classList.toggle('is-streak',isStreak);
      cell.classList.toggle('is-today',isToday);
      cell.classList.toggle('is-current',isCurrent);
      if (isToday) cell.setAttribute('aria-current','date');
      else if (isCurrent) cell.setAttribute('aria-current','page');
      const label = [dateLabel.format(parseDate(date)),isToday ? 'Today' : '',isAvailable ? isCompleted ? 'completed' : 'not completed' : date > today ? 'not released' : date < firstDate ? 'before NookGrid began' : 'puzzle unavailable',isStreak ? 'daily streak day' : '',isCurrent ? 'current puzzle' : ''].filter(Boolean).join(', ');
      const number = document.createElement('span');
      number.textContent = String(Number(date.slice(-2)));
      number.setAttribute('aria-hidden','true');
      cell.append(number);
      if (isAvailable) {
        cell.href = `?date=${date}${isTest ? '&test=1' : ''}`;
        cell.setAttribute('aria-label',label);
      } else {
        cell.classList.add('is-unavailable');
        const description = document.createElement('span');
        description.className = 'sr-only';
        description.textContent = label;
        cell.append(description);
      }
      if (isCompleted) cell.insertAdjacentHTML('beforeend','<svg class="ui-icon calendar-check" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false"><use href="./icons.svg#check"/></svg>');
      grid.append(cell);
    }
    section.append(heading,labels,grid);
    fragment.append(section);
  }
  return fragment;
}
