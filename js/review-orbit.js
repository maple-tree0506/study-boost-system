/*
 * Review orbit and Mistake Library rules.
 *
 * PURE module: no DOM, no storage. app.js passes in the saved mistakes and the SM-2
 * helpers (window.ReviewSystem); this module decides where each mistake sits on the
 * review chart, which ones a filter shows, and in what order the library lists them.
 * It never changes a schedule: SM-2 owns review timing.
 *
 * The chart: angle = course (one sector per course, sized by how many mistakes it has),
 * distance from the center = days until SM-2 brings the mistake back (log scale, rings
 * at the first SM-2 intervals 1, 6, 15 and 38 days). Everything due now sits in the core.
 * Positions are deterministic, so the same data always draws the same picture.
 *
 *   RINGS                                   -> [1, 6, 15, 38]
 *   toItem(record, rs)                      -> { id, course, topic, days, due, status, reviews, createdAt, dueAt, text }
 *   bucket(item)                            -> "due" | "week" | "later"
 *   matches(item, filter)                   -> boolean   filter { when, course, query }
 *   counts(items)                           -> { all, due, week, later }
 *   whenText(item)                          -> "Due now" | "Back in 1 day" | "Back in 12 days"
 *   sortItems(items, sort)                  -> new array  sort "due" | "newest" | "oldest" | "course"
 *   layout(items, opts)                     -> { sectors, nodes, rings, core, edge, dot }
 *   snippet(text, max)                      -> shortened text that never cuts a $...$ formula
 *   upcoming(items, span)                   -> { days: [{ offset, count }], later }
 *   shortCourse(label)                      -> "Calc AB" for "AP Calculus AB"
 *
 * Browser: window.ReviewOrbit. Node: module.exports.
 */
(function () {
    "use strict";

    var RINGS = [1, 6, 15, 38];
    var GOLDEN_ANGLE = 2.399963229728653;   // radians; spreads the due core evenly
    var PHI_CONJ = 0.6180339887498949;      // spreads nodes across a sector without clumps
    var WEEK = 7;
    var SORTS = ["due", "newest", "oldest", "course"];

    function str(value) {
        return value == null ? "" : String(value);
    }

    // Lower-case text a search can match: question, answer, explanation, topic, course,
    // and the student's own answer. Dollar signs, backslashes and braces are dropped, so
    // a search for "ln(5x" finds "$\ln(5x^2+1)$".
    function searchText(rec) {
        var parts = [rec.question, rec.answer, rec.explanation, rec.topic, rec.subject, rec.userAnswer];
        return parts.map(str).join(" ")
            .replace(/\\([a-zA-Z]+)/g, "$1")
            .replace(/[{}]/g, " ")
            .replace(/[$\\]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function toItem(rec, rs) {
        var r = rec || {};
        var due = !!rs.isDue(r.sr);
        var days = due ? 0 : Math.max(1, rs.daysUntilDue(r.sr));
        return {
            id: str(r.id),
            course: str(r.subject).trim() || "Uncategorized",
            topic: str(r.topic).trim(),
            days: days,
            due: due,
            status: rs.status(r.sr),
            reviews: (r.sr && r.sr.reviews) || 0,
            createdAt: str(r.createdAt),
            dueAt: r.sr && r.sr.due ? str(r.sr.due) : "",
            text: searchText(r)
        };
    }

    function bucket(item) {
        if (item.due) return "due";
        return item.days <= WEEK ? "week" : "later";
    }

    function matches(item, filter) {
        var f = filter || {};
        if (f.course && item.course !== f.course) return false;
        if (f.when && f.when !== "all" && bucket(item) !== f.when) return false;
        var q = str(f.query).trim().toLowerCase();
        if (q) {
            var words = q.split(/\s+/);
            for (var i = 0; i < words.length; i++) {
                if (item.text.indexOf(words[i]) === -1) return false;
            }
        }
        return true;
    }

    function counts(items) {
        var out = { all: 0, due: 0, week: 0, later: 0 };
        (items || []).forEach(function (it) {
            out.all += 1;
            out[bucket(it)] += 1;
        });
        return out;
    }

    function whenText(item) {
        if (item.due) return "Due now";
        return "Back in " + item.days + (item.days === 1 ? " day" : " days");
    }

    function time(text) {
        var t = new Date(text).getTime();
        return isNaN(t) ? 0 : t;
    }

    // Due first (oldest due date first), then by how soon the rest come back.
    function byDue(a, b) {
        if (a.due !== b.due) return a.due ? -1 : 1;
        var d = time(a.dueAt) - time(b.dueAt);
        if (d) return d;
        return time(b.createdAt) - time(a.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    }

    function sortItems(items, sort) {
        var list = (items || []).slice();
        var mode = SORTS.indexOf(sort) === -1 ? "due" : sort;
        list.sort(function (a, b) {
            if (mode === "newest") return time(b.createdAt) - time(a.createdAt) || byDue(a, b);
            if (mode === "oldest") return time(a.createdAt) - time(b.createdAt) || byDue(a, b);
            if (mode === "course") return a.course.localeCompare(b.course) || byDue(a, b);
            return byDue(a, b);
        });
        return list;
    }

    function radius(days, core, edge) {
        var max = RINGS[RINGS.length - 1];
        var d = Math.max(0, Math.min(days, max));
        return core + (edge - core) * (Math.log(1 + d) / Math.log(1 + max));
    }

    // opts: { size (default 420), core, edge, gapDeg (4), startDeg (-90), minShare (.05) }
    function layout(items, opts) {
        var o = opts || {};
        var size = o.size || 420;
        var c = size / 2;
        var core = o.core || size * 0.105;
        var edge = o.edge || size * 0.445;
        var list = items || [];
        var total = list.length;

        var groups = {};
        var names = [];
        list.forEach(function (it) {
            if (!groups[it.course]) { groups[it.course] = []; names.push(it.course); }
            groups[it.course].push(it);
        });
        names.sort(function (a, b) { return groups[b].length - groups[a].length || a.localeCompare(b); });

        var gap = names.length > 1 ? (o.gapDeg == null ? 4 : o.gapDeg) * Math.PI / 180 : 0;
        var usable = Math.PI * 2 - gap * names.length;
        var minShare = o.minShare == null ? 0.05 : o.minShare;
        var shares = names.map(function (n) { return Math.max(groups[n].length / Math.max(total, 1), minShare); });
        var shareSum = shares.reduce(function (s, x) { return s + x; }, 0) || 1;

        // Dots shrink as the chart fills, so 160 mistakes stay legible.
        var dot = Math.max(3.2, Math.min(6.5, 7 - total / 28)) * (size / 420);

        var a = (o.startDeg == null ? -90 : o.startDeg) * Math.PI / 180 + gap / 2;
        var sectors = [];
        var nodes = [];
        names.forEach(function (name, si) {
            var span = usable * shares[si] / shareSum;
            var members = groups[name];
            var sector = {
                course: name,
                a0: a,
                a1: a + span,
                mid: a + span / 2,
                count: members.length,
                due: members.filter(function (m) { return m.due; }).length
            };
            sectors.push(sector);
            var waiting = members.filter(function (m) { return !m.due; }).sort(function (x, y) {
                return x.days - y.days || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
            });
            waiting.forEach(function (it, i) {
                var t = 0.1 + 0.8 * ((0.5 + i * PHI_CONJ) % 1);
                var ang = a + span * t;
                var r = radius(it.days, core, edge);
                nodes.push({ item: it, x: c + r * Math.cos(ang), y: c + r * Math.sin(ang), r: r, angle: ang, sector: si });
            });
            a += span + gap;
        });

        // Due now: every due card is equally "now", so the core packs them on a
        // sunflower spiral; their place inside the core carries no meaning.
        var dueList = list.filter(function (it) { return it.due; }).sort(function (x, y) {
            return x.course.localeCompare(y.course) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
        });
        var inner = Math.max(0, core - dot - 3);
        dueList.forEach(function (it, i) {
            var r = dueList.length === 1 ? 0 : inner * Math.sqrt((i + 0.5) / dueList.length);
            var ang = i * GOLDEN_ANGLE;
            nodes.push({ item: it, x: c + r * Math.cos(ang), y: c + r * Math.sin(ang), r: r, angle: ang, sector: -1, due: true });
        });

        return {
            size: size,
            center: c,
            core: core,
            edge: edge,
            dot: dot,
            sectors: sectors,
            nodes: nodes,
            rings: RINGS.map(function (d) { return { days: d, r: radius(d, core, edge) }; })
        };
    }

    // Shorten text for a list line without cutting a $...$ formula in half (a split
    // formula would render as broken LaTeX). Cuts at a word boundary outside math.
    function snippet(text, max) {
        var s = str(text).replace(/\s+/g, " ").trim();
        var limit = max > 0 ? max : 120;
        if (s.length <= limit) return s;
        var inMath = false;
        var inDisplay = false;
        var best = -1;
        var after = -1;
        for (var i = 0; i < s.length; i++) {
            var ch = s.charAt(i);
            var safe = -1;
            if (ch === "$" && s.charAt(i - 1) !== "\\") {
                if (s.charAt(i + 1) === "$" && !inMath) {
                    inDisplay = !inDisplay;
                    i += 1;
                    if (!inDisplay) safe = i + 1;
                } else if (!inDisplay) {
                    inMath = !inMath;
                    if (!inMath) safe = i + 1;
                }
            } else if (ch === " " && !inMath && !inDisplay) {
                safe = i;
            }
            if (safe > 0) {
                if (safe <= limit) best = safe;
                else { after = safe; break; }
            }
        }
        // Prefer the last safe point inside the limit; a formula longer than the limit
        // is kept whole rather than split.
        var cut = best > 0 ? best : after;
        if (cut <= 0 || cut >= s.length) return s;
        return s.slice(0, cut).replace(/[\s,;:.]+$/, "") + "…";
    }

    // How many saved mistakes come back on each of the next `span` days (0 = due now),
    // plus how many come back later than that.
    function upcoming(items, span) {
        var n = span > 0 ? span : 7;
        var days = [];
        for (var i = 0; i < n; i++) days.push({ offset: i, count: 0 });
        var later = 0;
        (items || []).forEach(function (it) {
            var d = it.due ? 0 : it.days;
            if (d < n) days[d].count += 1;
            else later += 1;
        });
        return { days: days, later: later };
    }

    // Chart labels need short course names; anything unknown just loses its "AP " prefix.
    var SHORT = {
        "AP Calculus AB": "Calc AB",
        "AP Calculus BC": "Calc BC",
        "AP Statistics": "Statistics",
        "AP Biology": "Biology",
        "AP Chemistry": "Chemistry",
        "AP Physics 1": "Physics 1",
        "AP Physics C: Mechanics": "Physics C",
        "AP Environmental Science": "Env. Science",
        "AP Psychology": "Psychology",
        "AP United States History": "US History",
        "AP US History": "US History",
        "AP World History": "World History",
        "AP English Language": "English Lang.",
        "AP Computer Science A": "CS A",
        "Other / General": "General"
    };
    function shortCourse(label) {
        var s = str(label).trim();
        if (SHORT[s]) return SHORT[s];
        s = s.replace(/^AP\s+/, "");
        return s.length > 16 ? s.slice(0, 15).trim() + "…" : s;
    }

    // The review queue: what is due now, most overdue first (the order SM-2 would want).
    function queueOrder(items) {
        return sortItems((items || []).filter(function (it) { return it.due; }), "due");
    }

    // When the next review comes back once nothing is due: { days, count } or null.
    function nextDue(items) {
        var best = null;
        (items || []).forEach(function (it) {
            if (it.due) return;
            if (!best || it.days < best.days) best = { days: it.days, count: 1 };
            else if (it.days === best.days) best.count += 1;
        });
        return best;
    }

    var api = {
        RINGS: RINGS,
        queueOrder: queueOrder,
        nextDue: nextDue,
        SORTS: SORTS,
        searchText: searchText,
        toItem: toItem,
        bucket: bucket,
        matches: matches,
        counts: counts,
        whenText: whenText,
        sortItems: sortItems,
        radius: radius,
        layout: layout,
        snippet: snippet,
        upcoming: upcoming,
        shortCourse: shortCourse
    };

    if (typeof window !== "undefined") {
        window.ReviewOrbit = api;
    }
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
})();
