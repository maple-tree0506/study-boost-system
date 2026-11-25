// Unit tests for the similar-question adaptive rules (pure module).
// `node --test tests/variant-practice.test.js`

const test = require("node:test");
const assert = require("node:assert/strict");
const VP = require("../js/variant-practice.js");

const DAY = 86400000;
const approx = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, a + " !~= " + b);
const h = (correct, level = "medium", id) => ({ id: id || "v" + Math.random(), level, correct });
const hist = (...outcomes) => outcomes.map((c, i) => h(c, "medium", "v" + i));

// --- Beta CDF ----------------------------------------------------------------------------

test("betaCdf matches closed forms for integer parameters", () => {
    approx(VP.betaCdf(0.6, 4, 1), Math.pow(0.6, 4));                 // x^a when b = 1
    approx(VP.betaCdf(0.6, 4, 2), 5 * Math.pow(0.6, 4) * 0.4 + Math.pow(0.6, 5));
    approx(VP.betaCdf(0.6, 6, 2), 7 * Math.pow(0.6, 6) * 0.4 + Math.pow(0.6, 7));
    approx(VP.betaCdf(0.3, 2, 3), 6 * 0.09 * 0.49 + 4 * 0.027 * 0.7 + 0.0081);
    approx(VP.betaCdf(0.5, 2.5, 1), Math.pow(0.5, 2.5));             // non-integer a
});

test("betaCdf symmetry, bounds, and bad parameters", () => {
    approx(VP.betaCdf(0.37, 3.5, 2.25), 1 - VP.betaCdf(0.63, 2.25, 3.5));
    assert.equal(VP.betaCdf(0, 2, 2), 0);
    assert.equal(VP.betaCdf(1, 2, 2), 1);
    assert.ok(Number.isNaN(VP.betaCdf(0.5, 0, 2)));
});

// --- difficulty staircase ------------------------------------------------------------------

test("staircase starts at the original level", () => {
    const t = VP.nextTarget({ originalLevel: "medium", history: [] });
    assert.deepEqual([t.level, t.relation, t.reason], ["medium", "same", "start"]);
});

test("two correct in a row step up; one is not enough", () => {
    assert.equal(VP.nextTarget({ originalLevel: "medium", history: hist(true) }).level, "medium");
    assert.equal(VP.nextTarget({ originalLevel: "medium", history: hist(true) }).reason, "holding");
    const up = VP.nextTarget({ originalLevel: "medium", history: hist(true, true) });
    assert.deepEqual([up.level, up.relation, up.reason], ["challenge", "harder", "stepped_up"]);
});

test("a miss steps down, and the steps stay within one level of the original", () => {
    const down = VP.nextTarget({ originalLevel: "medium", history: hist(false) });
    assert.deepEqual([down.level, down.relation, down.reason], ["basic", "easier", "stepped_down"]);
    assert.equal(VP.nextTarget({ originalLevel: "medium", history: hist(false, false) }).reason, "at_floor");
    assert.equal(VP.nextTarget({ originalLevel: "medium", history: hist(true, true, true, true) }).level, "challenge");
    assert.equal(VP.nextTarget({ originalLevel: "basic", history: hist(false) }).level, "basic");
    assert.equal(VP.nextTarget({ originalLevel: "basic", history: hist(true, true, true, true) }).level, "medium");
    assert.equal(VP.nextTarget({ originalLevel: "challenge", history: hist(true, true) }).level, "challenge");
    assert.equal(VP.nextTarget({ originalLevel: "nonsense", history: [] }).level, "medium");
});

test("recovering after a miss: down, then two right brings it back", () => {
    const t = VP.nextTarget({ originalLevel: "medium", history: hist(false, true, true) });
    assert.deepEqual([t.level, t.relation], ["medium", "same"]);
});

// --- evidence --------------------------------------------------------------------------------

test("no history: not started, three correct answers needed", () => {
    const e = VP.evidence({ originalLevel: "medium", history: [] });
    assert.equal(e.status, "not_started");
    assert.equal(e.needed, 3);
});

test("one correct answer is never mastery", () => {
    const e = VP.evidence({ originalLevel: "medium", history: hist(true) });
    assert.equal(e.status, "building");
    assert.equal(e.needed, 2);
    approx(e.pMastery, 1 - Math.pow(0.6, 2));
});

test("two correct is still not enough; three distinct correct is likely mastered", () => {
    const two = VP.evidence({ originalLevel: "medium", history: hist(true, true) });
    assert.equal(two.status, "building");
    approx(two.pMastery, 1 - Math.pow(0.6, 3));   // 0.784 < 0.8
    assert.equal(two.needed, 1);
    const three = VP.evidence({ originalLevel: "medium", history: hist(true, true, true) });
    assert.equal(three.status, "likely_mastered");
    assert.equal(three.needed, 0);
});

test("the same variant answered repeatedly does not count as distinct evidence", () => {
    const same = [h(true, "medium", "a"), h(true, "medium", "a"), h(true, "medium", "a")];
    const e = VP.evidence({ originalLevel: "medium", history: same });
    assert.equal(e.strongCorrect, 1);
    assert.notEqual(e.status, "likely_mastered");
});

test("a miss raises the bar", () => {
    assert.equal(VP.evidence({ originalLevel: "medium", history: hist(false, true, true, true) }).status, "building");
    assert.equal(VP.evidence({ originalLevel: "medium", history: hist(false, true, true, true, true) }).status, "building");
    assert.equal(VP.evidence({ originalLevel: "medium", history: hist(false, true, true, true, true, true) }).status, "likely_mastered");
});

test("easier variants count half and never establish mastery alone", () => {
    const easy = [h(true, "basic", "a"), h(true, "basic", "b"), h(true, "basic", "c")];
    const e = VP.evidence({ originalLevel: "medium", history: easy });
    approx(e.successes, 1.5);
    assert.equal(e.strongCorrect, 0);
    assert.notEqual(e.status, "likely_mastered");
});

test("a wrong last answer rules out mastery; two misses in a row is struggling", () => {
    assert.notEqual(VP.evidence({ originalLevel: "medium", history: hist(true, true, true, true, false) }).status, "likely_mastered");
    assert.equal(VP.evidence({ originalLevel: "medium", history: hist(true, false, false) }).status, "struggling");
    assert.equal(VP.evidence({ originalLevel: "medium", history: hist(false, false) }).status, "struggling");
});

// --- SM-2 coupling ------------------------------------------------------------------------------

test("a correct variant never changes the SM-2 schedule", () => {
    const sr = { reps: 2, ef: 2.6, intervalDays: 6, due: new Date(Date.now() + 6 * DAY).toISOString() };
    const out = VP.nudgeSchedule(sr, { correct: true });
    assert.equal(out.changed, false);
    assert.equal(out.sr, sr);
});

test("a missed variant only brings a distant review forward to tomorrow", () => {
    const now = Date.UTC(2026, 10, 24, 12);
    const sr = { algo: "sm2", reps: 3, ef: 2.5, intervalDays: 15, due: new Date(now + 15 * DAY).toISOString(), reviews: 3 };
    const frozen = JSON.stringify(sr);
    const out = VP.nudgeSchedule(sr, { correct: false, now });
    assert.equal(out.changed, true);
    assert.equal(out.sr.due, new Date(now + DAY).toISOString());
    assert.deepEqual([out.sr.reps, out.sr.ef, out.sr.intervalDays, out.sr.reviews], [3, 2.5, 15, 3]);
    assert.equal(JSON.stringify(sr), frozen, "input must not be mutated");
    const soon = { due: new Date(now + 0.5 * DAY).toISOString() };
    assert.equal(VP.nudgeSchedule(soon, { correct: false, now }).changed, false);
    assert.equal(VP.nudgeSchedule(null, { correct: false, now }).changed, false);
});

// --- follow-up suggestions -------------------------------------------------------------------

test("follow-up messages match the evidence", () => {
    const now = Date.now();
    const sr = { due: new Date(now + 6 * DAY).toISOString() };
    const mastered = VP.followUp({ evidence: VP.evidence({ originalLevel: "medium", history: hist(true, true, true) }), sr, now });
    assert.equal(mastered[0].kind, "spaced_review");
    assert.match(mastered[0].text, /in 6 days/);
    const struggling = VP.followUp({
        evidence: VP.evidence({ originalLevel: "medium", history: hist(false, false) }),
        target: { level: "basic" }, sr, now, nudged: true
    });
    assert.deepEqual(struggling.map((s) => s.kind), ["review_moved", "step_back"]);
    assert.match(struggling[1].text, /Basic/);
    const building = VP.followUp({ evidence: VP.evidence({ originalLevel: "medium", history: hist(true) }), originalLevel: "medium", sr, now });
    assert.deepEqual(building.map((s) => s.kind), ["keep_going", "schedule"]);
    assert.match(building[0].text, /2 more correct answers in a row at the original question's level \(Medium\)/);
    const afterMiss = VP.followUp({
        evidence: VP.evidence({ originalLevel: "medium", history: hist(true, false) }),
        target: VP.nextTarget({ originalLevel: "medium", history: hist(true, false) }), originalLevel: "medium", sr, now
    });
    assert.match(afterMiss[0].text, /Easier questions count half/);
});

// --- ranking -----------------------------------------------------------------------------------

const MM = require("../js/mastery-model.js");

test("rankForPractice puts the weakest topic first and skips likely-mastered mistakes", () => {
    let map = {};
    for (const c of [false, false, true]) map = MM.updateMastery(map, { subject: "S", topic: "Weak", correct: c });
    for (const c of [true, true, true]) map = MM.updateMastery(map, { subject: "S", topic: "Strong", correct: c });
    const recs = [
        { id: "e1", subject: "S", topic: "Strong", question: "q1" },
        { id: "e2", subject: "S", topic: "Weak", question: "q2" },
        { id: "e3", subject: "S", topic: "New", question: "q3" },
        { id: "e4", subject: "S", topic: "Weak", question: "q4", variantPractice: { history: hist(true, true, true) } }
    ];
    const ranked = VP.rankForPractice(recs, map, { getTopicStat: MM.getTopicStat, limit: 5 });
    assert.deepEqual(ranked.map((r) => r.record.id), ["e2", "e3", "e1"]);
    assert.ok(ranked[0].reasons.includes("weak_topic"));
    assert.equal(ranked[1].ema, null); // unknown topic is not treated as strong
});

test("rankForPractice: struggling first among equals, then due, and limit applies", () => {
    const recs = [
        { id: "a", subject: "S", topic: "", question: "q" },
        { id: "b", subject: "S", topic: "", question: "q", variantPractice: { history: hist(false, false) } },
        { id: "c", subject: "S", topic: "", question: "q", sr: { due: "x" } }
    ];
    const ranked = VP.rankForPractice(recs, {}, { isDue: (sr) => !!sr, limit: 2 });
    assert.deepEqual(ranked.map((r) => r.record.id), ["b", "c"]);
});

// --- request / response ---------------------------------------------------------------------

const RECORD = {
    id: "err-1", subject: "AP Calculus AB", topic: "Chain rule", type: "Multiple Choice",
    question: "If $y = (3x+1)^4$...", options: ["A. a", "B. b", "C. c", "D. d"], answer: "A. a",
    userAnswer: "B. b", explanation: "Chain rule ...", difficulty: "medium",
    sr: { due: new Date(Date.now() + 3 * DAY).toISOString() }
};

test("buildRequest sends the mistake, the staircase level, and what to avoid", () => {
    const rec = Object.assign({}, RECORD, {
        variantPractice: { history: [Object.assign(h(false, "medium", "v1"), { q: "Seen stem" })], pending: [{ id: "p1", question: "Pending stem", level: "medium" }] },
        analysis: { coreConcept: "Chain rule", conceptKey: "chain-rule" }
    });
    const body = VP.buildRequest(rec, { userId: "u-1", model: "m", count: 9 });
    assert.equal(body.level, "basic");                 // stepped down after the miss
    assert.equal(body.count, 3);
    assert.deepEqual(body.avoid, ["Seen stem", "Pending stem"]);
    assert.equal(body.mistake.userAnswer, "B. b");
    assert.deepEqual(body.mistake.options, RECORD.options);
    assert.equal(body.analysis.conceptKey, "chain-rule");
    assert.equal(VP.buildRequest({ id: "x", question: "q" }).mistake.difficulty, null);
    assert.equal(VP.buildRequest(RECORD, { level: "challenge" }).level, "challenge");
});

const SERVER_VARIANT = {
    id: "var-1", question: "Find $\\frac{d}{dx}\\sin(2x)$.",
    options: ["A. $2\\cos(2x)$", "B. $\\cos(2x)$", "C. $-2\\cos(2x)$", "D. $2\\sin(2x)$"],
    answer: "A. $2\\cos(2x)$", explanation: "Chain rule ...", optionNotes: ["correct", "x", "y", "z"],
    concept: "Chain rule", conceptKey: "chain-rule", difficulty: "medium", relation: "same",
    changes: ["new inner function"], verification: { status: "verified", method: "numeric" }, generator: "template"
};

test("acceptVariants keeps valid items and drops malformed ones", () => {
    const bad = [
        null, "x",
        Object.assign({}, SERVER_VARIANT, { answer: "E. nope" }),
        Object.assign({}, SERVER_VARIANT, { options: ["A. 1", "B. 2", "C. 3"] }),
        Object.assign({}, SERVER_VARIANT, { question: "  " })
    ];
    const out = VP.acceptVariants([SERVER_VARIANT].concat(bad));
    assert.equal(out.length, 1);
    assert.equal(out[0].type, "Multiple Choice");
    assert.equal(out[0].level, "medium");
    assert.equal(out[0].verification.status, "verified");
    const odd = VP.acceptVariants([Object.assign({}, SERVER_VARIANT, { verification: { status: "trust me" }, generator: "??", optionNotes: [1, 2] })])[0];
    assert.equal(odd.verification.status, "unverified");
    assert.equal(odd.generator, "ai");
    assert.equal(odd.optionNotes, null);
    assert.deepEqual(VP.acceptVariants("nope"), []);
});

test("storeBatch, pickPending, and recordOutcome are immutable and bounded", () => {
    const v = VP.acceptVariants([SERVER_VARIANT])[0];
    const v2 = Object.assign({}, v, { id: "var-2", level: "basic" });
    const stored = VP.storeBatch(RECORD, { variants: [v, v2, v], analysis: { coreConcept: "Chain rule" } });
    assert.equal(RECORD.variantPractice, undefined);
    assert.equal(stored.variantPractice.pending.length, 2);       // duplicate id ignored
    assert.equal(stored.analysis.coreConcept, "Chain rule");
    assert.equal(VP.pickPending(stored, "basic").id, "var-2");
    assert.equal(VP.pickPending(stored, "challenge"), null);

    const done = VP.recordOutcome(stored, { variant: v, correct: false, chosen: "B", at: "2026-11-24T00:00:00Z" });
    assert.equal(done.variantPractice.pending.length, 1);
    const entry = done.variantPractice.history[0];
    assert.deepEqual([entry.id, entry.correct, entry.chosen, entry.level, entry.verified], ["var-1", false, "B", "medium", true]);
    assert.equal(stored.variantPractice.history.length, 0);
    // an answered variant is never queued again
    assert.equal(VP.storeBatch(done, { variants: [v] }).variantPractice.pending.length, 1);

    let many = RECORD;
    for (let i = 0; i < 10; i++) many = VP.storeBatch(many, { variants: [Object.assign({}, v, { id: "p" + i })] });
    assert.equal(many.variantPractice.pending.length, 4);
    for (let i = 0; i < 50; i++) many = VP.recordOutcome(many, { variant: Object.assign({}, v, { id: "h" + i }), correct: true });
    assert.equal(many.variantPractice.history.length, 40);
});
