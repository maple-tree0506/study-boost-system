// Unit tests for the R1 practice-selection planner (pure module).
// Node's built-in runner: `node --test tests/practice-selection.test.js`.

const test = require("node:test");
const assert = require("node:assert");
const { planPracticeSelection } = require("../js/practice-selection.js");

const alwaysDue = function () { return true; };

// Build a review record; dueOffsetDays shifts the SR due date (negative = overdue).
function rec(id, subject, dueOffsetDays) {
    return {
        id: id,
        subject: subject,
        type: "Short Answer",
        question: "Q" + id,
        answer: "A" + id,
        sr: { due: new Date(Date.now() + (dueOffsetDays || 0) * 86400000).toISOString() }
    };
}

test("caps selection at 3 by default", () => {
    const reviews = [rec(1), rec(2), rec(3), rec(4), rec(5)];
    const { selected, metadata } = planPracticeSelection({ reviews, isDue: alwaysDue });
    assert.strictEqual(selected.length, 3);
    assert.strictEqual(metadata.reviewCount, 3);
});

test("respects an explicit cap", () => {
    const reviews = [rec(1), rec(2), rec(3), rec(4)];
    const { selected } = planPracticeSelection({ reviews, cap: 2, isDue: alwaysDue });
    assert.strictEqual(selected.length, 2);
});

test("cap 0 selects nothing", () => {
    const { selected, metadata } = planPracticeSelection({ reviews: [rec(1)], cap: 0, isDue: alwaysDue });
    assert.strictEqual(selected.length, 0);
    assert.strictEqual(metadata.reviewCount, 0);
});

test("filters out not-due items (injected isDue)", () => {
    const reviews = [rec(1), rec(2)];
    const onlyFirstDue = function (sr) { return sr === reviews[0].sr; };
    const { selected } = planPracticeSelection({ reviews, isDue: onlyFirstDue });
    assert.strictEqual(selected.length, 1);
    assert.strictEqual(selected[0].errId, 1);
});

test("subject filter keeps matching subject", () => {
    const reviews = [rec(1, "AP Biology"), rec(2, "AP Calculus AB")];
    const { selected } = planPracticeSelection({ reviews, subject: "AP Biology", isDue: alwaysDue });
    assert.strictEqual(selected.length, 1);
    assert.strictEqual(selected[0].subject, "AP Biology");
});

test("subject fallback: null-subject records stay eligible under a filter", () => {
    const reviews = [rec(1, null), rec(2, "AP Calculus AB")];
    const { selected } = planPracticeSelection({ reviews, subject: "AP Biology", isDue: alwaysDue });
    assert.strictEqual(selected.length, 1);   // null-subject (1) eligible; calculus (2) excluded
    assert.strictEqual(selected[0].errId, 1);
});

test("subject fallback also covers undefined subject", () => {
    const r = { id: 7, type: "Short Answer", question: "Q7", answer: "A7", sr: {} }; // subject undefined
    const { selected } = planPracticeSelection({ reviews: [r], subject: "AP Biology", isDue: alwaysDue });
    assert.strictEqual(selected.length, 1);
});

test("no subject filter selects all due", () => {
    const reviews = [rec(1, "AP Biology"), rec(2, "AP Calculus AB")];
    const { selected } = planPracticeSelection({ reviews, isDue: alwaysDue });
    assert.strictEqual(selected.length, 2);
});

test("provenance fields present on each selected item", () => {
    const { selected } = planPracticeSelection({ reviews: [rec(1)], isDue: alwaysDue });
    const item = selected[0];
    assert.strictEqual(item.source, "review");
    assert.strictEqual(item.reason, "schedule:due");
    assert.strictEqual(typeof item.selectedAt, "number");
    assert.strictEqual(item.errId, 1);
    assert.strictEqual(item.id, "rev-1");
});

test("metadata.reviewCount equals selected length", () => {
    const reviews = [rec(1), rec(2), rec(3), rec(4)];
    const { selected, metadata } = planPracticeSelection({ reviews, cap: 2, isDue: alwaysDue });
    assert.strictEqual(metadata.reviewCount, selected.length);
    assert.strictEqual(metadata.reviewCount, 2);
});

test("soonest-due first ordering", () => {
    const dueNow = rec(1, null, 0);
    const overdue = rec(2, null, -5); // earlier due timestamp => should come first
    const { selected } = planPracticeSelection({ reviews: [dueNow, overdue], isDue: alwaysDue });
    assert.strictEqual(selected[0].errId, 2);
});

test("empty / missing reviews => empty selection", () => {
    assert.deepStrictEqual(planPracticeSelection({ isDue: alwaysDue }).selected, []);
    assert.strictEqual(planPracticeSelection({}).metadata.reviewCount, 0);
});

test("carries the stored explanation into the resurfaced review", () => {
    const r = rec(1);
    r.explanation = "x^2 differentiates to 2x; choosing x ignores the power rule.";
    const { selected } = planPracticeSelection({ reviews: [r], isDue: alwaysDue });
    assert.strictEqual(selected[0].explanation, r.explanation);
});

test("carries topic and topicKey into the resurfaced review (R2 passthrough)", () => {
    const r = rec(1);
    r.topic = "The Chain Rule";
    r.topicKey = "the chain rule";
    const { selected } = planPracticeSelection({ reviews: [r], isDue: alwaysDue });
    assert.strictEqual(selected[0].topic, "The Chain Rule");
    assert.strictEqual(selected[0].topicKey, "the chain rule");
});

test("topic passthrough is undefined when the record has no topic", () => {
    const r = rec(1); // no topic/topicKey set
    const { selected } = planPracticeSelection({ reviews: [r], isDue: alwaysDue });
    assert.strictEqual(selected[0].topic, undefined);
    assert.strictEqual(selected[0].topicKey, undefined);
});

test("default isDue treats a record with no sr as due", () => {
    const r = { id: 9, subject: null, type: "Short Answer", question: "Q9", answer: "A9" }; // no sr
    const { selected } = planPracticeSelection({ reviews: [r] }); // no isDue injected => default
    assert.strictEqual(selected.length, 1);
});

// --- topic matching for the built-in bank -------------------------------------------------
const PSel = require("../js/practice-selection.js");

test("splitByTopic keeps only items whose question or answer is about the topic", () => {
    const items = [
        { q: "Name the main products of glycolysis.", a: "Pyruvate, ATP, and NADH." },
        { q: "A point mutation changes one codon. What is the most likely effect?", a: "A. A single amino acid change" },
        { q: "Explain how Le Chatelier's principle applies to an equilibrium related to {focus}.", a: "A stress shifts the equilibrium." },
        { q: "Where do glycolytic enzymes work?", a: "A. In the cytoplasm" }
    ];
    const split = PSel.splitByTopic(items, "Glycolysis");
    assert.deepEqual(split.onTopic, [0, 3], "stems match 'glycolytic'; a {focus} template does not count");
    assert.deepEqual(split.general, [1, 2]);
});

test("every meaningful topic word must appear; short words match exactly", () => {
    const rates = { q: "A ladder slides; at what rate is the top moving? The rates are related by the chain rule.", a: "A. 3 m/s" };
    const chain = { q: "Differentiate (3x+1)^4 using the chain rule.", a: "A. 12(3x+1)^3" };
    assert.deepEqual(PSel.splitByTopic([rates, chain], "Related rates").onTopic, [0]);
    assert.deepEqual(PSel.splitByTopic([rates, chain], "Chain rule").onTopic, [0, 1]);
    assert.deepEqual(PSel.splitByTopic([{ q: "What is the pH of a buffer?", a: "A. 4.7" }, { q: "Phase changes absorb heat.", a: "A. yes" }], "pH").onTopic, [0]);
    assert.deepEqual(PSel.splitByTopic([{ q: "State Kirchhoff's loop law.", a: "A. Sum of voltages is zero" }], "Kirchhoff's laws").onTopic, [0]);
});

test("no topic, or only filler words, means every item is general", () => {
    const items = [{ q: "Anything", a: "A" }, { q: "Else", a: "B" }];
    assert.deepEqual(PSel.splitByTopic(items, "").onTopic, []);
    assert.deepEqual(PSel.splitByTopic(items, "  ").general, [0, 1]);
    assert.deepEqual(PSel.topicTerms("the unit on"), []);
    assert.deepEqual(PSel.splitByTopic(items, "the unit on").general, [0, 1]);
});

test("the real AP Biology bank: a glycolysis request never matches a codon-mutation question", () => {
    global.window = global.window || {};
    require("../js/question-bank.js");
    const bank = global.window.OFFLINE_BANK.bio;
    for (const tier of ["basic", "medium", "challenge"]) {
        for (const kind of ["mcq", "sa"]) {
            const pool = bank[tier][kind];
            const split = PSel.splitByTopic(pool, "Glycolysis");
            for (const i of split.onTopic) {
                assert.match(pool[i].q + " " + pool[i].a, /glycol/i, tier + "/" + kind + " #" + i);
            }
            for (const i of split.general) {
                assert.doesNotMatch((pool[i].q + " " + pool[i].a).replace(/\{focus\}/g, ""), /glycol/i);
            }
        }
    }
});

test("findSkill resolves names, ids, and aliases; unknown topics and courses give null", () => {
    assert.equal(PSel.findSkill("calc_ab", "Chain rule").id, "chain-rule");
    assert.equal(PSel.findSkill("calc_ab", "  chain RULE ").id, "chain-rule");
    assert.equal(PSel.findSkill("calc_ab", "MVT").id, "mvt");
    assert.equal(PSel.findSkill("calc_ab", "u sub").id, "u-substitution");
    assert.equal(PSel.findSkill("calc_ab", "Glycolysis"), null);
    assert.equal(PSel.findSkill("bio", "Chain rule"), null);
});

test("splitForRequest uses skill tags: a formula-only chain-rule question is found", () => {
    global.window = global.window || {};
    require("../js/question-bank.js");
    const pool = global.window.OFFLINE_BANK.calc_ab.medium.mcq;
    const split = PSel.splitForRequest(pool, "Chain rule", "calc_ab");
    assert.equal(split.byTag, true);
    const stems = split.onTopic.map((i) => pool[i].q);
    assert.ok(stems.some((q) => /ln\(5x\^2 \+ 1\)/.test(q)), "the ln(5x^2+1) question is a chain-rule question");
    assert.ok(stems.every((q, n) => pool[split.onTopic[n]].k.includes("chain-rule")));
    // A topic outside the catalog falls back to word matching.
    assert.equal(PSel.splitForRequest(pool, "Glycolysis", "calc_ab").byTag, false);
});
