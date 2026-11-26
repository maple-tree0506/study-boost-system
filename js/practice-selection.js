/*
 * Practice selection planner (R1, Phase 1).
 *
 * PURE planning module. Given the learner's saved review items, decide which are
 * DUE and should be surfaced in the next practice set. Phase 1 uses one signal
 * (spaced-repetition due-ness). Future selectors (mastery, coverage, analytics)
 * plug in behind the SAME stable public contract, so callers never change:
 *
 *   planPracticeSelection({ reviews, subject, cap = 3, isDue, keep })
 *     -> { selected: [...], metadata: { reviewCount, heldBack } }
 *
 * keep (optional) is a predicate on the saved record: due records it rejects stay out
 * of the set and are counted in metadata.heldBack. A strict "only this topic" set uses
 * it (recordMatchesRequest) so it never carries reviews of other skills.
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
        var keep = typeof opts.keep === "function" ? opts.keep : null;

        var due = reviews.filter(function (r) {
            return r && isDue(r.sr) && matchesSubject(r, subject);
        });
        var eligible = keep ? due.filter(function (r) { return keep(r); }) : due;

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

        return { selected: selected, metadata: { reviewCount: selected.length, heldBack: due.length - eligible.length } };
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

    // --- Skill catalog ----------------------------------------------------------------
    // Courses whose bank items carry skill tags (`k: [skillId, ...]`, the first is the
    // item's main skill). Tagged items are matched by tag, not by words, and their results
    // always count toward their own skill. Units follow the AP Calculus AB course
    // framework. Skill ids that the built-in similar-question generator also uses
    // (power-rule, chain-rule, product-rule, quotient-rule, antiderivative-power,
    // definite-integral, trig-limit) keep the same ids.
    var SKILLS = {
        calc_ab: [
            { id: "limits", name: "Limits", unit: "Unit 1 · Limits and continuity", aliases: ["limit"] },
            { id: "trig-limit", name: "Trig limits at 0", unit: "Unit 1 · Limits and continuity", aliases: ["sin x over x", "trigonometric limits"] },
            { id: "continuity", name: "Continuity", unit: "Unit 1 · Limits and continuity", aliases: ["continuous"] },
            { id: "derivative-definition", name: "Definition of the derivative", unit: "Unit 2 · Differentiation basics", aliases: ["limit definition", "difference quotient"] },
            { id: "power-rule", name: "Power rule", unit: "Unit 2 · Differentiation basics", aliases: ["power rule derivatives"] },
            { id: "basic-derivatives", name: "Basic derivatives (constants, e^x, ln x)", unit: "Unit 2 · Differentiation basics", aliases: ["derivative of e^x", "exponential derivatives", "derivatives of constants"] },
            { id: "product-rule", name: "Product rule", unit: "Unit 2 · Differentiation basics", aliases: [] },
            { id: "quotient-rule", name: "Quotient rule", unit: "Unit 2 · Differentiation basics", aliases: [] },
            { id: "chain-rule", name: "Chain rule", unit: "Unit 3 · Composite functions", aliases: ["composite functions", "chain"] },
            { id: "motion", name: "Position, velocity, and acceleration", unit: "Unit 4 · Derivatives in context", aliases: ["motion", "velocity", "acceleration", "particle motion"] },
            { id: "related-rates", name: "Related rates", unit: "Unit 4 · Derivatives in context", aliases: ["related rate"] },
            { id: "mvt", name: "Mean Value Theorem", unit: "Unit 5 · Analytical applications", aliases: ["mvt", "mean value"] },
            { id: "extrema", name: "Extrema and derivative tests", unit: "Unit 5 · Analytical applications", aliases: ["local extrema", "maximum", "minimum", "first derivative test", "second derivative test", "optimization"] },
            { id: "increasing-concavity", name: "Increasing, decreasing, and concavity", unit: "Unit 5 · Analytical applications", aliases: ["concavity", "inflection points", "increasing", "decreasing"] },
            { id: "riemann-sums", name: "Riemann sums", unit: "Unit 6 · Integration", aliases: ["riemann sum", "trapezoidal sum"] },
            { id: "integral-meaning", name: "Meaning of the definite integral", unit: "Unit 6 · Integration", aliases: ["signed area", "net change", "accumulation of change"] },
            { id: "ftc-accumulation", name: "Accumulation functions (FTC part 1)", unit: "Unit 6 · Integration", aliases: ["fundamental theorem of calculus", "ftc", "accumulation function"] },
            { id: "antiderivative-power", name: "Antiderivatives (reverse power rule)", unit: "Unit 6 · Integration", aliases: ["antiderivatives", "indefinite integrals", "reverse power rule"] },
            { id: "definite-integral", name: "Evaluating definite integrals", unit: "Unit 6 · Integration", aliases: ["definite integrals", "definite integral", "ftc part 2"] },
            { id: "u-substitution", name: "u-substitution", unit: "Unit 6 · Integration", aliases: ["u sub", "substitution"] },
            { id: "differential-equations", name: "Separable differential equations", unit: "Unit 7 · Differential equations", aliases: ["differential equations", "separation of variables", "exponential growth"] },
            { id: "average-value", name: "Average value of a function", unit: "Unit 8 · Applications of integration", aliases: ["average value"] },
            { id: "volume", name: "Volumes of revolution", unit: "Unit 8 · Applications of integration", aliases: ["volume", "disk method", "washer method", "shell method"] }
        ]
    };

    function norm(text) {
        return words(text).join(" ");
    }

    function skillsFor(courseId) {
        return SKILLS[courseId] ? SKILLS[courseId].slice() : [];
    }

    function skillById(courseId, id) {
        var list = SKILLS[courseId] || [];
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
        return null;
    }

    // The catalog skill a typed topic names (by name, id, or alias), or null.
    function findSkill(courseId, topic) {
        var t = norm(topic);
        if (!t) return null;
        var list = SKILLS[courseId] || [];
        for (var i = 0; i < list.length; i++) {
            var sk = list[i];
            var names = [sk.name, sk.id.replace(/-/g, " ")].concat(sk.aliases || []);
            for (var j = 0; j < names.length; j++) {
                if (norm(names[j]) === t) return sk;
            }
        }
        return null;
    }

    // Which items of a bank pool answer a request for `topic` in `courseId`:
    //   { onTopic, general, skill, byTag }
    // Tagged pools are matched by skill tag when the topic names a catalog skill; a topic
    // the catalog does not know, or an untagged pool, falls back to splitByTopic.
    function splitForRequest(items, topic, courseId) {
        var skill = findSkill(courseId, topic);
        var tagged = (items || []).some(function (it) { return it && Array.isArray(it.k); });
        if (skill && tagged) {
            var out = { onTopic: [], general: [], skill: skill, byTag: true, terms: [] };
            items.forEach(function (it, i) {
                if (it && Array.isArray(it.k) && it.k.indexOf(skill.id) !== -1) out.onTopic.push(i);
                else out.general.push(i);
            });
            return out;
        }
        var split = splitByTopic(items, topic);
        split.skill = null;
        split.byTag = false;
        return split;
    }

    // Is a saved mistake about the requested topic? For a catalog skill: its skill tags
    // when it has them, else its own topic when that names a skill. Otherwise its topic
    // name, or the topic's words in its question and answer (as splitByTopic does).
    function recordMatchesRequest(record, topic, courseId) {
        if (!record || !norm(topic)) return false;
        var skill = findSkill(courseId, topic);
        if (skill) {
            if (Array.isArray(record.skills) && record.skills.length) return record.skills.indexOf(skill.id) !== -1;
            var own = findSkill(courseId, record.topic);
            if (own) return own.id === skill.id;
        }
        if (norm(record.topic) && norm(record.topic) === norm(topic)) return true;
        return textMatchesTerms(String(record.question || "") + " " + String(record.answer || ""), topicTerms(topic));
    }

    var api = {
        planPracticeSelection: planPracticeSelection,
        recordMatchesRequest: recordMatchesRequest,
        skillsFor: skillsFor,
        skillById: skillById,
        findSkill: findSkill,
        splitForRequest: splitForRequest,
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
