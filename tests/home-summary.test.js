const test = require("node:test");
const assert = require("node:assert/strict");
const Home = require("../js/home-summary.js");

test("levelProgress matches the flat 100 XP per level rule", () => {
    assert.deepEqual(Home.levelProgress(0, 100), { level: 1, into: 0, toNext: 100, pct: 0 });
    assert.deepEqual(Home.levelProgress(240, 100), { level: 3, into: 40, toNext: 60, pct: 40 });
    assert.deepEqual(Home.levelProgress(300, 100), { level: 4, into: 0, toNext: 100, pct: 0 });
});

test("levelProgress treats bad input as zero XP", () => {
    assert.equal(Home.levelProgress(NaN, 100).level, 1);
    assert.equal(Home.levelProgress(-50, 100).into, 0);
});

test("activeStreak keeps a streak alive through yesterday, then drops it", () => {
    const stored = { count: 6, lastDay: "2026-11-04" };
    assert.deepEqual(Home.activeStreak(stored, "2026-11-04", "2026-11-03"), { count: 6, doneToday: true });
    assert.deepEqual(Home.activeStreak(stored, "2026-11-05", "2026-11-04"), { count: 6, doneToday: false });
    assert.deepEqual(Home.activeStreak(stored, "2026-11-09", "2026-11-08"), { count: 0, doneToday: false });
    assert.deepEqual(Home.activeStreak(null, "2026-11-05", "2026-11-04"), { count: 0, doneToday: false });
});

test("localDay uses the device calendar; addDays is plain date arithmetic", () => {
    // 2026-11-26 01:00 UTC is still the evening of Nov 25 in California. Run under
    // TZ=America/Los_Angeles this must say the 25th; in any zone it must match the local date.
    const moment = new Date(Date.UTC(2026, 10, 26, 1, 0));
    const expected = moment.getFullYear() + "-" + String(moment.getMonth() + 1).padStart(2, "0") + "-" + String(moment.getDate()).padStart(2, "0");
    assert.equal(Home.localDay(moment), expected);
    if (process.env.TZ === "America/Los_Angeles") assert.equal(Home.localDay(moment), "2026-11-25");
    assert.equal(Home.localDay("not a date"), "");
    assert.equal(Home.addDays("2026-11-25", 1), "2026-11-26");
    assert.equal(Home.addDays("2026-03-01", -1), "2026-02-28");
    assert.equal(Home.addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(Home.addDays("2026-11-08", -13), "2026-10-26");
    assert.equal(Home.addDays("bad", 1), "");
});

test("a day saved under the old UTC key (one day ahead) counts as today, once", () => {
    // Studied at 5 pm in California on Nov 25; the old code saved the UTC day, the 26th.
    const stored = { count: 4, lastDay: "2026-11-26" };
    assert.deepEqual(Home.activeStreak(stored, "2026-11-25", "2026-11-24"), { count: 4, doneToday: true });
    assert.equal(Home.carryDay("2026-11-26", "2026-11-25"), "2026-11-25");
    assert.equal(Home.carryDay("2026-11-24", "2026-11-25"), "2026-11-24");
    assert.equal(Home.carryDay("2026-11-30", "2026-11-25"), "2026-11-30", "only one day ahead is carried");
    assert.equal(Home.carryDay(undefined, "2026-11-25"), undefined);
});

test("dayPart covers the whole clock", () => {
    assert.equal(Home.dayPart(5), "Morning");
    assert.equal(Home.dayPart(12), "Afternoon");
    assert.equal(Home.dayPart(17), "Evening");
    assert.equal(Home.dayPart(21), "Late night");
    assert.equal(Home.dayPart(0), "Late night");
});

test("missions reflect real daily counts and cap at the target", () => {
    const list = Home.missions({ daily: { questions: 7, reviews: 0, xp: 20 }, due: 0 });
    const q = list.find((m) => m.id === "questions");
    const xp = list.find((m) => m.id === "xp");
    assert.equal(q.state, "done");
    assert.equal(q.value, 5);
    assert.equal(q.pct, 100);
    assert.equal(xp.state, "active");
    assert.equal(xp.pct, 40);
});

test("the review mission is idle, never done, when nothing was due", () => {
    const m = Home.missions({ daily: { reviews: 0 }, due: 0 }).find((x) => x.id === "reviews");
    assert.equal(m.state, "idle");
    assert.equal(m.pct, 0);
    assert.match(m.note, /Nothing is due/);
});

test("the review mission counts finished reviews against what is left", () => {
    const active = Home.missions({ daily: { reviews: 2 }, due: 2 }).find((x) => x.id === "reviews");
    assert.equal(active.state, "active");
    assert.equal(active.target, 4);
    assert.equal(active.pct, 50);
    const done = Home.missions({ daily: { reviews: 3 }, due: 0 }).find((x) => x.id === "reviews");
    assert.equal(done.state, "done");
});

test("nextStep puts due reviews before weak topics", () => {
    const step = Home.nextStep({
        due: 3,
        weakest: { subject: "AP Biology", topic: "Cells", ema: 0.2 },
        hasActivity: true
    });
    assert.equal(step.kind, "review");
    assert.equal(step.view, "review");
    assert.match(step.title, /^3 questions are due/);
    assert.match(Home.nextStep({ due: 1 }).title, /^1 question is due/);
});

test("nextStep names the weakest topic with its real accuracy", () => {
    const step = Home.nextStep({
        due: 0,
        weakest: { subject: "AP Biology", topic: "Cells", ema: 0.42 },
        hasActivity: true
    });
    assert.equal(step.kind, "focus");
    assert.equal(step.topic, "Cells");
    assert.equal(step.subject, "AP Biology");
    assert.match(step.body, /42%/);
});

test("nextStep ignores a weak-topic list that is not actually weak", () => {
    const step = Home.nextStep({
        due: 0,
        weakest: { subject: "AP Biology", topic: "Cells", ema: 0.9 },
        hasActivity: true
    });
    assert.equal(step.kind, "start");
    assert.match(step.title, /caught up/);
});

test("nextStep gives a brand-new user a first step with no claims about them", () => {
    const step = Home.nextStep({ due: 0, weakest: null, hasActivity: false });
    assert.equal(step.view, "practice");
    assert.match(step.title, /first set/);
});

test("orbitRadius grows with days and stops at the outer ring", () => {
    const radii = Home.ORBIT_RINGS.map(Home.orbitRadius);
    for (let i = 1; i < radii.length; i++) assert.ok(radii[i] > radii[i - 1]);
    assert.equal(Home.orbitRadius(38), Home.ORBIT_EDGE);
    assert.equal(Home.orbitRadius(400), Home.ORBIT_EDGE);
    assert.equal(Home.orbitRadius(0), Home.ORBIT_CORE);
});

test("orbitAngle is stable for one id and stays in range", () => {
    assert.equal(Home.orbitAngle("err-123"), Home.orbitAngle("err-123"));
    assert.notEqual(Home.orbitAngle("err-123"), Home.orbitAngle("err-124"));
    const a = Home.orbitAngle("err-999");
    assert.ok(a >= 0 && a < Math.PI * 2);
});

test("due cards spread out inside the core instead of stacking", () => {
    const records = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, sr: {} }));
    const points = Home.orbitPoints(records, () => 0, () => true);
    const place = (p) => [p.r * Math.cos(p.angle), p.r * Math.sin(p.angle)];
    for (let i = 0; i < points.length; i++) {
        assert.ok(points[i].r < Home.ORBIT_CORE);
        for (let j = i + 1; j < points.length; j++) {
            const [ax, ay] = place(points[i]);
            const [bx, by] = place(points[j]);
            assert.ok(Math.hypot(ax - bx, ay - by) > 8, "dots " + i + " and " + j + " overlap");
        }
    }
});

test("orbitPoints puts due cards in the core and scheduled cards on their day", () => {
    const records = [
        { id: "a", subject: "AP Biology", sr: { due: "past" } },
        { id: "b", subject: "AP Physics 1", sr: { due: "future" } }
    ];
    const points = Home.orbitPoints(
        records,
        () => 6,
        (sr) => sr.due === "past"
    );
    assert.equal(points[0].due, true);
    assert.equal(points[0].days, 0);
    assert.ok(points[0].r < Home.ORBIT_CORE);
    assert.equal(points[1].due, false);
    assert.equal(points[1].days, 6);
    assert.equal(points[1].r, Home.orbitRadius(6));
});

test("nextStep: a weak topic with a saved mistake offers similar-question practice", () => {
    const step = Home.nextStep({
        due: 0,
        weakest: { subject: "AP Calculus AB", topic: "Chain rule", ema: 0.4 },
        weakMistake: { id: "err-9", subject: "AP Calculus AB", topic: "Chain rule", ema: 0.4 },
        hasActivity: true
    });
    assert.equal(step.kind, "variant");
    assert.equal(step.view, "mistake");
    assert.equal(step.errId, "err-9");
    assert.match(step.body, /Chain rule in AP Calculus AB is at 40%/);
});

test("nextStep: due reviews still come first, and a strong topic gets no variant step", () => {
    const weakMistake = { id: "err-9", subject: "S", topic: "T", ema: 0.4 };
    assert.equal(Home.nextStep({ due: 2, weakMistake: weakMistake }).kind, "review");
    const strong = Home.nextStep({ due: 0, weakMistake: { id: "e", subject: "S", topic: "T", ema: 0.9 }, hasActivity: true });
    assert.equal(strong.kind, "start");
});

test("weekTopLine sums the last 7 days and names subjects only with enough answers", () => {
    const daily = [];
    for (let i = 0; i < 14; i++) daily.push({ date: "d" + i, answered: i < 7 ? 5 : 2, correct: i < 7 ? 5 : 1 });
    const bySubject = [
        { subject: "AP Biology", answered: 10, correct: 7, accuracy: 0.7 },
        { subject: "AP Physics 1", answered: 10, correct: 3, accuracy: 0.3 },
        { subject: "AP Chemistry", answered: 2, correct: 2, accuracy: 1 }
    ];
    const line = Home.weekTopLine(daily, bySubject);
    assert.equal(line.answered, 14);
    assert.equal(line.correct, 7);
    assert.match(line.text, /^Last 7 days: 14 questions, 50% right\./);
    assert.match(line.text, /Strongest: AP Biology \(70%\)/);
    assert.match(line.text, /Most room to grow: AP Physics 1 \(30%\)/);
    assert.doesNotMatch(line.text, /Chemistry/, "2 answers are too few to name a subject");
});

test("weekTopLine is honest with no data and never invents a comparison", () => {
    assert.equal(Home.weekTopLine([], []).text, "No graded questions in the last 7 days.");
    const one = Home.weekTopLine([{ answered: 1, correct: 1 }], [{ subject: "AP Biology", answered: 9, correct: 6, accuracy: 0.66 }]);
    assert.equal(one.text, "Last 7 days: 1 question, 100% right.");
    const tie = Home.weekTopLine([], [
        { subject: "A", answered: 4, correct: 2, accuracy: 0.5 },
        { subject: "B", answered: 4, correct: 2, accuracy: 0.5 }
    ]);
    assert.doesNotMatch(tie.text, /Strongest/);
});

test("mergeStats adds unsynced answers to the last synced stats and keeps the 14-day window current", () => {
    const synced = {
        overall: { answered: 12, correct: 9, accuracy: 0.75 },
        bySubject: [{ subject: "AP Calculus AB", answered: 12, correct: 9, accuracy: 0.75 }],
        bySource: [{ source: "review", answered: 2, correct: 2, accuracy: 1 }, { source: "generated", answered: 10, correct: 7, accuracy: 0.7 }],
        daily: [{ date: "2026-11-23", answered: 12, correct: 9, accuracy: 0.75 }]
    };
    const queued = {
        overall: { answered: 3, correct: 1, accuracy: 1 / 3 },
        bySubject: [{ subject: "AP Biology", answered: 3, correct: 1, accuracy: 1 / 3 }],
        bySource: [{ source: "generated", answered: 3, correct: 1, accuracy: 1 / 3 }],
        daily: [{ date: "2026-11-25", answered: 3, correct: 1, accuracy: 1 / 3 }]
    };
    const m = Home.mergeStats(synced, queued, "2026-11-25");
    assert.deepEqual(m.overall, { answered: 15, correct: 10, accuracy: 10 / 15 });
    assert.deepEqual(m.bySubject.map((s) => [s.subject, s.answered]), [["AP Calculus AB", 12], ["AP Biology", 3]]);
    assert.deepEqual(m.bySource.map((s) => [s.source, s.answered, s.correct]), [["generated", 13, 8], ["review", 2, 2]]);
    assert.equal(m.daily.length, 14);
    assert.equal(m.daily[13].date, "2026-11-25");
    assert.equal(m.daily[13].answered, 3);
    assert.equal(m.daily[11].date, "2026-11-23");
    assert.equal(m.daily[11].answered, 12);
    assert.equal(m.daily[0].date, "2026-11-12");
    // no snapshot: the queue alone, never invented numbers
    assert.equal(Home.mergeStats(null, queued, "2026-11-25").overall.answered, 3);
    assert.equal(Home.mergeStats(null, null, "2026-11-25").overall.accuracy, 0);
});

test("nextStep: a set in progress comes before due reviews, with its real position", () => {
    const step = Home.nextStep({ due: 3, hasActivity: true, openSet: { next: 2, total: 5, answered: 2, subject: "AP Calculus AB" } });
    assert.equal(step.kind, "continue");
    assert.equal(step.cta, "Continue at question 3");
    assert.match(step.body, /^AP Calculus AB: 2 of 5 answered\./);
    // no open set, or a finished one: the usual order
    assert.equal(Home.nextStep({ due: 3, hasActivity: true }).kind, "review");
    assert.equal(Home.nextStep({ due: 3, hasActivity: true, openSet: { next: -1, total: 5, answered: 5 } }).kind, "review");
    assert.equal(Home.nextStep({ due: 0, hasActivity: true, openSet: { next: 0, total: 0 } }).kind, "start");
});
