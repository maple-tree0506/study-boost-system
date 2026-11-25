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
 * Also: splitByTopic(items, topic) -> { onTopic, general, terms } decides which
 * built-in bank items are really about a requested topic (see below).
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

    // --- Topic matching for the built-in bank ---------------------------------------
    // Bank items carry no topic tags, so a requested topic ("Glycolysis") is matched
    // against each item's own question and correct answer. Template items that only
    // insert the topic name ("... related to {focus}") do NOT count: the {focus} token is
    // removed before matching, because those items test a fixed skill, not the topic.
    // A topic matches when every meaningful word of it appears (short words exactly,
    // longer words by stem: "glycolysis" also finds "glycolytic", "rates" finds "rate").
    var STOP_WORDS = {
        the: 1, and: 1, of: 1, in: 1, to: 1, for: 1, on: 1, with: 1, vs: 1, versus: 1,
        an: 1, ap: 1, unit: 1, its: 1, how: 1, what: 1, about: 1
    };

    function words(text) {
        return String(text || "")
            .toLowerCase()
            .replace(/\{focus\}/g, " ")
            .replace(/\\[a-z]+/g, " ")
            .replace(/'s\b/g, "")
            .replace(/[^a-z0-9]+/g, " ")
            .split(" ")
            .filter(Boolean);
    }

    function stem(word) {
        if (word.length >= 7) return word.slice(0, 6);
        if (word.length >= 4 && word.charAt(word.length - 1) === "s") return word.slice(0, -1);
        return word;
    }

    // -> [{ stem, exact }]; empty when the topic has no meaningful word.
    function topicTerms(topic) {
        return words(topic).filter(function (w) {
            return w.length >= 2 && !STOP_WORDS[w];
        }).map(function (w) {
            return w.length < 4 ? { stem: w, exact: true } : { stem: stem(w), exact: false };
        });
    }

    function textMatchesTerms(text, terms) {
        if (!terms || !terms.length) return false;
        var tokens = words(text);
        return terms.every(function (t) {
            return tokens.some(function (tok) {
                return t.exact ? tok === t.stem : tok.indexOf(t.stem) === 0;
            });
        });
    }

    // Which bank items are about the topic. Returns indices into `items`:
    //   { onTopic: [...], general: [...], terms }
    // With no usable topic every item is general.
    function splitByTopic(items, topic, textOf) {
        var terms = topicTerms(topic);
        var read = textOf || function (it) { return (it && it.q || "") + " " + (it && it.a || ""); };
        var out = { onTopic: [], general: [], terms: terms };
        (items || []).forEach(function (it, i) {
            if (terms.length && textMatchesTerms(read(it), terms)) out.onTopic.push(i);
            else out.general.push(i);
        });
        return out;
    }

    var api = {
        planPracticeSelection: planPracticeSelection,
        topicTerms: topicTerms,
        textMatchesTerms: textMatchesTerms,
        splitByTopic: splitByTopic
    };

    if (typeof window !== "undefined") {
        window.PracticeSelection = api;
    }
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
})();
