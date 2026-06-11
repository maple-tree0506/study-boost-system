/*
 * Practice selection planner (R1, Phase 1).
 *
 * PURE planning module. Given the learner's saved review items, decide which are
 * DUE and should be surfaced in the next practice set. Phase 1 uses one signal
 * (spaced-repetition due-ness). Future selectors (mastery, coverage, analytics)
 * plug in behind the SAME stable public contract, so callers never change:
 *
 *   planPracticeSelection({ reviews, subject, cap = 3, isDue })
 *     -> { selected: [...], metadata: { reviewCount } }
 *
 * Each selected entry is provenance-tagged:
 *   { id, errId, type, question, answer, options, subject,
 *     source: "review",        // CLOSED origin set: {review, generated}
 *     reason: "schedule:due",   // OPEN namespaced taxonomy (dimension:value)
 *     selectedAt }              // additive/optional provenance (R6 audit / replay)
 *
 * No DOM, no side effects. Browser: window.PracticeSelection. Node: module.exports.
 */
(function () {
    "use strict";

    var DEFAULT_CAP = 3;

    // Mirrors ReviewSystem.isDue semantics so the planner is self-sufficient in
    // tests. Callers in the app normally pass ReviewSystem.isDue explicitly.
    function defaultIsDue(sr) {
        if (!sr || !sr.due) return true;                 // no schedule yet => due now
        return new Date(sr.due).getTime() <= Date.now();
    }

    function resolveIsDue(isDue) {
        if (typeof isDue === "function") return isDue;
        if (typeof window !== "undefined" && window.ReviewSystem &&
            typeof window.ReviewSystem.isDue === "function") {
            return window.ReviewSystem.isDue;
        }
        return defaultIsDue;
    }

    function dueTime(sr) {
        return (sr && sr.due) ? new Date(sr.due).getTime() : 0;
    }

    // Subject fallback rule: a record with a MISSING subject (== null, i.e. null
    // or undefined) is ALWAYS eligible — missing metadata must not permanently
    // exclude historical review items. A null/undefined `subject` argument means
    // "no subject filter" (all due eligible).
    function matchesSubject(record, subject) {
        if (subject == null) return true;
        if (record.subject == null) return true;
        return record.subject === subject;
    }

    function planPracticeSelection(opts) {
        opts = opts || {};
        var reviews = Array.isArray(opts.reviews) ? opts.reviews : [];
        var subject = opts.subject;
        var cap = (typeof opts.cap === "number" && opts.cap >= 0) ? opts.cap : DEFAULT_CAP;
        var isDue = resolveIsDue(opts.isDue);

        var eligible = reviews.filter(function (r) {
            return r && isDue(r.sr) && matchesSubject(r, subject);
        });

        // Most urgent (soonest-due) first.
        eligible.sort(function (a, b) { return dueTime(a.sr) - dueTime(b.sr); });

        var capped = eligible.slice(0, cap);
        var selectedAt = Date.now();

        var selected = capped.map(function (r) {
            return {
                id: "rev-" + r.id,
                errId: r.id,
                type: r.type,
                question: r.question,
                answer: r.answer,
                explanation: r.explanation,    // carry the stored "why" into the resurfaced review
                options: undefined,            // saved mistakes carry no options => recall render
                subject: r.subject,
                topic: r.topic,                // R2: carry topic identity so grading a review feeds mastery
                topicKey: r.topicKey,
                source: "review",
                reason: "schedule:due",
                selectedAt: selectedAt
            };
        });

        return { selected: selected, metadata: { reviewCount: selected.length } };
    }

    var api = { planPracticeSelection: planPracticeSelection };

    if (typeof window !== "undefined") {
        window.PracticeSelection = api;
    }
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
})();
