/*
 * Topic-level mastery model (R2, Stage 2A).
 *
 * PURE modeling module — no DOM, no storage, no side effects. Given graded
 * outcomes, it maintains a per-(subject, topic) mastery estimate: counts plus a
 * recency-weighted accuracy (EMA) and a volume-gated mastery level. Callers feed
 * it real graded attempts and read summaries; persistence/UI live elsewhere.
 *
 *   updateMastery(map, { subject, topic, correct, at }) -> newMap   (immutable)
 *   getTopicStat(map, subject, topic)                   -> stat | null
 *   masteryLevel(stat)                                  -> "new"|"developing"|"proficient"|"mastered"
 *   summarizeMastery(map, { subject } = {})             -> { topics, weakest }
 *   normalizeTopicKey(topic)                            -> normalized string
 *
 * Map key: subject + "::" + topicKey. A blank topic normalizes to "" and
 * represents the subject-general bucket. Stat shape:
 *   { subject, topic, topicKey, attempts, correct, ema, lastAttemptAt }
 *
 * Browser: window.MasteryModel. Node: module.exports.
 */
(function () {
    "use strict";

    var EMA_ALPHA = 0.4;

    // Normalize a free-text topic into a stable bucket key: lowercase, trim, and
    // collapse internal whitespace. Blank/non-string => "" (subject-general).
    function normalizeTopicKey(topic) {
        if (typeof topic !== "string") return "";
        return topic.trim().toLowerCase().replace(/\s+/g, " ");
    }

    function makeKey(subject, topicKey) {
        return String(subject == null ? "" : subject) + "::" + topicKey;
    }

    // Immutable update: returns a NEW map with the outcome folded into the
    // matching (subject, topic) stat. The input map and its stats are untouched.
    function updateMastery(map, event) {
        var source = (map && typeof map === "object") ? map : {};
        event = event || {};

        var subject = event.subject;
        var rawTopic = event.topic;
        var topicKey = normalizeTopicKey(rawTopic);
        var outcome = event.correct ? 1 : 0;
        var at = event.at;

        var key = makeKey(subject, topicKey);
        var prev = source[key];
        var isFirst = !prev || typeof prev !== "object";

        var attempts = isFirst ? 1 : prev.attempts + 1;
        var correct = (isFirst ? 0 : prev.correct) + outcome;
        var ema = isFirst ? outcome : (EMA_ALPHA * outcome + (1 - EMA_ALPHA) * prev.ema);

        var nextStat = {
            subject: subject,
            // Keep the most recently seen display label; key stays stable.
            topic: isFirst ? rawTopic : (rawTopic !== undefined ? rawTopic : prev.topic),
            topicKey: topicKey,
            attempts: attempts,
            correct: correct,
            ema: ema,
            lastAttemptAt: at
        };

        // Shallow clone the map; replace only the affected entry.
        var next = {};
        for (var k in source) {
            if (Object.prototype.hasOwnProperty.call(source, k)) {
                next[k] = source[k];
            }
        }
        next[key] = nextStat;
        return next;
    }

    function getTopicStat(map, subject, topic) {
        if (!map || typeof map !== "object") return null;
        var key = makeKey(subject, normalizeTopicKey(topic));
        var stat = map[key];
        return (stat && typeof stat === "object") ? stat : null;
    }

    // Volume-gated mastery level: a high EMA alone is not enough — a minimum
    // number of attempts is required before claiming proficiency/mastery.
    function masteryLevel(stat) {
        if (!stat || typeof stat !== "object" || !stat.attempts) return "new";
        if (stat.attempts >= 4 && stat.ema >= 0.85) return "mastered";
        if (stat.attempts >= 3 && stat.ema >= 0.70) return "proficient";
        if (stat.attempts >= 1) return "developing";
        return "new";
    }

    function summarizeMastery(map, opts) {
        opts = opts || {};
        var subjectFilter = opts.subject;
        var stats = [];
        if (map && typeof map === "object") {
            for (var k in map) {
                if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
                var s = map[k];
                if (!s || typeof s !== "object") continue;
                if (subjectFilter != null && s.subject !== subjectFilter) continue;
                stats.push(s);
            }
        }

        // topics: most-practiced first; tie-break by weaker EMA, then topic name.
        var topics = stats.slice().sort(function (a, b) {
            if (b.attempts !== a.attempts) return b.attempts - a.attempts;
            if (a.ema !== b.ema) return a.ema - b.ema;
            return String(a.topic || "").localeCompare(String(b.topic || ""));
        });

        // weakest: only topics with enough attempts to be meaningful, lowest EMA first.
        var weakest = stats
            .filter(function (s) { return s.attempts >= 2; })
            .sort(function (a, b) {
                if (a.ema !== b.ema) return a.ema - b.ema;
                return String(a.topic || "").localeCompare(String(b.topic || ""));
            });

        return { topics: topics, weakest: weakest };
    }

    var api = {
        normalizeTopicKey: normalizeTopicKey,
        updateMastery: updateMastery,
        getTopicStat: getTopicStat,
        masteryLevel: masteryLevel,
        summarizeMastery: summarizeMastery
    };

    // Browser: attach to window. Node (tests): export the same object.
    if (typeof window !== "undefined") {
        window.MasteryModel = api;
    }
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
})();
