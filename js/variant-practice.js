/*
 * Similar-question practice: the adaptive rules (PURE module, no DOM or storage).
 *
 * A saved mistake can spawn "variants": new questions on the same knowledge point
 * (generated and checked by the server). This module decides what happens around
 * them, so app.js only renders:
 *
 *   nextTarget({ originalLevel, history })   -> { level, relation, reason }
 *       Difficulty staircase, "2 up / 1 down": two correct in a row steps up a
 *       level, a miss steps down, within one level of the original question.
 *       (Levitt's transformed up-down rule; it settles near 70% success.)
 *   evidence({ originalLevel, history })     -> { status, pMastery, needed, ... }
 *       Whether the student has PROBABLY mastered the idea. One correct answer is
 *       never enough: a Beta(1 + successes, 1 + failures) posterior must give
 *       P(success rate > 0.6) >= 0.8, the last answer must be right, and at least two
 *       different variants at the original difficulty or above must be correct.
 *   nudgeSchedule(sr, { correct, now })      -> { sr, changed }
 *       SM-2 stays in charge of the original question. A missed variant can only
 *       bring the original's next review FORWARD to tomorrow (reps, EF, and the
 *       interval are untouched); a correct variant never pushes a review back.
 *   followUp({ evidence, target, originalLevel, sr, nudged, now }) -> [{ kind, text }]
 *   rankForPractice(records, masteryMap, deps) -> mistakes to practise, weakest topic first
 *   buildRequest / acceptVariants / storeBatch / pickPending / recordOutcome
 *       The request payload, a defensive check of server output, and immutable
 *       updates of the variant state kept on each mistake record.
 *
 * State on a mistake record (all optional; older records simply lack it):
 *   record.analysis = { coreConcept, conceptKey, conceptTerms, solutionMethod, difficulty, diagnosis, source }
 *   record.variantPractice = { pending: [variant], history: [{ id, q, level, relation, correct, chosen, at, generator, verified }] }
 *
 * Browser: window.VariantPractice. Node: module.exports.
 */
(function () {
    "use strict";

    var LEVELS = ["basic", "medium", "challenge"];
    var DAY_MS = 86400000;
    var MASTERY_P = 0.8;          // required posterior probability ...
    var MASTERY_RATE = 0.6;       // ... that the success rate on similar questions exceeds 60%
    var MAX_HISTORY = 40;
    var MAX_PENDING = 4;
    var AVOID_LIMIT = 12;      // the server reads at most 12

    function normalizeLevel(level) {
        return LEVELS.indexOf(level) >= 0 ? level : "medium";
    }

    function levelIndex(level) {
        return LEVELS.indexOf(normalizeLevel(level));
    }

    function relation(original, target) {
        var o = levelIndex(original), t = levelIndex(target);
        return o === t ? "same" : (t < o ? "easier" : "harder");
    }

    function historyOf(input) {
        return (input && Array.isArray(input.history)) ? input.history.filter(function (h) {
            return h && typeof h === "object";
        }) : [];
    }

    // --- difficulty staircase -------------------------------------------------------------

    function nextTarget(input) {
        var start = levelIndex(input && input.originalLevel);
        var lo = Math.max(0, start - 1), hi = Math.min(2, start + 1);
        var level = start, streak = 0, reason = "start";
        historyOf(input).forEach(function (h) {
            if (h.correct) {
                streak += 1;
                if (streak >= 2) {
                    reason = level < hi ? "stepped_up" : "at_ceiling";
                    level = Math.min(hi, level + 1);
                    streak = 0;
                } else {
                    reason = "holding";
                }
            } else {
                reason = level > lo ? "stepped_down" : "at_floor";
                level = Math.max(lo, level - 1);
                streak = 0;
            }
        });
        var lvl = LEVELS[level];
        return { level: lvl, relation: relation(LEVELS[start], lvl), reason: reason, streak: streak };
    }

    // --- evidence of mastery ------------------------------------------------------------------

    // Lanczos approximation of ln(Gamma(z)), z > 0.
    var LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
        -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    function lnGamma(z) {
        if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
        z -= 1;
        var x = LANCZOS[0];
        for (var i = 1; i < 9; i++) x += LANCZOS[i] / (z + i);
        var t = z + 7.5;
        return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
    }

    // Continued fraction for the incomplete beta function (modified Lentz).
    function betacf(a, b, x) {
        var FPMIN = 1e-300, qab = a + b, qap = a + 1, qam = a - 1;
        var c = 1, d = 1 - qab * x / qap;
        if (Math.abs(d) < FPMIN) d = FPMIN;
        d = 1 / d;
        var h = d;
        for (var m = 1; m <= 300; m++) {
            var m2 = 2 * m;
            var aa = m * (b - m) * x / ((qam + m2) * (a + m2));
            d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
            c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
            d = 1 / d; h *= d * c;
            aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
            d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
            c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
            d = 1 / d;
            var del = d * c;
            h *= del;
            if (Math.abs(del - 1) < 3e-14) break;
        }
        return h;
    }

    // Regularized incomplete beta I_x(a, b): the CDF of a Beta(a, b) distribution at x.
    function betaCdf(x, a, b) {
        if (!(a > 0) || !(b > 0)) return NaN;
        if (x <= 0) return 0;
        if (x >= 1) return 1;
        var front = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
        if (x < (a + 1) / (a + b + 2)) return front * betacf(a, b, x) / a;
        return 1 - front * betacf(b, a, 1 - x) / b;
    }

    function summarize(original, history) {
        var start = levelIndex(original);
        var s = 0, f = 0, correct = 0;
        var strongCorrect = {};
        history.forEach(function (h) {
            var lvl = levelIndex(h.level);
            if (h.correct) {
                correct += 1;
                // Easier variants are weaker evidence: they count half.
                s += lvl < start ? 0.5 : 1;
                if (lvl >= start) strongCorrect[h.id || ("#" + correct)] = true;
            } else {
                f += 1; // a miss counts fully at any level
            }
        });
        var streak = 0;
        for (var i = history.length - 1; i >= 0 && history[i].correct; i--) streak += 1;
        var last = history.length ? !!history[history.length - 1].correct : null;
        var lastTwoWrong = history.length >= 2 && !history[history.length - 1].correct && !history[history.length - 2].correct;
        var pMastery = 1 - betaCdf(MASTERY_RATE, 1 + s, 1 + f);
        var distinct = Object.keys(strongCorrect).length;
        var status;
        if (!history.length) status = "not_started";
        else if (pMastery >= MASTERY_P && last && distinct >= 2) status = "likely_mastered";
        else if (history.length >= 2 && (pMastery < 0.3 || lastTwoWrong)) status = "struggling";
        else status = "building";
        return {
            attempts: history.length, correct: correct, wrong: history.length - correct,
            successes: s, failures: f, streak: streak, lastCorrect: last,
            strongCorrect: distinct, pMastery: pMastery, status: status
        };
    }

    function evidence(input) {
        var original = normalizeLevel(input && input.originalLevel);
        var history = historyOf(input);
        var out = summarize(original, history);
        // How many more correct answers at the original level would be enough?
        out.needed = 0;
        if (out.status !== "likely_mastered") {
            out.needed = null;
            var sim = history.slice();
            for (var k = 1; k <= 8; k++) {
                sim.push({ id: "sim-" + k, level: original, correct: true });
                if (summarize(original, sim).status === "likely_mastered") { out.needed = k; break; }
            }
        }
        return out;
    }

    // --- SM-2 coupling --------------------------------------------------------------------------

    function nudgeSchedule(sr, outcome) {
        var now = (outcome && typeof outcome.now === "number") ? outcome.now : Date.now();
        if (!sr || typeof sr !== "object" || (outcome && outcome.correct)) return { sr: sr, changed: false };
        var tomorrow = now + DAY_MS;
        var due = sr.due ? new Date(sr.due).getTime() : 0;
        if (!due || isNaN(due) || due <= tomorrow) return { sr: sr, changed: false };
        var copy = {};
        for (var k in sr) if (Object.prototype.hasOwnProperty.call(sr, k)) copy[k] = sr[k];
        copy.due = new Date(tomorrow).toISOString();
        copy.nudgedAt = new Date(now).toISOString();
        return { sr: copy, changed: true };
    }

    function daysUntil(iso, now) {
        if (!iso) return 0;
        return Math.ceil((new Date(iso).getTime() - now) / DAY_MS);
    }

    function inDays(n) {
        if (n <= 0) return "now";
        return n === 1 ? "tomorrow" : "in " + n + " days";
    }

    var LEVEL_NAME = { basic: "Basic", medium: "Medium", challenge: "Challenge" };

    function followUp(input) {
        input = input || {};
        var ev = input.evidence || { status: "not_started" };
        var now = typeof input.now === "number" ? input.now : Date.now();
        var sr = input.sr;
        var out = [];
        var reviewIn = sr && sr.due ? daysUntil(sr.due, now) : 0;
        if (input.nudged) {
            out.push({ kind: "review_moved", text: "This one was missed, so the spaced review of your original question moved up to tomorrow." });
        }
        if (ev.status === "likely_mastered") {
            out.push({ kind: "spaced_review", text: "Likely mastered: " + ev.correct + " of " + ev.attempts +
                " similar questions right. The spaced review of the original (" + (reviewIn <= 0 ? "due now" : inDays(reviewIn)) +
                ") is what confirms it has stuck, so no more similar questions are needed today." });
        } else if (ev.status === "struggling") {
            out.push({ kind: "step_back", text: "Re-read the method and the explanation above before the next one. The next question steps down to " +
                (LEVEL_NAME[input.target && input.target.level] || "an easier level") + " so you can rebuild the idea." });
        } else if (ev.status === "building") {
            // `needed` counts answers at the ORIGINAL question's level; easier ones count half.
            var at = LEVEL_NAME[normalizeLevel(input.originalLevel)];
            out.push({ kind: "keep_going", text: ev.needed ? ev.needed + " more correct " + (ev.needed === 1 ? "answer" : "answers") +
                " in a row at the original question's level (" + at + ") would show the idea is sticking." +
                (input.target && input.target.relation === "easier" ? " Easier questions count half." : "")
                : "Keep going: a few more similar questions will show whether it is sticking." });
        }
        if (!input.nudged && sr && sr.due && ev.status !== "likely_mastered") {
            out.push({ kind: "schedule", text: "Spaced review of the original question: " + (reviewIn <= 0 ? "due now" : inDays(reviewIn)) +
                ". Similar questions add practice; they do not replace that review." });
        }
        return out;
    }

    // --- choosing which mistakes to practise -------------------------------------------------------

    function practiceState(record) {
        var vp = record && record.variantPractice;
        return {
            history: vp && Array.isArray(vp.history) ? vp.history : [],
            pending: vp && Array.isArray(vp.pending) ? vp.pending : []
        };
    }

    function originalLevel(record) {
        if (!record) return "medium";
        if (LEVELS.indexOf(record.difficulty) >= 0) return record.difficulty;
        if (record.analysis && LEVELS.indexOf(record.analysis.difficulty) >= 0) return record.analysis.difficulty;
        return "medium";
    }

    function rankForPractice(records, masteryMap, deps) {
        deps = deps || {};
        var limit = typeof deps.limit === "number" ? deps.limit : 3;
        var out = [];
        (records || []).forEach(function (rec) {
            if (!rec || !rec.id || !rec.question) return;
            var ev = evidence({ originalLevel: originalLevel(rec), history: practiceState(rec).history });
            if (ev.status === "likely_mastered") return; // transfer already shown; SM-2 takes it from here
            var stat = deps.getTopicStat ? deps.getTopicStat(masteryMap, rec.subject, rec.topic) : null;
            var known = stat && stat.attempts >= 2;
            var ema = known ? stat.ema : 0.5; // too little data: treat as middling, not as strong
            var reasons = [];
            if (known && stat.ema < 0.7) reasons.push("weak_topic");
            if (ev.status === "struggling") reasons.push("struggling");
            if (ev.status === "building") reasons.push("in_progress");
            var due = deps.isDue ? !!deps.isDue(rec.sr) : false;
            if (due) reasons.push("due");
            var score = ema - (ev.status === "struggling" ? 0.2 : 0) - (ev.status === "building" ? 0.05 : 0);
            out.push({ record: rec, score: score, ema: known ? stat.ema : null, evidence: ev, due: due, reasons: reasons });
        });
        out.sort(function (a, b) {
            if (a.score !== b.score) return a.score - b.score;
            if (a.due !== b.due) return a.due ? -1 : 1;
            return String(a.record.id).localeCompare(String(b.record.id));
        });
        return out.slice(0, limit);
    }

    // --- request / response ---------------------------------------------------------------------

    function avoidList(record) {
        var st = practiceState(record);
        var stems = st.history.map(function (h) { return h.q; }).concat(st.pending.map(function (p) { return p.question; }));
        return stems.filter(function (s) { return typeof s === "string" && s.trim(); })
            .slice(-AVOID_LIMIT).map(function (s) { return s.slice(0, 300); });
    }

    function buildRequest(record, opts) {
        opts = opts || {};
        var target = opts.level ? { level: normalizeLevel(opts.level) }
            : nextTarget({ originalLevel: originalLevel(record), history: practiceState(record).history });
        return {
            mistake: {
                id: record.id,
                subject: record.subject || "",
                topic: record.topic || "",
                question: record.question || "",
                options: Array.isArray(record.options) ? record.options.slice(0, 6) : [],
                answer: record.answer || "",
                userAnswer: record.userAnswer || "",
                explanation: record.explanation || "",
                difficulty: LEVELS.indexOf(record.difficulty) >= 0 ? record.difficulty : null
            },
            level: target.level,
            count: Math.max(1, Math.min(3, opts.count || 2)),
            avoid: avoidList(record),
            analysis: record.analysis || null,
            model: opts.model || undefined,
            userId: opts.userId || undefined
        };
    }

    // The server already validated these; this is a second, defensive check so a
    // malformed item can never reach the grading code.
    function acceptVariants(list) {
        if (!Array.isArray(list)) return [];
        return list.map(function (v) {
            if (!v || typeof v !== "object") return null;
            if (typeof v.id !== "string" || typeof v.question !== "string" || !v.question.trim()) return null;
            if (!Array.isArray(v.options) || v.options.length !== 4) return null;
            if (!v.options.every(function (o) { return typeof o === "string" && o.trim(); })) return null;
            if (typeof v.answer !== "string" || v.options.indexOf(v.answer) < 0) return null;
            var notes = Array.isArray(v.optionNotes) && v.optionNotes.length === 4 ? v.optionNotes.map(function (n) {
                return typeof n === "string" ? n : "";
            }) : null;
            var ver = v.verification && typeof v.verification === "object" ? v.verification : {};
            return {
                id: v.id,
                type: "Multiple Choice",
                question: v.question,
                options: v.options.slice(),
                answer: v.answer,
                explanation: typeof v.explanation === "string" ? v.explanation : "",
                optionNotes: notes,
                concept: typeof v.concept === "string" ? v.concept : "",
                conceptKey: typeof v.conceptKey === "string" ? v.conceptKey : "",
                level: normalizeLevel(v.difficulty),
                relation: ["easier", "same", "harder"].indexOf(v.relation) >= 0 ? v.relation : "same",
                changes: Array.isArray(v.changes) ? v.changes.filter(function (c) { return typeof c === "string"; }).slice(0, 3) : [],
                verification: {
                    status: ["verified", "unverified", "not_applicable"].indexOf(ver.status) >= 0 ? ver.status : "unverified",
                    method: typeof ver.method === "string" ? ver.method : ""
                },
                generator: v.generator === "template" ? "template" : "ai"
            };
        }).filter(Boolean);
    }

    function withState(record, history, pending, extra) {
        var next = {};
        for (var k in record) if (Object.prototype.hasOwnProperty.call(record, k)) next[k] = record[k];
        next.variantPractice = { history: history, pending: pending };
        if (extra) for (var e in extra) if (Object.prototype.hasOwnProperty.call(extra, e)) next[e] = extra[e];
        return next;
    }

    function storeBatch(record, batch) {
        batch = batch || {};
        var st = practiceState(record);
        var seen = {};
        st.history.forEach(function (h) { seen[h.id] = true; });
        var pending = st.pending.slice();
        (batch.variants || []).forEach(function (v) {
            if (seen[v.id] || pending.some(function (p) { return p.id === v.id; })) return;
            pending.push(v);
        });
        pending = pending.slice(-MAX_PENDING);
        var extra = batch.analysis ? { analysis: batch.analysis } : null;
        return withState(record, st.history.slice(), pending, extra);
    }

    function pickPending(record, level) {
        var pending = practiceState(record).pending;
        for (var i = 0; i < pending.length; i++) {
            if (pending[i].level === level) return pending[i];
        }
        return null;
    }

    function recordOutcome(record, outcome) {
        var st = practiceState(record);
        var v = outcome.variant;
        var entry = {
            id: v.id,
            q: String(v.question || "").slice(0, 300),
            level: normalizeLevel(v.level),
            relation: v.relation || "same",
            correct: !!outcome.correct,
            chosen: outcome.chosen || "",
            at: outcome.at || new Date().toISOString(),
            generator: v.generator,
            verified: !!(v.verification && v.verification.status === "verified")
        };
        var history = st.history.concat([entry]).slice(-MAX_HISTORY);
        var pending = st.pending.filter(function (p) { return p.id !== v.id; });
        return withState(record, history, pending);
    }

    var api = {
        LEVELS: LEVELS,
        MASTERY_P: MASTERY_P,
        MASTERY_RATE: MASTERY_RATE,
        normalizeLevel: normalizeLevel,
        relation: relation,
        nextTarget: nextTarget,
        evidence: evidence,
        betaCdf: betaCdf,
        nudgeSchedule: nudgeSchedule,
        followUp: followUp,
        practiceState: practiceState,
        originalLevel: originalLevel,
        rankForPractice: rankForPractice,
        avoidList: avoidList,
        buildRequest: buildRequest,
        acceptVariants: acceptVariants,
        storeBatch: storeBatch,
        pickPending: pickPending,
        recordOutcome: recordOutcome
    };

    if (typeof window !== "undefined") {
        window.VariantPractice = api;
    }
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
})();
