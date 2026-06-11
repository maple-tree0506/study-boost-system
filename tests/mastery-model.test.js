// Unit tests for the R2 topic-mastery model (pure module).
// Node's built-in runner: `node --test tests/mastery-model.test.js`.

const test = require("node:test");
const assert = require("node:assert");
const {
    normalizeTopicKey,
    updateMastery,
    getTopicStat,
    masteryLevel,
    summarizeMastery
} = require("../js/mastery-model.js");

const EPS = 1e-9;
function approx(actual, expected, msg) {
    assert.ok(Math.abs(actual - expected) < EPS, msg || (actual + " !~= " + expected));
}

// Fold a sequence of boolean outcomes for one (subject, topic) into an existing
// map (defaults to empty), returning the new map. Threading `map` lets tests
// accumulate several topics before summarizing.
function feed(map, subject, topic, outcomes, at) {
    return outcomes.reduce(function (m, correct, i) {
        return updateMastery(m, { subject: subject, topic: topic, correct: correct, at: at || ("t" + i) });
    }, map || {});
}

// --- normalizeTopicKey ------------------------------------------------------

test("normalizeTopicKey lowercases, trims, and collapses whitespace", () => {
    assert.strictEqual(normalizeTopicKey("  The   Chain   Rule  "), "the chain rule");
    assert.strictEqual(normalizeTopicKey("Derivatives"), "derivatives");
    assert.strictEqual(normalizeTopicKey("a\tb\nc"), "a b c");
});

test("normalizeTopicKey maps blank / non-string to the empty (general) bucket", () => {
    assert.strictEqual(normalizeTopicKey(""), "");
    assert.strictEqual(normalizeTopicKey("   "), "");
    assert.strictEqual(normalizeTopicKey(undefined), "");
    assert.strictEqual(normalizeTopicKey(null), "");
    assert.strictEqual(normalizeTopicKey(42), "");
});

// --- first-attempt initialization ------------------------------------------

test("first attempt initializes attempts/correct/ema and records identity", () => {
    const map = updateMastery({}, { subject: "AP Biology", topic: "Cells", correct: true, at: "ts1" });
    const stat = getTopicStat(map, "AP Biology", "Cells");
    assert.strictEqual(stat.attempts, 1);
    assert.strictEqual(stat.correct, 1);
    approx(stat.ema, 1);
    assert.strictEqual(stat.subject, "AP Biology");
    assert.strictEqual(stat.topic, "Cells");
    assert.strictEqual(stat.topicKey, "cells");
    assert.strictEqual(stat.lastAttemptAt, "ts1");
});

test("first attempt incorrect => ema 0, correct 0, attempts 1", () => {
    const map = updateMastery({}, { subject: "AP Biology", topic: "Cells", correct: false });
    const stat = getTopicStat(map, "AP Biology", "Cells");
    assert.strictEqual(stat.attempts, 1);
    assert.strictEqual(stat.correct, 0);
    approx(stat.ema, 0);
});

// --- blank-topic bucket -----------------------------------------------------

test("blank topic buckets under the subject-general key ''", () => {
    const map = updateMastery({}, { subject: "AP Physics 1", topic: "   ", correct: true });
    const stat = getTopicStat(map, "AP Physics 1", "");
    assert.ok(stat);
    assert.strictEqual(stat.topicKey, "");
    // Same bucket regardless of which blank form is queried.
    assert.strictEqual(getTopicStat(map, "AP Physics 1", undefined), stat);
});

// --- EMA update math --------------------------------------------------------

test("EMA folds outcomes with alpha 0.4", () => {
    // start correct -> ema 1; then wrong -> 0.4*0 + 0.6*1 = 0.6; then correct -> 0.4*1 + 0.6*0.6 = 0.76
    const map = feed({}, "AP Calculus AB", "Limits", [true, false, true]);
    const stat = getTopicStat(map, "AP Calculus AB", "Limits");
    approx(stat.ema, 0.76);
    assert.strictEqual(stat.attempts, 3);
    assert.strictEqual(stat.correct, 2);
});

test("counters accumulate attempts and correct independently of ema", () => {
    const map = feed({}, "AP Calculus AB", "Limits", [false, true, true, false, true]);
    const stat = getTopicStat(map, "AP Calculus AB", "Limits");
    assert.strictEqual(stat.attempts, 5);
    assert.strictEqual(stat.correct, 3);
});

test("lastAttemptAt reflects the most recent event", () => {
    let map = updateMastery({}, { subject: "S", topic: "T", correct: true, at: "first" });
    map = updateMastery(map, { subject: "S", topic: "T", correct: false, at: "second" });
    assert.strictEqual(getTopicStat(map, "S", "T").lastAttemptAt, "second");
});

test("topic display label refreshes to the latest casing, key stays stable", () => {
    let map = updateMastery({}, { subject: "S", topic: "Photosynthesis", correct: true });
    map = updateMastery(map, { subject: "S", topic: "PHOTOSYNTHESIS", correct: false });
    const stat = getTopicStat(map, "S", "photosynthesis");
    assert.strictEqual(stat.attempts, 2);
    assert.strictEqual(stat.topicKey, "photosynthesis");
    assert.strictEqual(stat.topic, "PHOTOSYNTHESIS");
});

// --- mastery levels + volume gates -----------------------------------------

test("masteryLevel: zero attempts => new", () => {
    assert.strictEqual(masteryLevel({ attempts: 0, ema: 1 }), "new");
    assert.strictEqual(masteryLevel(null), "new");
    assert.strictEqual(masteryLevel(undefined), "new");
});

test("masteryLevel: one+ attempt below thresholds => developing", () => {
    assert.strictEqual(masteryLevel({ attempts: 1, ema: 1 }), "developing");
    assert.strictEqual(masteryLevel({ attempts: 2, ema: 0.95 }), "developing");
});

test("masteryLevel: proficient requires attempts>=3 AND ema>=0.70", () => {
    assert.strictEqual(masteryLevel({ attempts: 3, ema: 0.70 }), "proficient");
    assert.strictEqual(masteryLevel({ attempts: 3, ema: 0.84 }), "proficient");
    // volume gate: high ema but too few attempts is NOT proficient
    assert.strictEqual(masteryLevel({ attempts: 2, ema: 0.99 }), "developing");
});

test("masteryLevel: mastered requires attempts>=4 AND ema>=0.85", () => {
    assert.strictEqual(masteryLevel({ attempts: 4, ema: 0.85 }), "mastered");
    // volume gate: ema high enough but only 3 attempts => proficient, not mastered
    assert.strictEqual(masteryLevel({ attempts: 3, ema: 0.90 }), "proficient");
    // ema just below the mastered bar but above proficient => proficient
    assert.strictEqual(masteryLevel({ attempts: 5, ema: 0.84 }), "proficient");
});

// --- summarizeMastery: ordering, weakest, subject filter --------------------

test("summarizeMastery topics sort by attempts desc, then ema asc, then name", () => {
    let map = {};
    map = feed(map, "S", "Alpha", [true, true]);            // attempts 2, ema 1
    map = feed(map, "S", "Beta", [true, false, true]);      // attempts 3
    map = feed(map, "S", "Gamma", [false, false, true]);    // attempts 3, lower ema than Beta
    const { topics } = summarizeMastery(map);
    // Beta & Gamma have 3 attempts (come first); Gamma has lower ema so precedes Beta.
    assert.deepStrictEqual(topics.map(t => t.topic), ["Gamma", "Beta", "Alpha"]);
});

test("summarizeMastery topics tie-break by topic name when attempts and ema equal", () => {
    let map = {};
    map = feed(map, "S", "Zeta", [true]);
    map = feed(map, "S", "Apple", [true]);
    const { topics } = summarizeMastery(map);
    assert.deepStrictEqual(topics.map(t => t.topic), ["Apple", "Zeta"]);
});

test("summarizeMastery weakest includes only attempts>=2, lowest ema first", () => {
    let map = {};
    map = feed(map, "S", "Weak", [false, false]);     // attempts 2, ema 0
    map = feed(map, "S", "Mid", [true, false]);       // attempts 2, ema 0.6
    map = feed(map, "S", "OneShot", [false]);         // attempts 1 -> excluded
    const { weakest } = summarizeMastery(map);
    assert.deepStrictEqual(weakest.map(t => t.topic), ["Weak", "Mid"]);
    assert.ok(weakest.every(t => t.attempts >= 2));
});

test("summarizeMastery supports a subject filter", () => {
    let map = {};
    map = feed(map, "AP Biology", "Cells", [true, true]);
    map = feed(map, "AP Physics 1", "Forces", [false, false]);
    const bio = summarizeMastery(map, { subject: "AP Biology" });
    assert.strictEqual(bio.topics.length, 1);
    assert.strictEqual(bio.topics[0].subject, "AP Biology");
    assert.strictEqual(bio.weakest.length, 1);
    // No filter => both subjects present.
    assert.strictEqual(summarizeMastery(map).topics.length, 2);
});

test("summarizeMastery on an empty / invalid map returns empty arrays", () => {
    assert.deepStrictEqual(summarizeMastery({}), { topics: [], weakest: [] });
    assert.deepStrictEqual(summarizeMastery(null), { topics: [], weakest: [] });
    assert.deepStrictEqual(summarizeMastery(undefined), { topics: [], weakest: [] });
});

// --- same key across subjects stays distinct --------------------------------

test("same topic under different subjects are separate buckets", () => {
    let map = updateMastery({}, { subject: "AP Biology", topic: "Energy", correct: true });
    map = updateMastery(map, { subject: "AP Physics 1", topic: "Energy", correct: false });
    assert.strictEqual(getTopicStat(map, "AP Biology", "Energy").attempts, 1);
    assert.strictEqual(getTopicStat(map, "AP Physics 1", "Energy").attempts, 1);
    assert.strictEqual(summarizeMastery(map).topics.length, 2);
});

// --- getTopicStat misses ----------------------------------------------------

test("getTopicStat returns null for unknown topic or bad map", () => {
    const map = updateMastery({}, { subject: "S", topic: "T", correct: true });
    assert.strictEqual(getTopicStat(map, "S", "Nope"), null);
    assert.strictEqual(getTopicStat(null, "S", "T"), null);
});

// --- immutability -----------------------------------------------------------

test("updateMastery never mutates the input map or its stats", () => {
    const first = updateMastery({}, { subject: "S", topic: "T", correct: true, at: "a" });
    const snapshot = JSON.parse(JSON.stringify(first));
    const second = updateMastery(first, { subject: "S", topic: "T", correct: false, at: "b" });

    // input map is unchanged (deep equality vs snapshot)
    assert.deepStrictEqual(first, snapshot);
    // a new object was returned, and the prior stat object was not mutated
    assert.notStrictEqual(second, first);
    assert.notStrictEqual(second["S::t"], first["S::t"]);
    assert.strictEqual(first["S::t"].attempts, 1);
    assert.strictEqual(second["S::t"].attempts, 2);
});

test("updateMastery preserves unrelated entries by reference", () => {
    let map = updateMastery({}, { subject: "S", topic: "Keep", correct: true });
    const keepRef = map["S::keep"];
    const next = updateMastery(map, { subject: "S", topic: "Other", correct: true });
    assert.strictEqual(next["S::keep"], keepRef); // untouched entry carried over by reference
    assert.ok(next["S::other"]);
});
