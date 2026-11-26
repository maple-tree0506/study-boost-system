/*
 * Home dashboard logic.
 *
 * PURE module — no DOM, no storage, no side effects. app.js reads the learner's
 * real data (XP, streak, daily counts, mistake log, mastery) and passes it in;
 * this module only decides what the Home screen should say about it. Nothing here
 * invents data: a missing value produces an empty state, never a placeholder score.
 *
 *   levelProgress(totalXp, perLevel)            -> { level, into, toNext, pct }
 *   localDay(date?)                             -> "YYYY-MM-DD" on the device's own calendar
 *   addDays(day, n)                             -> the day key n days away ("YYYY-MM-DD")
 *   carryDay(storedDay, today)                  -> today when storedDay is today's old UTC key, else storedDay
 *   activeStreak(stored, today, yesterday)      -> { count, doneToday }
 *   dayPart(hour)                               -> "Morning" | ... | "Late night"
 *   missions({ daily, due })                    -> [{ id, label, value, target, pct, state, note }]
 *   nextStep({ due, weakest, hasActivity, weakMistake, openSet }) -> { kind, title, body, cta, view, pct? }
 *   orbitRadius(days)                           -> radius in chart units
 *   orbitAngle(id)                              -> stable angle in radians
 *   orbitPoints(records, daysUntilDue, isDue)   -> [{ id, days, due, r, angle, ... }]
 *   weekTopLine(daily, bySubject)               -> { text, answered, correct }
 *   mergeStats(base, extra, today)              -> /api/stats shape: last synced stats + unsynced answers
 *
 * Browser: window.HomeSummary. Node: module.exports.
 */
(function () {
    "use strict";

    // Daily targets. These are goals, not data, so they are plain constants.
    var MISSION_QUESTIONS = 5;
    var MISSION_XP = 50;

    // The rings of the review orbit sit at the first SM-2 intervals for a card that
    // keeps being recalled at the default easiness (1, 6, then 6 x 2.5, then x 2.5).
    var ORBIT_RINGS = [1, 6, 15, 38];
    var ORBIT_CORE = 44;    // radius of the "due now" core
    var ORBIT_EDGE = 188;   // radius of the outermost ring
    var GOLDEN_ANGLE = 2.39996;

    function clampPct(value, target) {
        if (!target || target <= 0) return 0;
        return Math.max(0, Math.min(100, Math.round((value / target) * 100)));
    }

    function levelProgress(totalXp, perLevel) {
        var per = perLevel > 0 ? perLevel : 100;
        var xp = Math.max(0, Math.floor(Number(totalXp) || 0));
        var into = xp % per;
        return {
            level: Math.floor(xp / per) + 1,
            into: into,
            toNext: per - into,
            pct: clampPct(into, per)
        };
    }

    function pad2(n) { return (n < 10 ? "0" : "") + n; }

    // The student's own calendar day. Missions, the streak, and the 14-day chart all use
    // this, so "today" ends at the student's midnight, not at midnight UTC.
    function localDay(date) {
        var d = date instanceof Date ? date : new Date(date == null ? Date.now() : date);
        if (isNaN(d.getTime())) return "";
        return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
    }

    // Calendar arithmetic on a day key (no daylight-saving drift: a day is a date, not 24 h).
    function addDays(day, n) {
        var p = String(day || "").split("-");
        if (p.length !== 3) return "";
        var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + (n || 0)));
        return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
    }

    // Days used to be stored as UTC dates, which run up to one day ahead of the student's
    // own (California after 4 pm). A stored key for "tomorrow" is today's old UTC key, so
    // it counts as today; anything else is kept as it is.
    function carryDay(storedDay, today) {
        return storedDay && storedDay === addDays(today, 1) ? today : storedDay;
    }

    // A stored streak only counts while it is still alive: studied today, or
    // yesterday (today's session can still extend it). Older streaks read as 0.
    function activeStreak(stored, today, yesterday) {
        var s = stored && typeof stored === "object" ? stored : {};
        var count = s.count > 0 ? s.count : 0;
        var last = carryDay(s.lastDay, today);
        if (last === today) return { count: count, doneToday: true };
        if (last === yesterday) return { count: count, doneToday: false };
        return { count: 0, doneToday: false };
    }

    function dayPart(hour) {
        if (hour >= 5 && hour < 12) return "Morning";
        if (hour >= 12 && hour < 17) return "Afternoon";
        if (hour >= 17 && hour < 21) return "Evening";
        return "Late night";
    }

    function missions(input) {
        var daily = (input && input.daily) || {};
        var due = Math.max(0, (input && input.due) || 0);
        var questions = daily.questions || 0;
        var reviews = daily.reviews || 0;
        var xp = daily.xp || 0;

        var reviewTarget = reviews + due;
        var reviewState;
        if (reviewTarget === 0) reviewState = "idle";
        else reviewState = due === 0 ? "done" : "active";

        return [
            {
                id: "questions",
                label: "Answer " + MISSION_QUESTIONS + " new questions",
                value: Math.min(questions, MISSION_QUESTIONS),
                target: MISSION_QUESTIONS,
                pct: clampPct(questions, MISSION_QUESTIONS),
                state: questions >= MISSION_QUESTIONS ? "done" : "active",
                note: ""
            },
            {
                id: "reviews",
                label: "Clear your due reviews",
                value: reviews,
                target: reviewTarget,
                pct: clampPct(reviews, reviewTarget),
                state: reviewState,
                note: reviewState === "idle" ? "Nothing is due today" : ""
            },
            {
                id: "xp",
                label: "Earn " + MISSION_XP + " XP",
                value: Math.min(xp, MISSION_XP),
                target: MISSION_XP,
                pct: clampPct(xp, MISSION_XP),
                state: xp >= MISSION_XP ? "done" : "active",
                note: ""
            }
        ];
    }

    // What the student should do next, in priority order: due reviews beat weak
    // topics, and weak topics beat a generic new set. A weak topic that has a saved
    // mistake gets similar-question practice built from that mistake, which targets
    // the specific misunderstanding better than a fresh, generic set.
    function nextStep(input) {
        var due = (input && input.due) || 0;
        var weakest = input && input.weakest;
        var hasActivity = !!(input && input.hasActivity);
        var weakMistake = input && input.weakMistake;
        var openSet = input && input.openSet;

        // A set in progress comes first: it is the work the student already started.
        if (openSet && openSet.total > 0 && openSet.next >= 0 && openSet.next < openSet.total) {
            var answered = Math.max(0, Math.min(openSet.answered || 0, openSet.total));
            return {
                kind: "continue",
                title: "Continue your set",
                body: (openSet.subject ? openSet.subject + ": " : "") + answered + " of " + openSet.total +
                    " answered. The answers you checked are saved.",
                cta: "Continue at question " + (openSet.next + 1),
                view: "practice",
                next: openSet.next,
                total: openSet.total,
                answered: answered
            };
        }
        if (due > 0) {
            return {
                kind: "review",
                title: due === 1 ? "1 question is due" : due + " questions are due",
                body: "Recall them now, while the spacing still helps you remember.",
                cta: "Start review",
                view: "review"
            };
        }
        if (weakMistake && weakMistake.id && typeof weakMistake.ema === "number" && weakMistake.ema < 0.7) {
            var mTopic = String(weakMistake.topic || "").trim();
            var where = mTopic ? mTopic + " in " + (weakMistake.subject || "this course") : (weakMistake.subject || "This course");
            return {
                kind: "variant",
                title: "Try questions like one you missed",
                body: where + " is at " + Math.round(weakMistake.ema * 100) + "% recent accuracy. " +
                    "Similar questions built from that mistake show whether the idea now carries over.",
                cta: "Practice similar questions",
                view: "mistake",
                pct: Math.round(weakMistake.ema * 100),
                errId: weakMistake.id,
                subject: weakMistake.subject || "",
                topic: mTopic
            };
        }
        if (weakest && typeof weakest.ema === "number" && weakest.ema < 0.7) {
            var topic = String(weakest.topic || "").trim();
            return {
                kind: "focus",
                title: "Practice " + (topic || weakest.subject || "your weakest topic"),
                body: (topic ? weakest.subject + " is" : "This course is") + " at " +
                    Math.round(weakest.ema * 100) + "% recent accuracy, your lowest right now.",
                cta: "Practice this",
                view: "practice",
                pct: Math.round(weakest.ema * 100),
                subject: weakest.subject || "",
                topic: topic
            };
        }
        if (hasActivity) {
            return {
                kind: "start",
                title: "You are caught up",
                body: "Nothing is due. Start a new set to keep your streak going.",
                cta: "Start a new set",
                view: "practice"
            };
        }
        return {
            kind: "start",
            title: "Start your first set",
            body: "Pick a course, answer a few questions, and this page fills in with your real results.",
            cta: "Start a new set",
            view: "practice"
        };
    }

    // Log scale, so 1 day and 38 days both stay readable on one chart.
    function orbitRadius(days) {
        var max = ORBIT_RINGS[ORBIT_RINGS.length - 1];
        var d = Math.max(0, Math.min(days, max));
        return ORBIT_CORE + (ORBIT_EDGE - ORBIT_CORE) * (Math.log(1 + d) / Math.log(1 + max));
    }

    // Hash the id, so a card keeps its place on the chart between visits.
    function orbitAngle(id) {
        var text = String(id || "");
        var hash = 2166136261;
        for (var i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return ((hash >>> 0) % 3600) / 3600 * Math.PI * 2;
    }

    function orbitPoints(records, daysUntilDue, isDue) {
        var list = records || [];
        var dueTotal = list.filter(function (rec) { return isDue(rec.sr); }).length;
        var dueIndex = 0;
        return list.map(function (rec) {
            var due = !!isDue(rec.sr);
            var days = due ? 0 : Math.max(1, daysUntilDue(rec.sr));
            var angle = orbitAngle(rec.id);
            var r = orbitRadius(days);
            if (due) {
                // Every due card is equally "now", so its place in the core carries no
                // meaning. A sunflower spiral keeps any number of them from stacking.
                r = dueTotal === 1 ? 0 : (ORBIT_CORE - 9) * Math.sqrt((dueIndex + 0.5) / dueTotal);
                angle = dueIndex * GOLDEN_ANGLE;
                dueIndex += 1;
            }
            return {
                id: rec.id,
                subject: rec.subject || "",
                days: days,
                due: due,
                r: r,
                angle: angle
            };
        });
    }

    // Progress opens with one plain sentence about the student's own week (the "top line"),
    // built only from their graded answers. Subjects need 3+ answers to be named.
    //   daily:     [{ date, answered, correct }]  (oldest first, as /api/stats returns it)
    //   bySubject: [{ subject, answered, correct, accuracy }]
    function weekTopLine(daily, bySubject) {
        var days = (daily || []).slice(-7);
        var answered = 0;
        var correct = 0;
        days.forEach(function (d) {
            answered += d.answered || 0;
            correct += d.correct || 0;
        });
        var named = (bySubject || []).filter(function (s) { return (s.answered || 0) >= 3; });
        named.sort(function (a, b) { return b.accuracy - a.accuracy || b.answered - a.answered; });
        var parts = [];
        if (answered) {
            parts.push("Last 7 days: " + answered + (answered === 1 ? " question" : " questions") + ", " +
                Math.round((correct / answered) * 100) + "% right.");
        } else {
            parts.push("No graded questions in the last 7 days.");
        }
        if (named.length >= 2) {
            var top = named[0];
            var low = named[named.length - 1];
            if (top.accuracy > low.accuracy) {
                parts.push("Strongest: " + top.subject + " (" + Math.round(top.accuracy * 100) + "%).");
                parts.push("Most room to grow: " + low.subject + " (" + Math.round(low.accuracy * 100) + "%).");
            }
        }
        return { text: parts.join(" "), answered: answered, correct: correct };
    }

    // Progress while the server can't be reached: the last stats the server returned plus
    // the answers still waiting on this device (never in those stats: an answer leaves the
    // queue only once the server stored it). Both are /api/stats shapes. The 14-day window
    // is rebuilt to end on `today`, so a snapshot from an earlier day still lines up.
    function mergeStats(base, extra, today) {
        var a = base || {};
        var b = extra || {};
        function rate(v) { return v.answered ? v.correct / v.answered : 0; }
        function add(list, key, into, order) {
            (list || []).forEach(function (row) {
                var k = row[key];
                if (!into[k]) { into[k] = { answered: 0, correct: 0 }; order.push(k); }
                into[k].answered += row.answered || 0;
                into[k].correct += row.correct || 0;
            });
        }
        function merged(key, listA, listB) {
            var into = {};
            var order = [];
            add(listA, key, into, order);
            add(listB, key, into, order);
            return order.map(function (k) {
                var row = {};
                row[key] = k;
                row.answered = into[k].answered;
                row.correct = into[k].correct;
                row.accuracy = rate(into[k]);
                return row;
            });
        }
        var oa = a.overall || {};
        var ob = b.overall || {};
        var overall = {
            answered: (oa.answered || 0) + (ob.answered || 0),
            correct: (oa.correct || 0) + (ob.correct || 0)
        };
        overall.accuracy = rate(overall);
        var bySubject = merged("subject", a.bySubject, b.bySubject);
        bySubject.sort(function (x, y) { return y.answered - x.answered || (x.subject < y.subject ? -1 : 1); });
        var bySource = merged("source", a.bySource, b.bySource);
        var SOURCE_ORDER = ["generated", "review", "variant", "other"];
        bySource.sort(function (x, y) { return SOURCE_ORDER.indexOf(x.source) - SOURCE_ORDER.indexOf(y.source); });
        var dayRows = {};
        merged("date", a.daily, b.daily).forEach(function (d) { dayRows[d.date] = d; });
        var daily = [];
        for (var i = 13; i >= 0; i--) {
            var key = addDays(today, -i);
            daily.push(dayRows[key] || { date: key, answered: 0, correct: 0, accuracy: 0 });
        }
        return { overall: overall, bySubject: bySubject, bySource: bySource, daily: daily };
    }

    var api = {
        MISSION_QUESTIONS: MISSION_QUESTIONS,
        MISSION_XP: MISSION_XP,
        ORBIT_RINGS: ORBIT_RINGS,
        ORBIT_CORE: ORBIT_CORE,
        ORBIT_EDGE: ORBIT_EDGE,
        levelProgress: levelProgress,
        localDay: localDay,
        addDays: addDays,
        carryDay: carryDay,
        activeStreak: activeStreak,
        dayPart: dayPart,
        missions: missions,
        nextStep: nextStep,
        orbitRadius: orbitRadius,
        orbitAngle: orbitAngle,
        orbitPoints: orbitPoints,
        weekTopLine: weekTopLine,
        mergeStats: mergeStats
    };

    // Browser: attach to window. Node (tests): export the same object.
    if (typeof window !== "undefined") {
        window.HomeSummary = api;
    }
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
})();
