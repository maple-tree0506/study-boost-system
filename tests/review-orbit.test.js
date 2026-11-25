// Review orbit and Mistake Library rules (js/review-orbit.js). Run: node --test tests/review-orbit.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const Orbit = require("../js/review-orbit.js");
const RS = require("../js/spaced-repetition.js");

const DAY = 86400000;
function rec(id, subject, daysFromNow, extra) {
    const sr = daysFromNow == null ? null : {
        algo: "sm2", reps: 1, ef: 2.5, intervalDays: Math.max(1, daysFromNow),
        due: new Date(Date.now() + daysFromNow * DAY - 60000).toISOString(),
        reviews: daysFromNow > 0 ? 1 : 0, lastQuality: 5
    };
    return Object.assign({ id, subject, topic: "", question: "Q " + id, answer: "A", createdAt: new Date(Date.now() - 1000).toISOString(), sr }, extra || {});
}

test("toItem reads the SM-2 schedule without changing it", () => {
    const r = rec("e1", "AP Biology", 3, { topic: " Enzymes " });
    const before = JSON.stringify(r);
    const it = Orbit.toItem(r, RS);
    assert.equal(JSON.stringify(r), before);
    assert.equal(it.course, "AP Biology");
    assert.equal(it.topic, "Enzymes");
    assert.equal(it.due, false);
    assert.equal(it.days, 3);
    assert.equal(Orbit.bucket(it), "week");
    assert.equal(Orbit.whenText(it), "Back in 3 days");
});

test("a record without a schedule counts as due now, and a missing course is labelled", () => {
    const it = Orbit.toItem({ id: "x", question: "?" }, RS);
    assert.equal(it.due, true);
    assert.equal(it.days, 0);
    assert.equal(it.course, "Uncategorized");
    assert.equal(Orbit.bucket(it), "due");
    assert.equal(Orbit.whenText(it), "Due now");
});

test("buckets split due, the next 7 days, and later", () => {
    const items = [rec("a", "C", 0), rec("b", "C", 1), rec("c", "C", 7), rec("d", "C", 8), rec("e", "C", 40)]
        .map((r) => Orbit.toItem(r, RS));
    assert.deepEqual(items.map(Orbit.bucket), ["due", "week", "week", "later", "later"]);
    assert.deepEqual(Orbit.counts(items), { all: 5, due: 1, week: 2, later: 2 });
    assert.equal(Orbit.whenText(items[1]), "Back in 1 day");
});

test("matches combines course, time bucket, and every search word", () => {
    const it = Orbit.toItem(rec("a", "AP Calculus AB", 2, {
        topic: "Chain rule", question: "The derivative of $\\ln(5x^2 + 1)$ is:"
    }), RS);
    assert.equal(Orbit.matches(it, {}), true);
    assert.equal(Orbit.matches(it, { course: "AP Biology" }), false);
    assert.equal(Orbit.matches(it, { when: "due" }), false);
    assert.equal(Orbit.matches(it, { when: "week", course: "AP Calculus AB" }), true);
    assert.equal(Orbit.matches(it, { query: "chain DERIVATIVE" }), true);
    assert.equal(Orbit.matches(it, { query: "ln(5x" }), true, "LaTeX commands and $ are ignored by search");
    assert.equal(Orbit.matches(it, { query: "chain enzyme" }), false);
});

test("sortItems puts due first, then the soonest; other sorts are stable and total", () => {
    const now = Date.now();
    const items = [
        Object.assign(Orbit.toItem(rec("late", "B", 20), RS), { createdAt: new Date(now - 5 * DAY).toISOString() }),
        Object.assign(Orbit.toItem(rec("soon", "A", 2), RS), { createdAt: new Date(now - 1 * DAY).toISOString() }),
        Object.assign(Orbit.toItem(rec("due", "C", 0), RS), { createdAt: new Date(now - 9 * DAY).toISOString() })
    ];
    assert.deepEqual(Orbit.sortItems(items, "due").map((i) => i.id), ["due", "soon", "late"]);
    assert.deepEqual(Orbit.sortItems(items, "newest").map((i) => i.id), ["soon", "late", "due"]);
    assert.deepEqual(Orbit.sortItems(items, "oldest").map((i) => i.id), ["due", "late", "soon"]);
    assert.deepEqual(Orbit.sortItems(items, "course").map((i) => i.id), ["soon", "late", "due"]);
    assert.deepEqual(Orbit.sortItems(items, "bogus").map((i) => i.id), ["due", "soon", "late"]);
    assert.equal(items[0].id, "late", "the input array is not reordered");
});

test("layout: one sector per course, sized by count, in a stable order", () => {
    const records = [rec("a1", "A", 2), rec("a2", "A", 3), rec("a3", "A", 9), rec("b1", "B", 1), rec("c1", "C", 0)];
    const items = records.map((r) => Orbit.toItem(r, RS));
    const L = Orbit.layout(items, { size: 420 });
    assert.deepEqual(L.sectors.map((s) => s.course), ["A", "B", "C"]);
    assert.ok(L.sectors[0].a1 - L.sectors[0].a0 > L.sectors[1].a1 - L.sectors[1].a0);
    assert.equal(L.sectors[2].due, 1);
    assert.equal(L.nodes.length, 5);
    assert.deepEqual(Orbit.layout(items, { size: 420 }), L, "same data, same picture");
    // sectors never overlap and stay inside one turn
    for (let i = 1; i < L.sectors.length; i++) assert.ok(L.sectors[i].a0 >= L.sectors[i - 1].a1);
    assert.ok(L.sectors[L.sectors.length - 1].a1 - L.sectors[0].a0 <= Math.PI * 2 + 1e-9);
});

test("layout: distance from the center is the time until review; due cards sit in the core", () => {
    const items = [rec("n1", "A", 1), rec("n6", "A", 6), rec("n38", "A", 38), rec("n90", "A", 90), rec("d", "A", 0), rec("d2", "B", 0)]
        .map((r) => Orbit.toItem(r, RS));
    const L = Orbit.layout(items, { size: 420 });
    const byId = Object.fromEntries(L.nodes.map((n) => [n.item.id, n]));
    const ringR = Object.fromEntries(L.rings.map((g) => [g.days, g.r]));
    assert.ok(Math.abs(byId.n1.r - ringR[1]) < 1e-9);
    assert.ok(Math.abs(byId.n6.r - ringR[6]) < 1e-9);
    assert.ok(Math.abs(byId.n38.r - L.edge) < 1e-9);
    assert.equal(byId.n90.r, byId.n38.r, "beyond the last ring stays on the edge");
    for (const id of ["d", "d2"]) {
        assert.equal(byId[id].due, true);
        assert.ok(byId[id].r < L.core, id + " is inside the core");
    }
    // the node angle stays inside its course sector
    const sector = L.sectors.find((s) => s.course === "A");
    for (const id of ["n1", "n6", "n38", "n90"]) {
        assert.ok(byId[id].angle > sector.a0 && byId[id].angle < sector.a1);
    }
});

test("layout: dense data shrinks the dots but keeps every mistake", () => {
    const many = [];
    for (let i = 0; i < 160; i++) many.push(rec("m" + i, "Course " + (i % 8), i % 45));
    const items = many.map((r) => Orbit.toItem(r, RS));
    const L = Orbit.layout(items, { size: 420 });
    assert.equal(L.nodes.length, 160);
    assert.ok(L.dot < Orbit.layout(items.slice(0, 10), { size: 420 }).dot);
    assert.ok(L.dot >= 3.2);
    assert.equal(L.sectors.length, 8);
    for (const n of L.nodes) {
        assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y));
        assert.ok(Math.hypot(n.x - 210, n.y - 210) <= L.edge + 1e-9);
    }
});

test("layout: an empty log still draws the rings", () => {
    const L = Orbit.layout([], { size: 420 });
    assert.equal(L.nodes.length, 0);
    assert.equal(L.sectors.length, 0);
    assert.deepEqual(L.rings.map((g) => g.days), [1, 6, 15, 38]);
});

test("snippet never splits a $...$ formula", () => {
    assert.equal(Orbit.snippet("Short question", 40), "Short question");
    const long = "If $y = (3x+1)^4$, then $\\dfrac{dy}{dx}$ is which of the following expressions for every real x";
    const s = Orbit.snippet(long, 30);
    assert.ok(s.endsWith("…"));
    assert.equal((s.match(/\$/g) || []).length % 2, 0, "balanced dollars: " + s);
    assert.ok(s.length <= 31);
    // a formula longer than the limit is kept whole rather than cut
    const f = Orbit.snippet("$\\int_0^1 (3x^2 + 2x + 1)\\,dx$ equals what value when evaluated", 10);
    assert.equal(f, "$\\int_0^1 (3x^2 + 2x + 1)\\,dx$…");
    // display math is treated as one unit
    const d = Orbit.snippet("$$\\sum_{n=1}^{\\infty} \\frac{1}{n^2}$$ converges to which value of the options listed", 12);
    assert.equal((d.match(/\$/g) || []).length % 2, 0);
    assert.ok(d.startsWith("$$\\sum"));
});

test("upcoming counts what comes back on each of the next days", () => {
    const items = [rec("a", "C", 0), rec("b", "C", 0), rec("c", "C", 1), rec("d", "C", 6), rec("e", "C", 7), rec("f", "C", 30)]
        .map((r) => Orbit.toItem(r, RS));
    const up = Orbit.upcoming(items, 7);
    assert.deepEqual(up.days.map((d) => d.count), [2, 1, 0, 0, 0, 0, 1]);
    assert.equal(up.later, 2);
    assert.deepEqual(Orbit.upcoming([], 3), { days: [{ offset: 0, count: 0 }, { offset: 1, count: 0 }, { offset: 2, count: 0 }], later: 0 });
});

test("shortCourse names every built-in course briefly and trims unknown ones", () => {
    assert.equal(Orbit.shortCourse("AP Calculus AB"), "Calc AB");
    assert.equal(Orbit.shortCourse("AP United States History"), "US History");
    assert.equal(Orbit.shortCourse("AP Art History"), "Art History");
    assert.equal(Orbit.shortCourse("AP Comparative Government and Politics"), "Comparative Gov…");
    assert.equal(Orbit.shortCourse(""), "");
});
