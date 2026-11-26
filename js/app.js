
const STORAGE_KEY_ERRORS = "studyBoostMistakesV2";
const STORAGE_UI = "studyBoostUIPrefsV1";
const STORAGE_ATTEMPT_QUEUE = "studyBoostAttemptQueueV1";
const STORAGE_AI_RELIABILITY = "studyBoostAiReliabilityV1";
const STORAGE_MASTERY = "studyBoostMasteryV1";
const STORAGE_USER_ID = "studyBoostUserIdV1";

// B2 beta feedback: paste your Google Form share link here (the only line to edit).
// When set, a "Share feedback" link appears on the completion screen and in the
// footer; left empty, no link is shown anywhere. e.g. "https://forms.gle/XXXXXXXX".
const FEEDBACK_FORM_URL = "https://forms.gle/hCHPgHsJ7Qe4payV6";

const AP_SUBJECTS = [
    { id: "calc_ab", label: "AP Calculus AB" },
    { id: "calc_bc", label: "AP Calculus BC" },
    { id: "stats", label: "AP Statistics" },
    { id: "bio", label: "AP Biology" },
    { id: "chem", label: "AP Chemistry" },
    { id: "phys1", label: "AP Physics 1" },
    { id: "phys_c_mech", label: "AP Physics C: Mechanics" },
    { id: "envsci", label: "AP Environmental Science" },
    { id: "psych", label: "AP Psychology" },
    { id: "ush", label: "AP United States History" },
    { id: "world", label: "AP World History" },
    { id: "lang", label: "AP English Language" },
    { id: "csa", label: "AP Computer Science A" },
    { id: "other", label: "Other / General" }
];

let generatedQuestions = [];
let errorRecords = readErrorRecords();
// R2: per-(subject, topic) mastery map (studyBoostMasteryV1). Pure model lives in
// js/mastery-model.js; this is just the persisted state it operates on.
let masteryMap = readMastery();
// v2 #2: the practiced topic's mastery level captured BEFORE a set is graded, so
// the completion screen can show movement (e.g. Developing -> Proficient) at the
// motivation peak. Shape: { subject, topic, level } | null.
let preSetMastery = null;
// Growth: the share message built for the current completion screen (see buildShareText).
let lastShareText = "";
// H-F: errIds whose SM-2 schedule was already updated this browser session (dedup).
const sessionReviewedErrIds = new Set();
// Mistakes whose answer was shown in this page session; their recall ratings are unlocked.
// A rating is a judgement of recall, so it can't be given before the answer is seen.
const revealedErrIds = new Set();
const RATE_PROMPT = "How well did you recall it?";
const RATE_PROMPT_LOCKED = "Try to recall the answer, then show it to rate yourself.";
// Practice focus mode: the question on screen, whether the setup form is open over a
// running set, whether the result sequence is showing, and what the set is.
let practiceIndex = 0;
let practiceSetupOpen = false;
let resultsShown = false;
let currentSetMeta = null; // { subject, topic, difficulty, origin: "ai" | "bank" | "review" }
// Review: one filter for the orbit and the library, the selected mistake, chart or list.
let reviewFilter = { when: "all", course: "", query: "", sort: "due" };
// The review queue: due mistakes one at a time on their own page. { ids, rated: { id: {
// quality, days } } } while it runs; lastQueueSummary is what Review says once it ends.
let reviewQueue = null;
let lastQueueSummary = null;
const RATING_NAME = { 2: "Forgot", 3: "Hard", 5: "Got it" };
let orbitSelectedId = "";
let orbitView = "chart";
// Home: what the main button and the quieter second button do right now.
let currentStep = null;
let currentAlt = null;
// Unfinished work kept across a refresh (see "Unfinished work survives a refresh").
const SESSION_KEY = "studyBoostSessionV1";
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
let sessionTimer = 0;
let restoringSession = false;
// What a finished set earned ({ streak, setXp, daily }), kept with the session so a refresh
// can show the same result without counting anything again.
let completedStats = null;
// The last Notes summary or excerpt ({ source, text, points, notes }), kept with the session.
let lastSummary = null;
let lastNotesContext = "";
let serverHealthy = false;
let healthReady = false;
let healthConfig = { openai_configured: false, variants: null };

let quizResults = {};

const noteInput = document.getElementById("noteInput");
const summaryBtn = document.getElementById("summaryBtn");
const summaryStatus = document.getElementById("summaryStatus");
const summaryOutput = document.getElementById("summaryOutput");

const modelInput = document.getElementById("modelInput");
const saveUIPrefsBtn = document.getElementById("saveUIPrefsBtn");
const uiPrefsStatus = document.getElementById("uiPrefsStatus");
const healthStatus = document.getElementById("healthStatus");
const retryHealthBtn = document.getElementById("retryHealthBtn");

const apSubjectInput = document.getElementById("apSubjectInput");
const questionFormatInput = document.getElementById("questionFormatInput");
const topicInput = document.getElementById("topicInput");
const useNotesContextInput = document.getElementById("useNotesContextInput");
const notesContextHint = document.getElementById("notesContextHint");
const difficultyInput = document.getElementById("difficultyInput");
const quizBtn = document.getElementById("quizBtn");
const quizStatus = document.getElementById("quizStatus");
const quizOutput = document.getElementById("quizOutput");

const refreshStatsBtn = document.getElementById("refreshStatsBtn");
const statsStatus = document.getElementById("statsStatus");
const statsOutput = document.getElementById("statsOutput");
const topicMasteryOutput = document.getElementById("topicMasteryOutput");

const mistakeSubjectFilterEl = document.getElementById("mistakeSubjectFilter");
const showAllBtn = document.getElementById("showAllBtn");
const showUnknownBtn = document.getElementById("showUnknownBtn");
const clearErrorsBtn = document.getElementById("clearErrorsBtn");
const errorStatus = document.getElementById("errorStatus");
const errorOutput = document.getElementById("errorOutput");
const exportDataBtn = document.getElementById("exportDataBtn");
const importDataBtn = document.getElementById("importDataBtn");
const importDataInput = document.getElementById("importDataInput");
const dataStatus = document.getElementById("dataStatus");
const masteryCourseInput = document.getElementById("masteryCourseInput");

// Move to another view through the shell. Falls back to a plain hash change if the
// shell script failed to load, so navigation never dead-ends.
function goToView(name) {
    if (window.Shell) return window.Shell.go(name);
    window.location.hash = name;
    return Promise.resolve();
}

function sanitizeText(value) {
    return (value || "").trim().replace(/\s+/g, " ");
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function cssEscape(value) {
    if (typeof CSS !== "undefined" && CSS.escape) {
        return CSS.escape(String(value || ""));
    }
    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Render LaTeX math ($...$ / $$...$$) inside an element using KaTeX, if loaded.
// Degrades gracefully: if KaTeX is unavailable or a snippet is malformed, the
// raw text is left in place (no crash).
function typesetMath(el) {
    if (!el || typeof window.renderMathInElement !== "function") return;
    try {
        window.renderMathInElement(el, {
            delimiters: [
                { left: "$$", right: "$$", display: true },
                { left: "$", right: "$", display: false },
                { left: "\\(", right: "\\)", display: false },
                { left: "\\[", right: "\\]", display: true }
            ],
            throwOnError: false
        });
    } catch (e) {
        // leave raw text on failure
    }
}

function isProviderConfigured() {
    return healthConfig.openai_configured;
}

function providerKeyHint() {
    return "Add OPENAI_API_KEY to the .env file and restart server.py.";
}

function setAIControlsBusy(busy) {
    summaryBtn.disabled = busy;
    quizBtn.disabled = busy;
}

function isMcqAnswerCorrect(selected, correctAnswer) {
    const sel = sanitizeText(selected);
    const ans = sanitizeText(correctAnswer);
    if (!sel || !ans) return false;
    if (sel === ans) return true;

    const selLetter = /^([A-D])\b/i.exec(sel);
    const ansLetter = /^([A-D])\b/i.exec(ans);
    if (selLetter && ansLetter) {
        return selLetter[1].toUpperCase() === ansLetter[1].toUpperCase();
    }
    if (ansLetter && sel.toUpperCase().indexOf(ansLetter[1].toUpperCase() + ".") === 0) {
        return true;
    }
    if (selLetter && ans.toUpperCase() === selLetter[1].toUpperCase()) {
        return true;
    }
    return false;
}

function getSentences(text) {
    return text
        .split(/[\n.!?]+/)
        .map(function (item) { return sanitizeText(item); })
        .filter(Boolean);
}

// UI preferences: { model, motion }. "motion" is the student's own choice ("system" follows
// the device, "reduce" always reduces); index.html applies it before the first paint.
function readUIPrefs() {
    try {
        const raw = localStorage.getItem(STORAGE_UI);
        if (!raw) return { model: "", motion: "system" };
        const p = JSON.parse(raw) || {};
        return {
            model: typeof p.model === "string" ? p.model : "",
            motion: p.motion === "reduce" ? "reduce" : "system"
        };
    } catch (e) {
        return { model: "", motion: "system" };
    }
}

function writeUIPrefs(patch) {
    const prefs = Object.assign(readUIPrefs(), patch || {});
    try {
        localStorage.setItem(STORAGE_UI, JSON.stringify(prefs));
        return true;
    } catch (e) {
        return false;
    }
}

function saveUIPrefs() {
    const ok = writeUIPrefs({ model: sanitizeText(modelInput.value) });
    uiPrefsStatus.textContent = ok ? "Preferences saved." : "Couldn't save: this browser's storage is full or blocked.";
}

function applyMotionPref(value) {
    if (value === "reduce") document.documentElement.setAttribute("data-motion", "reduce");
    else document.documentElement.removeAttribute("data-motion");
}

function applyUIPrefs() {
    const p = readUIPrefs();
    modelInput.value = p.model || defaultModelPlaceholder();
    applyMotionPref(p.motion);
    document.querySelectorAll('input[name="motionPref"]').forEach(function (r) { r.checked = r.value === p.motion; });
}

document.querySelectorAll('input[name="motionPref"]').forEach(function (radio) {
    radio.addEventListener("change", function () {
        if (!radio.checked) return;
        applyMotionPref(radio.value);
        const ok = writeUIPrefs({ motion: radio.value });
        const status = document.getElementById("motionStatus");
        if (status) {
            status.textContent = !ok ? "Couldn't save this choice: this browser's storage is full or blocked."
                : radio.value === "reduce" ? "Motion reduced. Every change still shows; the movement is gone."
                    : "Following your device's motion setting.";
        }
    });
});

function defaultModelPlaceholder() {
    return "llama-3.3-70b-versatile";
}

function readErrorRecords() {
    try {
        let raw = localStorage.getItem(STORAGE_KEY_ERRORS);
        if (!raw) {
            const legacy = localStorage.getItem("learningAssistantErrorsV1");
            if (legacy) {
                raw = legacy;
            }
        }
        const parsed = JSON.parse(raw || "[]");
        if (!Array.isArray(parsed)) return [];
        return parsed.map(migrateErrorRecord);
    } catch (e) {
        return [];
    }
}

function migrateErrorRecord(item) {
    if (!item || typeof item !== "object") return item;
    const copy = Object.assign({}, item);
    if (!copy.subject) copy.subject = "Uncategorized";
    if (typeof copy.explanation !== "string") copy.explanation = "";
    // R2: topic identity for records saved before topic tracking existed.
    if (typeof copy.topic !== "string") copy.topic = "";
    if (typeof copy.topicKey !== "string") copy.topicKey = "";
    // Initialize spaced-repetition state for records saved before this feature.
    if (!copy.sr && window.ReviewSystem) copy.sr = window.ReviewSystem.initReview();
    return copy;
}

// R2: load/save the topic-mastery map. Best-effort, mirroring the error-record
// and attempt-queue helpers — a storage failure must never break grading.
function readMastery() {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_MASTERY) || "{}");
        return (parsed && typeof parsed === "object" && !Array.isArray(parsed)) ? parsed : {};
    } catch (e) {
        return {};
    }
}

function saveMastery() {
    try {
        localStorage.setItem(STORAGE_MASTERY, JSON.stringify(masteryMap));
    } catch (e) {
        // storage full or unavailable — mastery is a derived convenience, skip silently
    }
}

function saveErrorRecords() {
    localStorage.setItem(STORAGE_KEY_ERRORS, JSON.stringify(errorRecords));
    try {
        localStorage.removeItem("learningAssistantErrorsV1");
    } catch (e) {}
}

function populateSubjectSelects() {
    apSubjectInput.innerHTML = "";
    AP_SUBJECTS.forEach(function (s) {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.label;
        apSubjectInput.appendChild(opt);
    });
    // Land first-time visitors on the flagship upgraded subject (authentic
    // AP-style items with explanations) instead of the list's first entry.
    if (AP_SUBJECTS.some(function (s) { return s.id === "bio"; })) {
        apSubjectInput.value = "bio";
    }
    // Topic Mastery lives on another view now, so it gets its own copy of the control.
    if (masteryCourseInput) {
        masteryCourseInput.innerHTML = apSubjectInput.innerHTML;
        masteryCourseInput.value = apSubjectInput.value;
    }
}

function getQuizNotesContext() {
    if (!useNotesContextInput.checked) {
        return { text: "", source: "none" };
    }
    const fromBox = sanitizeText(noteInput.value);
    if (fromBox) {
        return { text: fromBox, source: "textarea" };
    }
    const fromSummary = sanitizeText(lastNotesContext);
    if (fromSummary) {
        return { text: fromSummary, source: "summary" };
    }
    return { text: "", source: "none" };
}

function updateNotesContextUI() {
    const fromBox = !!sanitizeText(noteInput.value);
    const fromSummary = !!sanitizeText(lastNotesContext);
    const hasAny = fromBox || fromSummary;
    // Offline the set comes from the built-in bank, which never reads notes: say so here,
    // before generating, instead of after.
    if (healthReady && !canUseLiveAI()) {
        useNotesContextInput.disabled = true;
        notesContextHint.textContent = "Built-in questions are fixed AP-style items and don't use notes. " +
            "Practice from your notes needs the AI connection (Setup → AI connection).";
        return;
    }
    useNotesContextInput.disabled = false;
    if (!hasAny && useNotesContextInput.checked) {
        notesContextHint.textContent = "Paste notes on the Notes page, or generate a summary, to base questions on your material.";
    } else if (fromBox) {
        notesContextHint.textContent = "Using the text on your Notes page. Edit it anytime, then generate again.";
    } else if (fromSummary) {
        notesContextHint.textContent = "Using your last summary. Paste new notes on the Notes page for different questions.";
    } else {
        notesContextHint.textContent = "Optional: paste notes to tailor questions to your material.";
    }
}

function refreshMistakeFilterOptions() {
    const subjects = {};
    errorRecords.forEach(function (r) {
        if (r.subject) subjects[r.subject] = true;
    });
    const current = mistakeSubjectFilterEl.value;
    mistakeSubjectFilterEl.innerHTML = '<option value="">All courses</option>';
    Object.keys(subjects).sort().forEach(function (sub) {
        const opt = document.createElement("option");
        opt.value = sub;
        opt.textContent = sub;
        mistakeSubjectFilterEl.appendChild(opt);
    });
    if (current && subjects[current]) {
        mistakeSubjectFilterEl.value = current;
    } else if (reviewFilter.course && !subjects[reviewFilter.course]) {
        // The filtered course has no mistakes left: fall back to all courses.
        reviewFilter.course = "";
    }
}

// --- AI reliability layer ------------------------------------------------
// JSON mode (response_format) makes the model return *valid JSON*, but not
// necessarily the right *shape*. These validators check the shape; the counter
// records how often the AI got it right on the first try vs. needed a repair
// retry vs. failed entirely — giving a measurable reliability number.

function validateSummaryShape(obj) {
    return !!obj &&
        typeof obj.simplifiedSummary === "string" &&
        obj.simplifiedSummary.trim().length > 0 &&
        Array.isArray(obj.keyPoints) &&
        obj.keyPoints.length >= 1 &&
        obj.keyPoints.every(function (p) { return typeof p === "string" && p.trim().length > 0; });
}

// outcome: "ok" (valid first try) | "repaired" (valid after one retry) | "failed"
function recordAiResult(kind, outcome) {
    try {
        const data = getAiReliability();
        const bucket = data[kind] || { ok: 0, repaired: 0, failed: 0, total: 0 };
        if (outcome === "ok" || outcome === "repaired" || outcome === "failed") {
            bucket[outcome] += 1;
        }
        bucket.total += 1;
        data[kind] = bucket;
        localStorage.setItem(STORAGE_AI_RELIABILITY, JSON.stringify(data));
        console.log("[AI reliability]", kind, outcome, JSON.stringify(bucket));
    } catch (e) {
        // metric is best-effort; never break a generation because of it
    }
}

function getAiReliability() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_AI_RELIABILITY) || "{}");
    } catch (e) {
        return {};
    }
}

function extractJsonObject(text) {
    if (!text) return null;
    const trimmed = String(text).trim();
    try {
        return JSON.parse(trimmed);
    } catch (e) {}
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
    try {
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch (e) {
        return null;
    }
}

function extractJsonArray(text) {
    if (!text) return null;
    const trimmed = String(text).trim();
    try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : null;
    } catch (e) {}
    const a = trimmed.indexOf("[");
    const b = trimmed.lastIndexOf("]");
    if (a === -1 || b === -1 || b <= a) return null;
    try {
        const parsed = JSON.parse(trimmed.slice(a, b + 1));
        return Array.isArray(parsed) ? parsed : null;
    } catch (e) {
        return null;
    }
}

function normalizeQuestionType(typeValue) {
    const t = String(typeValue || "").toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
    if (t === "multiple_choice" || t === "mcq" || t === "choice" || t === "multiple") {
        return "multiple_choice";
    }
    if (t === "short_answer" || t === "short" || t === "sa" || t === "free_response" || t === "frq") {
        return "short_answer";
    }
    return "short_answer";
}

// MCQ de-bias — fixes "the correct answer is always option A". Randomizes option
// order and re-letters A/B/C/D so position no longer leaks the answer. Skipped when
// the explanation names an option by letter (shuffling would desync that reference)
// or when the answer can't be matched to an option (don't risk breaking grading).
function explanationRefsOptionLetter(expl) {
    return /\b(option|choice|answer)s?\s+[A-F]\b/i.test(String(expl || ""));
}
function shuffleMcqOptions(item) {
    if (!item || !Array.isArray(item.options) || item.options.length < 2) return item;
    if (explanationRefsOptionLetter(item.explanation)) return item;
    const strip = function (s) { return String(s).replace(/^\s*[A-Fa-f][.)]\s*/, "").trim(); };
    const bare = item.options.map(strip);
    const ansBare = strip(item.answer);
    const correctIdx = bare.indexOf(ansBare);
    if (correctIdx < 0) return item; // answer not found among options — leave as-is
    const order = bare.map(function (_, i) { return i; });
    for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    const letters = ["A", "B", "C", "D", "E", "F"];
    const newOptions = order.map(function (origIdx, pos) { return letters[pos] + ". " + bare[origIdx]; });
    const newCorrectPos = order.indexOf(correctIdx);
    return Object.assign({}, item, {
        options: newOptions,
        answer: letters[newCorrectPos] + ". " + bare[correctIdx]
    });
}

function normalizeAIQuestions(rawQuestions) {
    if (!Array.isArray(rawQuestions)) return [];
    return rawQuestions
        .map(function (q, index) {
            if (!q || typeof q !== "object") return null;
            const normalizedType = normalizeQuestionType(q.type);
            const questionText = String(q.question || q.prompt || "").trim();
            const answerText = String(q.answer || q.correctAnswer || q.solution || "").trim();
            if (!questionText) return null;

            let options = undefined;
            let renderType = "Short Answer";
            if (normalizedType === "multiple_choice") {
                if (Array.isArray(q.options)) {
                    options = q.options.map(function (opt) { return String(opt || "").trim(); }).filter(Boolean);
                } else if (Array.isArray(q.choices)) {
                    options = q.choices.map(function (opt) { return String(opt || "").trim(); }).filter(Boolean);
                } else {
                    options = [];
                }
                if (options.length >= 2) {
                    renderType = "Multiple Choice";
                } else {
                    options = undefined;
                }
            }

            // Explanation is optional. Dedupe filter (NOT synthesis): drop it if it
            // just restates the answer or is too short to be a real explanation.
            const explanationText = String(q.explanation || "").trim();
            const explanation = (explanationText.length >= 20 && explanationText !== answerText)
                ? explanationText : "";
            return {
                id: (renderType === "Multiple Choice" ? "mcq-" : "sa-") + Date.now() + "-" + index,
                type: renderType,
                question: questionText,
                options: options,
                answer: answerText || "No answer provided by AI.",
                explanation: explanation
            };
        })
        .filter(Boolean);
}

function parseFormat(formatStr) {
    const parts = (formatStr || "3:2").split(":");
    const mcq = parseInt(parts[0], 10) || 0;
    const sa = parseInt(parts[1], 10) || 0;
    return { mcq: mcq, sa: sa };
}

// Structural quality gate: the result has at least the requested number of each
// question type. Field shape (question/answer/options present) is handled
// separately by normalizeAIQuestions, which filters out malformed items first.
//
// An earlier topic-keyword check was removed here: it false-rejected valid
// questions that express the topic with LaTeX/symbols (e.g. $f'(x)$, $\int$)
// instead of the literal keyword, causing needless fallback to the offline bank.
function isQuizQualityAcceptable(questions, topic, expected) {
    if (!Array.isArray(questions) || questions.length < 1) return false;
    const mcqCount = questions.filter(function (q) { return q && q.type === "Multiple Choice"; }).length;
    const shortCount = questions.filter(function (q) { return q && q.type === "Short Answer"; }).length;
    return mcqCount >= expected.mcq && shortCount >= expected.sa;
}

// Top-of-page connection chip, so the student always knows which mode they are in.
function renderAiChip() {
    const chip = document.getElementById("aiChip");
    if (!chip) return;
    let state = "down";
    let text = "Server not connected";
    if (!healthReady) {
        state = "checking";
        text = "Checking connection";
    } else if (canUseLiveAI()) {
        state = "ai";
        text = "AI connected";
    } else if (serverHealthy) {
        state = "offline";
        text = "Built-in question bank";
    }
    chip.setAttribute("data-state", state);
    chip.textContent = text;
}

async function fetchHealth() {
    healthReady = false;
    renderAiChip();
    setAIControlsBusy(true);
    healthStatus.textContent = "Checking connection...";
    try {
        const res = await fetch("/api/health", { method: "GET" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        serverHealthy = !!data.ok;
        healthConfig.openai_configured = !!data.openai_configured;
        healthConfig.variants = data.variants || null;
        const o = healthConfig.openai_configured ? "AI features available" : "no API key yet";
        healthStatus.textContent = "Connected — " + o + ".";
        if (!isProviderConfigured()) {
            healthStatus.textContent += " Practice works offline; add a key to enable AI.";
        }
    } catch (e) {
        serverHealthy = false;
        healthConfig.openai_configured = false;
        healthConfig.variants = null;
        healthStatus.textContent = "Not connected. Start the local server (server.py), then open http://127.0.0.1:8765/.";
    } finally {
        healthReady = true;
        setAIControlsBusy(false);
        renderAiChip();
    }
    if (serverHealthy) {
        await flushAttemptQueue();
    }
    loadStats();
    renderFirstVisitCopy(); // the connection decides what the first-visit Home can promise
    if (lastSummary && summaryOutput.querySelector(".key-points")) drawSummary(lastSummary);
    updateNotesContextUI();
    updateBankHint();
    if (window.Shell && window.Shell.current() === "mistake") renderMistakeDetail(window.Shell.param());
}

function canUseLiveAI() {
    return healthReady && serverHealthy && isProviderConfigured();
}

async function proxyChat(messages, opts) {
    const model = sanitizeText(modelInput.value);
    if (!model) {
        throw new Error("Set a model on the Setup page (e.g. llama-3.3-70b-versatile).");
    }
    if (!isProviderConfigured()) {
        throw new Error(providerKeyHint());
    }
    const payload = { model: model, messages: messages };
    if (opts && opts.json) {
        payload.json = true;  // ask the proxy to enable provider JSON mode
    }
    // Bound the request so a hung provider can't leave the user staring at a
    // spinner forever — abort after 30s and let callers fall back gracefully.
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, 30000);
    let res;
    try {
        res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
    } catch (e) {
        if (e && e.name === "AbortError") {
            throw new Error("The AI took too long to respond (timed out).");
        }
        throw e;
    } finally {
        clearTimeout(timer);
    }
    let data = {};
    try {
        data = await res.json();
    } catch (e) {
        data = {};
    }
    if (!res.ok) {
        throw new Error(data.error || ("Proxy error " + res.status));
    }
    if (!data.content) {
        throw new Error("Empty response from proxy.");
    }
    return data.content;
}

async function summarizeNotesWithAI(rawNotes) {
    const system =
        "You are a helpful AP / high school tutor. Return ONLY valid JSON. " +
        "Keys: simplifiedSummary (string), keyPoints (array of strings). " +
        "simplifiedSummary is one short paragraph. keyPoints has 4-8 bullets. " +
        "Write any mathematical expressions as LaTeX delimited with $...$ " +
        "(e.g. $x^2$, $\\frac{dy}{dx}$, $\\int_0^1 x\\,dx$). " +
        "No markdown fences.";
    const user = "Summarize for study:\n\n" + rawNotes;
    const messages = [
        { role: "system", content: system },
        { role: "user", content: user }
    ];

    const attempt = async function () {
        return extractJsonObject(await proxyChat(messages, { json: true }));
    };

    // First try; if the shape is wrong, repair with exactly one retry before failing.
    let json = await attempt();
    if (validateSummaryShape(json)) {
        recordAiResult("summary", "ok");
        return json;
    }
    json = await attempt();
    if (validateSummaryShape(json)) {
        recordAiResult("summary", "repaired");
        return json;
    }
    recordAiResult("summary", "failed");
    throw new Error("Could not get a valid summary from the AI.");
}

function subjectLabelFromId(id) {
    const found = AP_SUBJECTS.find(function (s) { return s.id === id; });
    return found ? found.label : id;
}

async function generateQuizWithAI(topic, difficulty, expected, apSubjectId, notesContext) {
    const diffGuide = {
        basic: "BASIC — test recall and definitions. One concept per question, single step, "
            + "straightforward terminology. MCQ distractors are obviously wrong.",
        medium: "MEDIUM — test application and multi-step reasoning. Combine two related concepts, "
            + "require a short calculation or explanation. MCQ distractors are plausible.",
        challenge: "CHALLENGE — AP free-response rigor. Synthesize multiple concepts, include edge "
            + "cases or multi-part reasoning, require justification. MCQ distractors reflect common misconceptions."
    };
    const diffLabel = diffGuide[difficulty] ? difficulty : "medium";
    const diffSpec = diffGuide[diffLabel];
    const courseName = subjectLabelFromId(apSubjectId);

    const system =
        "You write AP-style practice questions. Return ONLY valid JSON with key questions (array). " +
        "You MUST output exactly " + expected.mcq + " multiple_choice and " + expected.sa + " short_answer questions, in that total order preference: list MCQs first, then short answers. " +
        "multiple_choice: type 'multiple_choice', question string, options array of exactly 4 strings starting with 'A. '..'D. ', answer equals the full correct option string, explanation string. " +
        "short_answer: type 'short_answer', question string, answer is a concise model answer (2-5 sentences), explanation string. " +
        "Questions must match the AP course style and use authentic terminology and structures for that exam. " +
        "Calibrate the complexity STRICTLY to the requested difficulty level described below. " +
        "Write any mathematical expressions as LaTeX delimited with $...$ " +
        "(e.g. $x^2$, $\\frac{dy}{dx}$, $\\int_0^1 x\\,dx$); do this inside question, options, and answer strings. " +
        "The explanation must say WHY the correct answer is correct and, for multiple_choice, what misconception each wrong option reflects; do NOT repeat the answer text. If you cannot give a real explanation, set explanation to \"\". " +
        "Avoid generic study-skills questions. No markdown fences.";

    let user = "AP course: " + courseName + "\n";
    user += "Difficulty level: " + diffSpec + "\n";
    if (sanitizeText(topic)) {
        user += "Topic focus: " + topic + "\n";
    }
    if (sanitizeText(notesContext)) {
        user += "\nContext from student notes — REQUIRED: base every question on specific concepts from these notes. Do not reuse generic templates. Vary topics across questions.\n";
        user += notesContext.slice(0, 8000) + "\n";
    }
    user += "\nGenerate exactly " + (expected.mcq + expected.sa) + " questions as specified.";

    const content = await proxyChat([
        { role: "system", content: system },
        { role: "user", content: user }
    ], { json: true });

    const json = extractJsonObject(content);
    if (json && Array.isArray(json.questions)) return json.questions;
    if (json && Array.isArray(json.items)) return json.items;
    const arr = extractJsonArray(content);
    if (arr) return arr;
    throw new Error("Could not parse quiz JSON.");
}

// Turn raw notes into clean key-point strings for the offline summary. Notes are
// usually line-structured, so split on LINES first (before whitespace is collapsed),
// strip a leading list marker (1. / 2) / - / • / □), and drop meaningless fragments
// (empty, pure numbers/punctuation, or under 3 chars) so the summary never shows a
// bullet like "1" or ")". Falls back to sentence splitting only for a single
// paragraph with no line breaks.
function notesToKeyPoints(raw) {
    const text = String(raw || "");
    let lines = text.split(/\r?\n+/).map(function (l) { return l.trim(); }).filter(Boolean);
    if (lines.length <= 1) {
        lines = getSentences(sanitizeText(text)); // single paragraph: split into sentences
    }
    const points = [];
    lines.forEach(function (line) {
        const cleaned = sanitizeText(line.replace(/^\s*(?:\d+[.)]|[-•*▪◦‣·□☐]+)\s+/, ""));
        if (!cleaned) return;
        if (/^[\d\s.)(,:;•\-*□☐]+$/.test(cleaned)) return; // pure number / punctuation
        if (cleaned.length < 3) return;
        points.push(cleaned);
    });
    return points;
}

function summarizeNotesDemo(raw) {
    const normalized = sanitizeText(raw);
    if (!normalized) return null;
    const points = notesToKeyPoints(raw);
    const summaryText = points.slice(0, 2).join(" ");
    const keyPoints = points.length ? points.slice(0, 6) : [normalized];
    const listHtml = keyPoints.map(function (p) {
        return "<li>" + escapeHtml(p) + "</li>";
    }).join("");
    return { simplifiedSummary: summaryText || normalized, keyPointsHtml: listHtml, keyPoints: keyPoints };
}

// Offline regeneration variety (P1): remembers recently-served bank indices per
// subject+tier+type so a second generated set offers DIFFERENT questions instead of
// repeating the same ones. Returns `count` shuffled indices that avoid the recent
// set; recent memory is capped to (poolLen - count) so there are always enough fresh
// ones and the selection rotates through the whole tier pool across regenerations.
const recentDemoIdx = {};
function pickBankIndices(key, poolLen, count) {
    if (poolLen <= 0) return [];
    if (count > poolLen) count = poolLen;
    const shuffle = function (a) {
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    };
    const all = [];
    for (let i = 0; i < poolLen; i++) all.push(i);
    if (poolLen <= count) return shuffle(all); // whole pool needed; variety impossible
    const recent = recentDemoIdx[key] || [];
    const fresh = all.filter(function (i) { return recent.indexOf(i) === -1; });
    const chosen = shuffle(fresh).slice(0, count);
    recentDemoIdx[key] = recent.concat(chosen).slice(-(poolLen - count));
    return chosen;
}

// Returns an array of offline questions, or null when no bank exists for the
// subject (so the caller can degrade honestly instead of showing wrong-subject items).
// The offline bank is large (~250 KB), so it is not part of the first page load. It is
// fetched the first time a set needs it, and prefetched once the browser is idle.
let bankPromise = null;
function ensureQuestionBank() {
    if (window.OFFLINE_BANK) return Promise.resolve(true);
    if (bankPromise) return bankPromise;
    bankPromise = new Promise(function (resolve) {
        const tag = document.createElement("script");
        tag.src = "js/question-bank.js";
        tag.async = true;
        tag.onload = function () { resolve(!!window.OFFLINE_BANK); };
        tag.onerror = function () {
            bankPromise = null; // allow a retry
            tag.remove();
            resolve(false);
        };
        document.head.appendChild(tag);
    });
    return bankPromise;
}
(function prefetchQuestionBank() {
    const go = function () { ensureQuestionBank(); };
    if (window.Shell && window.Shell.current() === "practice") { go(); return; }
    if ("requestIdleCallback" in window) window.requestIdleCallback(go, { timeout: 4000 });
    else window.setTimeout(go, 2500);
}());

// Build a set from the built-in bank. A requested topic is matched by skill tag where the
// course is tagged (AP Calculus AB), otherwise by the words of each item's own question and
// answer (PracticeSelection.splitForRequest). Every tagged item counts toward its own skill;
// an untagged item that doesn't match the request is general course practice (empty topic,
// the course's general bucket). `onlyMatching` leaves the rest of the set empty instead of
// filling it. Returns null when the course has no bank, [] when nothing matched.
function createMockQuestions(topic, apSubjectId, difficulty, expected, onlyMatching) {
    const allBanks = (typeof window !== "undefined" && window.OFFLINE_BANK) || {};
    const subjectBank = allBanks[apSubjectId];
    if (!subjectBank) return null;

    const tier = ({ basic: "basic", medium: "medium", challenge: "challenge" })[difficulty] || "medium";
    const pack = subjectBank[tier] || subjectBank.medium || subjectBank.basic || subjectBank.challenge;
    if (!pack || !Array.isArray(pack.mcq) || !Array.isArray(pack.sa)) return null;

    // Bank questions are fixed, AP-style items: they are not written from the student's
    // notes, so they never claim to be (the status line says the notes were not used).
    const course = subjectLabelFromId(apSubjectId);
    const wanted = sanitizeText(topic);
    const PS = window.PracticeSelection;
    const topicKey = wanted && window.MasteryModel ? window.MasteryModel.normalizeTopicKey(wanted) : "";
    let requestedSkill = null;
    const pick = function (kind, need) {
        const pool = pack[kind] || [];
        const split = wanted && PS && PS.splitForRequest ? PS.splitForRequest(pool, wanted, apSubjectId)
            : { onTopic: [], general: pool.map(function (x, i) { return i; }), skill: null };
        if (split.skill) requestedSkill = split.skill;
        const chosen = [];
        const from = function (indices, key, on) {
            const n = Math.min(need - chosen.length, indices.length);
            if (n <= 0) return;
            pickBankIndices(key, indices.length, n).forEach(function (k) { chosen.push({ idx: indices[k], on: on }); });
        };
        from(split.onTopic, apSubjectId + "|" + tier + "|" + kind + "|topic:" + topicKey, true);
        if (!onlyMatching) from(split.general, apSubjectId + "|" + tier + "|" + kind + (wanted ? "|general:" + topicKey : ""), false);
        return chosen;
    };
    // On-topic items read with the student's topic; the others with the course name, so a
    // template never claims to be about a topic it doesn't test.
    const filler = function (on) {
        const focus = on ? wanted : course;
        return function (text) { return String(text || "").replace(/\{focus\}/g, focus); };
    };
    // Where this item's result is counted: the requested topic, else its own tagged skill,
    // else nothing (the course's general bucket).
    const topicFor = function (item, on) {
        if (on) return requestedSkill ? requestedSkill.name : wanted;
        if (Array.isArray(item.k) && item.k.length && PS && PS.skillById) {
            const sk = PS.skillById(apSubjectId, item.k[0]);
            if (sk) return sk.name;
        }
        return "";
    };
    const build = function (kind, item, c, n) {
        const fill = filler(c.on);
        const q = {
            id: (kind === "mcq" ? "mcq-demo-" : "sa-demo-") + Date.now() + "-" + n + "-" + c.idx,
            type: kind === "mcq" ? "Multiple Choice" : "Short Answer",
            question: fill(item.q),
            answer: item.a,
            explanation: fill(item.e || ""),
            onTopic: c.on,
            assignedTopic: topicFor(item, c.on)
        };
        if (kind === "mcq") q.options = (item.o || []).slice();
        if (Array.isArray(item.k)) q.skills = item.k.slice();
        return q;
    };

    const out = [];
    if (expected.mcq > 0) pick("mcq", expected.mcq).forEach(function (c, i) { out.push(build("mcq", pack.mcq[c.idx], c, i)); });
    if (expected.sa > 0) pick("sa", expected.sa).forEach(function (c, j) { out.push(build("sa", pack.sa[c.idx], c, j)); });
    out.requestedSkill = requestedSkill;
    return out;
}

// Before generating offline: what the built-in bank actually has for this course and
// level, and how much of it is about the typed topic, so the format and topic choices
// don't promise more than the set will hold.
// "only" is honoured only while the choice is on screen (offline, with a topic typed).
function topicFillValue() {
    const el = document.getElementById("topicFillInput");
    const wrap = document.getElementById("topicFill");
    return el && !(wrap && wrap.hidden) ? el.value : "fill";
}

// The one place a new set replaces the current one. Callers only get here once the new
// questions exist, so a failed or empty request leaves the student's set as it was.
function installSet(questions, meta) {
    generatedQuestions = questions;
    quizResults = {};
    currentSetMeta = meta;
    renderQuestions();
}

// Skill suggestions for courses whose questions are tagged (AP Calculus AB): picking one
// matches questions by tag, exactly.
function refreshTopicOptions() {
    const list = document.getElementById("topicOptions");
    if (!list || !window.PracticeSelection || !window.PracticeSelection.skillsFor) return;
    list.innerHTML = window.PracticeSelection.skillsFor(apSubjectInput.value).map(function (sk) {
        return '<option value="' + escapeHtml(sk.name) + '" label="' + escapeHtml(sk.unit) + '"></option>';
    }).join("");
}

function updateBankHint() {
    const el = document.getElementById("bankHint");
    const fill = document.getElementById("topicFill");
    if (!el) return;
    refreshTopicOptions();
    const topic = sanitizeText(topicInput.value);
    if (!healthReady || canUseLiveAI()) {
        el.hidden = true;
        if (fill) fill.hidden = true;
        return;
    }
    if (fill) fill.hidden = !topic;
    if (!window.OFFLINE_BANK) {
        el.hidden = true;
        ensureQuestionBank().then(function (ok) { if (ok) updateBankHint(); });
        return;
    }
    const apId = apSubjectInput.value;
    const subject = subjectLabelFromId(apId);
    const bank = window.OFFLINE_BANK[apId];
    const tierName = ({ basic: "Basic", medium: "Medium", challenge: "Challenge" })[difficultyInput.value] || "Medium";
    const pack = bank && (bank[difficultyInput.value] || bank.medium);
    el.hidden = false;
    if (!pack) {
        el.textContent = "The built-in bank has no " + subject + " questions. Pick another course, or connect the AI.";
        return;
    }
    const want = parseFormat(questionFormatInput.value);
    const nMcq = pack.mcq.length;
    const nSa = pack.sa.length;
    let text = "Built-in bank, " + subject + " · " + tierName + ": " + nMcq + " multiple choice, " + nSa + " short answer.";
    const short = [];
    if (want.mcq > nMcq) short.push(nMcq + " multiple choice");
    if (want.sa > nSa) short.push(nSa + " short answer");
    if (short.length) text += " This format asks for more, so the set will have " + short.join(" and ") + ".";
    const PS = window.PracticeSelection;
    if (topic && PS && PS.splitForRequest) {
        const m = PS.splitForRequest(pack.mcq, topic, apId);
        const a = PS.splitForRequest(pack.sa, topic, apId);
        const name = m.skill ? m.skill.name : topic;
        const on = m.onTopic.length + a.onTopic.length;
        if (!on) {
            text += " None are about “" + name + "” at this level.";
        } else {
            const used = Math.min(m.onTopic.length, want.mcq) + Math.min(a.onTopic.length, want.sa);
            text += " " + on + (on === 1 ? " is" : " are") + " about “" + name + "” (" + m.onTopic.length +
                " multiple choice, " + a.onTopic.length + " short answer); this format would use " + used + " of them.";
        }
        if (!m.skill && PS.skillsFor(apId).length) {
            text += " “" + topic + "” isn't one of the listed " + subject +
                " skills, so questions are matched by their words; pick a skill from the list to match exactly.";
        }
    }
    el.textContent = text;
}
(function wireBankHint() {
    [apSubjectInput, difficultyInput, questionFormatInput].forEach(function (el) {
        el.addEventListener("change", updateBankHint);
    });
    // Updated on every keystroke, not after a pause: the hint sits above Generate, and a
    // late update moved the button (129 px on a phone) just as the student tapped it.
    topicInput.addEventListener("input", updateBankHint);
    topicInput.addEventListener("change", updateBankHint);
    refreshTopicOptions();
}());

function scoreSummary() {
    let answered = 0;
    let correct = 0;
    Object.keys(quizResults).forEach(function (id) {
        const r = quizResults[id];
        if (r && r.done) {
            answered++;
            if (r.correct) correct++;
        }
    });
    return { answered: answered, correct: correct };
}

// --- Practice focus mode: one question at a time -----------------------------------------
// Every card of a set is rendered once; only the current one is shown. The set bar's cells
// are both the score and the navigation. The band shows the question number.
const DIFFICULTY_NAME = { basic: "Basic", medium: "Medium", challenge: "Challenge" };
const ORIGIN_NAME = {
    ai: "AI-generated",
    bank: "Built-in question bank",
    review: "Due reviews from your Mistake Log"
};

// Say plainly which built-in questions are about the requested topic and where the
// results of the others go (the course overall), so mastery feedback stays honest.
function topicCoverageText(topic, subject, onTopic, otherSkills, general) {
    const t = "“" + topic + "”";
    const parts = [];
    if (onTopic) parts.push(onTopic + (onTopic === 1 ? " is" : " are") + " about " + t + ".");
    else parts.push("No built-in " + subject + " questions at this level are about " + t + ".");
    if (otherSkills) {
        parts.push(otherSkills + (otherSkills === 1 ? " practises another " : " practise other ") + subject +
            " skill" + (otherSkills === 1 ? "" : "s") + " and count" + (otherSkills === 1 ? "s" : "") + " toward " +
            (otherSkills === 1 ? "that skill" : "those skills") + ", not " + t + ".");
    }
    if (general) {
        parts.push(general + (general === 1 ? " is" : " are") + " general " + subject +
            " practice and count" + (general === 1 ? "s" : "") + " toward " + subject + " overall, not " + t + ".");
    }
    return parts.join(" ");
}

// The result kicker stays short: course and level only (the set bar has the rest).
function resultKicker() {
    const m = currentSetMeta || {};
    const parts = [m.origin === "review" ? "Review set" : (m.subject || "Practice set")];
    if (DIFFICULTY_NAME[m.difficulty]) parts.push(DIFFICULTY_NAME[m.difficulty]);
    return parts.join(" · ");
}

function snippetOf(text, max) {
    return window.ReviewOrbit ? window.ReviewOrbit.snippet(text, max) : String(text || "");
}

// Multiple-choice options with a key badge (A-D) the keyboard shortcuts refer to. The
// radio stays in the label, invisible over the badge, so clicks, keys and tests still use it.
function mcqOptionsHtml(groupName, options) {
    let html = '<div class="mcq-options" data-role="mcq">';
    (options || []).forEach(function (opt, oi) {
        const letter = optionLetter(opt);
        const shown = letter ? String(opt).replace(/^\s*[A-F][.)]\s*/, "") : opt;
        html += "<label>";
        html += '<input type="radio" name="' + escapeHtml(groupName) + '" value="' + escapeHtml(opt) + '" /> ';
        html += '<span class="opt-key">' + (letter || String.fromCharCode(65 + oi)) + "</span>";
        html += '<span class="opt-text">' + escapeHtml(shown) + "</span>";
        html += "</label>";
    });
    return html + "</div>";
}

// What this set is, in words: course, topic, level, and where the questions came from
// (live AI, the built-in bank, or saved mistakes coming back for review).
function setMetaText() {
    const m = currentSetMeta;
    if (!m) return "";
    const reviews = generatedQuestions.filter(function (q) { return q.source === "review"; }).length;
    const parts = [];
    if (m.subject) parts.push(m.subject);
    if (m.topic) parts.push(m.topic);
    else if (m.requestedTopic) parts.push("General practice (no built-in questions on " + m.requestedTopic + ")");
    if (DIFFICULTY_NAME[m.difficulty]) parts.push(DIFFICULTY_NAME[m.difficulty]);
    let origin = ORIGIN_NAME[m.origin] || "";
    if (m.origin !== "review" && reviews) origin += " + " + reviews + (reviews === 1 ? " due review" : " due reviews");
    if (origin) parts.push(origin);
    return parts.join(" · ");
}

function firstOpenIndex() {
    for (let i = 0; i < generatedQuestions.length; i++) {
        const r = quizResults[generatedQuestions[i].id];
        if (!r || !r.done) return i;
    }
    return -1;
}

function isSetComplete() {
    return generatedQuestions.length > 0 && firstOpenIndex() === -1;
}

// One cell per question in the set: empty until graded, then right or not yet. Each cell
// opens its question.
function scoreBannerInner() {
    const s = scoreSummary();
    const total = generatedQuestions.length;
    const cells = generatedQuestions.map(function (q, i) {
        const r = quizResults[q.id];
        const state = r && r.done ? (r.correct ? " ok" : " bad") : "";
        const current = i === practiceIndex && !resultsShown;
        const label = "Question " + (i + 1) + (r && r.done ? (r.correct ? ", right" : ", not yet right") : ", not answered");
        return '<button type="button" class="set-cell' + state + (current ? " is-current" : "") + '" data-goto="' + i + '"' +
            ' aria-label="' + label + '"' + (current ? ' aria-current="step"' : "") + ">" + (i + 1) + "</button>";
    }).join("");
    const complete = isSetComplete();
    const held = currentSetMeta && currentSetMeta.heldBack;
    return '<p class="set-meta">' + escapeHtml(setMetaText()) +
        (held ? '<a class="set-heldback" href="#review">' + held + (held === 1 ? " due review on another topic" : " due reviews on other topics") +
            " · open Review</a>" : "") + "</p>" +
        '<div class="set-cells" role="group" aria-label="Questions in this set">' + cells + "</div>" +
        '<span class="score-text">' + s.correct + " correct of " + s.answered + " graded · " + total + " in this set.</span>" +
        '<span class="set-tools">' +
        (complete ? '<button type="button" class="small set-results" data-action="show-results">See results</button>' : "") +
        '<button type="button" class="secondary small set-change" data-action="change-set">' +
        (practiceSetupOpen ? "Hide setup" : "Change set") + "</button></span>";
}

function renderScoreBanner() {
    if (!generatedQuestions.length) return "";
    return '<div class="score-banner" id="scoreBanner">' + scoreBannerInner() + "</div>";
}

function updateScoreBanner() {
    const el = document.getElementById("scoreBanner");
    if (el) el.innerHTML = scoreBannerInner();
}

function renderQuestions() {
    if (!restoringSession) completedStats = null;
    resultsShown = false;
    practiceSetupOpen = false;
    practiceIndex = 0;
    if (generatedQuestions.length && !restoringSession) snapshotSetMastery();
    if (!generatedQuestions.length) {
        quizOutput.innerHTML = "<p class='empty'>Choose a course and generate questions to begin.</p>";
        setPracticeMode();
        saveSession();
        return;
    }

    const total = generatedQuestions.length;
    let html = renderScoreBanner();

    generatedQuestions.forEach(function (item, index) {
        const isMcq = item.type === "Multiple Choice" && item.options && item.options.length;
        const qid = escapeHtml(item.id);
        html += '<article class="qa-card" data-qid="' + qid + '" data-index="' + index + '" aria-labelledby="qt-' + index + '" hidden>';
        html += '<div class="card-head"><h3 class="qa-title" id="qt-' + index + '" tabindex="-1">Question ' + (index + 1) +
            '<span class="qa-of"> of ' + total + "</span></h3>";
        html += '<span class="tag">' + escapeHtml(item.type) + "</span>";
        // R1: resurfaced due mistakes are added on top of the requested set — label
        // them so the (intentionally) larger count reads as the feature it is.
        if (item.source === "review") {
            html += '<span class="tag review">Review · from your Mistake Log</span>';
        } else if (currentSetMeta && currentSetMeta.origin === "bank" && (item.topic || currentSetMeta.requestedTopic)) {
            // Where this question's result will be counted: the topic, or the course overall.
            html += item.topic
                ? '<span class="tag counts">Counts toward ' + escapeHtml(item.topic) + "</span>"
                : '<span class="tag counts general">General · counts toward ' + escapeHtml(item.subject || "the course") + "</span>";
        }
        html += "</div>";
        html += '<p class="qa-q">' + escapeHtml(item.question) + "</p>";

        if (isMcq) {
            html += mcqOptionsHtml("mcq-" + item.id, item.options);
            html += '<div class="actions qa-actions"><button type="button" class="check-mcq" data-qid="' + qid + '">Check answer</button>' +
                '<span class="key-hint" aria-hidden="true">Keys: A–' + String.fromCharCode(64 + Math.min(item.options.length, 6)) +
                " or 1–" + Math.min(item.options.length, 6) + " choose · Enter checks · N next</span></div>";
            html += '<div class="feedback" role="status" data-feedback="' + qid + '" hidden></div>';
        } else {
            html += '<div class="field">';
            html += '<textarea class="sa-input" data-sa-input="' + qid + '" aria-label="Your answer" placeholder="Type your answer, then submit to see the suggested answer."></textarea>';
            html += "</div>";
            html += '<div class="actions qa-actions"><button type="button" class="submit-sa" data-qid="' + qid + '">Submit answer</button></div>';
            html += '<div class="feedback" role="status" data-feedback="' + qid + '" hidden></div>';
            // Self-grade buttons appear only AFTER the student submits their answer.
            html += '<div class="short-actions" data-selfgrade="' + qid + '" hidden>';
            html += '<span class="selfgrade-q">Compare with the suggested answer below. Did you get it right?</span>';
            html += '<button type="button" class="outline self-correct" data-qid="' + qid + '" data-correct="1">I was right</button>';
            html += '<button type="button" class="outline self-wrong" data-qid="' + qid + '" data-correct="0">I was wrong</button>';
            html += "</div>";
        }

        // Khan-style: the answer stays hidden until the student checks/submits.
        html += '<div class="answer-box" data-answer="' + qid + '" hidden>';
        html += "<h4>Suggested answer</h4>";
        html += "<p>" + escapeHtml(item.answer) + "</p>";
        if (item.explanation) {
            // Remediation explanation: hidden until an INCORRECT response reveals it.
            html += '<div class="explanation" data-explanation="' + qid + '" hidden>';
            html += "<h4>Why</h4><p>" + escapeHtml(item.explanation) + "</p>";
            html += "</div>";
        }
        html += "</div>";

        html += '<div class="card-foot">';
        html += '<button type="button" class="text-btn" data-action="save-error" data-id="' + qid + '">Add to Mistake Log</button>';
        html += '<span class="q-nav">';
        html += '<button type="button" class="outline small q-prev" data-action="q-prev">Previous</button>';
        html += '<button type="button" class="secondary q-next" data-action="q-next">Next question</button>';
        html += "</span></div>";

        html += "</article>";
    });

    quizOutput.innerHTML = html;
    typesetMath(quizOutput);
    showQuestion(0, false);
    setPracticeMode();
    saveSession();
}

// Setup form, focused set, or result sequence: one data attribute drives the layout.
function setPracticeMode() {
    const view = document.getElementById("view-practice");
    const active = generatedQuestions.length > 0;
    const mode = !active ? "setup" : resultsShown ? "results" : "focus";
    if (view) view.setAttribute("data-mode", mode);
    const setup = document.getElementById("practiceSetup");
    if (setup) setup.hidden = active && !practiceSetupOpen;
    updatePracticeBand();
}

function togglePracticeSetup() {
    practiceSetupOpen = !practiceSetupOpen;
    setPracticeMode();
    updateScoreBanner();
    if (practiceSetupOpen) {
        const setup = document.getElementById("practiceSetup");
        if (setup) setup.scrollIntoView({ behavior: motionBehavior(), block: "start" });
        try { apSubjectInput.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
}

function motionBehavior() {
    return window.Shell && window.Shell.reducedMotion() ? "auto" : "smooth";
}

function pad2(n) {
    return n < 10 ? "0" + n : String(n);
}

// The band carries the set's real numbers: which question, then the score.
function updatePracticeBand() {
    if (!window.Shell || !window.Shell.setBand || window.Shell.current() !== "practice") return;
    const total = generatedQuestions.length;
    if (!total) { window.Shell.setBand(null); return; }
    if (resultsShown) {
        window.Shell.setBand({ num: String(scoreSummary().correct), of: "/" + total, label: "Right" });
    } else {
        window.Shell.setBand({ num: pad2(practiceIndex + 1), of: "/" + pad2(total), label: "Question" });
    }
}

function showQuestion(index, moveFocus) {
    const cards = quizOutput.querySelectorAll(".qa-card");
    if (!cards.length) return;
    practiceIndex = Math.max(0, Math.min(index, cards.length - 1));
    cards.forEach(function (c, k) {
        const on = k === practiceIndex && !resultsShown;
        c.hidden = !on;
        c.classList.toggle("is-current", on);
    });
    updateScoreBanner();
    refreshQuestionNav();
    updatePracticeBand();
    saveSession(); // the question on screen is part of what a refresh restores
    if (moveFocus && !resultsShown) {
        const title = cards[practiceIndex].querySelector(".qa-title");
        const bar = document.getElementById("scoreBanner");
        (bar || cards[practiceIndex]).scrollIntoView({ behavior: motionBehavior(), block: "start" });
        if (title) title.focus({ preventScroll: true });
    }
}

// Previous / Next on the current card. The last card leads to the results once every
// question is graded; until then it leads to the first one still open.
function refreshQuestionNav() {
    const card = quizOutput.querySelector(".qa-card.is-current");
    if (!card) return;
    const idx = parseInt(card.getAttribute("data-index"), 10) || 0;
    const item = generatedQuestions[idx];
    const done = !!(item && quizResults[item.id] && quizResults[item.id].done);
    const last = idx >= generatedQuestions.length - 1;
    card.classList.toggle("is-graded", done);
    const prev = card.querySelector(".q-prev");
    if (prev) prev.disabled = idx === 0;
    const next = card.querySelector(".q-next");
    if (!next) return;
    let label = "Next question";
    let action = "q-next";
    if (last && isSetComplete()) {
        label = "See results";
        action = "show-results";
    } else if (last) {
        label = "Next unanswered";
    }
    next.textContent = label;
    next.setAttribute("data-action", action);
    // Once this question is graded, moving on is the next action (the signal).
    next.classList.toggle("secondary", !done);
}

function goNextQuestion() {
    if (practiceIndex < generatedQuestions.length - 1) {
        showQuestion(practiceIndex + 1, true);
        return;
    }
    if (isSetComplete()) {
        showResults();
        return;
    }
    const open = firstOpenIndex();
    if (open >= 0) showQuestion(open, true);
}

// After a grade: lock the choice, show what to do next, and keep focus on it.
function afterGrade(card) {
    if (!card) return;
    card.querySelectorAll('.mcq-options input[type="radio"]').forEach(function (r) { r.disabled = true; });
    const check = card.querySelector(".check-mcq");
    if (check) check.disabled = true;
    updateScoreBanner();
    refreshQuestionNav();
    const next = card.querySelector(".q-next");
    if (next) {
        try { next.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
}

// Keyboard: letters or numbers choose, Enter checks (or moves on once graded), N moves on.
// Typing in a text box is never intercepted, and buttons keep their own Enter.
document.addEventListener("keydown", function (ev) {
    if (!window.Shell || window.Shell.current() !== "practice") return;
    if (!generatedQuestions.length || resultsShown) return;
    if (ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (document.querySelector("dialog[open]")) return;
    const t = ev.target instanceof HTMLElement ? ev.target : null;
    const tag = t ? t.tagName : "";
    const typing = tag === "TEXTAREA" || tag === "SELECT" ||
        (tag === "INPUT" && !/^(radio|checkbox)$/i.test(t.type)) || (t && t.isContentEditable);
    if (typing) return;
    const card = quizOutput.querySelector(".qa-card.is-current");
    if (!card) return;
    const item = generatedQuestions[parseInt(card.getAttribute("data-index"), 10) || 0];
    if (!item) return;
    const done = !!(quizResults[item.id] && quizResults[item.id].done);
    const key = ev.key;

    const radios = Array.prototype.slice.call(card.querySelectorAll('.mcq-options input[type="radio"]'));
    if (radios.length && !done && /^[1-6a-fA-F]$/.test(key)) {
        let n = /^[1-6]$/.test(key) ? parseInt(key, 10) - 1 : -1;
        if (n < 0) {
            const letter = key.toUpperCase();
            n = radios.findIndex(function (r) { return optionLetter(r.value) === letter; });
            if (n < 0) n = letter.charCodeAt(0) - 65;
        }
        if (radios[n]) {
            radios[n].checked = true;
            radios[n].focus({ preventScroll: true });
            ev.preventDefault();
            saveSession(); // keep the pick across a refresh, as a click would
        }
        return;
    }
    if (key === "Enter") {
        if (tag === "BUTTON" || tag === "A" || tag === "SUMMARY") return; // native activation
        if (done) {
            goNextQuestion();
            ev.preventDefault();
            return;
        }
        const check = card.querySelector(".check-mcq");
        if (check && radios.some(function (r) { return r.checked; })) {
            check.click();
            ev.preventDefault();
        }
        return;
    }
    if (key === "n" || key === "N") {
        goNextQuestion();
        ev.preventDefault();
    }
});

document.addEventListener("studyboost:view", function (ev) {
    if (ev.detail && ev.detail.view === "practice") updatePracticeBand();
});

// --- P0: study streak (consecutive days) ---
const STREAK_KEY = "studyBoostStreakV1";
// Days are the student's own calendar days (HomeSummary.localDay), not UTC dates.
function todayKey() {
    return window.HomeSummary.localDay(new Date());
}

function bumpStreak() {
    const today = todayKey();
    let s = {};
    try { s = JSON.parse(localStorage.getItem(STREAK_KEY)) || {}; } catch (e) { s = {}; }
    const last = window.HomeSummary.carryDay(s.lastDay, today); // a key saved in UTC days
    if (last === today) {                                       // already counted today
        if (s.lastDay !== today) {
            s.lastDay = today;
            try { localStorage.setItem(STREAK_KEY, JSON.stringify(s)); } catch (e) { /* storage full */ }
        }
        return s.count || 1;
    }
    const yesterday = window.HomeSummary.addDays(today, -1);
    s.count = last === yesterday ? (s.count || 0) + 1 : 1;
    s.lastDay = today;
    try { localStorage.setItem(STREAK_KEY, JSON.stringify(s)); } catch (e) { /* storage full */ }
    return s.count;
}

// --- P1: XP, level, and daily progress (flat values, no clever formulas) ---
const XP_KEY = "studyBoostXpV1";
const DAILY_KEY = "studyBoostDailyV1";
const XP_PER_LEVEL = 100;

function getXp() {
    try { return parseInt(localStorage.getItem(XP_KEY), 10) || 0; } catch (e) { return 0; }
}
function addXp(amount) {
    const total = getXp() + amount;
    try { localStorage.setItem(XP_KEY, String(total)); } catch (e) { /* storage full */ }
    return total;
}
function levelInfo(total) {
    return {
        level: Math.floor(total / XP_PER_LEVEL) + 1,
        toNext: XP_PER_LEVEL - (total % XP_PER_LEVEL)
    };
}
function getDaily() {
    const today = todayKey();
    let d = {};
    try { d = JSON.parse(localStorage.getItem(DAILY_KEY)) || {}; } catch (e) { d = {}; }
    if (d.day && window.HomeSummary.carryDay(d.day, today) === today) d.day = today; // saved under UTC
    if (d.day !== today) d = { day: today, questions: 0, reviews: 0, xp: 0 };
    return d;
}
function bumpDaily(fields) {
    const d = getDaily();
    d.questions += fields.questions || 0;
    d.reviews += fields.reviews || 0;
    d.xp += fields.xp || 0;
    try { localStorage.setItem(DAILY_KEY, JSON.stringify(d)); } catch (e) { /* storage full */ }
    return d;
}

// --- v2 #2: mastery GROWTH payoff on the completion screen ---
// Mastery is the *growth* signal (XP is the reward). We surface the practiced
// topic's level movement at the motivation peak instead of burying it in Progress.
const MASTERY_RANK = { new: 0, developing: 1, proficient: 2, mastered: 3 };
const MASTERY_LABEL = { new: "New", developing: "Developing", proficient: "Proficient", mastered: "Mastered" };

// Current mastery for a (subject, topic): { level, stat } or null if model absent.
function currentMastery(subject, topic) {
    if (!window.MasteryModel) return null;
    const stat = window.MasteryModel.getTopicStat(masteryMap, subject, topic);
    return { level: window.MasteryModel.masteryLevel(stat), stat: stat };
}

// Snapshot, before any grading, the level of every skill this set practises, so the
// completion screen can show real movement. Only items with a topic (a tagged skill or
// a topic the questions are really about) are skills; general course practice is not.
function setTopics() {
    const seen = {};
    const out = [];
    generatedQuestions.forEach(function (q) {
        const topic = String(q.topic || "").trim();
        if (!topic) return;
        const key = (q.subject || "") + "::" + topic.toLowerCase();
        if (seen[key]) return;
        seen[key] = true;
        out.push({ key: key, subject: q.subject || "", topic: topic });
    });
    return out;
}

function snapshotSetMastery() {
    const levels = {};
    setTopics().forEach(function (t) {
        const cur = currentMastery(t.subject, t.topic);
        levels[t.key] = cur && cur.stat && cur.stat.attempts ? cur.level : "new";
    });
    preSetMastery = { levels: levels };
}

// The completion screen's learning line. It never turns a set into a verdict about a
// whole course: per skill it says what happened in this set, how much evidence there is
// in total, and the current estimate (moved up only by questions tagged with that skill).
function masteryGrowthHtml() {
    if (!window.MasteryModel) return "";
    const levels = (preSetMastery && preSetMastery.levels) || {};
    const here = {};
    generatedQuestions.forEach(function (q) {
        const r = quizResults[q.id];
        const topic = String(q.topic || "").trim();
        if (!r || !r.done || !topic) return;
        const key = (q.subject || "") + "::" + topic.toLowerCase();
        here[key] = here[key] || { subject: q.subject || "", topic: topic, n: 0, right: 0 };
        here[key].n += 1;
        if (r.correct) here[key].right += 1;
    });
    const rows = Object.keys(here).map(function (k) { return here[k]; })
        .sort(function (a, b) { return b.n - a.n || a.topic.localeCompare(b.topic); });
    if (!rows.length) {
        const subject = (currentSetMeta && currentSetMeta.subject) || "this course";
        return '<p class="cc-growth">This was general ' + escapeHtml(subject) +
            " practice, so no skill estimate changed. Pick a topic to track a skill.</p>";
    }
    let html = '<ul class="cc-skills">';
    rows.slice(0, 4).forEach(function (row) {
        const cur = currentMastery(row.subject, row.topic);
        const stat = cur && cur.stat;
        const before = levels[(row.subject || "") + "::" + row.topic.toLowerCase()] || "new";
        const after = cur ? cur.level : "new";
        const rose = (MASTERY_RANK[after] || 0) > (MASTERY_RANK[before] || 0);
        html += "<li" + (rose ? ' class="is-up"' : "") + "><strong>" + escapeHtml(row.topic) + "</strong>: " +
            row.right + " of " + row.n + " right in this set" +
            (stat && stat.attempts ? " · " + stat.attempts + " graded so far, " + stat.correct + " right" : "") +
            " · estimate: " + (rose ? MASTERY_LABEL[before] + " &rarr; " : "") + MASTERY_LABEL[after] + "</li>";
    });
    html += "</ul>";
    if (rows.length > 4) html += '<p class="hint">' + (rows.length - 4) + " more skills are on the Progress page.</p>";
    return html;
}

// B2: render a "Share feedback" anchor when a feedback form URL is configured;
// returns "" otherwise so callers never show a dead link to beta users.
function feedbackLinkHtml(cls, label) {
    if (!FEEDBACK_FORM_URL) return "";
    return '<a href="' + escapeHtml(FEEDBACK_FORM_URL) + '" target="_blank" rel="noopener"' +
        (cls ? ' class="' + cls + '"' : "") + ">" + escapeHtml(label || "Share feedback") + "</a>";
}

// Growth loop: a shareable one-liner about the set the student just finished.
// Contains only their own score/level/streak — no personal data, no anonymous id.
function buildShareText(stats) {
    const subject = sanitizeText(stats.subject || "");
    const what = subject ? subject + " practice" : "AP practice";
    let line = "I just scored " + stats.correct + "/" + stats.total + " on " + what +
        " — Level " + stats.level;
    if (stats.streak > 1) line += ", " + stats.streak + "-day streak";
    return line + ". StudyBoost turns your notes into adaptive AP practice with spaced repetition.";
}

// Briefly swap a button's label to confirm an action, then restore it.
function flashLabel(btn, message) {
    if (!btn) return;
    const original = btn.textContent;
    btn.textContent = message;
    btn.disabled = true;
    setTimeout(function () {
        btn.textContent = original;
        btn.disabled = false;
    }, 2000);
}

// Share via the native sheet where available (mobile), else copy to the clipboard.
// A cancelled share is a normal outcome, not an error, so it stays silent.
async function shareProgress(btn) {
    const url = window.location.origin + "/";
    const text = lastShareText || "StudyBoost turns your notes into adaptive AP practice.";
    if (typeof navigator.share === "function") {
        try {
            await navigator.share({ title: "StudyBoost", text: text, url: url });
            return;
        } catch (e) {
            if (e && e.name === "AbortError") return; // user dismissed the sheet
            // otherwise fall through to the clipboard path
        }
    }
    const payload = text + " " + url;
    try {
        await navigator.clipboard.writeText(payload);
        flashLabel(btn, "Copied — paste it anywhere");
        return;
    } catch (e) {
        // Clipboard API missing or permission denied — fall back below.
    }
    flashLabel(btn, legacyCopy(payload) ? "Copied — paste it anywhere" : "Press Ctrl+C to copy");
}

// Pre-Clipboard-API copy path: select the text in an offscreen textarea and let
// execCommand copy it. If that fails too, the textarea is deliberately LEFT in the
// DOM, focused and selected, so the "Press Ctrl+C" prompt is actually true; it is
// cleaned up shortly after.
function legacyCopy(payload) {
    const ta = document.createElement("textarea");
    ta.value = payload;
    ta.setAttribute("readonly", "");
    ta.setAttribute("aria-hidden", "true");
    ta.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0";
    document.body.appendChild(ta);
    let ok = false;
    try {
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, payload.length);
        ok = document.execCommand("copy");
    } catch (e) {
        ok = false;
    }
    if (ok) {
        document.body.removeChild(ta);
    } else {
        setTimeout(function () {
            if (ta.parentNode) ta.parentNode.removeChild(ta);
        }, 8000);
    }
    return ok;
}

// --- P0: completion — the result sequence, built once a set is fully graded ---
// The bookkeeping (set XP, streak) happens the moment the last answer is graded, so it
// counts even if the student never opens the results. The card itself waits until the
// student asks for it, so the last explanation can be read first.
function maybeShowCompletion() {
    const total = generatedQuestions.length;
    if (!total) return;
    if (scoreSummary().answered !== total) return;          // not finished yet
    enterCompletionMode();
}

// The result poster's ring: one numbered dot per question of the set, in order from the
// top, filled by its real result (right / not yet). Decorative: the list below says the same.
function resultRingSvg() {
    const n = generatedQuestions.length;
    if (!n) return "";
    const c = 100, r = 82;
    const dot = n > 10 ? 8 : n > 7 ? 10 : 12;
    let h = '<svg class="cc-ring" viewBox="0 0 200 200" aria-hidden="true" focusable="false">';
    h += '<circle class="cc-ring-line" cx="100" cy="100" r="' + r + '"/>';
    h += '<circle class="cc-ring-core" cx="100" cy="100" r="38"/>';
    generatedQuestions.forEach(function (q, i) {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        const x = (c + r * Math.cos(a)).toFixed(1);
        const y = (c + r * Math.sin(a)).toFixed(1);
        const ok = !!(quizResults[q.id] && quizResults[q.id].correct);
        h += '<g class="cc-ring-dot ' + (ok ? "is-ok" : "is-miss") + '" style="--i:' + i + '">' +
            '<circle cx="' + x + '" cy="' + y + '" r="' + dot + '"/>' +
            '<text x="' + x + '" y="' + y + '" dy=".36em" text-anchor="middle">' + (i + 1) + "</text></g>";
    });
    return h + "</svg>";
}

function enterCompletionMode(savedStats) {
    if (document.getElementById("completionCard")) return;  // already built for this set
    const total = generatedQuestions.length;
    const s = scoreSummary();
    const wrong = s.answered - s.correct;
    // generated items answered incorrectly are auto-captured into the Mistake Log (SM-2)
    const added = generatedQuestions.filter(function (q) {
        const r = quizResults[q.id];
        return q.source !== "review" && r && r.done && !r.correct;
    }).length;
    // The bookkeeping runs once, when the last answer is graded. A set restored after a
    // refresh brings the numbers it earned then (savedStats) and counts nothing again.
    let streak, setXp, daily;
    if (savedStats) {
        streak = savedStats.streak;
        setXp = savedStats.setXp;
        daily = savedStats.daily;
    } else {
        streak = bumpStreak();
        // P1: set-completion XP bonus (+20), then read totals for display
        setXp = 20;
        generatedQuestions.forEach(function (q) {
            const r = quizResults[q.id];
            if (r && r.done) setXp += (r.correct ? 10 : 4) + (q.source === "review" ? 5 : 0);
        });
        addXp(20);
        const d = bumpDaily({ xp: 20 });
        daily = { questions: d.questions, reviews: d.reviews, xp: d.xp };
        completedStats = { streak: streak, setXp: setXp, daily: daily };
        saveSession();
    }
    const lvl = levelInfo(getXp());

    const card = document.createElement("section");
    card.id = "completionCard";
    card.className = "completion-card paper";
    card.hidden = true;
    card.setAttribute("aria-labelledby", "ccTitle");
    card.setAttribute("data-xp", String(setXp));
    const progress = window.HomeSummary ? window.HomeSummary.levelProgress(getXp(), XP_PER_LEVEL) : { pct: 0 };
    const meta = setMetaText();
    let html = "";
    html += '<div class="cc-result">';
    html += '<p class="kicker">' + escapeHtml(resultKicker()) + "</p>";
    html += '<h3 class="cc-title" id="ccTitle" tabindex="-1">' + (wrong === 0 ? "Perfect set." : "Set complete.") + "</h3>";
    html += '<p class="cc-score">' + resultRingSvg() + '<span class="cc-num" aria-hidden="true">' + s.correct + '<span class="cc-of"> / ' + total + "</span></span>" +
        '<span class="sr-only">' + s.correct + " of " + total + " right</span></p>";
    html += "</div>";
    html += '<div class="cc-reward">';
    html += '<p class="cc-xp">+<span id="ccXp">' + setXp + "</span> XP</p>";
    html += '<p class="cc-level">Level ' + lvl.level + " · " + lvl.toNext + " XP to Level " + (lvl.level + 1) + "</p>";
    html += '<span class="bar-track"><span class="bar-fill" style="width:' + progress.pct + '%"></span></span>';
    html += "</div>";

    // Learning first: what changed for each skill, and what was saved for review.
    html += '<div class="cc-detail">';
    html += masteryGrowthHtml(); // per-skill evidence, never a course-level claim
    html += "<p>" + (wrong === 0
        ? "Perfect set — nothing to review."
        : added + (added === 1 ? " question" : " questions") + " added to your review queue.") + "</p>";
    html += "</div>";

    // What to do about the ones that did not land.
    const missed = [];
    generatedQuestions.forEach(function (q, i) {
        const r = quizResults[q.id];
        if (r && r.done && !r.correct) missed.push({ q: q, i: i });
    });
    const missedRecord = function (m) {
        return m.q.errId ? findErrorRecord(m.q.errId)
            : errorRecords.find(function (r) { return r.sourceId === m.q.id; });
    };

    // One next step, chosen from the student's own data: a similar question on something
    // just missed (when one can be made), else the reviews due now, else another set.
    const similarTo = missed.map(missedRecord).find(function (rec) { return rec && canPracticeSimilar(rec); });
    const dueNow = window.ReviewOrbit ? window.ReviewOrbit.queueOrder(reviewItems()).length : 0;
    html += '<div class="actions cc-next">';
    if (similarTo) {
        html += '<button type="button" data-action="open-mistake" data-id="' + escapeHtml(similarTo.id) + '">Practice a similar question</button>';
        html += '<p class="cc-next-why">On ' + escapeHtml(similarTo.topic || "a question you just missed") + ", a new question on the same idea.</p>";
    } else if (dueNow) {
        html += '<button type="button" data-action="queue-start">Review due mistakes (' + dueNow + ")</button>";
        html += '<p class="cc-next-why">' + (wrong ? "Including the ones you just missed. " : "") + "One at a time: recall, show the answer, rate.</p>";
    } else {
        html += '<button type="button" data-action="new-set">Start a new set</button>';
    }
    html += "</div>";

    if (missed.length) {
        html += '<div class="cc-missed"><h4>Worth another look</h4><ul class="cc-missed-list">';
        missed.forEach(function (m) {
            const rec = missedRecord(m);
            html += "<li>";
            html += '<span class="cc-missed-q"><b>' + (m.i + 1) + ".</b> " + escapeHtml(snippetOf(m.q.question, 110)) + "</span>";
            html += '<span class="cc-missed-actions">';
            html += '<button type="button" class="outline small" data-goto="' + m.i + '">See the answer</button>';
            if (rec && canPracticeSimilar(rec) && rec !== similarTo) {
                html += '<button type="button" class="small" data-action="open-mistake" data-id="' + escapeHtml(rec.id) + '">Practice similar</button>';
            }
            html += "</span></li>";
        });
        html += "</ul></div>";
    }

    // The sequence: every question in order with its result. Plain words, never a red X.
    html += '<ol class="cc-sequence" aria-label="Your answers, in order">';
    generatedQuestions.forEach(function (q, i) {
        const ok = !!(quizResults[q.id] && quizResults[q.id].correct);
        html += '<li class="cc-step ' + (ok ? "is-ok" : "is-miss") + '" style="--i:' + Math.min(i, 12) + '">' +
            '<span class="cc-step-num">' + (i + 1) + "</span>" +
            '<span class="cc-step-state">' + (ok ? "Right" : "Not yet") + "</span>" +
            '<span class="cc-step-q">' + escapeHtml(snippetOf(q.question, 96)) + "</span>" +
            "</li>";
    });
    html += "</ol>";

    html += '<div class="actions cc-actions">';
    if (similarTo && dueNow) html += '<button type="button" class="secondary" data-action="queue-start">Review due mistakes (' + dueNow + ")</button>";
    if (similarTo || dueNow) html += '<button type="button" class="secondary" data-action="new-set">Start a new set</button>';
    html += '<button type="button" class="secondary" data-action="view-progress">View Progress</button>';
    html += '<button type="button" class="outline" data-action="show-questions">Show the questions</button>';
    html += "</div>";
    html += '<p class="cc-today">Today: ' + daily.questions + " questions · " + daily.reviews + " reviews · +" + daily.xp + " XP · Streak: Day " + streak + "</p>";
    // Growth loop: sharing sits on its own line so it never competes with the
    // learning actions above it, but is still offered at the motivation peak.
    lastShareText = buildShareText({
        correct: s.correct,
        total: total,
        level: lvl.level,
        streak: streak,
        subject: (currentSetMeta && currentSetMeta.subject) || subjectLabelFromId(apSubjectInput.value)
    });
    html += '<p class="share-line"><button type="button" class="outline" data-action="share-progress">Share my progress</button></p>';
    const fb = feedbackLinkHtml("feedback-link");
    if (fb) html += '<p class="feedback-line">' + fb + " — 1 minute, helps StudyBoost improve.</p>";
    card.innerHTML = html;

    quizOutput.appendChild(card);
    typesetMath(card);
    updateScoreBanner();
    refreshQuestionNav();
    refreshHud();
}

// Show the result sequence. Nothing waits on the animation: the numbers are in the DOM
// from the start, and the reveal only plays when motion is allowed.
function showResults() {
    if (!document.getElementById("completionCard")) maybeShowCompletion();
    const card = document.getElementById("completionCard");
    if (!card) return;
    resultsShown = true;
    card.hidden = false;
    quizOutput.querySelectorAll(".qa-card").forEach(function (c) { c.hidden = true; c.classList.remove("is-current"); });
    const sb = document.getElementById("scoreBanner");
    if (sb) sb.hidden = true;
    setPracticeMode();
    card.scrollIntoView({ behavior: motionBehavior(), block: "start" });
    const title = card.querySelector(".cc-title");
    if (title) title.focus({ preventScroll: true });
    if (!card.hasAttribute("data-counted") && window.Shell) {
        card.setAttribute("data-counted", "1");
        window.Shell.countUp(document.getElementById("ccXp"), parseInt(card.getAttribute("data-xp"), 10) || 0);
    }
}

function hideResults() {
    const card = document.getElementById("completionCard");
    if (card) card.hidden = true;
    resultsShown = false;
    const sb = document.getElementById("scoreBanner");
    if (sb) sb.hidden = false;
    setPracticeMode();
}

function findQuestionCard(qid) {
    if (typeof qid !== "string") return null;
    const esc = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(qid) : qid;
    return quizOutput.querySelector("[data-qid=\"" + esc + "\"]");
}

// After grading, mark the right option and the wrong pick directly in the list.
function markMcqOptions(card, item) {
    card.querySelectorAll(".mcq-options label").forEach(function (label) {
        const input = label.querySelector("input");
        if (!input) return;
        if (isMcqAnswerCorrect(input.value, item.answer)) label.classList.add("is-answer");
        else if (input.checked) label.classList.add("is-wrong");
    });
}

// Reveal the model answer for a question (only called after check/submit).
function revealAnswer(card, qid) {
    if (!card) return;
    const ab = card.querySelector('[data-answer="' + cssEscape(qid) + '"]');
    if (ab) ab.hidden = false;
}

// Reveal the remediation explanation — only called after an INCORRECT response.
function revealExplanation(card, qid) {
    if (!card) return;
    const ex = card.querySelector('[data-explanation="' + cssEscape(qid) + '"]');
    if (ex) ex.hidden = false;
}

// R1: map a grade to an SM-2 quality (coarse: correct=got, incorrect=forgot).
function gradeToQuality(correct) {
    const Q = (window.ReviewSystem && window.ReviewSystem.QUALITY) || { got: 5, forgot: 2 };
    return correct ? Q.got : Q.forgot;
}

// Feedback after a check, in layers: the result, what was picked against the answer, where
// the reasoning is, and what happens to the question next. Only facts the app has.
function mcqFeedbackText(item, ok) {
    if (ok) return "Correct.";
    const picked = optionLetter(item.userAnswer);
    const answer = optionLetter(item.answer);
    const which = picked && answer ? "You chose " + picked + "; the answer is " + answer + "."
        : "The correct answer is marked.";
    const why = item.explanation ? " The explanation below shows the step that matters." : "";
    const next = item.source === "review"
        ? " It comes back sooner on your review schedule."
        : " Saved to your review queue.";
    return "Not quite. " + which + why + next;
}

// R1: close the adaptive loop after a grade.
//  - a resurfaced REVIEW item feeds its result back into SM-2 (reschedule);
//  - an incorrect GENERATED item is auto-captured into the review pipeline.
function applyGradeOutcome(item, correct) {
    if (!item) return;
    if (item.source === "review" && item.errId && window.ReviewSystem) {
        reviewMistake(item.errId, gradeToQuality(correct));
    } else if (!correct && item.source !== "review") {
        addErrorRecord(item.id);
    }
}

function handleQuizClick(ev) {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;

    const saveId = t.getAttribute("data-id");
    const saveAction = t.getAttribute("data-action");
    if (saveAction === "save-error" && saveId) {
        addErrorRecord(saveId);
        return;
    }

    // Moving around the set: the set bar's cells, Previous / Next, and the results.
    if (t.hasAttribute("data-goto")) {
        const goto = parseInt(t.getAttribute("data-goto"), 10) || 0;
        if (resultsShown) hideResults();
        showQuestion(goto, true);
        return;
    }
    if (saveAction === "q-prev") {
        showQuestion(practiceIndex - 1, true);
        return;
    }
    if (saveAction === "q-next") {
        goNextQuestion();
        return;
    }
    if (saveAction === "show-results") {
        showResults();
        return;
    }
    if (saveAction === "change-set") {
        togglePracticeSetup();
        return;
    }
    if (saveAction === "open-mistake" && saveId) {
        goToView("mistake/" + saveId);
        return;
    }
    if (saveAction === "queue-start") {
        startReviewQueue();
        return;
    }

    // Completion-screen actions
    if (saveAction === "show-questions") {
        hideResults();
        showQuestion(0, true);
        return;
    }
    if (saveAction === "view-progress") {
        goToView("progress"); // entering the view refreshes the stats
        return;
    }
    if (saveAction === "start-review") {
        const plan = window.PracticeSelection
            ? window.PracticeSelection.planPracticeSelection({ reviews: errorRecords })
            : { selected: [] };
        if (!plan.selected || !plan.selected.length) {
            quizStatus.textContent = "Nothing is due for review right now — great work.";
            return;
        }
        generatedQuestions = plan.selected.slice();
        quizResults = {};
        currentSetMeta = { subject: "", topic: "", difficulty: "", origin: "review" };
        renderQuestions();
        quizStatus.textContent = "Reviewing " + generatedQuestions.length +
            (generatedQuestions.length === 1 ? " item" : " items") + " due from your Mistake Log.";
        showQuestion(0, true);
        return;
    }
    if (saveAction === "share-progress") {
        shareProgress(t);
        return;
    }
    if (saveAction === "new-set") {
        // Back to the setup form. Misses from the finished set are already saved.
        generatedQuestions = [];
        quizResults = {};
        currentSetMeta = null;
        renderQuestions();
        quizStatus.textContent = "";
        const panel = document.getElementById("quiz-title");
        if (panel) panel.scrollIntoView({ behavior: motionBehavior(), block: "start" });
        const subj = document.getElementById("apSubjectInput");
        if (subj) setTimeout(function () { try { subj.focus(); } catch (e) { /* ignore */ } }, 350);
        return;
    }

    if (t.classList.contains("check-mcq")) {
        const qid = t.getAttribute("data-qid");
        const card = findQuestionCard(qid);
        if (!card) return;
        const sel = card.querySelector('input[name="mcq-' + cssEscape(qid) + '"]:checked');
        const fb = card.querySelector('[data-feedback="' + cssEscape(qid) + '"]');
        const item = generatedQuestions.find(function (x) { return x.id === qid; });
        if (!item || !fb) return;

        if (quizResults[qid] && quizResults[qid].done) {
            fb.hidden = false;
            fb.className = "feedback bad";
            fb.textContent = "Already graded — your first answer counts.";
            return;
        }

        if (!sel) {
            fb.hidden = false;
            fb.className = "feedback hint-only";
            fb.textContent = "Choose an option first.";
            return;
        }

        const ok = isMcqAnswerCorrect(sel.value, item.answer);
        item.userAnswer = sel.value; // saved with the mistake: the student's own answer
        quizResults[qid] = { done: true, correct: ok };
        fb.hidden = false;
        fb.className = ok ? "feedback ok" : "feedback bad";
        fb.textContent = mcqFeedbackText(item, ok);
        markMcqOptions(card, item);
        revealAnswer(card, qid);
        recordAttempt(item, ok);
        applyGradeOutcome(item, ok);
        if (!ok) revealExplanation(card, qid);
        maybeShowCompletion();
        afterGrade(card);
        return;
    }

    if (t.classList.contains("submit-sa")) {
        const qid = t.getAttribute("data-qid");
        const card = findQuestionCard(qid);
        if (!card) return;
        const ta = card.querySelector('[data-sa-input="' + cssEscape(qid) + '"]');
        const fb = card.querySelector('[data-feedback="' + cssEscape(qid) + '"]');
        const item = generatedQuestions.find(function (x) { return x.id === qid; });
        if (!item || !fb || !ta) return;

        if (quizResults[qid] && quizResults[qid].submitted) return;

        const answerText = sanitizeText(ta.value);
        if (!answerText) {
            fb.hidden = false;
            fb.className = "feedback hint-only";
            fb.textContent = "Type your answer first.";
            return;
        }

        // Lock the input and remember what the student wrote.
        ta.setAttribute("readonly", "readonly");
        ta.classList.add("locked");
        item.userAnswer = ta.value.trim();
        quizResults[qid] = Object.assign({}, quizResults[qid], { submitted: true });
        t.disabled = true;

        revealAnswer(card, qid);
        const sg = card.querySelector('[data-selfgrade="' + cssEscape(qid) + '"]');
        if (sg) sg.hidden = false;

        fb.hidden = false;
        fb.className = "feedback";
        fb.textContent = "Answer submitted — compare with the suggested answer, then grade yourself.";
        const firstGrade = sg ? sg.querySelector("button") : null;
        if (firstGrade) firstGrade.focus({ preventScroll: true });
        return;
    }

    if (t.classList.contains("self-correct") || t.classList.contains("self-wrong")) {
        const qid = t.getAttribute("data-qid");
        const isCorrect = t.getAttribute("data-correct") === "1";
        const card = findQuestionCard(qid);
        const fb = card ? card.querySelector('[data-feedback="' + cssEscape(qid) + '"]') : null;
        if (quizResults[qid] && quizResults[qid].done) {
            if (fb) {
                fb.hidden = false;
                fb.className = "feedback bad";
                fb.textContent = "Already graded — your first answer counts.";
            }
            return;
        }
        quizResults[qid] = { done: true, correct: isCorrect };
        const item = generatedQuestions.find(function (x) { return x.id === qid; });
        if (fb) {
            fb.hidden = false;
            fb.className = isCorrect ? "feedback ok" : "feedback bad";
            fb.textContent = isCorrect ? "Counted as correct." : "Counted as not yet right" +
                (item && item.explanation ? ". The explanation is below." : ".");
        }
        if (card) card.querySelectorAll(".self-correct, .self-wrong").forEach(function (b) { b.disabled = true; });
        recordAttempt(item, isCorrect);
        applyGradeOutcome(item, isCorrect);
        if (!isCorrect) revealExplanation(card, qid);
        maybeShowCompletion();
        afterGrade(card);
    }
}

quizOutput.addEventListener("click", handleQuizClick);

function readAttemptQueue() {
    try {
        const raw = localStorage.getItem(STORAGE_ATTEMPT_QUEUE);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function writeAttemptQueue(list) {
    try {
        localStorage.setItem(STORAGE_ATTEMPT_QUEUE, JSON.stringify(list.slice(-500)));
    } catch (e) {
        // storage full or unavailable — nothing else we can do offline
    }
}

function queueAttempt(payload) {
    const list = readAttemptQueue();
    if (payload.eventId && list.some(function (a) { return a.eventId === payload.eventId; })) return;
    list.push(payload);
    writeAttemptQueue(list);
}

// A random id per graded answer. The server stores one row per id, so an upload that is
// retried because its reply was lost is not counted twice. No personal data.
function newEventId() {
    try {
        if (window.crypto && typeof window.crypto.randomUUID === "function") return "ev-" + window.crypto.randomUUID();
    } catch (e) { /* fall through */ }
    return "ev-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
}

// Beta instrumentation: an opaque, anonymous per-browser id (no PII). Generated
// once and reused, so attempts can be grouped per user to measure outcomes.
function getOrCreateUserId() {
    try {
        let id = localStorage.getItem(STORAGE_USER_ID);
        if (!id) {
            id = "u-" + ((window.crypto && crypto.randomUUID)
                ? crypto.randomUUID()
                : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10));
            localStorage.setItem(STORAGE_USER_ID, id);
        }
        return id;
    } catch (e) {
        return null; // storage unavailable — attempt still records, just without an id
    }
}

// P3: portable backup of the learner's data so it survives browser-storage loss
// (iOS evicts localStorage after ~7 days; clearing site data wipes it too).
// Exports the durable, user-meaningful keys ONLY — NOT the offline attempt queue
// (transient; re-importing would double-submit) or the AI-reliability counters.
// Backups made before XP/streak were added simply lack those keys; restore skips
// missing keys, so an old backup never wipes the current device's level.
const BACKUP_KEYS = [
    STORAGE_KEY_ERRORS,   // mistake log + SM-2 schedule
    STORAGE_MASTERY,      // topic mastery
    STORAGE_USER_ID,      // anonymous id — kept so a restore on another device stays one user
    STORAGE_UI,           // UI prefs (harmless)
    XP_KEY,               // total XP -> level
    STREAK_KEY,           // { count, lastDay }; a stale lastDay resets naturally on next study
    DAILY_KEY             // today's missions; getDaily() resets it if the day has passed
];

function exportUserData() {
    // Store each key's RAW localStorage string verbatim. This round-trips both the
    // JSON-blob keys (mistakes/mastery/prefs) and the plain-string id key exactly,
    // with no parse/stringify that could drop a non-JSON value.
    const data = {};
    BACKUP_KEYS.forEach(function (k) {
        const raw = localStorage.getItem(k);
        if (raw !== null) {
            data[k] = raw;
        }
    });
    const payload = {
        app: "StudyBoost",
        type: "studyboost-backup",
        version: 2, // 2 = adds XP, streak, daily. Restore ignores this field.
        exportedAt: new Date().toISOString(),
        data: data
    };
    try {
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "studyboost-backup-" + todayKey() + ".json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        dataStatus.textContent = "Backup downloaded. Keep it safe — restore it anytime or on another device.";
    } catch (e) {
        dataStatus.textContent = "Could not create the backup file in this browser.";
    }
}

function importUserData(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function () {
        let parsed;
        try {
            parsed = JSON.parse(reader.result);
        } catch (e) {
            dataStatus.textContent = "That file isn't valid JSON.";
            return;
        }
        if (!parsed || parsed.type !== "studyboost-backup" || !parsed.data || typeof parsed.data !== "object") {
            dataStatus.textContent = "That file isn't a StudyBoost backup.";
            return;
        }
        // Replace (not merge) — clear, predictable; the main use is restoring lost data.
        const hasProgress = Object.prototype.hasOwnProperty.call(parsed.data, XP_KEY) ||
            Object.prototype.hasOwnProperty.call(parsed.data, STREAK_KEY);
        // Say what is in the file and what it replaces, before anything changes.
        let inBackup = null;
        try {
            const list = JSON.parse(parsed.data.studyBoostMistakesV2 || "null");
            if (Array.isArray(list)) inBackup = list.length;
        } catch (e) { /* unreadable list: counted as unknown */ }
        const made = parsed.exportedAt && !isNaN(new Date(parsed.exportedAt).getTime())
            ? new Date(parsed.exportedAt).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }) : "";
        const plural = function (n) { return n + (n === 1 ? " saved mistake" : " saved mistakes"); };
        const restoreMessage = "Backup" + (made ? " from " + made : "") +
            (inBackup === null ? "." : ": " + plural(inBackup) + ".") +
            " It replaces the mistake log (" + plural(errorRecords.length) + " here now)" +
            (hasProgress ? ", topic mastery, XP, and streak" : " and topic mastery") +
            " in this browser. Your Notes box, the practice set in progress, and answers waiting to upload stay as they are.";
        const confirmed = window.Shell
            ? await window.Shell.confirm({ title: "Restore this backup?", body: restoreMessage, confirmLabel: "Restore backup" })
            : window.confirm("Restore this backup? " + restoreMessage);
        if (!confirmed) {
            dataStatus.textContent = "Restore cancelled.";
            return;
        }
        try {
            BACKUP_KEYS.forEach(function (k) {
                // Values are stored verbatim as raw strings (see exportUserData).
                if (Object.prototype.hasOwnProperty.call(parsed.data, k) &&
                    typeof parsed.data[k] === "string") {
                    localStorage.setItem(k, parsed.data[k]);
                }
            });
        } catch (e) {
            dataStatus.textContent = "Could not save the restored data (browser storage may be full).";
            return;
        }
        // Re-hydrate in-memory state and re-render the affected sections.
        errorRecords = readErrorRecords();
        masteryMap = readMastery();
        sessionReviewedErrIds.clear();
        renderErrorRecords();
        refreshMistakeFilterOptions();
        renderTopicMastery();
        applyUIPrefs();
        dataStatus.textContent = "Backup restored.";
    };
    reader.onerror = function () { dataStatus.textContent = "Could not read that file."; };
    reader.readAsText(file);
}

// FR1/FR2/FR5: record a graded result. Always succeeds locally; syncs when possible.
function recordAttempt(item, correct) {
    if (!item) return;
    // P1: award XP and count today's progress for each graded question
    const isReview = item.source === "review";
    const gained = (correct ? 10 : 4) + (isReview ? 5 : 0);
    addXp(gained);
    bumpDaily({ questions: isReview ? 0 : 1, reviews: isReview ? 1 : 0, xp: gained });
    const payload = {
        subject: item.subject || subjectLabelFromId(apSubjectInput.value) || "Uncategorized",
        type: item.type || "Unknown",
        correct: !!correct,
        ts: new Date().toISOString(),
        // Beta: anonymous user + R1 provenance (review vs newly generated). The
        // server whitelists source and ignores unknown values.
        userId: getOrCreateUserId(),
        eventId: newEventId(),
        // new question, scheduled review of a saved mistake, or a similar question built from one
        source: item.source === "review" ? "review" : (item.source === "variant" ? "variant" : "generated")
    };
    sendAttempt(payload);

    // R2: fold this outcome into the topic-level mastery model. Additive and
    // independent of the attempt/SQLite path above — a failure here can't affect
    // grading. Topic comes from the item (stamped at finalizeSet / carried by the
    // planner for resurfaced reviews); subject matches what was recorded.
    if (window.MasteryModel) {
        masteryMap = window.MasteryModel.updateMastery(masteryMap, {
            subject: payload.subject,
            topic: item.topic,
            correct: !!correct,
            at: payload.ts,
            source: payload.source
        });
        saveMastery();
        renderTopicMastery(); // 2C: refresh the read-only panel after each graded outcome
    }
    refreshHud();
}

async function postAttempt(payload) {
    const res = await fetch("/api/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
}

async function sendAttempt(payload) {
    if (window.location.protocol === "file:" || !serverHealthy) {
        queueAttempt(payload);
        return;
    }
    try {
        await postAttempt(payload);
        flushAttemptQueue();
    } catch (e) {
        queueAttempt(payload);
    }
}

// Uploads answers saved while offline. One upload runs at a time (a second call joins it),
// and each answer leaves the queue only once the server has it, read fresh from storage, so
// an answer queued during the upload is never overwritten by an older copy of the queue.
let attemptFlush = null;
function flushAttemptQueue() {
    if (attemptFlush) return attemptFlush;
    attemptFlush = flushAttemptQueueOnce().finally(function () { attemptFlush = null; });
    return attemptFlush;
}

async function flushAttemptQueueOnce() {
    if (window.location.protocol === "file:" || !serverHealthy) return;
    const list = readAttemptQueue();
    if (!list.length) return;
    // Answers queued by older versions have no id yet: give them one before the first try.
    let named = false;
    list.forEach(function (a) {
        if (a && !a.eventId) { a.eventId = newEventId(); named = true; }
    });
    if (named) writeAttemptQueue(list);
    for (let i = 0; i < list.length; i++) {
        try {
            await postAttempt(list[i]);
        } catch (e) {
            return; // stop at the first failure; this answer and the rest stay queued
        }
        const sent = list[i].eventId;
        writeAttemptQueue(readAttemptQueue().filter(function (a) { return a.eventId !== sent; }));
    }
}

function computeLocalStats(queue) {
    const total = queue.length;
    const correctTotal = queue.reduce(function (n, a) { return n + (a.correct ? 1 : 0); }, 0);

    const subjMap = {};
    const dayMap = {};
    const sourceMap = {};
    queue.forEach(function (a) {
        const src = a.source === "generated" || a.source === "review" || a.source === "variant" ? a.source : "other";
        if (!sourceMap[src]) sourceMap[src] = { answered: 0, correct: 0 };
        sourceMap[src].answered++;
        sourceMap[src].correct += a.correct ? 1 : 0;
        const subj = a.subject || "Uncategorized";
        if (!subjMap[subj]) subjMap[subj] = { answered: 0, correct: 0 };
        subjMap[subj].answered++;
        subjMap[subj].correct += a.correct ? 1 : 0;

        const day = a.ts ? window.HomeSummary.localDay(a.ts) : "";
        if (day) {
            if (!dayMap[day]) dayMap[day] = { answered: 0, correct: 0 };
            dayMap[day].answered++;
            dayMap[day].correct += a.correct ? 1 : 0;
        }
    });

    const bySubject = Object.keys(subjMap).map(function (name) {
        const v = subjMap[name];
        return { subject: name, answered: v.answered, correct: v.correct, accuracy: v.answered ? v.correct / v.answered : 0 };
    }).sort(function (a, b) { return b.answered - a.answered; });

    const daily = [];
    const today = todayKey();
    for (let i = 13; i >= 0; i--) {
        const key = window.HomeSummary.addDays(today, -i);
        const e = dayMap[key] || { answered: 0, correct: 0 };
        daily.push({ date: key, answered: e.answered, correct: e.correct, accuracy: e.answered ? e.correct / e.answered : 0 });
    }

    const bySource = ["generated", "review", "variant", "other"].filter(function (k) { return sourceMap[k]; }).map(function (k) {
        const v = sourceMap[k];
        return { source: k, answered: v.answered, correct: v.correct, accuracy: v.answered ? v.correct / v.answered : 0 };
    });

    return {
        overall: { answered: total, correct: correctTotal, accuracy: total ? correctTotal / total : 0 },
        bySubject: bySubject,
        bySource: bySource,
        daily: daily
    };
}

function pct(x) {
    return Math.round((x || 0) * 100);
}

function accuracyClass(accuracy, answered) {
    if (!answered) return "acc-none";
    if (accuracy >= 0.8) return "acc-high";
    if (accuracy >= 0.5) return "acc-mid";
    return "acc-low";
}

// offline: null when the numbers came from the server just now; otherwise
// { syncedAt: ISO | null, pending: answers waiting on this device, live?: the read worked }.
function renderStats(data, offline) {
    const overall = data.overall || { answered: 0, correct: 0, accuracy: 0 };
    let html = "";

    if (offline) {
        const n = offline.pending || 0;
        const answers = n + (n === 1 ? " answer" : " answers");
        let note;
        if (offline.live) {
            note = answers + " saved on this device " + (n === 1 ? "hasn't" : "haven't") + " uploaded yet. " +
                (n === 1 ? "It's" : "They're") + " included here and will upload on the next try.";
        } else if (offline.syncedAt) {
            note = "Offline. These numbers are from your last sync (" + syncTimeText(offline.syncedAt) + ")" +
                (n ? ", plus " + answers + " saved on this device that will upload when the connection returns."
                   : ". Nothing new is waiting to upload.");
        } else {
            note = "Offline, and this device has no earlier sync to show. " + (n
                ? "These are only the " + answers + " saved on this device; they will upload when the connection returns."
                : "Answers you grade will show here.");
        }
        html += '<p class="stats-notice">' + escapeHtml(note) + "</p>";
    }

    if (window.HomeSummary && overall.answered) {
        html += '<p class="top-line">' + escapeHtml(window.HomeSummary.weekTopLine(data.daily, data.bySubject).text) + "</p>";
    }
    html += '<div class="stat-cards">';
    // No graded questions means no accuracy yet, which is not the same as 0%.
    html += '<div class="stat-card"><span class="stat-num">' + (overall.answered ? pct(overall.accuracy) + "%" : "–") + '</span><span class="stat-label">Overall accuracy</span></div>';
    html += '<div class="stat-card"><span class="stat-num">' + overall.answered + '</span><span class="stat-label">Questions answered</span></div>';
    html += '<div class="stat-card"><span class="stat-num">' + overall.correct + '</span><span class="stat-label">Correct</span></div>';
    html += "</div>";

    const bySubject = data.bySubject || [];
    html += "<h3>By subject</h3>";
    if (!bySubject.length) {
        html += '<p class="empty">No graded questions yet. Answer a quiz question to start tracking.</p>';
    } else {
        html += '<div class="subject-bars">';
        bySubject.forEach(function (s) {
            html += '<div class="subject-row">';
            html += '<span class="subject-name">' + escapeHtml(s.subject) + "</span>";
            html += '<span class="bar-track"><span class="bar-fill ' + accuracyClass(s.accuracy, s.answered) + '" style="width:' + pct(s.accuracy) + '%"></span></span>';
            html += '<span class="subject-meta">' + pct(s.accuracy) + "% (" + s.correct + "/" + s.answered + ")</span>";
            html += "</div>";
        });
        html += "</div>";
    }

    // Practice type: new questions, scheduled reviews of saved mistakes, and similar
    // questions built from mistakes are recorded separately.
    const bySource = data.bySource || [];
    if (bySource.length) {
        const SOURCE_LABEL = { generated: "New questions", review: "Reviews of saved mistakes", variant: "Similar questions", other: "Earlier (untagged)" };
        html += "<h3>By practice type</h3>";
        html += '<div class="subject-bars">';
        bySource.forEach(function (s) {
            html += '<div class="subject-row">';
            html += '<span class="subject-name">' + escapeHtml(SOURCE_LABEL[s.source] || s.source) + "</span>";
            html += '<span class="bar-track"><span class="bar-fill ' + accuracyClass(s.accuracy, s.answered) + '" style="width:' + pct(s.accuracy) + '%"></span></span>';
            html += '<span class="subject-meta">' + pct(s.accuracy) + "% (" + s.correct + "/" + s.answered + ")</span>";
            html += "</div>";
        });
        html += "</div>";
    }

    const daily = data.daily || [];
    const maxVol = daily.reduce(function (m, d) { return Math.max(m, d.answered); }, 0);
    html += "<h3>Last 14 days</h3>";
    if (!maxVol) {
        html += '<p class="empty">No graded questions in the last 14 days. Each day you practise adds a bar here.</p>';
    } else {
        html += '<p class="hint">Bar height and the number on it: questions answered that day (busiest day: ' + maxVol +
            "). Color: accuracy that day.</p>";
        html += '<ul class="trend-legend">' +
            '<li><i class="acc-high"></i>80% or higher</li>' +
            '<li><i class="acc-mid"></i>50 to 79%</li>' +
            '<li><i class="acc-low"></i>Under 50%</li>' +
            "</ul>";
        html += '<div class="trend" role="list" aria-label="Questions answered per day, last 14 days">';
        daily.forEach(function (d) {
            const heightPct = Math.max(6, Math.round((d.answered / maxVol) * 100));
            const title = d.date + ": " + d.answered + " answered" + (d.answered ? ", " + pct(d.accuracy) + "% correct" : "");
            const label = d.date.slice(5);
            html += '<div class="trend-col" role="listitem" data-tip="' + escapeHtml(title) + '" aria-label="' + escapeHtml(title) + '">';
            html += '<span class="trend-bar-wrap">';
            if (d.answered) {
                html += '<span class="trend-bar ' + accuracyClass(d.accuracy, d.answered) + '" style="height:' + heightPct + '%">' +
                    '<span class="trend-num">' + d.answered + "</span></span>";
            }
            html += "</span>";
            html += '<span class="trend-label">' + escapeHtml(label) + "</span>";
            html += "</div>";
        });
        html += "</div>";
    }

    statsOutput.innerHTML = html;
}

// A blank topicKey is the subject-general bucket; give it a readable label.
function topicDisplay(stat) {
    const label = (stat && typeof stat.topic === "string") ? stat.topic.trim() : "";
    return label || "General course practice";
}

// The course's general bucket mixes unrelated questions, so it is shown with its accuracy
// but never with a skill level ("Mastered" there would describe a whole course).
function isGeneralBucket(stat) {
    return !(stat && typeof stat.topic === "string" && stat.topic.trim());
}

// #6: hand-rolled SVG radar of topic mastery — no charting library (the project has
// no build chain). It's a gestalt complement to the bars below, which stay as the
// accessible, detailed view. Renders only with >=3 topics (a radar needs >=3 axes)
// and caps at the 8 most-practiced. Each axis radius = the topic's recent accuracy
// (ema), matching the bar percentages. Returns "" when there's too little to plot.
function masteryRadarSvg(topics) {
    const axes = (topics || []).slice(0, 8);
    const n = axes.length;
    // With fewer than 5 topics the "radar" is a triangle or a square that says less than
    // the bars below it, so it is left out.
    if (n < 5) return "";
    const cx = 180, cy = 120, R = 78, TAU = Math.PI * 2;
    const ptAt = function (i, radius) {
        const ang = -Math.PI / 2 + (i / n) * TAU;
        return [cx + radius * Math.cos(ang), cy + radius * Math.sin(ang)];
    };
    const polyPoints = function (radiusFn) {
        const out = [];
        for (let i = 0; i < n; i++) { const p = ptAt(i, radiusFn(i)); out.push(p[0].toFixed(1) + "," + p[1].toFixed(1)); }
        return out.join(" ");
    };
    let grid = "";
    [0.25, 0.5, 0.75, 1].forEach(function (frac) {
        grid += '<polygon class="radar-grid" points="' + polyPoints(function () { return R * frac; }) + '"/>';
    });
    let spokes = "", labels = "";
    for (let i = 0; i < n; i++) {
        const edge = ptAt(i, R);
        spokes += '<line class="radar-grid" x1="' + cx + '" y1="' + cy + '" x2="' + edge[0].toFixed(1) + '" y2="' + edge[1].toFixed(1) + '"/>';
        const ang = -Math.PI / 2 + (i / n) * TAU, dx = Math.cos(ang);
        const anchor = dx > 0.3 ? "start" : (dx < -0.3 ? "end" : "middle");
        const lp = ptAt(i, R + 12);
        const raw = topicDisplay(axes[i]);
        const short = raw.length > 20 ? raw.slice(0, 19) + "…" : raw;
        labels += '<text class="radar-label" x="' + lp[0].toFixed(1) + '" y="' + lp[1].toFixed(1) + '" text-anchor="' + anchor + '" dominant-baseline="middle">' + escapeHtml(short) + "</text>";
    }
    const dataPoly = '<polygon class="radar-shape" points="' + polyPoints(function (i) {
        return R * Math.max(0, Math.min(1, axes[i].ema || 0));
    }) + '"/>';
    const summary = axes.map(function (t) { return topicDisplay(t) + " " + Math.round((t.ema || 0) * 100) + "%"; }).join(", ");
    return '<div class="mastery-radar"><svg viewBox="0 0 360 240" width="100%" role="img" aria-label="Topic mastery radar: ' +
        escapeHtml(summary) + '">' + grid + spokes + dataPoly + labels + "</svg></div>";
}

// R2 Stage 2C: read-only Topic Mastery panel, scoped to the selected course.
// Single data source: MasteryModel.summarizeMastery. No writes; synchronous
// localStorage-backed state, so there is no loading state to show. Degrades to the
// empty message if the module is missing or the map is unusable (error state).
function renderTopicMastery() {
    if (!topicMasteryOutput) return;
    const emptyMsg = '<p class="empty">No topic mastery yet. Grade practice questions for this course to build it.</p>';

    if (!window.MasteryModel || !masteryMap || typeof masteryMap !== "object") {
        topicMasteryOutput.innerHTML = emptyMsg;
        return;
    }

    // Progress has its own course filter (it never changes the Practice course).
    const subjectLabel = subjectLabelFromId(masteryCourseInput ? masteryCourseInput.value : apSubjectInput.value);
    const summary = window.MasteryModel.summarizeMastery(masteryMap, { subject: subjectLabel });
    const topics = summary.topics || [];

    if (!topics.length) {
        topicMasteryOutput.innerHTML = emptyMsg;
        return;
    }

    // Topic Mastery levels are deliberately distinct from SM-2's new/learning/mastered.
    const LEVEL_LABEL = { "new": "New", developing: "Developing", proficient: "Proficient", mastered: "Mastered" };
    const masteredCount = topics.filter(function (t) {
        return !isGeneralBucket(t) && window.MasteryModel.masteryLevel(t) === "mastered";
    }).length;
    const totalGraded = topics.reduce(function (a, t) { return a + t.attempts; }, 0);
    const weakest = (summary.weakest || []).slice(0, 3); // top 3 weakest only

    let html = '<div class="review-stats">';
    html += '<div class="review-stat"><span class="rs-num">' + topics.length + '</span><span class="rs-label">Topics tracked</span></div>';
    html += '<div class="review-stat"><span class="rs-num">' + masteredCount + '</span><span class="rs-label">Mastered</span></div>';
    html += '<div class="review-stat"><span class="rs-num">' + totalGraded + '</span><span class="rs-label">Graded</span></div>';
    html += "</div>";

    if (weakest.length) {
        html += '<p class="hint">Focus next: ' + weakest.map(function (t) {
            return escapeHtml(topicDisplay(t)) + " (" + Math.round(t.ema * 100) + "%)";
        }).join(" · ") + "</p>";
    }

    html += masteryRadarSvg(topics); // #6: gestalt radar above the detailed bars (>=3 topics)

    html += '<div class="mastery-list">';
    topics.forEach(function (t) {
        const level = window.MasteryModel.masteryLevel(t);
        const pct = Math.round(t.ema * 100);
        const rank = isGeneralBucket(t) ? 0 : (MASTERY_RANK[level] || 0);
        html += '<div class="mastery-row">';
        html += '<span class="mastery-topic">' + escapeHtml(topicDisplay(t)) + "</span>";
        html += isGeneralBucket(t)
            ? '<span class="tag">No skill level</span>'
            : '<span class="tag mastery-' + level + '">' + (LEVEL_LABEL[level] || level) + "</span>";
        html += '<span class="rank-pips" aria-hidden="true">' + [1, 2, 3].map(function (n) {
            return "<i" + (n <= rank ? ' class="on"' : "") + "></i>";
        }).join("") + "</span>";
        html += '<div class="mastery-meter">';
        html += '<span class="bar-track" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100" aria-label="' + escapeHtml(topicDisplay(t)) + ' mastery">';
        html += '<span class="bar-fill level-' + level + '" style="width:' + pct + '%"></span>';
        html += "</span>";
        html += '<span class="mastery-pct">' + pct + "%</span>";
        html += "</div>";
        const similar = t.sources && t.sources.variant ? t.sources.variant.attempts : 0;
        html += '<span class="mastery-meta">' + t.attempts + " graded, " + t.correct + " right" + (similar ? " · " + similar + " similar" : "") + "</span>";
        html += "</div>";
    });
    html += "</div>";

    topicMasteryOutput.innerHTML = html;
}

// The last stats the server returned, kept so Progress doesn't drop to the local queue
// (often 0) when the connection drops. Counts only, for this browser's own id; a cache,
// not backed up.
const STATS_CACHE_KEY = "studyBoostStatsCacheV1";
function readStatsCache(uid) {
    try {
        const c = JSON.parse(localStorage.getItem(STATS_CACHE_KEY));
        if (c && c.userId === uid && c.data && c.data.overall && typeof c.at === "string") return c;
    } catch (e) { /* unreadable: no cache */ }
    return null;
}
function writeStatsCache(uid, data) {
    try { localStorage.setItem(STATS_CACHE_KEY, JSON.stringify({ at: new Date().toISOString(), userId: uid, data: data })); } catch (e) { /* storage full */ }
}
function syncTimeText(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "earlier";
    const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return window.HomeSummary.localDay(d) === todayKey() ? "today, " + time
        : d.toLocaleDateString([], { month: "short", day: "numeric" }) + ", " + time;
}

// FR3/FR4: load and render stats. Offline: the last synced stats plus the answers still
// queued on this device (FR5), each said for what it is.
async function loadStats() {
    statsStatus.textContent = "Loading progress...";
    await flushAttemptQueue();

    // Progress is per-user: scope the request to this browser's anonymous id.
    // If storage is unavailable (no id), fall back to the local-queue view rather
    // than requesting global data.
    // Before the connection check finishes, wait for it (fetchHealth calls loadStats again)
    // rather than flash "Offline".
    if (!healthReady && window.location.protocol !== "file:") return;
    const uid = getOrCreateUserId();
    const showOffline = function () {
        const queue = readAttemptQueue();
        const local = computeLocalStats(queue);
        const cached = uid ? readStatsCache(uid) : null;
        renderStats(cached ? window.HomeSummary.mergeStats(cached.data, local, todayKey()) : local,
            { syncedAt: cached ? cached.at : null, pending: queue.length });
        statsStatus.textContent = cached ? "Offline: showing your last synced progress." : "Offline: showing answers saved on this device.";
    };
    if (window.location.protocol === "file:" || !serverHealthy || !uid) {
        showOffline();
        return;
    }

    try {
        // tz: the student's UTC offset in minutes, so days end at their own midnight.
        const tz = -new Date().getTimezoneOffset();
        const res = await fetch("/api/stats?userId=" + encodeURIComponent(uid) + "&tz=" + tz);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        if (!data || !data.overall) throw new Error("bad stats");
        writeStatsCache(uid, data);
        const queue = readAttemptQueue(); // only if an upload failed while the read worked
        if (queue.length) {
            renderStats(window.HomeSummary.mergeStats(data, computeLocalStats(queue), todayKey()), { live: true, pending: queue.length });
            statsStatus.textContent = "Some answers haven't uploaded yet; they're included below.";
        } else {
            renderStats(data, null);
            statsStatus.textContent = "Progress up to date.";
        }
    } catch (e) {
        showOffline();
    }
}

async function generateQuiz() {
    const topic = sanitizeText(topicInput.value);
    const difficulty = difficultyInput.value;
    const expected = parseFormat(questionFormatInput.value);
    const apId = apSubjectInput.value;
    const subjectLabel = subjectLabelFromId(apId);
    const ctx = getQuizNotesContext();
    const notesCtx = ctx.text;

    // R1: lead the set with due review items (additive, cap 3), then fill with new.
    // A strict "only this topic" set takes only the due reviews on that topic; the others
    // stay in Review and the set bar points to them.
    const PS = window.PracticeSelection;
    const strictTopic = !!topic && topicFillValue() === "only";
    const reviewPlan = PS
        ? PS.planPracticeSelection({
            reviews: errorRecords, subject: subjectLabel,
            keep: strictTopic ? function (r) { return PS.recordMatchesRequest(r, topic, apId); } : null
        })
        : { selected: [], metadata: {} };
    const reviewItems = reviewPlan.selected;
    const heldBack = (reviewPlan.metadata && reviewPlan.metadata.heldBack) || 0;
    const heldBackText = heldBack
        ? " " + heldBack + (heldBack === 1 ? " due review on another topic is" : " due reviews on other topics are") + " waiting in Review."
        : "";
    const finalizeSet = function (newItems) {
        // R2: stamp topic identity so graded outcomes can feed topic-level mastery.
        const topicKey = window.MasteryModel ? window.MasteryModel.normalizeTopicKey(topic) : "";
        (newItems || []).forEach(function (q) {
            q.subject = subjectLabel || "Uncategorized";
            q.source = "generated";
            q.reason = "generator:new";
            // Bank items say where their result counts (the request, their own tagged skill,
            // or the course's general bucket); AI items were written for the request.
            if (typeof q.assignedTopic === "string") {
                q.topic = q.assignedTopic;
                q.topicKey = window.MasteryModel ? window.MasteryModel.normalizeTopicKey(q.assignedTopic) : "";
                delete q.assignedTopic;
            } else {
                q.topic = topic || "";
                q.topicKey = topicKey;
            }
            q.difficulty = difficulty; // similar-question practice starts from the original's level
        });
        // De-bias MCQ option positions (no more "always A") for the whole set.
        return reviewItems.concat(newItems || []).map(function (q) {
            return (q && q.type === "Multiple Choice") ? shuffleMcqOptions(q) : q;
        });
    };

    if (expected.mcq + expected.sa < 1) {
        quizStatus.textContent = "Choose a format with at least one question.";
        return;
    }

    // A new set replaces the one in progress, so say so first.
    if (generatedQuestions.length && !isSetComplete()) {
        const done = scoreSummary().answered;
        const message = "Your current set has " + done + " of " + generatedQuestions.length +
            " answered. Answers you already checked stay saved; the rest of that set will be replaced.";
        const ok = window.Shell
            ? await window.Shell.confirm({ title: "Start a new set?", body: message, confirmLabel: "Start new set" })
            : window.confirm("Start a new set? " + message);
        if (!ok) {
            quizStatus.textContent = "Kept your current set.";
            return;
        }
    }

    const ctxLabel =
        ctx.source === "textarea" ? "your notes" :
        ctx.source === "summary" ? "your last summary" :
        "the course and topic";
    // Only the AI reads notes; offline the set comes from the built-in bank.
    quizStatus.textContent = canUseLiveAI() ? "Generating questions from " + ctxLabel + "..." : "Picking questions from the built-in bank...";
    // Nothing is reset here: installSet swaps sets only once the new questions exist.
    // Skill levels before grading are snapshotted in renderQuestions (snapshotSetMastery).
    const keptNote = generatedQuestions.length ? " Your current set is unchanged." : "";


    const tryDemo = async function (reason) {
        let loaded = !!window.OFFLINE_BANK;
        if (!loaded) {
            quizStatus.textContent = "Loading the built-in questions...";
            quizBtn.setAttribute("aria-busy", "true");
            try { loaded = await ensureQuestionBank(); } finally { quizBtn.removeAttribute("aria-busy"); }
        }
        if (!loaded) {
            quizStatus.textContent = reason + " The built-in question bank didn't load. Check your connection, then try again." + keptNote;
            return;
        }
        const onlyMatching = strictTopic;
        const demo = createMockQuestions(topic, apId, difficulty, expected, onlyMatching);
        if (demo && !demo.length && onlyMatching) {
            if (reviewItems.length) {
                installSet(reviewItems.slice(), { subject: subjectLabel, topic: topic, difficulty: "", origin: "review", heldBack: heldBack });
                quizStatus.textContent = "No new built-in " + subjectLabel + " questions at this level are about “" + topic +
                    "”, so this set is your " + reviewItems.length + " due " + (reviewItems.length === 1 ? "review" : "reviews") + " on it." + heldBackText;
                return;
            }
            quizStatus.textContent = "No built-in " + subjectLabel + " questions at this level are about “" + topic +
                "”. Choose “Fill the set with other questions from the course”, another level, or another topic." + keptNote;
            return;
        }
        if (!demo || !demo.length) {
            if (reviewItems.length) {
                installSet(reviewItems.slice(), { subject: subjectLabel, topic: topic, difficulty: "", origin: "review", heldBack: heldBack });
                quizStatus.textContent = reason + " There's no built-in bank for " + subjectLabel +
                    " — showing " + reviewItems.length + " review(s) due instead." + heldBackText;
            } else {
                quizStatus.textContent = reason + " There's no built-in bank for " + subjectLabel +
                    " yet — add an API key for AI questions, or try a course like " +
                    "AP Calculus AB or AP Biology." + keptNote;
            }
            return;
        }
        const onTopic = demo.filter(function (q) { return q.onTopic; }).length;
        const skillName = demo.requestedSkill ? demo.requestedSkill.name : topic;
        const set = finalizeSet(demo);
        const fresh = set.filter(function (q) { return q.source !== "review"; });
        const otherSkills = fresh.filter(function (q) { return !q.onTopic && q.topic; }).length;
        installSet(set, {
            subject: subjectLabel, topic: onTopic ? skillName : "", difficulty: difficulty, origin: "bank",
            requestedTopic: topic, onTopic: onTopic, otherSkills: otherSkills, general: demo.length - onTopic - otherSkills,
            heldBack: heldBack
        });
        const demoNew = demo.length;
        const asked = expected.mcq + expected.sa;
        quizStatus.textContent = reason + " Showing " + demoNew + " new from the built-in bank" +
            (reviewItems.length ? " + " + reviewItems.length + " due review." : ".") +
            (demoNew < asked ? " The bank has " + demoNew + " at this level for this format, not " + asked + "." : "") +
            (topic ? " " + topicCoverageText(skillName, subjectLabel, onTopic, otherSkills, demoNew - onTopic - otherSkills) : "") +
            heldBackText +
            (notesCtx ? " Built-in questions don't use your notes." : "");
    };

    if (!healthReady) {
        quizStatus.textContent = "Still checking connection — try again in a moment.";
        return;
    }

    if (!canUseLiveAI()) {
        const reason = !serverHealthy
            ? "AI is unavailable right now."
            : "AI isn't set up yet.";
        await tryDemo(reason);
        return;
    }

    setAIControlsBusy(true);
    quizBtn.setAttribute("aria-busy", "true"); // presentational: drives the busy spinner + SR state
    // Reassure the user if generation runs long, so a slow request doesn't read as
    // a freeze. Cleared in finally regardless of outcome.
    const slowTimer = setTimeout(function () {
        quizStatus.textContent = "The AI is taking longer than usual — hang tight; it'll fall back to the built-in question bank if it can't finish.";
    }, 8000);
    try {
        // A local copy: the student's current set stays in place until this one passes.
        let aiQuestions = await generateQuizWithAI(topic, difficulty, expected, apId, notesCtx);
        let aiSet = normalizeAIQuestions(aiQuestions);

        if (!aiSet.length) {
            throw new Error("Empty AI result.");
        }

        if (isQuizQualityAcceptable(aiSet, topic || subjectLabel, expected)) {
            recordAiResult("quiz", "ok");
        } else {
            quizStatus.textContent = "Questions were too generic — trying again...";
            aiQuestions = await generateQuizWithAI(topic, difficulty, expected, apId, notesCtx);
            aiSet = normalizeAIQuestions(aiQuestions);
            if (!aiSet.length || !isQuizQualityAcceptable(aiSet, topic || subjectLabel, expected)) {
                throw new Error("Quality check failed.");
            }
            recordAiResult("quiz", "repaired");
        }

        installSet(finalizeSet(aiSet), { subject: subjectLabel, topic: topic, difficulty: difficulty, origin: "ai", heldBack: heldBack });
        const aiNew = generatedQuestions.filter(function (q) { return q.source !== "review"; }).length;
        quizStatus.textContent = "Questions ready — " + aiNew + " new from " + ctxLabel +
            (reviewItems.length ? " + " + reviewItems.length + " due review." : ".") + heldBackText;
    } catch (err) {
        console.error("AI quiz generation failed:", err); // debug detail stays out of the UI
        recordAiResult("quiz", "failed");
        const timedOut = /timed out|too long/i.test((err && err.message) || "");
        await tryDemo(timedOut ? "The AI timed out." : "The AI request didn't go through.");
    } finally {
        clearTimeout(slowTimer);
        setAIControlsBusy(false);
        quizBtn.removeAttribute("aria-busy");
    }
}

function addErrorRecord(questionId) {
    const found = generatedQuestions.find(function (item) {
        return item.id === questionId;
    });
    if (!found) {
        errorStatus.textContent = "Could not find the selected question.";
        return;
    }
    // Use the question's OWN subject (set when the set was built), not the live
    // dropdown — otherwise switching subjects mid-session mislabels captured
    // mistakes and R1's subject-filtered review injection silently misses them.
    const subj = found.subject || subjectLabelFromId(apSubjectInput.value);
    const exists = errorRecords.some(function (item) {
        return item.sourceId === found.id;
    });
    if (exists) {
        errorStatus.textContent = "Already in your Mistake Log.";
        return;
    }
    errorRecords.unshift({
        id: "err-" + Date.now(),
        sourceId: found.id,
        type: found.type,
        question: found.question,
        answer: found.answer,
        explanation: found.explanation || "",
        // A question saved by hand after a CORRECT pick has no wrong answer to analyse.
        userAnswer: found.userAnswer && !(found.type === "Multiple Choice" && isMcqAnswerCorrect(found.userAnswer, found.answer))
            ? found.userAnswer : "",
        // The original choices and level: needed to show the mistake in full and to
        // build similar questions at the same difficulty.
        options: Array.isArray(found.options) && found.options.length ? found.options.slice() : undefined,
        difficulty: found.difficulty || "",
        sr: window.ReviewSystem ? window.ReviewSystem.initReview() : null,
        subject: subj,
        // R2: copy the question's OWN topic (set at finalizeSet), never the live
        // topicInput — same rule as subject, so switching topics mid-session can't
        // mislabel a captured mistake.
        topic: found.topic || "",
        topicKey: found.topicKey || "",
        // Skill tags from the built-in bank (AP Calculus AB): lets the page decide, without
        // asking the server, whether similar questions can be built offline.
        skills: Array.isArray(found.skills) && found.skills.length ? found.skills.slice() : undefined,
        createdAt: new Date().toISOString()
    });
    saveErrorRecords();
    renderErrorRecords();
    refreshMistakeFilterOptions();
    errorStatus.textContent = "Saved — this question will come back for review.";
}

function reviewMistake(errorId, quality) {
    // H-F: one SM-2 update per item per session. A resurfaced item can be graded both
    // in practice (applyGradeOutcome) and in Section 3 — first grade wins. The Set is
    // in-memory, so it resets on reload (documented leak); a durable day-level dedup is
    // a future R3 upgrade once review recency lives in the unified event log.
    if (sessionReviewedErrIds.has(errorId)) {
        errorStatus.textContent = "Already reviewed this session — your schedule is unchanged.";
        return;
    }
    let reviewed = null;
    errorRecords = errorRecords.map(function (item) {
        if (item.id !== errorId) return item;
        const sr = window.ReviewSystem.review(item.sr, quality);
        reviewed = Object.assign({}, item, { sr: sr });
        return reviewed;
    });
    if (!reviewed) return;
    sessionReviewedErrIds.add(errorId);
    saveErrorRecords();
    renderErrorRecords();
    const days = window.ReviewSystem.daysUntilDue(reviewed.sr);
    const when = days <= 0 ? "today" : days === 1 ? "in 1 day" : "in " + days + " days";
    errorStatus.textContent = "Scheduled — next review " + when +
        " (status: " + window.ReviewSystem.status(reviewed.sr) + ").";
}

function removeErrorRecord(errorId) {
    errorRecords = errorRecords.filter(function (item) {
        return item.id !== errorId;
    });
    saveErrorRecords();
    renderErrorRecords();
    refreshMistakeFilterOptions();
}

async function clearErrorRecords() {
    if (!errorRecords.length) {
        errorStatus.textContent = "Your Mistake Log is already empty.";
        return;
    }
    // Destructive and unrecoverable: the log and its review schedule live only here.
    const count = errorRecords.length;
    const clearMessage = "This permanently deletes all " + count + " saved " +
        (count === 1 ? "mistake" : "mistakes") + " and their review schedule from this browser. " +
        "It cannot be undone — use “Download my data” first if you want a backup.";
    const confirmed = window.Shell
        ? await window.Shell.confirm({ title: "Clear your Mistake Log?", body: clearMessage, confirmLabel: "Clear log", danger: true })
        : window.confirm("Clear your Mistake Log? " + clearMessage);
    if (!confirmed) {
        errorStatus.textContent = "Clear cancelled. Nothing was deleted.";
        return;
    }
    errorRecords = [];
    sessionReviewedErrIds.clear();
    saveErrorRecords();
    renderErrorRecords();
    refreshMistakeFilterOptions();
    errorStatus.textContent = "Mistake Log cleared.";
}

// --- Review: the orbit and the Mistake Library ------------------------------------------
// One filter drives both views: the chart dims what the filter leaves out, the library
// lists what it keeps. The rules (time buckets, search, sort, chart positions) live in
// js/review-orbit.js, which is pure and tested. SM-2 owns every schedule shown here.
const STATUS_LABEL = { "new": "New", learning: "Learning", mastered: "Mastered" };
const WHEN_LABEL = { all: "All", due: "Due now", week: "Next 7 days", later: "Later" };

function reviewItems() {
    const RS = window.ReviewSystem;
    const RO = window.ReviewOrbit;
    if (!RS || !RO) return [];
    return errorRecords.map(function (r) { return RO.toItem(r, RS); });
}

function shortCourse(label) {
    return window.ReviewOrbit ? window.ReviewOrbit.shortCourse(label) : String(label || "");
}

function setReviewFilter(patch) {
    reviewFilter = Object.assign({}, reviewFilter, patch || {});
    if (mistakeSubjectFilterEl && mistakeSubjectFilterEl.value !== reviewFilter.course) {
        mistakeSubjectFilterEl.value = reviewFilter.course;
    }
    const search = document.getElementById("mistakeSearch");
    if (search && search.value !== reviewFilter.query) search.value = reviewFilter.query;
    const sort = document.getElementById("mistakeSort");
    if (sort && sort.value !== reviewFilter.sort) sort.value = reviewFilter.sort;
    renderErrorRecords();
}

function renderErrorRecords() {
    refreshHud(); // every change to the log passes through here
    const items = reviewItems();
    renderReviewChrome(items);
    renderReviewOrbit(items);
    renderLibrary(items);
}

// Filter chips with live counts, the view toggle, and the instrument readouts.
function renderReviewChrome(items) {
    const RO = window.ReviewOrbit;
    const c = RO ? RO.counts(items) : { all: 0, due: 0, week: 0, later: 0 };
    document.querySelectorAll("#orbitStage [data-when]").forEach(function (b) {
        const w = b.getAttribute("data-when");
        b.textContent = WHEN_LABEL[w] + " · " + c[w];
        b.setAttribute("aria-pressed", String(reviewFilter.when === w));
    });
    document.querySelectorAll("#orbitStage [data-orbit-view]").forEach(function (b) {
        b.setAttribute("aria-pressed", String(orbitView === b.getAttribute("data-orbit-view")));
    });
    const box = document.getElementById("reviewReadouts");
    const RS = window.ReviewSystem;
    if (!box) return;
    if (!RS || !errorRecords.length) {
        box.innerHTML = "";
        return;
    }
    const s = RS.summarize(errorRecords);
    const cell = function (value, label, tone) {
        return '<div class="readout"' + (tone ? ' data-tone="' + tone + '"' : "") + '><span class="ro-num">' + value +
            '</span><span class="ro-label">' + label + "</span></div>";
    };
    box.innerHTML = cell(s.total, s.total === 1 ? "Saved mistake" : "Saved mistakes") +
        cell(s.due, "Due now", "due") +
        cell(s.learning, "Learning") +
        cell(s.mastered, "Mastered", "mastered");
}

function nodeLabel(it) {
    return (it.topic || "No topic") + ", " + it.course + ", " + window.ReviewOrbit.whenText(it).toLowerCase() +
        (it.due ? "" : ", " + (STATUS_LABEL[it.status] || it.status).toLowerCase());
}

// An annular sector (or a full ring when one course fills the chart).
function sectorPath(c, r0, r1, a0, a1) {
    const p = function (r, a) { return (c + r * Math.cos(a)).toFixed(1) + "," + (c + r * Math.sin(a)).toFixed(1); };
    if (a1 - a0 >= Math.PI * 2 - 1e-6) {
        return "M" + (c + r1).toFixed(1) + "," + c + " A" + r1 + "," + r1 + " 0 1 1 " + (c - r1).toFixed(1) + "," + c +
            " A" + r1 + "," + r1 + " 0 1 1 " + (c + r1).toFixed(1) + "," + c + " Z" +
            " M" + (c + r0).toFixed(1) + "," + c + " A" + r0 + "," + r0 + " 0 1 0 " + (c - r0).toFixed(1) + "," + c +
            " A" + r0 + "," + r0 + " 0 1 0 " + (c + r0).toFixed(1) + "," + c + " Z";
    }
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return "M" + p(r0, a0) + " L" + p(r1, a0) + " A" + r1 + "," + r1 + " 0 " + large + " 1 " + p(r1, a1) +
        " L" + p(r0, a1) + " A" + r0 + "," + r0 + " 0 " + large + " 0 " + p(r0, a0) + " Z";
}

// The orbit as SVG. Home draws it small and passive; Review draws it with course labels
// and focusable, selectable nodes (keyboard: arrows move, Enter selects).
function orbitSvg(items, opts) {
    const RO = window.ReviewOrbit;
    const size = opts.size || 420;
    const L = RO.layout(items, { size: size });
    const c = L.center;
    const f = opts.filter || null;
    const sel = opts.selected || "";
    const pad = opts.labels ? 70 : 6;
    let h = "";
    L.sectors.forEach(function (s, i) {
        const on = !f || !f.course || f.course === s.course;
        h += '<path class="ob-sector' + (i % 2 ? " is-alt" : "") + (on ? "" : " is-dim") + '" fill-rule="evenodd" d="' +
            sectorPath(c, L.core + 3, L.edge + 12, s.a0, s.a1) + '"/>';
    });
    L.rings.forEach(function (g) {
        h += '<circle class="ob-ring" cx="' + c + '" cy="' + c + '" r="' + g.r.toFixed(1) + '"/>';
    });
    // Ring labels sit in the gap at the top of the chart, where no course sector starts.
    L.rings.forEach(function (g) {
        h += '<text class="ob-tick" x="' + (c + 5) + '" y="' + (c - g.r - 4).toFixed(1) + '">' + g.days + "d</text>";
    });
    h += '<circle class="ob-core" cx="' + c + '" cy="' + c + '" r="' + L.core.toFixed(1) + '"/>';
    if (opts.labels) {
        L.sectors.forEach(function (s) {
            if (s.a1 - s.a0 < 0.3 && L.sectors.length > 1) return; // too thin to label; the legend names it
            const r = L.edge + 24;
            const x = c + r * Math.cos(s.mid);
            // Labels above the center grow upward, so their second line never covers the chart.
            const y = c + r * Math.sin(s.mid) - (Math.sin(s.mid) < -0.3 ? 15 : 0);
            const cos = Math.cos(s.mid);
            const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
            h += '<text class="ob-label" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="' + anchor + '">' +
                escapeHtml(shortCourse(s.course)) + '<tspan class="ob-count" x="' + x.toFixed(1) + '" dy="1.15em">' + s.count +
                (s.due ? " · " + s.due + " due" : "") + "</tspan></text>";
        });
    }
    // Draw (and tab through) nodes soonest-due first.
    const order = {};
    RO.sortItems(items, "due").forEach(function (it, i) { order[it.id] = i; });
    const nodes = L.nodes.slice().sort(function (a, b) { return order[a.item.id] - order[b.item.id]; });
    // Tap targets: up to 28 chart units (about 44 px at phone size) around each dot, but
    // never past halfway to the nearest other dot, so neighbouring targets don't overlap.
    // In a dense chart the List view is the easier way in.
    const hitR = {};
    nodes.forEach(function (n) {
        let nearest = Infinity;
        nodes.forEach(function (m) {
            if (m !== n) nearest = Math.min(nearest, Math.hypot(m.x - n.x, m.y - n.y));
        });
        hitR[n.item.id] = Math.max(L.dot + 3, Math.min(28, nearest / 2));
    });
    nodes.forEach(function (n) {
        const it = n.item;
        const state = it.due ? "due" : it.status;
        const match = !f || RO.matches(it, f);
        const cls = "ob-node is-" + state + (match ? "" : " is-dim") + (it.id === sel ? " is-selected" : "");
        const x = n.x.toFixed(1);
        const y = n.y.toFixed(1);
        if (opts.interactive) {
            h += '<g class="' + cls + '" data-node="' + escapeHtml(it.id) + '" role="button" tabindex="' + (it.id === sel ? 0 : -1) +
                '" aria-pressed="' + (it.id === sel) + '" aria-label="' + escapeHtml(nodeLabel(it)) + '">' +
                '<circle class="ob-hit" cx="' + x + '" cy="' + y + '" r="' + hitR[it.id].toFixed(1) + '"/>' +
                '<circle class="ob-halo" cx="' + x + '" cy="' + y + '" r="' + Math.max(L.dot + 7, 12).toFixed(1) + '"/>' +
                '<circle class="ob-dot" cx="' + x + '" cy="' + y + '" r="' + L.dot.toFixed(1) + '"/></g>';
        } else {
            h += '<circle class="ob-dot ' + cls + '" cx="' + x + '" cy="' + y + '" r="' + L.dot.toFixed(1) + '"/>';
        }
    });
    const vb = (-pad) + " " + (-pad) + " " + (size + 2 * pad) + " " + (size + 2 * pad);
    const a11y = opts.interactive
        ? 'role="group" aria-label="Review orbit: ' + items.length + (items.length === 1 ? " saved mistake" : " saved mistakes") +
            '. Use the arrow keys to move between mistakes and Enter to select one."'
        : 'aria-hidden="true" focusable="false"';
    return '<svg class="ob-svg" viewBox="' + vb + '" ' + a11y + ">" + h + "</svg>";
}

function legendHtml(items) {
    const RO = window.ReviewOrbit;
    const L = RO.layout(items, { size: 420 });
    const key = function (cls, text) {
        return '<span class="lg-item"><i class="lg-dot ' + cls + '" aria-hidden="true"></i>' + text + "</span>";
    };
    let html = '<span class="lg-keys">' + key("is-due", "Due now (the core)") + key("is-learning", "Learning") +
        key("is-new", "New") + key("is-mastered", "Mastered") + "</span>";
    html += '<span class="lg-rule">Angle = course. Distance from the core = days until SM-2 brings it back (rings at 1, 6, 15, 38 days).</span>';
    if (L.sectors.length) {
        html += '<span class="lg-courses">' + L.sectors.map(function (s) {
            return escapeHtml(shortCourse(s.course)) + " " + s.count;
        }).join(" · ") + "</span>";
    }
    return html;
}

// The list alternative to the chart: the same items and filter, grouped by when.
function orbitListHtml(items) {
    const RO = window.ReviewOrbit;
    const visible = RO.sortItems(items.filter(function (it) { return RO.matches(it, reviewFilter); }), "due");
    if (!visible.length) {
        return '<p class="empty">' + (items.length ? "Nothing matches this filter." : "No saved mistakes yet.") + "</p>";
    }
    const groups = [["due", "Due now"], ["week", "Next 7 days"], ["later", "Later"]];
    let html = "";
    groups.forEach(function (g) {
        const list = visible.filter(function (it) { return RO.bucket(it) === g[0]; });
        if (!list.length) return;
        html += '<section class="ol-group"><h4>' + g[1] + " <span>" + list.length + "</span></h4><ul>";
        list.forEach(function (it) {
            const on = it.id === orbitSelectedId;
            html += '<li><button type="button" class="ol-item' + (on ? " is-selected" : "") + '" data-select="' + escapeHtml(it.id) +
                '" aria-pressed="' + on + '">' + escapeHtml((it.topic || "No topic") + " · " + shortCourse(it.course) + " · " + RO.whenText(it)) +
                "</button></li>";
        });
        html += "</ul></section>";
    });
    return html;
}

function renderReviewOrbit(items) {
    const RO = window.ReviewOrbit;
    const chartEl = document.getElementById("reviewOrbitChart");
    const listEl = document.getElementById("reviewOrbitList");
    const legend = document.getElementById("orbitLegend");
    if (!RO || !chartEl || !listEl) return;
    renderReviewToday(items);
    // Keep a selection: the soonest-due match, unless the student picked one that still exists.
    if (!items.some(function (it) { return it.id === orbitSelectedId; })) {
        const visible = RO.sortItems(items.filter(function (it) { return RO.matches(it, reviewFilter); }), "due");
        const first = visible[0] || RO.sortItems(items, "due")[0];
        orbitSelectedId = first ? first.id : "";
    }
    chartEl.hidden = orbitView !== "chart";
    listEl.hidden = orbitView !== "list";
    if (orbitView === "chart") {
        // On a narrow screen the course labels would be too small to read: the chart drops
        // them (and their margin) and the legend under it names the courses instead.
        const narrow = chartEl.clientWidth > 0 && chartEl.clientWidth < 520;
        chartEl.innerHTML = orbitSvg(items, { size: 440, labels: !narrow, interactive: true, filter: reviewFilter, selected: orbitSelectedId });
    } else {
        listEl.innerHTML = orbitListHtml(items);
    }
    if (legend) legend.innerHTML = legendHtml(items);
    renderOrbitDetail(items);
}

// The selected mistake, with the two things to do about it. The card is a live region,
// so it is only rewritten when what it shows changes (not on every filter keystroke).
let orbitDetailKey = "";
function renderOrbitDetail(items) {
    const el = document.getElementById("orbitDetail");
    const RO = window.ReviewOrbit;
    if (!el || !RO) return;
    const shown = items.find(function (x) { return x.id === orbitSelectedId; });
    const key = items.length ? (shown ? [shown.id, shown.dueAt, shown.reviews, shown.status, canUseLiveAI()].join("|") : "none") : "empty";
    if (key === orbitDetailKey && el.innerHTML) return;
    orbitDetailKey = key;
    if (!items.length) {
        el.innerHTML = '<div class="od-card is-empty"><p class="kicker">Empty orbit</p>' +
            '<h4 class="od-title">Nothing saved yet.</h4>' +
            "<p>Questions you miss in Practice land in the core. Each time you remember one, it moves further out.</p>" +
            '<div class="actions"><button type="button" data-action="orbit-practice">Start a practice set</button></div></div>';
        return;
    }
    const it = items.find(function (x) { return x.id === orbitSelectedId; });
    const rec = it ? findErrorRecord(it.id) : null;
    if (!it || !rec) {
        el.innerHTML = "";
        return;
    }
    let html = '<div class="od-card" data-state="' + (it.due ? "due" : it.status) + '">';
    html += '<p class="kicker">' + escapeHtml(RO.whenText(it) + (it.reviews ? " · reviewed " + it.reviews + "×" : " · not reviewed yet")) + "</p>";
    html += '<h4 class="od-title">' + escapeHtml(it.topic || "No topic saved") + "</h4>";
    html += '<p class="od-meta">' + escapeHtml(it.course + " · " + (rec.type || "Question") + " · " + (STATUS_LABEL[it.status] || it.status)) + "</p>";
    html += '<p class="od-q">' + escapeHtml(RO.snippet(rec.question, 170)) + "</p>";
    html += '<div class="actions">';
    html += '<button type="button" data-action="orbit-rate" data-id="' + escapeHtml(it.id) + '">' +
        (it.due ? "Review it now" : "Open in the library") + "</button>";
    if (canPracticeSimilar(rec)) {
        html += '<button type="button" class="secondary" data-action="open-mistake" data-id="' + escapeHtml(it.id) + '">Practice similar</button>';
    }
    html += "</div></div>";
    el.innerHTML = html;
    typesetMath(el);
}

function selectOrbitItem(id) {
    orbitSelectedId = id;
    document.querySelectorAll("#reviewOrbitChart [data-node]").forEach(function (g) {
        const on = g.getAttribute("data-node") === id;
        g.classList.toggle("is-selected", on);
        g.setAttribute("aria-pressed", String(on));
        g.setAttribute("tabindex", on ? "0" : "-1");
    });
    document.querySelectorAll("#reviewOrbitList [data-select]").forEach(function (b) {
        const on = b.getAttribute("data-select") === id;
        b.classList.toggle("is-selected", on);
        b.setAttribute("aria-pressed", String(on));
    });
    renderOrbitDetail(reviewItems());
}

// Bring a mistake's library card into view (clearing filters that would hide it).
function openLibraryCard(id) {
    const find = function () { return errorOutput.querySelector('[data-card-id="' + cssEscape(id) + '"]'); };
    let card = find();
    if (!card) {
        setReviewFilter({ when: "all", course: "", query: "" });
        card = find();
    }
    if (!card) return;
    card.scrollIntoView({ behavior: motionBehavior(), block: "start" });
    const title = card.querySelector(".qa-title");
    if (title) title.focus({ preventScroll: true });
    card.classList.remove("is-flash");
    void card.offsetWidth;
    card.classList.add("is-flash");
}

function renderLibrary(items) {
    const RS = window.ReviewSystem;
    const RO = window.ReviewOrbit;
    const countEl = document.getElementById("libraryCount");
    if (!RS || !RO) return;
    const visible = RO.sortItems(items.filter(function (it) { return RO.matches(it, reviewFilter); }), reviewFilter.sort);
    if (countEl) {
        countEl.textContent = !items.length ? ""
            : visible.length === items.length ? items.length + (items.length === 1 ? " saved mistake" : " saved mistakes")
                : "Showing " + visible.length + " of " + items.length;
    }
    const recs = errorRecords.length ? practiceRecommendationsHtml() : "";
    if (!visible.length) {
        const emptyMsg = errorRecords.length
            ? "Nothing matches this filter. Try All, another course, or a different search."
            : "Questions you miss are saved here automatically for spaced review.";
        errorOutput.innerHTML = recs + "<p class='empty'>" + emptyMsg + "</p>";
        return;
    }
    const byId = {};
    errorRecords.forEach(function (r) { byId[r.id] = r; });

    const cards = visible.map(function (it) {
        const item = byId[it.id];
        const sr = item.sr;
        const due = it.due;
        const id = escapeHtml(item.id);
        const dueText = due ? "Due now" : (it.days === 1 ? "Next review in 1 day" : "Next review in " + it.days + " days");
        // Show what each rating would schedule, so the choice has a visible result.
        // Recall comes first: the ratings unlock once the suggested answer has been shown.
        const revealed = revealedErrIds.has(item.id);
        const ratingButton = function (quality, label) {
            const next = RS.review(sr, quality).intervalDays;
            const when = next === 1 ? "1 day" : next + " days";
            return '<button type="button" class="outline rate" data-action="review" data-q="' + quality + '" data-id="' + id + '"' +
                ' data-next="' + when + '" aria-label="' + label + ", next review in " + when + '"' + (revealed ? "" : " disabled") + ">" + label + "</button>";
        };
        return (
            '<article class="error-card' + (due ? " is-due" : "") + '" data-card-id="' + id + '">' +
            '<div class="card-head"><h4 class="qa-title" tabindex="-1">' + escapeHtml(it.topic || "No topic saved") + "</h4>" +
            '<span class="tag subject">' + escapeHtml(item.subject || "Uncategorized") + "</span>" +
            '<span class="tag">' + escapeHtml(item.type) + "</span>" +
            '<span class="tag status-' + it.status + '">' + (STATUS_LABEL[it.status] || it.status) + "</span>" +
            (due ? '<span class="tag due">Due</span>' : "") +
            variantTagHtml(item) +
            "</div>" +
            '<p class="qa-q">' + escapeHtml(item.question) + "</p>" +
            (item.userAnswer
                ? '<p class="your-answer"><strong>Your answer:</strong> ' + escapeHtml(item.userAnswer) + "</p>"
                : "") +
            '<details class="answer-box" data-reveal-id="' + id + '"' + (revealed ? " open" : "") + '><summary>Suggested answer</summary><p>' + escapeHtml(item.answer) + "</p></details>" +
            (item.explanation
                ? '<details class="answer-box"><summary>Why</summary><p>' + escapeHtml(item.explanation) + "</p></details>"
                : "") +
            '<p class="due-info">' + escapeHtml(dueText) + (sr && sr.reviews ? " · reviewed " + sr.reviews + "×" : "") + "</p>" +
            '<div class="actions review-actions">' +
            '<span class="selfgrade-q">' + (revealed ? RATE_PROMPT : RATE_PROMPT_LOCKED) + "</span>" +
            ratingButton(2, "Forgot") +
            ratingButton(3, "Hard") +
            ratingButton(5, "Got it") +
            (canPracticeSimilar(item)
                ? '<button type="button" class="similar-btn" data-action="open-mistake" data-id="' + id + '">Practice similar</button>'
                : '<button type="button" class="outline" data-action="open-mistake" data-id="' + id + '">What it tests</button>') +
            '<button type="button" class="danger small" data-action="remove-error" data-id="' + id + '">Delete</button>' +
            "</div>" +
            (canPracticeSimilar(item) ? "" : '<p class="hint similar-note">Similar questions for ' + escapeHtml(item.subject || "this course") +
                " need the AI connection; offline, the built-in generator covers AP Calculus only.</p>") +
            "</article>"
        );
    }).join("");

    errorOutput.innerHTML = recs + cards;
    typesetMath(errorOutput);
}

// One renderer for the AI summary and the offline excerpt, ending in the next step of the
// loop. The AI summary reads like a page: a short lede, then numbered key points. Offline
// nothing is rewritten, so it is called an excerpt and shows only the student's own lines.
function renderSummary(summaryText, listHtml, source) {
    const ai = source === "ai";
    // Only the AI can turn these notes into questions; offline, say so instead of
    // offering a button that would quietly use the built-in bank.
    const next = canUseLiveAI()
        ? '<div class="actions"><button type="button" data-action="practice-notes">Practice these notes</button></div>'
        : '<p class="hint">Questions built from these notes need the AI connection. Offline, Practice uses the built-in bank of AP-style questions.</p>' +
            '<div class="actions"><button type="button" class="secondary" data-action="practice-notes">Go to Practice</button></div>';
    summaryOutput.innerHTML = ai
        ? '<p class="kicker">AI summary</p>' +
            '<h3>Simplified Summary</h3><p class="summary-lede">' + escapeHtml(summaryText) + "</p>" +
            '<h3>Key Points</h3><ol class="key-points">' + listHtml + "</ol>" + next
        : '<p class="kicker">Offline excerpt · your own lines, not a summary</p>' +
            '<h3>Key lines from your notes</h3><ol class="key-points">' + listHtml + "</ol>" +
            '<p class="hint">The first lines of your notes, one per point, with bullets and extra spaces removed. Nothing was rewritten; a real summary needs the AI connection.</p>' + next;
    typesetMath(summaryOutput);
}

// The summary or excerpt is kept with the session (text only, from the student's own notes
// or the AI's reply), so a refresh shows it again with the notes it was made from.
function rememberSummary(source, text, points) {
    lastSummary = {
        source: source === "ai" ? "ai" : "offline",
        text: String(text || ""),
        points: (points || []).map(function (p) { return String(p); }),
        notes: noteInput.value || ""
    };
    saveSession();
}

function drawSummary(sm) {
    const listHtml = sm.points.map(function (pt) { return "<li>" + escapeHtml(pt) + "</li>"; }).join("");
    renderSummary(sm.text, listHtml, sm.source);
}

function restoreSummary(sm) {
    if (!sm || !Array.isArray(sm.points) || typeof sm.text !== "string") return;
    lastSummary = sm;
    drawSummary(sm);
    lastNotesContext = sm.source === "ai" ? sm.text + "\n" + sm.points.join("\n") : sanitizeText(sm.notes || "");
    updateNotesContextUI();
    summaryStatus.textContent = (noteInput.value || "") === (sm.notes || "")
        ? "Restored from before the refresh."
        : "Your notes changed since this was made. Press the button again to update it.";
}

summaryOutput.addEventListener("click", function (ev) {
    const btn = ev.target instanceof Element ? ev.target.closest('[data-action="practice-notes"]') : null;
    if (btn) goToPracticeSetup();
});

summaryBtn.addEventListener("click", async function () {
    const raw = sanitizeText(noteInput.value);
    if (!raw) {
        summaryStatus.textContent = "Paste your notes first.";
        summaryOutput.innerHTML = "<p class='empty'>" + (canUseLiveAI() ? "Paste your notes and generate a summary to get started." : "Paste your notes to pull out the key lines.") + "</p>";
        return;
    }
    if (!healthReady) {
        summaryStatus.textContent = "Still checking connection — try again in a moment.";
        return;
    }

    summaryStatus.textContent = "Generating summary...";

    if (!canUseLiveAI()) {
        // The raw text, not the whitespace-collapsed copy: key points are split by line.
        const demo = summarizeNotesDemo(noteInput.value);
        renderSummary(demo ? demo.simplifiedSummary : raw, demo ? demo.keyPointsHtml : "", "offline");
        lastNotesContext = raw;
        rememberSummary("offline", demo ? demo.simplifiedSummary : raw, demo ? demo.keyPoints : []);
        summaryStatus.textContent = serverHealthy
            ? "Offline excerpt: AI summaries need the AI connection (Setup → AI connection)."
            : "Offline excerpt: start the local server to enable AI.";
        updateNotesContextUI();
        return;
    }

    setAIControlsBusy(true);
    summaryBtn.setAttribute("aria-busy", "true"); // presentational: drives the busy spinner + SR state
    try {
        const json = await summarizeNotesWithAI(raw);
        const listHtml = (json.keyPoints || []).map(function (pt) {
            return "<li>" + escapeHtml(pt) + "</li>";
        }).join("");
        renderSummary(json.simplifiedSummary, listHtml, "ai");
        lastNotesContext = json.simplifiedSummary + "\n" + (json.keyPoints || []).join("\n");
        rememberSummary("ai", json.simplifiedSummary, json.keyPoints || []);
        summaryStatus.textContent = "Summary ready — your practice questions can now use these notes.";
        updateNotesContextUI();
    } catch (err) {
        console.error("AI summary failed:", err); // debug detail stays out of the UI
        summaryStatus.textContent = "AI summary unavailable right now. Showing an offline excerpt of your notes instead.";
        const demo = summarizeNotesDemo(noteInput.value);
        renderSummary(demo ? demo.simplifiedSummary : raw, demo ? demo.keyPointsHtml : "", "offline");
        lastNotesContext = raw;
        rememberSummary("offline", demo ? demo.simplifiedSummary : raw, demo ? demo.keyPoints : []);
        updateNotesContextUI();
    } finally {
        setAIControlsBusy(false);
        summaryBtn.removeAttribute("aria-busy");
    }
});

quizBtn.addEventListener("click", generateQuiz);

clearErrorsBtn.addEventListener("click", clearErrorRecords);

// Review filters: time chips, course, search, sort, and the chart/list switch. The same
// filter state drives the orbit and the library.
mistakeSubjectFilterEl.addEventListener("change", function () {
    setReviewFilter({ course: mistakeSubjectFilterEl.value });
});

(function redrawOrbitOnResize() {
    let timer = 0;
    let wasNarrow = null;
    window.addEventListener("resize", function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
            if (!window.Shell || window.Shell.current() !== "review" || orbitView !== "chart") return;
            const el = document.getElementById("reviewOrbitChart");
            const narrow = !!el && el.clientWidth > 0 && el.clientWidth < 520;
            if (narrow !== wasNarrow) {
                wasNarrow = narrow;
                renderReviewOrbit(reviewItems());
            }
        }, 200);
    });
    // The chart is drawn while Review is hidden at start-up (width 0), so draw it again
    // at its real width when the page opens.
    document.addEventListener("studyboost:view", function (ev) {
        if (ev.detail && ev.detail.view === "review" && orbitView === "chart") {
            const el = document.getElementById("reviewOrbitChart");
            wasNarrow = !!el && el.clientWidth > 0 && el.clientWidth < 520;
            renderReviewOrbit(reviewItems());
        }
    });
}());

(function wireReviewTools() {
    const stage = document.getElementById("orbitStage");
    const search = document.getElementById("mistakeSearch");
    const sort = document.getElementById("mistakeSort");
    let searchTimer = 0;
    if (search) {
        search.addEventListener("input", function () {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(function () { setReviewFilter({ query: search.value }); }, 140);
        });
    }
    if (sort) {
        sort.addEventListener("change", function () { setReviewFilter({ sort: sort.value }); });
    }
    if (!stage) return;
    stage.addEventListener("click", function (ev) {
        const t = ev.target instanceof Element ? ev.target : null;
        if (!t) return;
        const when = t.closest("[data-when]");
        if (when) {
            const w = when.getAttribute("data-when");
            setReviewFilter({ when: w });
            errorStatus.textContent = w === "all" ? "Showing all items." : "Showing items " + WHEN_LABEL[w].toLowerCase() + ".";
            return;
        }
        const view = t.closest("[data-orbit-view]");
        if (view) {
            orbitView = view.getAttribute("data-orbit-view");
            renderErrorRecords();
            return;
        }
        const node = t.closest("[data-node]");
        if (node) {
            selectOrbitItem(node.getAttribute("data-node"));
            return;
        }
        const pick = t.closest("[data-select]");
        if (pick) {
            selectOrbitItem(pick.getAttribute("data-select"));
            return;
        }
        const act = t.closest("[data-action]");
        if (!act) return;
        const action = act.getAttribute("data-action");
        if (action === "orbit-rate") openLibraryCard(act.getAttribute("data-id"));
        else if (action === "open-mistake") goToView("mistake/" + act.getAttribute("data-id"));
        else if (action === "orbit-practice") goToPracticeSetup();
    });
    // Roving focus through the chart: arrows move, Home/End jump, Enter or Space selects.
    stage.addEventListener("keydown", function (ev) {
        const node = ev.target instanceof Element ? ev.target.closest("[data-node]") : null;
        if (!node) return;
        const all = Array.prototype.slice.call(stage.querySelectorAll("[data-node]"));
        const i = all.indexOf(node);
        let next = -1;
        if (ev.key === "ArrowRight" || ev.key === "ArrowDown") next = Math.min(all.length - 1, i + 1);
        else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") next = Math.max(0, i - 1);
        else if (ev.key === "Home") next = 0;
        else if (ev.key === "End") next = all.length - 1;
        else if (ev.key === "Enter" || ev.key === " ") {
            selectOrbitItem(node.getAttribute("data-node"));
            ev.preventDefault();
            return;
        }
        if (next < 0) return;
        ev.preventDefault();
        all.forEach(function (g, k) { g.setAttribute("tabindex", k === next ? "0" : "-1"); });
        all[next].focus();
    });
}());

// A Forgot / Hard / Got it rating, from the Mistake Log or a mistake's own page.
// Recall ratings unlock once the answer is shown (revealedErrIds, declared at the top).
document.addEventListener("toggle", function (ev) {
    const box = ev.target;
    if (!(box instanceof HTMLElement) || !box.open) return;
    const id = box.getAttribute("data-reveal-id");
    if (!id || revealedErrIds.has(id)) return;
    revealedErrIds.add(id);
    const scope = box.closest(".error-card, #mistakeOriginal") || document;
    scope.querySelectorAll('button[data-action="review"]').forEach(function (b) {
        if (b.getAttribute("data-id") === id) b.disabled = false;
    });
    const prompt = scope.querySelector(".selfgrade-q");
    if (prompt) prompt.textContent = RATE_PROMPT;
}, true); // toggle doesn't bubble; listen in the capture phase

function rateMistake(id, quality) {
    // Count a rating toward today's reviews once. It earns no XP, so the XP totals
    // are unchanged; resurfaced practice items are counted in recordAttempt instead.
    const firstRating = !sessionReviewedErrIds.has(id);
    reviewMistake(id, quality);
    if (firstRating) {
        bumpDaily({ reviews: 1 });
        refreshHud();
    }
}

errorOutput.addEventListener("click", async function (event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.getAttribute("data-action");
    const id = target.getAttribute("data-id");
    if (!id) return;
    if (action === "review") {
        rateMistake(id, parseInt(target.getAttribute("data-q"), 10));
    } else if (action === "remove-error") {
        // One mistake and its schedule live only in this browser: confirm before deleting.
        const record = findErrorRecord(id);
        const name = record && record.topic ? "“" + record.topic + "”" : "this mistake";
        const ok = window.Shell
            ? await window.Shell.confirm({ title: "Delete this mistake?", body: "This removes " + name + " and its review schedule from this browser. It cannot be undone.", confirmLabel: "Delete", danger: true })
            : window.confirm("Delete this mistake and its review schedule?");
        if (!ok) {
            errorStatus.textContent = "Nothing was deleted.";
            return;
        }
        removeErrorRecord(id);
        errorStatus.textContent = "Deleted.";
    } else if (action === "open-mistake") {
        goToView("mistake/" + id);
    }
});

saveUIPrefsBtn.addEventListener("click", saveUIPrefs);

retryHealthBtn.addEventListener("click", fetchHealth);

if (exportDataBtn && importDataBtn && importDataInput) {
    exportDataBtn.addEventListener("click", exportUserData);
    importDataBtn.addEventListener("click", function () { importDataInput.click(); });
    importDataInput.addEventListener("change", function (e) {
        const file = e.target.files && e.target.files[0];
        importUserData(file);
        e.target.value = ""; // allow re-importing the same file
    });
}

if (refreshStatsBtn) {
    refreshStatsBtn.addEventListener("click", loadStats);
}

if (window.location.protocol === "file:") {
    healthStatus.textContent =
        "Opened as a local file — styles may work, but AI needs the server. Run: py server.py, then open http://127.0.0.1:8765/";
    healthReady = true;
    serverHealthy = false;
    renderAiChip();
}

noteInput.addEventListener("input", updateNotesContextUI);

populateSubjectSelects();
applyUIPrefs();
if (window.location.protocol !== "file:") {
    setAIControlsBusy(true);
    fetchHealth();
}
updateNotesContextUI();
renderErrorRecords();
refreshMistakeFilterOptions();
renderTopicMastery();
// 2C: re-scope the Topic Mastery panel when the course selection changes. The
// Progress page has its own course control, kept in step with the Practice one.
// The Progress course filter only filters Progress. Until the student picks a course
// there, it follows the Practice course (one way); after that the two are independent.
let masteryCoursePicked = false;
function followPracticeCourse() {
    if (masteryCourseInput && !masteryCoursePicked && masteryCourseInput.value !== apSubjectInput.value) {
        masteryCourseInput.value = apSubjectInput.value;
        renderTopicMastery();
    }
}

// A topic that is a listed skill of another course ("Chain rule" after switching from
// Calculus AB to Biology) no longer describes the set, so it is cleared, and the status
// line says so. Free-text topics are kept: nothing says they belong to one course.
// Calculus BC covers every Calculus AB skill, so an AB skill stays a valid BC topic.
const COURSE_INCLUDES = { calc_bc: ["calc_ab"] };
function clearTopicFromOtherCourse() {
    const PS = window.PracticeSelection;
    const topic = sanitizeText(topicInput.value);
    if (!topic || !PS || !PS.findSkill || PS.findSkill(apSubjectInput.value, topic)) return;
    const owner = AP_SUBJECTS.find(function (s) { return s.id !== apSubjectInput.value && PS.findSkill(s.id, topic); });
    if (!owner || (COURSE_INCLUDES[apSubjectInput.value] || []).indexOf(owner.id) !== -1) return;
    topicInput.value = "";
    quizStatus.textContent = "Cleared the topic \u201c" + topic + "\u201d: it's a " + owner.label + " skill.";
    updateBankHint();
}

apSubjectInput.addEventListener("change", function () {
    clearTopicFromOtherCourse();
    followPracticeCourse();
});
if (masteryCourseInput) {
    masteryCourseInput.addEventListener("change", function () {
        masteryCoursePicked = true;
        renderTopicMastery();
    });
}
document.addEventListener("studyboost:view", function (ev) {
    if (ev.detail && ev.detail.view === "progress") followPracticeCourse();
});
if (window.location.protocol === "file:") {
    loadStats();
}

// --- Similar-question practice: the mistake page ------------------------------------------
// One saved mistake, what it tests, and new questions on the same idea. The adaptive rules
// (difficulty staircase, evidence of mastery, SM-2 nudge) live in js/variant-practice.js,
// which is pure and tested. Generating and checking questions happens on the server
// (/api/variants). This section renders, grades, and keeps the mistake record current.
const mistakeOriginalEl = document.getElementById("mistakeOriginal");
const mistakeAnalysisEl = document.getElementById("mistakeAnalysis");
const variantDrillEl = document.getElementById("variantDrill");
const drillEvidenceEl = document.getElementById("drillEvidence");
const variantStatusEl = document.getElementById("variantStatus");
const variantAreaEl = document.getElementById("variantArea");
const variantResultEl = document.getElementById("variantResult");

// The open mistake and the similar question on screen (if any).
let variantSession = { errId: "", item: null, answered: false, busy: false, retryAt: 0, unavailable: "" };

const LEVEL_NAME = { basic: "Basic", medium: "Medium", challenge: "Challenge" };
const RELATION_NAME = { easier: "One step easier", same: "Same level", harder: "One step harder" };
const EVIDENCE_NAME = {
    not_started: "Not started",
    building: "Building evidence",
    struggling: "Needs more work",
    likely_mastered: "Likely mastered"
};
const STEP_REASON = {
    start: "the same level as the original",
    holding: "one more right in a row steps it up",
    stepped_up: "stepped up after two right in a row",
    stepped_down: "stepped down after a miss",
    at_ceiling: "the hardest level for this question",
    at_floor: "the easiest level for this question"
};

function findErrorRecord(id) {
    return errorRecords.find(function (r) { return r.id === id; }) || null;
}

// Replace one mistake record and persist. Storage can be full; say so instead of failing.
function replaceErrorRecord(updated) {
    errorRecords = errorRecords.map(function (r) { return r.id === updated.id ? updated : r; });
    try {
        saveErrorRecords();
        return true;
    } catch (e) {
        if (variantStatusEl) variantStatusEl.textContent = "Couldn't save to this browser's storage (it may be full). Download a backup in Setup.";
        return false;
    }
}

function variantState(record) {
    const VP = window.VariantPractice;
    const original = VP.originalLevel(record);
    const history = VP.practiceState(record).history;
    return {
        original: original,
        history: history,
        evidence: VP.evidence({ originalLevel: original, history: history }),
        target: VP.nextTarget({ originalLevel: original, history: history })
    };
}

// Weakest-topic-first list of mistakes worth practising (likely-mastered ones excluded).
// Similar questions can be made for any course with the AI; without it only the built-in
// AP Calculus skills work, so other courses are not recommended there.
function canPracticeSimilar(record) {
    if (canUseLiveAI()) return true;
    // Offline, the built-in generator covers a fixed list of skills (from /api/health).
    // A mistake with skill tags is checked against that list; an older one without tags
    // can only be judged by course, so the page lets the student try.
    const built = healthConfig.variants && Array.isArray(healthConfig.variants.builtInSkills)
        ? healthConfig.variants.builtInSkills : null;
    if (record && Array.isArray(record.skills) && record.skills.length && built) {
        return record.skills.some(function (id) { return built.indexOf(id) !== -1; });
    }
    return /calculus/i.test((record && record.subject) || "");
}

function rankedPractice(limit) {
    if (!window.VariantPractice || !window.MasteryModel) return [];
    return window.VariantPractice.rankForPractice(errorRecords.filter(canPracticeSimilar), masteryMap, {
        getTopicStat: window.MasteryModel.getTopicStat,
        isDue: window.ReviewSystem ? window.ReviewSystem.isDue : null,
        limit: limit
    });
}

function mistakeLabel(record) {
    const topic = (record.topic || "").trim();
    return topic ? topic + " · " + (record.subject || "") : (record.subject || "Saved question");
}

// Mistake Log card tag: how similar-question practice on this mistake is going.
function variantTagHtml(record) {
    if (!window.VariantPractice) return "";
    const history = window.VariantPractice.practiceState(record).history;
    if (!history.length) return "";
    const st = variantState(record);
    if (st.evidence.status === "likely_mastered") return '<span class="tag similar-done">Similar: likely mastered</span>';
    return '<span class="tag similar">Similar ' + st.evidence.correct + "/" + st.evidence.attempts + "</span>";
}

// Mistake Log: which mistakes to practise next, weakest topic first.
function practiceRecommendationsHtml() {
    const ranked = rankedPractice(3).filter(function (r) {
        return r.reasons.indexOf("weak_topic") >= 0 || r.reasons.indexOf("struggling") >= 0 || r.reasons.indexOf("in_progress") >= 0;
    });
    if (!ranked.length) return "";
    let html = '<section class="recommend" aria-labelledby="recommend-title">';
    html += '<h3 id="recommend-title">Practice similar questions next</h3><ul class="recommend-list">';
    ranked.forEach(function (r) {
        const why = r.reasons.indexOf("struggling") >= 0 ? "Missed the last similar questions"
            : r.reasons.indexOf("weak_topic") >= 0 ? "Weak topic: " + Math.round(r.ema * 100) + "% recent accuracy"
                : "In progress, " + r.evidence.correct + " of " + r.evidence.attempts + " right";
        html += "<li>";
        html += '<span class="rec-topic">' + escapeHtml(mistakeLabel(r.record)) + "</span>";
        html += '<span class="rec-why">' + escapeHtml(why) + "</span>";
        html += '<button type="button" class="outline small" data-action="open-mistake" data-id="' + escapeHtml(r.record.id) + '">Practice similar</button>';
        html += "</li>";
    });
    html += "</ul></section>";
    return html;
}

function optionLetter(option) {
    const m = /^\s*([A-F])[.)]/.exec(option || "");
    return m ? m[1] : "";
}

// --- the original question ---
function renderMistakeOriginal(record) {
    const RS = window.ReviewSystem;
    const sr = record.sr;
    const due = RS ? RS.isDue(sr) : false;
    const status = RS ? RS.status(sr) : "new";
    const days = RS ? RS.daysUntilDue(sr) : 0;
    const STATUS_LABEL = { "new": "New", learning: "Learning", mastered: "Mastered" };
    const picked = record.userAnswer || "";
    const options = Array.isArray(record.options) ? record.options : [];

    let html = '<div class="card-head"><h3 class="sheet-title">The question you missed</h3></div>';
    html += '<div class="tag-row">';
    html += '<span class="tag subject">' + escapeHtml(record.subject || "Uncategorized") + "</span>";
    html += '<span class="tag">' + escapeHtml(record.type || "Question") + "</span>";
    if ((record.topic || "").trim()) html += '<span class="tag">' + escapeHtml(record.topic) + "</span>";
    html += '<span class="tag status-' + status + '">' + (STATUS_LABEL[status] || status) + "</span>";
    if (due) html += '<span class="tag due">Due</span>';
    html += "</div>";
    html += '<p class="qa-q">' + escapeHtml(record.question) + "</p>";

    let answer = "";
    if (options.length) {
        answer += '<ul class="static-options">';
        options.forEach(function (opt) {
            const isAnswer = isMcqAnswerCorrect(opt, record.answer);
            const isPick = !isAnswer && picked && isMcqAnswerCorrect(opt, picked);
            answer += '<li class="' + (isAnswer ? "is-answer" : isPick ? "is-wrong" : "") + '">' +
                '<span class="opt-text">' + escapeHtml(opt) + "</span>" +
                (isAnswer ? '<span class="opt-mark">Correct answer</span>' : isPick ? '<span class="opt-mark">Your pick</span>' : "") +
                "</li>";
        });
        answer += "</ul>";
        if (!picked) answer += '<p class="hint">Your pick was not recorded for this question (it was saved before StudyBoost kept picks).</p>';
    } else {
        answer += picked
            ? '<p class="your-answer"><strong>Your answer:</strong> ' + escapeHtml(picked) + "</p>"
            : '<p class="hint">No written answer was saved for this question.</p>';
        answer += '<div class="answer-box"><h4>Suggested answer</h4><p>' + escapeHtml(record.answer) + "</p></div>";
    }
    if (record.explanation) {
        answer += '<details class="answer-box"><summary>Why</summary><p>' + escapeHtml(record.explanation) + "</p></details>";
    }

    if (due) {
        // Due for spaced review: keep the answer folded so the review still starts from recall.
        html += '<p class="due-note">This question is due for its spaced review. Recall the answer first, then rate yourself.</p>';
        const revealed = revealedErrIds.has(record.id);
        html += '<details class="reveal" data-reveal-id="' + escapeHtml(record.id) + '"' + (revealed ? " open" : "") +
            '><summary>Show the answer and explanation</summary>' + answer + "</details>";
        html += '<div class="actions review-actions"><span class="selfgrade-q">' + (revealed ? RATE_PROMPT : RATE_PROMPT_LOCKED) + "</span>" +
            [[2, "Forgot"], [3, "Hard"], [5, "Got it"]].map(function (q) {
                const next = RS ? RS.review(sr, q[0]).intervalDays : 0;
                const when = next === 1 ? "1 day" : next + " days";
                return '<button type="button" class="outline rate" data-action="review" data-q="' + q[0] + '" data-id="' +
                    escapeHtml(record.id) + '" data-next="' + when + '" aria-label="' + q[1] + ", next review in " + when + '"' +
                    (revealed ? "" : " disabled") + ">" + q[1] + "</button>";
            }).join("") + "</div>";
    } else {
        html += answer;
        html += '<p class="due-info">Next spaced review ' + (days <= 1 ? "tomorrow" : "in " + days + " days") +
            (sr && sr.nudgedAt ? " (moved up after a missed similar question)" : "") + ".</p>";
    }
    mistakeOriginalEl.innerHTML = html;
    typesetMath(mistakeOriginalEl);
}

// --- what it tests ---
function renderMistakeAnalysis(record) {
    const a = record.analysis;
    let html = '<h3 class="sheet-title" id="analysis-title">What it tests</h3>';
    if (!a || !a.coreConcept) {
        const fallback = (record.topic || "").trim() || record.subject || "This course";
        html += '<p class="kp"><span class="kp-label">Knowledge point</span><span class="kp-name">' + escapeHtml(fallback) + "</span></p>";
        html += '<p class="hint">' + ((record.topic || "").trim() ? "From the topic you entered." : "No topic was entered for this question.") +
            (canPracticeSimilar(record)
                ? " The full analysis (the concept, how to solve it, and what likely went wrong) appears when you start similar practice."
                : " How to solve it and what likely went wrong need the AI connection (Setup). The question above has the answer and its explanation.") + "</p>";
        mistakeAnalysisEl.innerHTML = html;
        return;
    }
    html += '<p class="kp"><span class="kp-label">Knowledge point</span><span class="kp-name">' + escapeHtml(a.coreConcept) + "</span></p>";
    html += '<div class="tag-row"><span class="tag level-' + escapeHtml(a.difficulty || "medium") + '">' +
        escapeHtml(LEVEL_NAME[a.difficulty] || "Medium") + " difficulty</span></div>";
    if (a.solutionMethod) {
        html += '<div class="analysis-row"><h4>How to solve it</h4><p>' + escapeHtml(a.solutionMethod) + "</p></div>";
    }
    const d = a.diagnosis || {};
    if (d.status === "diagnosed" && d.likelyError) {
        const pips = { high: 3, medium: 2, low: 1 }[d.confidence] || 1;
        let basis;
        if (d.source === "explanation") basis = "Your pick matches a trap named in the question's explanation.";
        else if (d.grounded && d.evidence) basis = "Based on your answer: “" + d.evidence + "”";
        else basis = "A possible cause, not confirmed by your answer.";
        html += '<div class="analysis-row diag"><h4>Likely error</h4><p>' + escapeHtml(d.likelyError) + "</p>";
        html += '<p class="diag-meta"><span class="rank-pips" aria-hidden="true">' + [1, 2, 3].map(function (n) {
            return "<i" + (n <= pips ? ' class="on"' : "") + "></i>";
        }).join("") + "</span>" + escapeHtml((d.confidence || "low").replace(/^./, function (c) { return c.toUpperCase(); }) +
            " confidence. " + basis) + "</p></div>";
    } else {
        html += '<div class="analysis-row diag is-unknown"><h4>Likely error</h4><p>Not enough information to say.</p>';
        if (d.reason) html += '<p class="diag-meta">' + escapeHtml(d.reason) + "</p>";
        html += "</div>";
    }
    const SOURCE = {
        ai: "Analysis by the AI from this question and your answer.",
        template: "Analysis from the built-in calculus skill map.",
        offline: "Based on the topic you entered; the AI connection gives a fuller analysis."
    };
    html += '<p class="hint">' + escapeHtml(SOURCE[a.source] || SOURCE.offline) + "</p>";
    mistakeAnalysisEl.innerHTML = html;
    typesetMath(mistakeAnalysisEl);
}

// --- the practice strip ---
function renderDrillHeader(record) {
    const st = variantState(record);
    const ev = st.evidence;
    let html = '<span class="ev-status" data-status="' + ev.status + '">' + EVIDENCE_NAME[ev.status] + "</span>";
    if (st.history.length) {
        html += '<span class="set-cells" aria-hidden="true">' + st.history.slice(-12).map(function (h) {
            return '<i class="set-cell ' + (h.correct ? "ok" : "bad") + '"></i>';
        }).join("") + "</span>";
        html += '<span class="ev-count">' + ev.correct + " of " + ev.attempts + " right</span>";
    }
    drillEvidenceEl.innerHTML = html;
}

function variantCapabilityText() {
    if (canUseLiveAI()) {
        return "The AI writes each question; computable answer keys are recomputed before you see them, and questions that fail the checks are never shown.";
    }
    return "Offline mode: the built-in generator covers AP Calculus derivative, integral, and limit rules. Other topics need the AI connection (Setup).";
}

function renderDrillIdle(record) {
    const st = variantState(record);
    let html = '<div class="drill-start">';
    if (variantSession.unavailable) {
        // No generator for this topic without the AI: say so once, and offer real next steps.
        html += "<p>" + escapeHtml(variantSession.unavailable) + "</p>";
        html += '<div class="actions">';
        html += '<button type="button" class="secondary" data-action="practice-course">Practice a new ' + escapeHtml(record.subject || "") + " set</button>";
        html += '<button type="button" class="outline" data-action="back-to-log">Back to Review</button>';
        html += "</div>";
        html += '<p class="hint">A new set is general practice for the course, not questions built from this mistake. This mistake stays in spaced review either way.</p>';
        html += "</div>";
        variantAreaEl.innerHTML = html;
        return;
    }
    // Availability is decided here, from the course and the question's skill tags. Nothing
    // about this mistake is sent anywhere until the student presses a start button.
    if (!canPracticeSimilar(record) && !st.history.length && !window.VariantPractice.pickPending(record, st.target.level)) {
        html += "<p>Similar questions for " + escapeHtml(record.subject || "this course") +
            " need the AI connection. Offline, the built-in generator covers AP Calculus derivative, integral, and limit rules.</p>";
        html += '<div class="actions"><button type="button" class="secondary" data-action="practice-course">Practice a new ' +
            escapeHtml(record.subject || "") + " set</button></div></div>";
        variantAreaEl.innerHTML = html;
        return;
    }
    if (st.evidence.status === "likely_mastered") {
        html += "<p>You have answered " + st.evidence.correct + " of " + st.evidence.attempts +
            " similar questions correctly, including the last one. The spaced review of the original question will confirm it has stuck.</p>";
        html += '<div class="actions"><button type="button" class="secondary" data-action="variant-start">Practice one more anyway</button></div>';
    } else {
        html += '<p class="drill-next">Next question: <strong>' + LEVEL_NAME[st.target.level] + "</strong>, " +
            escapeHtml(STEP_REASON[st.target.reason] || RELATION_NAME[st.target.relation]) + ".</p>";
        html += '<div class="actions"><button type="button" data-action="variant-start">' +
            (st.history.length ? "Next similar question" : "Practice similar questions") + "</button></div>";
        if (!st.history.length) {
            html += "<p class=\"hint\">Each question tests the same idea with new numbers or a new setup. Getting several right in a row, not just one, is what counts as evidence you have it.</p>";
        }
    }
    html += '<p class="hint">' + escapeHtml(variantCapabilityText()) + "</p>";
    html += "</div>";
    variantAreaEl.innerHTML = html;
}

function renderVariantCard(item) {
    let html = '<article class="qa-card variant-card" data-qid="' + escapeHtml(item.id) + '">';
    html += '<div class="card-head"><strong class="qa-title">Similar question</strong>';
    html += '<span class="tag level-' + item.level + '">' + LEVEL_NAME[item.level] + "</span>";
    html += '<span class="tag">' + RELATION_NAME[item.relation] + "</span>";
    if (item.verification.status === "verified") {
        html += '<span class="tag checked" data-tip="' + escapeHtml("Answer key recomputed: " + (item.verification.method || "checked numerically")) + '">Answer checked</span>';
    } else if (item.verification.status === "unverified") {
        html += '<span class="tag unchecked">Not machine-checked</span>';
    }
    if (item.generator === "template") html += '<span class="tag">Built-in generator</span>';
    html += "</div>";
    if (item.changes.length) {
        html += '<p class="variant-changes"><span>Same idea, new setup:</span> ' + escapeHtml(item.changes.join(" · ")) + "</p>";
    }
    html += '<p class="qa-q">' + escapeHtml(item.question) + "</p>";
    html += mcqOptionsHtml("variant-" + item.id, item.options);
    html += '<div class="actions"><button type="button" data-action="variant-check">Check answer</button></div>';
    html += '<div class="feedback" role="status" data-variant-feedback hidden></div>';
    html += '<div class="answer-box" data-variant-answer hidden><h4>Answer</h4><p>' + escapeHtml(item.answer) + "</p>";
    if (item.explanation) {
        html += '<details class="explanation" data-variant-why><summary>Why</summary><p>' + escapeHtml(item.explanation) + "</p></details>";
    }
    html += "</div></article>";
    variantAreaEl.innerHTML = html;
    typesetMath(variantAreaEl);
}

function showVariant(item) {
    variantSession.item = item;
    variantSession.answered = false;
    variantResultEl.innerHTML = "";
    renderVariantCard(item);
    const card = variantAreaEl.querySelector(".variant-card");
    if (card) card.scrollIntoView({ behavior: window.Shell && window.Shell.reducedMotion() ? "auto" : "smooth", block: "start" });
}

function variantErrorMessage(data, status) {
    const code = data && data.code;
    if (code === "too_many_requests") {
        return "That's a lot of requests in one minute. Try again in about " + (data.retryAfter || 60) + " seconds.";
    }
    if (code === "rate_limited") {
        return "The AI is busy right now." + (data.retryAfter ? " Try again in about " + data.retryAfter + " seconds." : " Try again shortly.");
    }
    if (code === "timeout") return "The AI took too long to respond. Try again.";
    if (code === "invalid_output") return "The AI's questions did not pass the quality checks (for example, an answer key did not match the math), so none were shown. Try again.";
    if (data && data.error) return data.error;
    return "Could not create similar questions right now (error " + status + ").";
}

async function startVariant() {
    const sess = variantSession;
    if (sess.busy) return;
    const VP = window.VariantPractice;
    let record = findErrorRecord(sess.errId);
    if (!record || !VP) return;
    if (Date.now() < sess.retryAt) {
        variantStatusEl.textContent = "Please wait " + Math.ceil((sess.retryAt - Date.now()) / 1000) + " more seconds before trying again.";
        return;
    }
    variantStatusEl.textContent = "";
    const st = variantState(record);
    // Questions already generated for this level are used first: no new AI call.
    const queued = VP.pickPending(record, st.target.level);
    if (queued) {
        showVariant(queued);
        return;
    }
    if (window.location.protocol === "file:" || !serverHealthy) {
        variantStatusEl.textContent = "Similar-question practice needs the StudyBoost server. Start server.py and open http://127.0.0.1:8765/.";
        return;
    }

    sess.busy = true;
    const buttons = variantDrillEl.querySelectorAll('[data-action="variant-start"]');
    buttons.forEach(function (b) { b.disabled = true; b.setAttribute("aria-busy", "true"); });
    variantStatusEl.textContent = (canUseLiveAI() ? "Writing and checking similar questions at " : "Building similar questions at ") +
        LEVEL_NAME[st.target.level] + " level...";
    const slowTimer = setTimeout(function () {
        variantStatusEl.textContent = "Still working. Each question is checked before you see it, which can take a few seconds.";
    }, 8000);
    const payload = VP.buildRequest(record, {
        userId: getOrCreateUserId(),
        model: sanitizeText(modelInput.value) || undefined,
        count: 2,
        level: st.target.level
    });
    const controller = new AbortController();
    const abortTimer = setTimeout(function () { controller.abort(); }, 60000);
    try {
        const res = await fetch("/api/variants", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        let data = {};
        try { data = await res.json(); } catch (e) { data = {}; }
        record = findErrorRecord(sess.errId);
        if (!record) return; // the mistake was deleted while we waited
        // The student may have opened another mistake meanwhile: keep the results on
        // THIS mistake's record, but only draw them if its page is still the one showing.
        const onScreen = variantSession === sess;
        if (data && data.analysis && typeof data.analysis === "object") {
            record = Object.assign({}, record, { analysis: data.analysis });
        }
        if (!res.ok) {
            replaceErrorRecord(record);
            if (!onScreen) return;
            renderMistakeAnalysis(record);
            if (data.retryAfter) sess.retryAt = Date.now() + data.retryAfter * 1000;
            if (canUseLiveAI() && data.code !== "too_many_requests") recordAiResult("variant", "failed");
            if (data.code === "no_generator" || data.code === "daily_limit") {
                sess.unavailable = data.error || "Similar questions for this topic need the AI connection.";
                variantStatusEl.textContent = "";
                renderDrillIdle(record);
                return;
            }
            variantStatusEl.textContent = variantErrorMessage(data, res.status);
            return;
        }
        const accepted = VP.acceptVariants(data.variants);
        if (!accepted.length) {
            variantStatusEl.textContent = "No usable questions came back. Try again.";
            return;
        }
        record = VP.storeBatch(record, { variants: accepted, analysis: data.analysis || null });
        replaceErrorRecord(record);
        if (canUseLiveAI()) recordAiResult("variant", data.generator === "ai" ? "ok" : "failed");
        if (!onScreen) return;
        renderMistakeAnalysis(record);
        variantStatusEl.textContent = data.notice || "";
        const next = VP.pickPending(record, st.target.level) || VP.practiceState(record).pending[0];
        if (!next) {
            // Every question in the batch repeated one already answered: nothing new to show.
            variantStatusEl.textContent = "Those questions repeated ones you've already answered. Try again for new ones.";
            return;
        }
        showVariant(next);
    } catch (err) {
        console.error("Similar-question request failed:", err);
        if (variantSession !== sess) return;
        variantStatusEl.textContent = err && err.name === "AbortError"
            ? "That took too long. Try again."
            : "Could not reach the server. Check the connection and try again.";
    } finally {
        clearTimeout(slowTimer);
        clearTimeout(abortTimer);
        sess.busy = false;
        variantDrillEl.querySelectorAll('[data-action="variant-start"]').forEach(function (b) {
            b.disabled = false;
            b.removeAttribute("aria-busy");
        });
    }
}

function checkVariant() {
    const sess = variantSession;
    const item = sess.item;
    if (!item || sess.answered) return;
    const VP = window.VariantPractice;
    const card = variantAreaEl.querySelector(".variant-card");
    if (!card) return;
    const sel = card.querySelector('input[type="radio"]:checked');
    const fb = card.querySelector("[data-variant-feedback]");
    if (!sel) {
        fb.hidden = false;
        fb.className = "feedback bad";
        fb.textContent = "Select an option first.";
        return;
    }
    let record = findErrorRecord(sess.errId);
    if (!record) return;

    const ok = isMcqAnswerCorrect(sel.value, item.answer);
    sess.answered = true;
    card.querySelectorAll('input[type="radio"]').forEach(function (i) { i.disabled = true; });
    const checkBtn = card.querySelector('[data-action="variant-check"]');
    if (checkBtn) checkBtn.disabled = true;
    const idx = item.options.indexOf(sel.value);
    const note = item.optionNotes && idx >= 0 ? item.optionNotes[idx] : "";
    fb.hidden = false;
    fb.className = ok ? "feedback ok" : "feedback bad";
    fb.textContent = ok ? "Correct." : "Not quite." + (note && !/^\s*correct\b/i.test(note) ? " Your pick: " + note : "");
    markMcqOptions(card, item);
    const ab = card.querySelector("[data-variant-answer]");
    if (ab) ab.hidden = false;
    const why = card.querySelector("[data-variant-why]");
    if (why && !ok) why.open = true; // after a miss the explanation opens; after a hit it is one click away
    typesetMath(card);

    // The learning record: topic mastery (tagged "variant"), the graded attempt, the
    // variant history on the mistake, and (after a miss) an earlier spaced review.
    const before = currentMastery(record.subject, record.topic);
    recordAttempt({
        id: item.id, type: "Multiple Choice", subject: record.subject, topic: record.topic,
        topicKey: record.topicKey, source: "variant"
    }, ok);
    const after = currentMastery(record.subject, record.topic);
    record = VP.recordOutcome(record, { variant: item, correct: ok, chosen: optionLetter(sel.value), at: new Date().toISOString() });
    const nudge = VP.nudgeSchedule(record.sr, { correct: ok });
    if (nudge.changed) record = Object.assign({}, record, { sr: nudge.sr });
    replaceErrorRecord(record);
    renderErrorRecords();
    renderDrillHeader(record);
    if (nudge.changed) renderMistakeOriginal(record);
    renderVariantResult(record, { ok: ok, before: before, after: after, nudged: nudge.changed });
}

function renderVariantResult(record, r) {
    const VP = window.VariantPractice;
    const st = variantState(record);
    const suggestions = VP.followUp({ evidence: st.evidence, target: st.target, originalLevel: st.original, sr: record.sr, nudged: r.nudged });
    const beforeStat = r.before && r.before.stat;
    const afterStat = r.after && r.after.stat;
    const afterLevel = r.after ? r.after.level : "new";
    const afterPct = afterStat ? Math.round(afterStat.ema * 100) : 0;
    const beforeText = beforeStat ? MASTERY_LABEL[r.before.level] + " " + Math.round(beforeStat.ema * 100) + "%" : "Not tracked yet";
    const topicName = (record.topic || "").trim() || (record.subject || "This course") + " (general)";

    let html = '<div class="result-strip">';
    html += '<div class="result-cell"><span class="rc-label">Topic mastery: ' + escapeHtml(topicName) + "</span>";
    html += '<span class="rc-value">' + escapeHtml(beforeText) + " &rarr; " + MASTERY_LABEL[afterLevel] + " " + afterPct + "%</span>";
    html += barHtml(afterPct, "level-" + afterLevel) + "</div>";
    html += '<div class="result-cell"><span class="rc-label">This idea</span>';
    html += '<span class="rc-value">' + EVIDENCE_NAME[st.evidence.status] + "</span>";
    html += '<span class="rc-meta">' + st.evidence.correct + " of " + st.evidence.attempts + " similar questions right" +
        (st.evidence.status !== "likely_mastered" && st.evidence.needed
            ? "; " + st.evidence.needed + " more in a row at " + LEVEL_NAME[st.original] + " level would show mastery" : "") + "</span></div>";
    html += "</div>";
    if (suggestions.length) {
        html += '<ul class="next-list">' + suggestions.map(function (s) {
            return '<li data-kind="' + escapeHtml(s.kind) + '">' + escapeHtml(s.text) + "</li>";
        }).join("") + "</ul>";
    }
    html += '<div class="actions">';
    if (st.evidence.status === "likely_mastered") {
        const other = rankedPractice(4).filter(function (x) { return x.record.id !== record.id; })[0];
        if (other) {
            html += '<button type="button" data-action="open-mistake" data-id="' + escapeHtml(other.record.id) + '">Next: ' +
                escapeHtml(mistakeLabel(other.record)) + "</button>";
        }
        html += '<button type="button" class="secondary" data-action="variant-start">Practice one more anyway</button>';
    } else {
        html += '<button type="button" data-action="variant-start">Next similar question (' + LEVEL_NAME[st.target.level] + ")</button>";
    }
    html += '<button type="button" class="outline" data-action="back-to-log">Back to Review</button>';
    html += "</div>";
    variantResultEl.innerHTML = html;
}

function renderMistakeDetail(errId) {
    if (!mistakeOriginalEl || !window.VariantPractice) return;
    renderQueueBar(errId);
    if (variantSession.errId !== errId) {
        variantSession = { errId: errId, item: null, answered: false, busy: false, retryAt: 0, unavailable: "" };
    }
    const record = findErrorRecord(errId);
    if (!record) {
        mistakeOriginalEl.innerHTML = '<p class="empty">This mistake is no longer in your Mistake Log.</p>' +
            '<div class="actions"><button type="button" data-action="back-to-log">Back to Review</button></div>';
        mistakeAnalysisEl.innerHTML = "";
        variantDrillEl.hidden = true;
        return;
    }
    variantDrillEl.hidden = false;
    renderMistakeOriginal(record);
    renderMistakeAnalysis(record);
    renderDrillHeader(record);
    if (!variantSession.busy) variantStatusEl.textContent = "";
    if (variantSession.item && !variantSession.answered) {
        variantResultEl.innerHTML = "";
        renderVariantCard(variantSession.item);
    } else if (!variantResultEl.innerHTML || !variantSession.answered) {
        variantResultEl.innerHTML = "";
        renderDrillIdle(record);
    }
}

function handleMistakePageClick(ev) {
    const t = ev.target instanceof Element ? ev.target.closest("[data-action]") : null;
    if (!t || t.disabled) return;
    const action = t.getAttribute("data-action");
    if (action === "variant-start") {
        startVariant();
    } else if (action === "variant-check") {
        checkVariant();
    } else if (action === "back-to-log") {
        goToView("review");
    } else if (action === "practice-course") {
        const record = findErrorRecord(variantSession.errId);
        const course = record && AP_SUBJECTS.find(function (c) { return c.label === record.subject; });
        if (course) {
            apSubjectInput.value = course.id;
            apSubjectInput.dispatchEvent(new Event("change"));
        }
        if (record) topicInput.value = record.topic || "";
        goToPracticeSetup();
    } else if (action === "open-mistake") {
        goToView("mistake/" + t.getAttribute("data-id"));
    } else if (action === "review") {
        const id = t.getAttribute("data-id");
        const quality = parseInt(t.getAttribute("data-q"), 10);
        rateMistake(id, quality);
        const record = findErrorRecord(id);
        if (record) renderMistakeOriginal(record);
        variantStatusEl.textContent = errorStatus.textContent;
        if (reviewQueue && reviewQueue.ids.indexOf(id) !== -1 && record && window.ReviewSystem) {
            reviewQueue.rated[id] = { quality: quality, days: Math.max(0, window.ReviewSystem.daysUntilDue(record.sr)) };
            renderQueueBar(id);
            const next = document.querySelector('#queueBar [data-action="queue-next"], #queueBar [data-action="queue-finish"]');
            if (next) next.focus({ preventScroll: false });
        }
    } else if (action === "queue-next") {
        const pos = reviewQueue ? reviewQueue.ids.indexOf(variantSession.errId) : -1;
        if (pos !== -1 && pos + 1 < reviewQueue.ids.length) openQueueItem(reviewQueue.ids[pos + 1]);
    } else if (action === "queue-finish" || action === "queue-end") {
        finishReviewQueue();
    } else if (action === "queue-start") {
        startReviewQueue();
    } else if (action === "back-to-set") {
        const open = firstOpenIndex();
        goToView("practice");
        if (open >= 0) showQuestion(open, true);
    } else if (action === "queue-similar") {
        const drill = document.getElementById("variantDrill");
        if (drill) drill.scrollIntoView({ behavior: motionBehavior(), block: "start" });
        startVariant();
    }
}

(function wireReviewToday() {
    const el = document.getElementById("reviewToday");
    if (!el) return;
    el.addEventListener("click", function (ev) {
        const t = ev.target instanceof Element ? ev.target.closest('[data-action="queue-start"]') : null;
        if (t) startReviewQueue();
    });
}());

// --- The review queue -------------------------------------------------------------------
// Due mistakes, one at a time, most overdue first: recall, show the answer, rate, and the
// bar says when it comes back and offers the next one (or a similar question first, after
// Forgot or Hard). SM-2 still does all the scheduling; the queue only sets the order.
function startReviewQueue() {
    const RO = window.ReviewOrbit;
    const ids = RO ? RO.queueOrder(reviewItems()).map(function (it) { return it.id; })
        .filter(function (id) { return !sessionReviewedErrIds.has(id); }) : [];
    if (!ids.length) {
        errorStatus.textContent = "Nothing is due for review right now.";
        goToView("review");
        return;
    }
    reviewQueue = { ids: ids, rated: {} };
    lastQueueSummary = null;
    openQueueItem(ids[0]);
}

// Go to a mistake in the queue. Already on its page (the address would not change), so
// redraw it in place instead.
function openQueueItem(id) {
    if (window.Shell && window.Shell.current() === "mistake" && window.Shell.param() === id) {
        renderMistakeDetail(id);
        const bar = document.getElementById("queueBar");
        if (bar) bar.scrollIntoView({ behavior: motionBehavior(), block: "start" });
        return;
    }
    goToView("mistake/" + id);
}

function finishReviewQueue() {
    if (reviewQueue) {
        const rated = Object.keys(reviewQueue.rated).map(function (id) { return reviewQueue.rated[id]; });
        lastQueueSummary = rated.length ? {
            count: rated.length,
            forgot: rated.filter(function (r) { return r.quality < 3; }).length,
            hard: rated.filter(function (r) { return r.quality === 3; }).length,
            gotIt: rated.filter(function (r) { return r.quality >= 5; }).length,
            skipped: reviewQueue.ids.length - rated.length
        } : null;
    }
    reviewQueue = null;
    goToView("review");
}

function backInText(days) {
    return days <= 0 ? "later today" : days === 1 ? "tomorrow" : "in " + days + " days";
}

function renderQueueBar(errId) {
    const bar = document.getElementById("queueBar");
    if (!bar) return;
    const pos = reviewQueue ? reviewQueue.ids.indexOf(errId) : -1;
    // The page says what it is for: a review queue, or one mistake and its similar questions.
    const view = document.getElementById("view-mistake");
    const title = document.getElementById("mistake-title");
    if (view) view.toggleAttribute("data-queue", pos !== -1);
    if (title) title.textContent = pos !== -1 ? "Review Due Mistakes" : "Practice Similar Questions";
    if (pos === -1) {
        // Outside a queue: the way on from here (reviews due now, or the set in progress).
        const due = window.ReviewOrbit ? window.ReviewOrbit.queueOrder(reviewItems())
            .filter(function (it) { return !sessionReviewedErrIds.has(it.id); }).length : 0;
        const setOpen = generatedQuestions.length > 0 && !isSetComplete();
        if (!due && !setOpen) {
            bar.hidden = true;
            bar.innerHTML = "";
            return;
        }
        let html = '<p class="qb-note">' + (due ? due + (due === 1 ? " review is" : " reviews are") + " due now." : "Your practice set is still open.") + "</p>";
        html += '<div class="actions">';
        if (setOpen) {
            const open = firstOpenIndex();
            html += '<button type="button" class="secondary small" data-action="back-to-set">Back to your set (question ' +
                (open + 1) + " of " + generatedQuestions.length + ")</button>";
        }
        if (due) html += '<button type="button" class="small" data-action="queue-start">Start review (' + due + ")</button>";
        html += "</div>";
        bar.innerHTML = html;
        bar.hidden = false;
        bar.setAttribute("data-mode", "suggest");
        return;
    }
    bar.removeAttribute("data-mode");
    const total = reviewQueue.ids.length;
    const left = total - pos - 1;
    const rated = reviewQueue.rated[errId];
    const record = findErrorRecord(errId);
    let html = '<p class="qb-count"><b>' + (pos + 1) + "</b> of " + total + " due</p>";
    if (!rated) {
        html += '<p class="qb-note">Recall the answer first, then show it and rate yourself. ' +
            (left ? left + (left === 1 ? " more after this one." : " more after this one.") : "This is the last one.") + "</p>";
        html += '<div class="actions"><button type="button" class="outline small" data-action="queue-end">End review</button></div>';
    } else {
        html += '<p class="qb-note"><strong>' + RATING_NAME[rated.quality] + "</strong>: back " + backInText(rated.days) + ".</p>";
        html += '<div class="actions">';
        html += left
            ? '<button type="button" data-action="queue-next">Next due question (' + left + " left)</button>"
            : '<button type="button" data-action="queue-finish">Finish review</button>';
        if (rated.quality < 5 && record && canPracticeSimilar(record)) {
            html += '<button type="button" class="secondary" data-action="queue-similar">Try a similar question first</button>';
        }
        html += "</div>";
    }
    bar.innerHTML = html;
    bar.hidden = false;
}

// Review's first block: what is due today and one button to start, or what comes next.
function renderReviewToday(items) {
    const el = document.getElementById("reviewToday");
    if (!el || !window.ReviewOrbit) return;
    if (!items.length) {
        el.hidden = true;
        el.innerHTML = "";
        return;
    }
    const due = window.ReviewOrbit.queueOrder(items).filter(function (it) { return !sessionReviewedErrIds.has(it.id); }).length;
    let html = "";
    const s = lastQueueSummary;
    if (s) {
        const parts = [];
        if (s.gotIt) parts.push(s.gotIt + " Got it");
        if (s.hard) parts.push(s.hard + " Hard");
        if (s.forgot) parts.push(s.forgot + " Forgot");
        html += '<p class="rt-done">Reviewed ' + s.count + ": " + escapeHtml(parts.join(", ")) + "." +
            (s.skipped ? " " + s.skipped + " left for later." : "") + "</p>";
    }
    if (due) {
        html += '<p class="kicker">Today</p><h3 class="rt-title"><b>' + due + "</b> " + (due === 1 ? "review is" : "reviews are") + " due now</h3>" +
            "<p>One at a time: recall the answer, show it, rate yourself. Each rating sets when it comes back.</p>" +
            '<div class="actions"><button type="button" data-action="queue-start">Start review</button></div>';
    } else {
        const next = window.ReviewOrbit.nextDue(items);
        html += '<p class="kicker">Today</p><h3 class="rt-title">Nothing is due now</h3>' +
            (next ? "<p>Next: " + next.count + (next.count === 1 ? " review " : " reviews ") + backInText(next.days) + ".</p>" : "");
    }
    el.innerHTML = html;
    el.hidden = false;
}

if (variantDrillEl) {
    document.getElementById("view-mistake").addEventListener("click", handleMistakePageClick);
}
document.addEventListener("studyboost:view", function (ev) {
    if (ev.detail && ev.detail.view === "mistake") renderMistakeDetail(ev.detail.param);
});
if (window.Shell && window.Shell.current() === "mistake") renderMistakeDetail(window.Shell.param());

// v2 Phase 1: Home front door. Start CTAs lead into Practice; the rest of the app is
// one tap away in the navigation.
function isReturningUser() {
    try {
        const m = localStorage.getItem(STORAGE_MASTERY);
        if (m && m !== "{}" && m !== "null") return true;
        if (Array.isArray(errorRecords) && errorRecords.length) return true;
        if (getXp() > 0) return true;
    } catch (e) { /* ignore */ }
    return false;
}

// --- Home dashboard: real numbers only ---------------------------------------
// Opens Practice on the setup form, even when a set is already on screen.
function goToPracticeSetup() {
    if (generatedQuestions.length && !practiceSetupOpen) {
        practiceSetupOpen = true;
        setPracticeMode();
        updateScoreBanner();
    }
    goToView("practice").then(function () {
        try { apSubjectInput.focus(); } catch (e) { /* ignore */ }
    });
}

function reviewCounts() {
    if (window.ReviewSystem) return window.ReviewSystem.summarize(errorRecords);
    return { total: errorRecords.length, due: 0, learning: 0, mastered: 0, masteryPct: 0 };
}

function readStreak() {
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(STREAK_KEY)) || {}; } catch (e) { stored = {}; }
    // Same local day boundaries as bumpStreak, so the two can never disagree.
    const today = todayKey();
    return window.HomeSummary.activeStreak(stored, today, window.HomeSummary.addDays(today, -1));
}

function dayCount(n) {
    return n + (n === 1 ? " day" : " days");
}

function barHtml(pct, extraClass) {
    return '<span class="bar-track"><span class="bar-fill' + (extraClass ? " " + extraClass : "") +
        '" style="width:' + pct + '%"></span></span>';
}

// --- Home: the command center -----------------------------------------------------------
// The first screen answers "what do I do now?" from the student's own data. The decision
// itself (due reviews, then a weak topic with a saved mistake, then the weakest topic)
// lives in js/home-summary.js; this renders it.
function weakInputs() {
    const weak = window.MasteryModel ? window.MasteryModel.summarizeMastery(masteryMap).weakest : [];
    const top = rankedPractice(1)[0];
    const weakMistake = top && typeof top.ema === "number"
        ? { id: top.record.id, topic: top.record.topic || "", subject: top.record.subject || "", ema: top.ema }
        : null;
    return { weakest: weak[0], weakMistake: weakMistake };
}

// The giant numeral beside the headline. Always a real number from this student's data.
function commandFigure(step, counts, items) {
    if (step.kind === "review") return { value: String(counts.due), unit: "due now" };
    if (step.kind === "continue") return { value: String(step.answered), unit: "of " + step.total + " answered" };
    if ((step.kind === "variant" || step.kind === "focus") && typeof step.pct === "number") {
        return { value: step.pct + "%", unit: "recent accuracy" };
    }
    const waiting = items.filter(function (it) { return !it.due; });
    if (waiting.length) {
        const soonest = Math.min.apply(null, waiting.map(function (it) { return it.days; }));
        return { value: String(soonest), unit: soonest === 1 ? "day to the next review" : "days to the next review" };
    }
    const streak = readStreak().count;
    if (streak) return { value: String(streak), unit: "day streak" };
    return null;
}

function commandListHtml(step, items) {
    const RO = window.ReviewOrbit;
    if (!RO) return "";
    const line = function (it, rec) {
        return "<li>" +
            '<span class="cl-what"><span class="cl-course">' + escapeHtml(shortCourse(it.course)) + "</span>" +
            '<span class="cl-topic">' + escapeHtml(it.topic || "No topic") + "</span></span>" +
            '<span class="cl-q">' + escapeHtml(RO.snippet(rec ? rec.question : "", 84)) + "</span>" +
            "</li>";
    };
    if (step.kind === "review") {
        const due = RO.sortItems(items.filter(function (it) { return it.due; }), "due");
        let html = due.slice(0, 4).map(function (it) { return line(it, findErrorRecord(it.id)); }).join("");
        if (due.length > 4) html += '<li class="cl-more">+ ' + (due.length - 4) + " more due</li>";
        return html;
    }
    if (step.kind === "variant" && step.errId) {
        const it = items.find(function (x) { return x.id === step.errId; });
        return it ? line(it, findErrorRecord(it.id)) : "";
    }
    return "";
}

function renderNextStep(counts) {
    const el = document.getElementById("nextStep");
    if (!el || !window.HomeSummary) return;
    const HS = window.HomeSummary;
    const w = weakInputs();
    const returning = isReturningUser();
    const openSet = generatedQuestions.length && !isSetComplete() ? {
        next: firstOpenIndex(), total: generatedQuestions.length, answered: scoreSummary().answered,
        subject: (currentSetMeta && currentSetMeta.subject) || ""
    } : null;
    const input = { due: counts.due, weakest: w.weakest, weakMistake: w.weakMistake, hasActivity: returning, openSet: openSet };
    const step = HS.nextStep(input);
    currentStep = step;
    // A quieter second move: after the set in progress, what would come next (often the due
    // reviews); after the reviews, the weak topic.
    const alt = step.kind === "continue" ? HS.nextStep(Object.assign({}, input, { openSet: null }))
        : step.kind === "review" ? HS.nextStep(Object.assign({}, input, { due: 0 })) : null;
    currentAlt = alt && (alt.kind === "variant" || alt.kind === "focus" || (step.kind === "continue" && alt.kind === "review")) ? alt : null;

    el.setAttribute("data-kind", step.kind);
    el.setAttribute("data-state", returning ? "returning" : "first");
    const kicker = document.getElementById("commandKicker");
    const figure = document.getElementById("commandFigure");
    const title = document.getElementById("home-title");
    const dek = document.getElementById("commandDek");
    const list = document.getElementById("commandList");
    const btn = document.getElementById("nextStepBtn");
    const altBtn = document.getElementById("nextStepAlt");

    if (!returning) {
        kicker.textContent = "Adaptive AP practice";
        figure.hidden = true;
        // Static markup: one giant word on the blue plane, the rest of the line on a slab.
        title.innerHTML = '<span class="h1-big">Practice</span> <span class="h1-tag">that brings back what you miss.</span>';
        renderFirstVisitCopy();
        list.hidden = true;
        list.innerHTML = "";
        btn.textContent = "Start studying";
        altBtn.hidden = true;
        return;
    }

    const items = reviewItems();
    kicker.textContent = "Your next move";
    // Due reviews: the headline itself carries the giant number ("4 / questions are due").
    // Other steps: the number is a separate real reading (accuracy, days to next review).
    const lead = step.kind === "review" ? /^(\d+)\s+(.*)$/.exec(step.title) : null;
    const fig = lead ? null : commandFigure(step, counts, items);
    figure.hidden = !fig;
    figure.innerHTML = fig
        ? '<span class="cf-num">' + escapeHtml(fig.value) + '</span><span class="cf-unit">' + escapeHtml(fig.unit) + "</span>"
        : "";
    if (lead) {
        // The space between the spans keeps "4 questions" one phrase for screen readers.
        title.innerHTML = '<span class="h1-num">' + escapeHtml(lead[1]) + '</span> <span class="h1-words">' + escapeHtml(lead[2]) + "</span>";
    } else {
        title.textContent = step.title;
    }
    title.classList.toggle("has-num", !!lead);
    dek.textContent = step.body;
    const listHtml = commandListHtml(step, items);
    list.hidden = !listHtml;
    list.innerHTML = listHtml;
    list.setAttribute("aria-label", step.kind === "variant" ? "The question you missed" : "Due now");
    if (listHtml) typesetMath(list);
    btn.textContent = step.cta;
    altBtn.hidden = !currentAlt;
    if (currentAlt) {
        const where = currentAlt.topic || currentAlt.subject || "your weakest topic";
        altBtn.textContent = currentAlt.kind === "review" ? "Or: review " + counts.due + " due now"
            : (currentAlt.kind === "variant" ? "Then: similar questions on " : "Then: practice ") + where +
                (typeof currentAlt.pct === "number" ? " (" + currentAlt.pct + "%)" : "");
    }
}

// First-visit promises must match what this server can do: questions come from the
// student's notes only with a live AI connection; otherwise from the built-in bank.
// index.html ships the bank wording, so the offline site never swaps text after load.
function renderFirstVisitCopy() {
    const ai = canUseLiveAI();
    const dek = document.getElementById("commandDek");
    if (dek && document.getElementById("nextStep").getAttribute("data-state") === "first") {
        dek.textContent = ai
            ? "AP-style questions from your own notes or any of 13 AP courses. The ones you miss come back on a spaced schedule until they stick."
            : "AP-style questions from a built-in bank for 13 AP courses. The ones you miss come back on a spaced schedule until they stick.";
    }
    const step = document.getElementById("welcomeStepGenerate");
    if (step) {
        step.innerHTML = "<strong>Generate</strong> " + (ai
            ? "AP-style questions from a course, topic, and difficulty, or from your own notes."
            : "AP-style questions for a course, topic, and difficulty from the built-in bank. With an AI connection, from your own notes too.");
    }
    // Notes: offline nothing is summarized, so the page promises key lines, not a summary.
    const notesTitle = document.getElementById("summary-title");
    if (notesTitle) notesTitle.textContent = ai ? "AI Note Summary" : "Key Lines From Your Notes";
    const notesDek = document.getElementById("notesDek");
    if (notesDek) {
        notesDek.textContent = ai
            ? "Paste what you have. Get a short summary and key points, then practice on the same material."
            : "Paste what you have. Offline, StudyBoost pulls out your key lines as they are; with an AI connection it writes a summary.";
    }
    if (summaryBtn) summaryBtn.textContent = ai ? "Generate Summary" : "Pull out key lines";
    const summaryEmpty = summaryOutput && summaryOutput.querySelector(".empty");
    if (summaryEmpty) summaryEmpty.textContent = ai ? "Paste your notes and generate a summary to get started." : "Paste your notes to pull out the key lines.";
    const why = document.getElementById("whyQuestions");
    if (why) {
        why.textContent = ai
            ? "AI generates practice from your own notes"
            : "A built-in question bank for 13 AP courses; with an AI connection, questions from your own notes";
    }
}

function runStep(step) {
    if (!step || !isReturningUser()) {
        goToPracticeSetup();
        return;
    }
    if (step.kind === "variant") {
        goToView("mistake/" + step.errId);
        return;
    }
    if (step.kind === "continue") {
        const open = firstOpenIndex();
        goToView("practice");
        if (open >= 0) showQuestion(open, true);
        return;
    }
    if (step.kind === "review") {
        startReviewQueue();
        return;
    }
    if (step.kind === "focus") {
        const course = AP_SUBJECTS.find(function (s) { return s.label === step.subject; });
        if (course) {
            apSubjectInput.value = course.id;
            apSubjectInput.dispatchEvent(new Event("change"));
        }
        topicInput.value = step.topic || "";
    }
    goToPracticeSetup();
}

function renderMissions(counts) {
    const el = document.getElementById("missionList");
    if (!el) return;
    el.innerHTML = window.HomeSummary.missions({ daily: getDaily(), due: counts.due }).map(function (m) {
        const count = m.state === "idle" ? m.note : m.value + " of " + m.target;
        return '<li class="mission" data-state="' + m.state + '">' +
            '<span class="mission-label">' + escapeHtml(m.label) + "</span>" +
            '<span class="mission-count">' + escapeHtml(count) + "</span>" +
            barHtml(m.pct) +
            "</li>";
    }).join("");
}

// Home's orbit: the same chart as Review, small and passive. The whole chart links there.
function renderOrbit(counts) {
    const chart = document.getElementById("orbitChart");
    const caption = document.getElementById("orbitCaption");
    if (!chart || !window.ReviewOrbit) return;
    const items = reviewItems();
    chart.innerHTML = orbitSvg(items, { size: 420, labels: false, interactive: false });
    const summary = counts.total
        ? counts.total + (counts.total === 1 ? " saved mistake, " : " saved mistakes, ") + counts.due + " due now"
        : "no saved mistakes yet";
    chart.setAttribute("aria-label", "Open the review orbit: " + summary + ".");
    if (!caption) return;
    if (!counts.total) {
        caption.textContent = "Your review orbit. Questions you miss land in the core, then move outward as you remember them.";
        return;
    }
    const lead = counts.due ? counts.due + " due now in the core. " : "Nothing due now. ";
    caption.textContent = lead + "Each dot is a saved mistake: the farther out, the more days until it comes back.";
}

// Coming up: how many saved mistakes come back on each of the next seven days (SM-2).
function renderComingUp() {
    const el = document.getElementById("comingUp");
    if (!el || !window.ReviewOrbit) return;
    const items = reviewItems();
    if (!items.length) {
        el.innerHTML = '<p class="empty">Nothing is scheduled yet. Questions you miss show up here on the day they come back.</p>';
        return;
    }
    const up = window.ReviewOrbit.upcoming(items, 7);
    const max = Math.max.apply(null, up.days.map(function (d) { return d.count; }).concat([1]));
    let html = '<ol class="week-bars">';
    up.days.forEach(function (d) {
        const label = d.offset === 0 ? "now" : d.offset === 1 ? "1 day" : d.offset + " days";
        html += '<li class="wb' + (d.offset === 0 ? " is-now" : "") + (d.count ? "" : " is-zero") + '">' +
            '<span class="wb-num">' + d.count + "</span>" +
            '<span class="wb-bar" style="height:' + (4 + Math.round((d.count / max) * 84)) + 'px" aria-hidden="true"></span>' +
            '<span class="wb-day">' + (d.offset === 0 ? "due " : "in ") + label + "</span></li>";
    });
    html += "</ol>";
    html += '<p class="hint">' + (up.later ? up.later + (up.later === 1 ? " more comes" : " more come") + " back after that. " : "") +
        "Days are counted from now on your SM-2 schedule.</p>";
    el.innerHTML = html;
}

function renderHud() {
    const HS = window.HomeSummary;
    const progress = HS.levelProgress(getXp(), XP_PER_LEVEL);
    const streak = readStreak();
    const hud = document.getElementById("railHud");
    if (hud) {
        hud.innerHTML =
            '<p class="hud-level">Level <b>' + progress.level + "</b></p>" +
            barHtml(progress.pct) +
            '<p class="hud-meta">' + progress.toNext + " XP to Level " + (progress.level + 1) + "</p>" +
            '<p class="hud-meta">' + (streak.count ? "Streak: " + dayCount(streak.count) : "No active streak") + "</p>";
    }
    const counts = reviewCounts();
    const badge = document.getElementById("navDueBadge");
    if (badge) {
        badge.hidden = !counts.due;
        badge.textContent = counts.due;
        badge.setAttribute("aria-label", counts.due + " due");
    }
    const daily = getDaily();
    const stat = function (value, label) {
        return '<div class="status-cell"><dt>' + label + "</dt><dd>" + value + "</dd></div>";
    };
    const levelBlock =
        '<div class="status-level"><span class="status-lv">Level</span>' +
        '<span class="status-num">' + progress.level + "</span>" +
        '<div class="status-xp">' + barHtml(progress.pct) +
        '<p class="hud-meta">' + getXp() + " XP total, " + progress.toNext + " to Level " + (progress.level + 1) + "</p></div></div>";
    const strip = document.getElementById("statusStrip");
    if (strip) {
        strip.innerHTML = levelBlock + '<dl class="status-cells">' +
            stat(streak.count ? dayCount(streak.count) : "None", "Streak") +
            stat(daily.questions, "Questions today") +
            stat(daily.reviews, "Reviews today") +
            stat(counts.mastered + " of " + counts.total, "Mistakes mastered") +
            "</dl>";
    }
    const sheet = document.getElementById("statusSheet");
    if (sheet) {
        sheet.innerHTML = levelBlock + '<dl class="status-cells">' +
            stat(streak.count ? dayCount(streak.count) : "None", "Streak") +
            "</dl>";
    }
}

function renderHome() {
    if (!window.HomeSummary) return;
    // The welcome card is for people with no activity yet. It has done its job once
    // they have answered something, even if they never dismissed it.
    const welcome = document.getElementById("welcomeCard");
    const returning = isReturningUser();
    if (welcome && !welcome.hidden && returning) welcome.hidden = true;
    const view = document.getElementById("view-home");
    if (view) view.setAttribute("data-returning", returning ? "1" : "0");
    const counts = reviewCounts();
    renderNextStep(counts);
    renderMissions(counts);
    renderOrbit(counts);
    renderComingUp();
}

// Keep the level, streak, and due count current everywhere after any change.
function refreshHud() {
    if (!window.HomeSummary) return;
    renderHud();
    if (window.Shell && window.Shell.current() === "home") renderHome();
}

document.addEventListener("studyboost:view", function (ev) {
    const view = ev.detail && ev.detail.view;
    if (view === "home") renderHome();
    if (view === "progress") loadStats();
});
renderHome();
refreshHud();

// v2 #4: first-run welcome card — walk a brand-new user through the 4-step spine
// once. Shown only to users with no prior activity who haven't dismissed it; reuses
// isReturningUser() and the Start-CTA scroll/focus so there's no new mechanism.
const ONBOARD_KEY = "studyBoostOnboardedV1";
(function initWelcomeCard() {
    const card = document.getElementById("welcomeCard");
    if (!card) return;
    let seen = false;
    try { seen = localStorage.getItem(ONBOARD_KEY) === "1"; } catch (e) { /* ignore */ }
    if (seen || isReturningUser()) return; // returning or already-onboarded: never show
    card.hidden = false;
    const dismiss = function () {
        card.hidden = true;
        try { localStorage.setItem(ONBOARD_KEY, "1"); } catch (e) { /* storage full */ }
    };
    const x = document.getElementById("welcomeDismiss");
    if (x) x.addEventListener("click", dismiss);
    const start = document.getElementById("welcomeStart");
    if (start) start.addEventListener("click", function () {
        dismiss();
        goToPracticeSetup();
    });
}());
(function wireNextStep() {
    const btn = document.getElementById("nextStepBtn");
    const alt = document.getElementById("nextStepAlt");
    if (btn) btn.addEventListener("click", function () { runStep(currentStep); });
    if (alt) alt.addEventListener("click", function () { runStep(currentAlt); });
}());
// B2: populate the persistent footer feedback link if a form URL is configured.
(function initFeedbackFooter() {
    const el = document.getElementById("feedbackFooter");
    if (!el) return;
    el.innerHTML = feedbackLinkHtml("feedback-link", "Share feedback on StudyBoost");
}());

// P3a: insert a snippet at the textarea caret (replacing any selection), respecting
// maxlength, then fire 'input' so the notes-context UI updates.
function insertAtCursor(el, text) {
    if (!el || !text) return;
    const max = parseInt(el.getAttribute("maxlength"), 10) || Infinity;
    const start = el.selectionStart != null ? el.selectionStart : el.value.length;
    const end = el.selectionEnd != null ? el.selectionEnd : el.value.length;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    const room = max - (before.length + after.length);
    if (room <= 0) return;
    const insert = text.length > room ? text.slice(0, room) : text;
    el.value = before + insert + after;
    el.focus();
    const caret = start + insert.length;
    try { el.setSelectionRange(caret, caret); } catch (e) { /* ignore */ }
    el.dispatchEvent(new Event("input", { bubbles: true }));
}
// Formula quick-insert bar: each button carries its $...$ snippet in data-insert.
(function wireFormulaBar() {
    const bar = document.getElementById("formulaBar");
    if (!bar || !noteInput) return;
    bar.addEventListener("click", function (ev) {
        const btn = ev.target.closest("[data-insert]");
        if (btn) insertAtCursor(noteInput, btn.getAttribute("data-insert"));
    });
}());

// P3b: smart formula paste. Rich-text notes copied from the web/Word carry sub/sup
// formatting that a plain textarea drops ("F_i" -> "Fi"). On paste we read the
// clipboard's text/html, convert <sub>/<sup> (and common Unicode super/subscript
// glyphs) to _{}/^{}, and wrap the affected tokens in $...$ so KaTeX renders them.
const UNICODE_SUPER = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "ⁿ": "n", "⁺": "+", "⁻": "-" };
const UNICODE_SUB = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9", "ₐ": "a", "ₑ": "e", "ᵢ": "i", "ⱼ": "j", "ₙ": "n", "ₓ": "x", "₊": "+", "₋": "-" };
function convertPastedFormulas(html, plainText) {
    let text;
    if (html) {
        // DOMParser "text/html" yields an inert document: no scripts run, no
        // resources load. We only read textContent, never inject the HTML.
        const doc = new DOMParser().parseFromString(html, "text/html");
        doc.querySelectorAll("sub").forEach(function (el) { el.replaceWith("_{" + el.textContent + "}"); });
        doc.querySelectorAll("sup").forEach(function (el) { el.replaceWith("^{" + el.textContent + "}"); });
        text = (doc.body ? doc.body.textContent : "") || "";
    } else {
        text = plainText || "";
    }
    text = text
        .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻]+/g, function (run) {
            return "^{" + run.split("").map(function (c) { return UNICODE_SUPER[c] || c; }).join("") + "}";
        })
        .replace(/[₀₁₂₃₄₅₆₇₈₉ₐₑᵢⱼₙₓ₊₋]+/g, function (run) {
            return "_{" + run.split("").map(function (c) { return UNICODE_SUB[c] || c; }).join("") + "}";
        });
    // Wrap formula tokens (a word carrying _{}/^{} groups) in $...$ for KaTeX.
    return text.replace(/[A-Za-z0-9]*(?:[_^]\{[^}]*\})+[A-Za-z0-9]*/g, function (m) { return "$" + m + "$"; });
}
(function wireSmartPaste() {
    if (!noteInput) return;
    noteInput.addEventListener("paste", function (ev) {
        const cd = ev.clipboardData || window.clipboardData;
        if (!cd) return;
        const html = cd.getData("text/html");
        const plain = cd.getData("text/plain");
        const hasHtmlFormula = html && /<su[bp](\s|>)/i.test(html);
        const hasUnicodeFormula = /[⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻₀₁₂₃₄₅₆₇₈₉ₐₑᵢⱼₙₓ₊₋]/.test(plain || "");
        if (!hasHtmlFormula && !hasUnicodeFormula) return; // nothing to fix: default paste
        ev.preventDefault();
        insertAtCursor(noteInput, convertPastedFormulas(hasHtmlFormula ? html : "", plain));
    });
}());
    
// --- Unfinished work survives a refresh ------------------------------------------------
// A practice set in progress (questions, what was already checked, short-answer drafts,
// the question on screen) and the Notes box are kept in this browser for a day, so a
// refresh or a phone interruption doesn't throw them away. Restoring only redraws: grades,
// XP, and attempts were recorded when they happened and are never recorded twice. A set
// is dropped once it is complete (its results are saved by then). Not part of backups.

function readSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data || typeof data !== "object" || Date.now() - (data.savedAt || 0) > SESSION_MAX_AGE_MS) {
            localStorage.removeItem(SESSION_KEY);
            return null;
        }
        return data;
    } catch (e) {
        return null;
    }
}

function saveSessionNow() {
    clearTimeout(sessionTimer);
    if (restoringSession) return;
    const hasSet = generatedQuestions.length > 0;
    const complete = hasSet && isSetComplete();
    const open = hasSet && !complete;
    const drafts = {};
    if (open) {
        quizOutput.querySelectorAll("[data-sa-input]").forEach(function (ta) {
            if (ta.value && !ta.readOnly) drafts[ta.getAttribute("data-sa-input")] = ta.value;
        });
        // A picked but unchecked option is a draft too.
        quizOutput.querySelectorAll(".qa-card[data-qid]").forEach(function (card) {
            const qid = card.getAttribute("data-qid");
            const picked = card.querySelector('.mcq-options input[type="radio"]:checked');
            if (picked && !picked.disabled && !(quizResults[qid] && quizResults[qid].done)) drafts[qid] = { pick: picked.value };
        });
    }
    const data = {
        savedAt: Date.now(),
        notes: noteInput.value || "",
        summary: lastSummary,
        set: hasSet ? {
            questions: generatedQuestions,
            results: quizResults,
            index: practiceIndex,
            meta: currentSetMeta,
            preSet: preSetMastery,
            drafts: drafts,
            complete: complete,
            stats: complete ? completedStats : null,
            shown: complete && resultsShown
        } : null
    };
    try {
        if (!data.notes && !data.set && !data.summary) localStorage.removeItem(SESSION_KEY);
        else localStorage.setItem(SESSION_KEY, JSON.stringify(data));
    } catch (e) { /* storage full or blocked: the work just won't survive a refresh */ }
}

function saveSession() {
    clearTimeout(sessionTimer);
    sessionTimer = setTimeout(saveSessionNow, 300);
}

// Put one card back the way the student left it (checked answer, submitted short answer,
// or an unsent draft), without grading anything again.
function restoreCardState(item, drafts) {
    const card = findQuestionCard(item.id);
    if (!card) return;
    const qid = item.id;
    const r = quizResults[qid] || {};
    const fb = card.querySelector('[data-feedback="' + cssEscape(qid) + '"]');
    const radios = card.querySelectorAll('.mcq-options input[type="radio"]');
    if (card.querySelector(".check-mcq")) {
        if (!r.done) {
            const draft = drafts && drafts[qid];
            if (draft && typeof draft.pick === "string") {
                radios.forEach(function (radio) { radio.checked = radio.value === draft.pick; });
            }
            return;
        }
        radios.forEach(function (radio) { radio.checked = radio.value === item.userAnswer; });
        markMcqOptions(card, item);
        revealAnswer(card, qid);
        if (!r.correct) revealExplanation(card, qid);
        if (fb) {
            fb.hidden = false;
            fb.className = r.correct ? "feedback ok" : "feedback bad";
            fb.textContent = mcqFeedbackText(item, r.correct);
        }
        radios.forEach(function (radio) { radio.disabled = true; });
        card.querySelector(".check-mcq").disabled = true;
        return;
    }
    const ta = card.querySelector("[data-sa-input]");
    if (!ta) return;
    if (!r.submitted && !r.done) {
        if (drafts && typeof drafts[qid] === "string") ta.value = drafts[qid];
        return;
    }
    ta.value = item.userAnswer || "";
    ta.setAttribute("readonly", "readonly");
    ta.classList.add("locked");
    const submit = card.querySelector(".submit-sa");
    if (submit) submit.disabled = true;
    revealAnswer(card, qid);
    const sg = card.querySelector('[data-selfgrade="' + cssEscape(qid) + '"]');
    if (sg) sg.hidden = false;
    if (!fb) return;
    fb.hidden = false;
    if (r.done) {
        card.querySelectorAll(".self-correct, .self-wrong").forEach(function (b) { b.disabled = true; });
        fb.className = r.correct ? "feedback ok" : "feedback bad";
        fb.textContent = r.correct ? "Counted as correct." : "Counted as not yet right" +
            (item.explanation ? ". The explanation is below." : ".");
        if (!r.correct) revealExplanation(card, qid);
    } else {
        fb.className = "feedback";
        fb.textContent = "Answer submitted — compare with the suggested answer, then grade yourself.";
    }
}

function restoreSession() {
    const saved = readSession();
    if (!saved) return;
    if (saved.notes && !noteInput.value) {
        noteInput.value = saved.notes;
        updateNotesContextUI();
    }
    restoreSummary(saved.summary);
    const set = saved.set;
    if (!set || !Array.isArray(set.questions) || !set.questions.length) return;
    restoringSession = true;
    try {
        generatedQuestions = set.questions;
        quizResults = set.results && typeof set.results === "object" ? set.results : {};
        currentSetMeta = set.meta || null;
        if (set.preSet) preSetMastery = set.preSet;
        renderQuestions();
        generatedQuestions.forEach(function (item) { restoreCardState(item, set.drafts || {}); });
        if (set.complete && isSetComplete()) {
            // A finished set: the same result, read-only (XP and streak were counted once).
            completedStats = set.stats || { streak: readStreak().count || 1, setXp: 0, daily: getDaily() };
            enterCompletionMode(completedStats);
            if (set.shown) {
                const card = document.getElementById("completionCard");
                if (card) card.setAttribute("data-counted", "1"); // no count-up a second time
                showResults();
            } else {
                showQuestion(Math.max(0, Math.min(set.index || 0, generatedQuestions.length - 1)), false);
            }
            quizStatus.textContent = "Restored your finished set and its result. Nothing was counted again.";
        } else {
            showQuestion(Math.max(0, Math.min(set.index || 0, generatedQuestions.length - 1)), false);
            quizStatus.textContent = "Restored your unfinished set. Answers you already checked are kept and were not counted again.";
        }
    } catch (e) {
        generatedQuestions = [];
        quizResults = {};
        currentSetMeta = null;
        renderQuestions();
    } finally {
        restoringSession = false;
    }
}

(function wireSessionSaving() {
    quizOutput.addEventListener("input", saveSession);   // short-answer drafts
    quizOutput.addEventListener("change", saveSession);  // option picks
    quizOutput.addEventListener("click", saveSession);   // checks, grades, navigation
    noteInput.addEventListener("input", saveSession);
    // A phone can drop the page without warning once it is in the background.
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") saveSessionNow();
    });
    window.addEventListener("pagehide", saveSessionNow);
}());
restoreSession();
// Home was drawn before the session came back; redraw it so a set in progress shows there.
if (generatedQuestions.length && window.Shell && window.Shell.current() === "home") renderHome();
