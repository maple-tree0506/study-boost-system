/*
 * Home dashboard logic.
 *
 * PURE module — no DOM, no storage, no side effects. app.js reads the learner's
 * real data (XP, streak, daily counts, mistake log, mastery) and passes it in;
 * this module only decides what the Home screen should say about it. Nothing here
 * invents data: a missing value produces an empty state, never a placeholder score.
 *
 *   levelProgress(totalXp, perLevel)            -> { level, into, toNext, pct }
 *   activeStreak(stored, today, yesterday)      -> { count, doneToday }
 *   dayPart(hour)                               -> "Morning" | ... | "Late night"
 *   missions({ daily, due })                    -> [{ id, label, value, target, pct, state, note }]
 *   nextStep({ due, weakest, hasActivity })     -> { kind, title, body, cta, view }
 *   orbitRadius(days)                           -> radius in chart units
 *   orbitAngle(id)                              -> stable angle in radians
 *   orbitPoints(records, daysUntilDue, isDue)   -> [{ id, days, due, r, angle, ... }]
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

    // A stored streak only counts while it is still alive: studied today, or
    // yesterday (today's session can still extend it). Older streaks read as 0.
    function activeStreak(stored, today, yesterday) {
        var s = stored && typeof stored === "object" ? stored : {};
        var count = s.count > 0 ? s.count : 0;
        if (s.lastDay === today) return { count: count, doneToday: true };
        if (s.lastDay === yesterday) return { count: count, doneToday: false };
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
    // topics, and weak topics beat a generic new set.
    function nextStep(input) {
        var due = (input && input.due) || 0;
        var weakest = input && input.weakest;
        var hasActivity = !!(input && input.hasActivity);

        if (due > 0) {
            return {
                kind: "review",
                title: due === 1 ? "1 question is due" : due + " questions are due",
                body: "Recall them now, while the spacing still helps you remember.",
                cta: "Start review",
                view: "review"
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

    var api = {
        MISSION_QUESTIONS: MISSION_QUESTIONS,
        MISSION_XP: MISSION_XP,
        ORBIT_RINGS: ORBIT_RINGS,
        ORBIT_CORE: ORBIT_CORE,
        ORBIT_EDGE: ORBIT_EDGE,
        levelProgress: levelProgress,
        activeStreak: activeStreak,
        dayPart: dayPart,
        missions: missions,
        nextStep: nextStep,
        orbitRadius: orbitRadius,
        orbitAngle: orbitAngle,
        orbitPoints: orbitPoints
    };

    // Browser: attach to window. Node (tests): export the same object.
    if (typeof window !== "undefined") {
        window.HomeSummary = api;
    }
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
})();
