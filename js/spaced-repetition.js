/*
 * Adaptive review scheduling for the mistake log.
 *
 * Designed as a pluggable system, not a hard-coded rule: each scheduler
 * implements init() and schedule(state, quality). SM-2 is the default; another
 * algorithm (e.g. Leitner) can be registered on ReviewSystem.schedulers without
 * touching the rest of the app — that's the "future support" hook.
 *
 * A review state (stored per mistake as record.sr):
 *   { algo, reps, ef, intervalDays, due (ISO), reviews, lastQuality }
 *
 * Quality is the SM-2 0..5 scale. The UI maps three ratings:
 *   Forgot -> 2, Hard -> 3, Got it -> 5
 */
(function () {
    "use strict";

    var DAY_MS = 86400000;

    function nowIso() { return new Date().toISOString(); }
    function addDaysIso(days) { return new Date(Date.now() + days * DAY_MS).toISOString(); }

    // --- SM-2 scheduler (https://super-memory.com/english/ol/sm2.htm) ---
    var sm2 = {
        label: "SM-2",
        init: function () {
            return { algo: "sm2", reps: 0, ef: 2.5, intervalDays: 0, due: nowIso(), reviews: 0, lastQuality: null };
        },
        schedule: function (s, quality) {
            var ef = typeof s.ef === "number" ? s.ef : 2.5;
            var reps = s.reps || 0;
            var interval;

            if (quality < 3) {
                // Lapse: relearn from a 1-day interval.
                reps = 0;
                interval = 1;
            } else {
                if (reps === 0) interval = 1;
                else if (reps === 1) interval = 6;
                else interval = Math.round((s.intervalDays || 1) * ef);
                reps += 1;
            }

            // Standard SM-2 easiness update, floored at 1.3.
            ef = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
            if (ef < 1.3) ef = 1.3;

            return {
                algo: "sm2",
                reps: reps,
                ef: Math.round(ef * 1000) / 1000,
                intervalDays: interval,
                due: addDaysIso(interval),
                reviews: (s.reviews || 0) + 1,
                lastQuality: quality
            };
        }
    };

    var ReviewSystem = {
        DEFAULT: "sm2",
        schedulers: { sm2: sm2 },
        QUALITY: { forgot: 2, hard: 3, got: 5 },

        initReview: function (algo) {
            var sched = this.schedulers[algo] || this.schedulers[this.DEFAULT];
            return sched.init();
        },

        review: function (state, quality) {
            var s = state || this.initReview();
            var sched = this.schedulers[s.algo] || this.schedulers[this.DEFAULT];
            return sched.schedule(s, quality);
        },

        isDue: function (state) {
            if (!state || !state.due) return true;
            return new Date(state.due).getTime() <= Date.now();
        },

        // Automatic mastery calculation, derived from the schedule state.
        status: function (state) {
            if (!state || !state.reviews) return "new";
            if (state.reps >= 3 && state.intervalDays >= 21) return "mastered";
            return "learning";
        },

        daysUntilDue: function (state) {
            if (!state || !state.due) return 0;
            return Math.ceil((new Date(state.due).getTime() - Date.now()) / DAY_MS);
        },

        // Progress analytics over a set of mistake records (each with .sr).
        summarize: function (records) {
            var out = { total: 0, due: 0, "new": 0, learning: 0, mastered: 0, reviews: 0, masteryPct: 0 };
            (records || []).forEach(function (r) {
                var s = r.sr;
                out.total += 1;
                out.reviews += (s && s.reviews) || 0;
                out[ReviewSystem.status(s)] += 1;
                if (ReviewSystem.isDue(s)) out.due += 1;
            });
            out.masteryPct = out.total ? Math.round((out.mastered / out.total) * 100) : 0;
            return out;
        }
    };

    window.ReviewSystem = ReviewSystem;
})();
