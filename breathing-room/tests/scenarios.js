/*
 * Sadman's planner scenarios (p3-planner branch, planner/scenarios.json) run against the shared planner.
 * Run: node breathing-room/tests/scenarios.js   (also part of npm test)
 */
const assert = require('assert');
const P = require('../planner.js');
const scenarios = require('./scenarios.json');

const hm = (iso) => iso.slice(11, 16);
let passed = 0;
for (const sc of scenarios) {
  const events = sc.events.map((e) => ({ title: e.title, start: hm(e.start), end: hm(e.end) }));
  const energy = sc.energy === 'high' ? 'good' : sc.energy;
  const plan = P.buildPlan(events, { dayStart: '09:00', dayEnd: '18:00', energy });
  const busy = events.map((e) => [P.toMin(e.start), P.toMin(e.end)]);

  for (const b of plan.breaks) {
    const s = P.toMin(b.start), e = s + b.len;
    const clash = busy.find(([bs, be]) => s < be && e > bs);
    assert.ok(!clash, `${sc.name}: ${b.type} at ${b.start} overlaps a meeting`);
    assert.ok(s >= P.toMin('09:00') && e <= P.toMin('18:00'), `${sc.name}: ${b.type} at ${b.start} is outside the workday`);
  }
  if (plan.breaks.length < 2) {
    assert.ok(plan.warnings.length > 0, `${sc.name}: a day with almost no room for breaks should come with a warning`);
  }
  console.log(`ok - ${sc.name}: ${plan.breaks.length} breaks, ${plan.warnings.length} warnings (${sc.description})`);
  passed++;
}
console.log(`\n${passed} scenarios passed`);
