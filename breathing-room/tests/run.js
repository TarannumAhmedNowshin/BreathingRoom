// Run with: node tests/run.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const P = require('../planner.js');
const ICS = require('../ics.js');

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok -', name); };
const overlaps = (a, b) => a.s < b.e && b.s < a.e;

const day = [
  { title: 'Team stand-up', start: '09:30', end: '09:45' },
  { title: 'Client workshop', start: '10:00', end: '12:15' },
  { title: '1:1 with Sam', start: '12:15', end: '12:45' },
  { title: 'Budget review', start: '14:00', end: '15:00' },
  { title: 'Sprint planning', start: '15:00', end: '16:30' },
];

test('breaks never overlap meetings or each other', () => {
  const plan = P.buildPlan(day, { dayStart: '09:00', dayEnd: '17:30' });
  const meetings = plan.items.filter((i) => i.type === 'meeting');
  for (const b of plan.breaks) {
    for (const m of meetings) assert(!overlaps(b, m), `${b.id} overlaps ${m.title}`);
    for (const o of plan.breaks) if (o !== b) assert(!overlaps(b, o), `${b.id} overlaps ${o.id}`);
  }
});

test('lunch lands in the 12:00-14:30 window after the 1:1', () => {
  const plan = P.buildPlan(day, { dayStart: '09:00', dayEnd: '17:30' });
  const lunch = plan.breaks.find((b) => b.type === 'lunch');
  assert(lunch, 'lunch planned');
  assert(lunch.s >= P.toMin('12:45') && lunch.e <= P.toMin('14:30'));
});

test('long meeting blocks produce a warning', () => {
  const plan = P.buildPlan(day, { dayStart: '09:00', dayEnd: '17:30' });
  assert(plan.warnings.some((w) => w.kind === 'meetings'));
});

test('no lunch gap is flagged', () => {
  const plan = P.buildPlan([{ title: 'Offsite', start: '11:30', end: '15:00' }], { dayStart: '09:00', dayEnd: '17:30' });
  assert(!plan.breaks.some((b) => b.type === 'lunch'));
  assert(plan.warnings.some((w) => w.kind === 'lunch'));
});

test('low energy plans more breaks', () => {
  const ok = P.buildPlan([], { dayStart: '09:00', dayEnd: '17:30', energy: 'ok' });
  const low = P.buildPlan([], { dayStart: '09:00', dayEnd: '17:30', energy: 'low' });
  assert(low.breaks.length > ok.breaks.length, `${low.breaks.length} > ${ok.breaks.length}`);
});

test('all breaks sit inside the workday', () => {
  const plan = P.buildPlan(day, { dayStart: '08:00', dayEnd: '16:00' });
  for (const b of plan.breaks) assert(b.s >= 480 && b.e <= 960, b.id);
});

test('ics example yields the five meetings on any day', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'example.ics'), 'utf8');
  for (const d of [new Date(2026, 9, 29), new Date(2026, 10, 1), new Date(2027, 0, 4)]) {
    const r = ICS.parse(text, d);
    assert.strictEqual(r.events.length, 5);
    assert.deepStrictEqual(r.events[0], { title: 'Team stand-up', start: '09:30', end: '09:45' });
  }
});

test('ics handles weekly rules, exdates, cancellations and folded lines', () => {
  const text = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT', 'UID:a', 'DTSTART;TZID=Europe/Dublin:20261005T110000', 'DTEND;TZID=Europe/Dublin:20261005T113000',
    'RRULE:FREQ=WEEKLY;BYDAY=MO,TH', 'EXDATE;TZID=Europe/Dublin:20261022T110000', 'SUMMARY:Weekly sync with a very',
    '  long title', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:b', 'DTSTART:20261029T140000', 'DURATION:PT45M', 'SUMMARY:Design review', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:c', 'DTSTART:20261029T160000', 'DTEND:20261029T170000', 'STATUS:CANCELLED', 'SUMMARY:Cancelled', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:d', 'DTSTART;VALUE=DATE:20261029', 'SUMMARY:Holiday', 'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const thu = ICS.parse(text, new Date(2026, 9, 29));
  assert.deepStrictEqual(thu.events.map((e) => e.title), ['Weekly sync with a very long title', 'Design review']);
  assert.strictEqual(thu.events[1].end, '14:45');
  assert.strictEqual(thu.skippedAllDay, 1);
  const exThu = ICS.parse(text, new Date(2026, 9, 22));
  assert.strictEqual(exThu.events.length, 0);
  const wed = ICS.parse(text, new Date(2026, 9, 28));
  assert.strictEqual(wed.events.length, 0);
});

test('exported breaks round-trip through the calendar reader, with reminders', () => {
  const plan = P.buildPlan(day, { dayStart: '09:00', dayEnd: '17:30' });
  const d = new Date(2026, 9, 29);
  const ics = ICS.build(plan.breaks, d, { alarmMinutes: 2 });
  assert(ics.includes('TRIGGER:-PT2M'));
  assert.strictEqual((ics.match(/BEGIN:VALARM/g) || []).length, plan.breaks.length);
  const back = ICS.parse(ics, d).events;
  assert.deepStrictEqual(back.map((e) => e.start), plan.breaks.map((b) => b.start));
  const silent = ICS.build(plan.breaks, d, { alarmMinutes: null });
  assert(!silent.includes('VALARM'));
  assert(ICS.build(plan.breaks, d, {}).includes('TRIGGER:PT0M'));
});

console.log(`\n${passed} tests passed`);
