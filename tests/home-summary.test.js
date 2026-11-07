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
