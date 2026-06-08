// Unit tests for the SM-2 spaced-repetition scheduler.
// Uses Node's built-in test runner (no dependencies): `node --test`.

const test = require("node:test");
const assert = require("node:assert");
const RS = require("../js/spaced-repetition.js");

test("first correct review schedules a 1-day interval", () => {
    const s = RS.review(RS.initReview(), RS.QUALITY.got);
    assert.strictEqual(s.reps, 1);
    assert.strictEqual(s.intervalDays, 1);
    assert.strictEqual(s.reviews, 1);
});

test("interval grows 1 -> 6 -> ef-scaled on repeated success", () => {
    let s = RS.initReview();
    s = RS.review(s, 5);
    assert.strictEqual(s.intervalDays, 1);
    s = RS.review(s, 5);
    assert.strictEqual(s.intervalDays, 6);
    s = RS.review(s, 5);
    assert.ok(s.intervalDays > 6, "third interval should exceed 6 (round(6 * ef))");
});

test("'forgot' resets reps and shrinks the interval to 1 day", () => {
    let s = RS.initReview();
    s = RS.review(s, 5);
    s = RS.review(s, 5); // reps 2, interval 6
    s = RS.review(s, RS.QUALITY.forgot);
    assert.strictEqual(s.reps, 0);
    assert.strictEqual(s.intervalDays, 1);
});

test("easiness factor never drops below 1.3", () => {
    let s = RS.initReview();
    for (let i = 0; i < 10; i++) s = RS.review(s, RS.QUALITY.forgot);
    assert.ok(s.ef >= 1.3, "EF floor is 1.3");
});

test("status transitions new -> learning -> mastered", () => {
    let s = RS.initReview();
    assert.strictEqual(RS.status(s), "new");
    s = RS.review(s, 5);
    assert.strictEqual(RS.status(s), "learning");
    s = RS.review(s, 5);
    s = RS.review(s, 5);
    s = RS.review(s, 5); // reps 4, interval >= 21
    assert.strictEqual(RS.status(s), "mastered");
});

test("a freshly (correctly) reviewed item is not due now", () => {
    const s = RS.review(RS.initReview(), 5); // due in 1 day
    assert.strictEqual(RS.isDue(s), false);
});

test("a brand-new item is due now", () => {
    assert.strictEqual(RS.isDue(RS.initReview()), true);
});

test("summarize counts due / mastered and computes mastery %", () => {
    const mastered = (function () {
        let x = RS.initReview();
        for (let i = 0; i < 4; i++) x = RS.review(x, 5);
        return x;
    })();
    const sum = RS.summarize([{ sr: RS.initReview() }, { sr: mastered }]);
    assert.strictEqual(sum.total, 2);
    assert.strictEqual(sum.mastered, 1);
    assert.strictEqual(sum.due, 1); // only the new one is due
    assert.strictEqual(sum.masteryPct, 50);
});
