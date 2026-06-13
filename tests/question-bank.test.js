// Structural validator for the offline question bank (Stage 0).
// `node --test tests/question-bank.test.js`
//
// Guards the MECHANICAL invariants that protect rendering, MCQ grading, and the
// review loop — the exact failure modes a content upgrade risks. Structural only:
// it does NOT judge question quality (length symmetry, "real misconception",
// cognitive tier) — those stay in the human authoring checklist. Must stay green
// on the current bank before any content upgrade begins.

const test = require("node:test");
const assert = require("node:assert");

global.window = {};
require("../js/question-bank.js");
const BANK = global.window.OFFLINE_BANK;

const TIERS = ["basic", "medium", "challenge"];
const PREFIXES = ["A. ", "B. ", "C. ", "D. "];
const BANNED = [
    /\ball of the above\b/i,
    /\bnone of the above\b/i,
    /\bboth [a-d] and [a-d]\b/i,
];

// Even number of "$" => delimiters are balanced (KaTeX won't break).
function balancedDollars(s) {
    return ((String(s).match(/\$/g) || []).length) % 2 === 0;
}

// Fail with an exact locator so future content edits are debuggable in seconds.
function fail(loc, msg) {
    assert.fail(loc + ": " + msg);
}

test("OFFLINE_BANK exists and is an object", () => {
    assert.ok(BANK && typeof BANK === "object", "window.OFFLINE_BANK not loaded");
    assert.ok(Object.keys(BANK).length > 0, "OFFLINE_BANK is empty");
});

test("every subject has basic/medium/challenge with non-empty mcq + sa arrays", () => {
    for (const subject of Object.keys(BANK)) {
        for (const tier of TIERS) {
            const pack = BANK[subject] && BANK[subject][tier];
            const loc = subject + "/" + tier;
            assert.ok(pack, loc + ": missing tier");
            if (!Array.isArray(pack.mcq) || pack.mcq.length === 0) fail(loc, "mcq missing or empty");
            if (!Array.isArray(pack.sa) || pack.sa.length === 0) fail(loc, "sa missing or empty");
        }
    }
});

test("every MCQ item is structurally valid (options, answer contract, KaTeX, banned patterns)", () => {
    for (const subject of Object.keys(BANK)) {
        for (const tier of TIERS) {
            const items = (BANK[subject][tier] || {}).mcq || [];
            items.forEach(function (q, i) {
                const loc = subject + "/" + tier + "/mcq[" + i + "]";

                if (typeof q.q !== "string" || q.q.trim().length === 0) fail(loc, "stem (q) is empty");
                if (/\{focus\}/.test(q.q)) fail(loc, "{focus} token is not allowed in an MCQ stem");

                if (!Array.isArray(q.o) || q.o.length !== 4) fail(loc, "must have exactly 4 options");
                q.o.forEach(function (opt, k) {
                    if (typeof opt !== "string") fail(loc, "option[" + k + "] is not a string");
                    if (!opt.startsWith(PREFIXES[k])) {
                        fail(loc, "option[" + k + "] must start with \"" + PREFIXES[k] + "\" (got: " + JSON.stringify(opt.slice(0, 6)) + ")");
                    }
                });

                // Answer contract: `a` must be exactly one of the option strings.
                if (typeof q.a !== "string" || q.a.trim().length === 0) fail(loc, "answer (a) is empty");
                if (!q.o.includes(q.a)) fail(loc, "answer does not exactly match one option");

                // KaTeX safety.
                if (!balancedDollars(q.q)) fail(loc, "unbalanced \"$\" delimiters in stem");
                if (!balancedDollars(q.a)) fail(loc, "unbalanced \"$\" delimiters in answer");
                q.o.forEach(function (opt, k) {
                    if (!balancedDollars(opt)) fail(loc, "unbalanced \"$\" delimiters in option[" + k + "]");
                });

                // Banned patterns (case-insensitive) across stem + options + answer.
                const blob = [q.q].concat(q.o, [q.a]).join("  ");
                BANNED.forEach(function (re) {
                    if (re.test(blob)) fail(loc, "banned pattern present (" + re + ")");
                });

                assertExplanation(q, loc);
            });
        }
    }
});

test("every SA item is structurally valid (q, a, KaTeX)", () => {
    for (const subject of Object.keys(BANK)) {
        for (const tier of TIERS) {
            const items = (BANK[subject][tier] || {}).sa || [];
            items.forEach(function (q, i) {
                const loc = subject + "/" + tier + "/sa[" + i + "]";
                if (typeof q.q !== "string" || q.q.trim().length === 0) fail(loc, "prompt (q) is empty");
                if (typeof q.a !== "string" || q.a.trim().length === 0) fail(loc, "answer (a) is empty");
                if (!balancedDollars(q.q)) fail(loc, "unbalanced \"$\" delimiters in prompt");
                if (!balancedDollars(q.a)) fail(loc, "unbalanced \"$\" delimiters in answer");
                assertExplanation(q, loc);
            });
        }
    }
});

// Optional `e` explanation: if present, must be a real string that adds info
// (mirrors the dedupe filter in normalizeAIQuestions so authored `e` renders).
function assertExplanation(q, loc) {
    if (q.e === undefined) return;
    if (typeof q.e !== "string") fail(loc, "explanation (e) must be a string when present");
    if (q.e.trim().length < 20) fail(loc, "explanation (e) is too short (< 20 chars)");
    if (q.e === q.a) fail(loc, "explanation (e) must not just restate the answer");
}

test("bank size sanity: total item count is reported", () => {
    let mcq = 0, sa = 0;
    for (const subject of Object.keys(BANK)) {
        for (const tier of TIERS) {
            mcq += ((BANK[subject][tier] || {}).mcq || []).length;
            sa += ((BANK[subject][tier] || {}).sa || []).length;
        }
    }
    assert.ok(mcq > 0 && sa > 0, "bank should contain MCQ and SA items");
});
