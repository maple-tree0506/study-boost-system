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
