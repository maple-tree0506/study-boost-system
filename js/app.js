
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
let showOnlyDue = false;
let mistakeSubjectFilter = "";
let lastNotesContext = "";
let serverHealthy = false;
let healthReady = false;
let healthConfig = { openai_configured: false };

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

function readUIPrefs() {
    try {
        const raw = localStorage.getItem(STORAGE_UI);
        if (!raw) return { model: "" };
        const p = JSON.parse(raw);
        return { model: typeof p.model === "string" ? p.model : "" };
    } catch (e) {
        return { model: "" };
    }
}

function saveUIPrefs() {
    const prefs = { model: sanitizeText(modelInput.value) };
    localStorage.setItem(STORAGE_UI, JSON.stringify(prefs));
    uiPrefsStatus.textContent = "Preferences saved.";
}

function applyUIPrefs() {
    const p = readUIPrefs();
    modelInput.value = p.model || defaultModelPlaceholder();
}

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
        text = "Offline question bank";
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
        const o = healthConfig.openai_configured ? "AI features available" : "no API key yet";
        healthStatus.textContent = "Connected — " + o + ".";
        if (!isProviderConfigured()) {
            healthStatus.textContent += " Practice works offline; add a key to enable AI.";
        }
    } catch (e) {
        serverHealthy = false;
        healthConfig.openai_configured = false;
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
    return { simplifiedSummary: summaryText || normalized, keyPointsHtml: listHtml };
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
function createMockQuestions(topic, apSubjectId, difficulty, expected, notesContext) {
    const allBanks = (typeof window !== "undefined" && window.OFFLINE_BANK) || {};
    const subjectBank = allBanks[apSubjectId];
    if (!subjectBank) return null;

    const tier = ({ basic: "basic", medium: "medium", challenge: "challenge" })[difficulty] || "medium";
    const pack = subjectBank[tier] || subjectBank.medium || subjectBank.basic || subjectBank.challenge;
    if (!pack || !Array.isArray(pack.mcq) || !Array.isArray(pack.sa)) return null;

    const label = { basic: "Basic", medium: "Medium", challenge: "Challenge" }[difficulty] || "Medium";
    const course = subjectLabelFromId(apSubjectId);
    const focus = sanitizeText(topic) || course;
    const prefix = "[" + label + " · " + course + "] ";
    const fill = function (s) { return String(s || "").replace(/\{focus\}/g, focus); };

    const notesLead = sanitizeText(notesContext).slice(0, 120);
    const notesPrefix = notesLead
        ? "[From your notes: \"" + notesLead + (notesLead.length >= 120 ? "…" : "") + "\"] "
        : "";

    const out = [];
    if (expected.mcq > 0 && pack.mcq.length) {
        const mcqIdx = pickBankIndices(apSubjectId + "|" + tier + "|mcq", pack.mcq.length, expected.mcq);
        mcqIdx.forEach(function (idx, i) {
            const item = pack.mcq[idx];
            out.push({
                id: "mcq-demo-" + Date.now() + "-" + i + "-" + idx,
                type: "Multiple Choice",
                question: notesPrefix + prefix + fill(item.q),
                options: (item.o || []).slice(),
                answer: item.a,
                explanation: fill(item.e || "")
            });
        });
    }
    if (expected.sa > 0 && pack.sa.length) {
        const saIdx = pickBankIndices(apSubjectId + "|" + tier + "|sa", pack.sa.length, expected.sa);
        saIdx.forEach(function (idx, j) {
            const item = pack.sa[idx];
            out.push({
                id: "sa-demo-" + Date.now() + "-" + j + "-" + idx,
                type: "Short Answer",
                question: notesPrefix + fill(item.q),
                answer: item.a,
                explanation: fill(item.e || "")
            });
        });
    }
    return out.length ? out : null;
}

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

// One cell per question in the set: empty until graded, then right or wrong.
function scoreBannerInner() {
    const s = scoreSummary();
    const total = generatedQuestions.length;
    const cells = generatedQuestions.map(function (q) {
        const r = quizResults[q.id];
        const state = r && r.done ? (r.correct ? " ok" : " bad") : "";
        return '<i class="set-cell' + state + '"></i>';
    }).join("");
    return '<span class="score-text">' + s.correct + " correct of " + s.answered + " graded · " + total + " in this set.</span>" +
        '<span class="set-cells" aria-hidden="true">' + cells + "</span>";
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
    if (!generatedQuestions.length) {
        quizOutput.innerHTML = "<p class='empty'>Choose a course and generate questions to begin.</p>";
        return;
    }

    let html = renderScoreBanner();

    generatedQuestions.forEach(function (item, index) {
        const isMcq = item.type === "Multiple Choice" && item.options && item.options.length;
        html += '<article class="qa-card" data-qid="' + escapeHtml(item.id) + '">';
        html += '<div class="card-head"><strong class="qa-title">Question ' + (index + 1) + "</strong>";
        html += '<span class="tag">' + escapeHtml(item.type) + "</span>";
        // R1: resurfaced due mistakes are added on top of the requested set — label
        // them so the (intentionally) larger count reads as the feature it is.
        if (item.source === "review") {
            html += '<span class="tag review">Review · from your Mistake Log</span>';
        }
        html += "</div>";
        html += '<p class="qa-q">' + escapeHtml(item.question) + "</p>";

        if (isMcq) {
            html += '<div class="mcq-options" data-role="mcq">';
            item.options.forEach(function (opt) {
                html += "<label>";
                html += '<input type="radio" name="mcq-' + escapeHtml(item.id) + '" value="' + escapeHtml(opt) + '" /> ';
                html += "<span>" + escapeHtml(opt) + "</span>";
                html += "</label>";
            });
            html += "</div>";
            html += '<div class="actions"><button type="button" class="secondary check-mcq" data-qid="' + escapeHtml(item.id) + '">Check answer</button></div>';
            html += '<div class="feedback" role="status" data-feedback="' + escapeHtml(item.id) + '" hidden></div>';
        } else {
            html += '<div class="field">';
            html += '<textarea class="sa-input" data-sa-input="' + escapeHtml(item.id) + '" aria-label="Your answer" placeholder="Type your answer, then submit to see the suggested answer."></textarea>';
            html += "</div>";
            html += '<div class="actions"><button type="button" class="secondary submit-sa" data-qid="' + escapeHtml(item.id) + '">Submit answer</button></div>';
            html += '<div class="feedback" role="status" data-feedback="' + escapeHtml(item.id) + '" hidden></div>';
            // Self-grade buttons appear only AFTER the student submits their answer.
            html += '<div class="short-actions" data-selfgrade="' + escapeHtml(item.id) + '" hidden>';
            html += '<span class="selfgrade-q">Compare with the suggested answer below. Did you get it right?</span>';
            html += '<button type="button" class="outline self-correct" data-qid="' + escapeHtml(item.id) + '" data-correct="1">I was right</button>';
            html += '<button type="button" class="outline self-wrong" data-qid="' + escapeHtml(item.id) + '" data-correct="0">I was wrong</button>';
            html += "</div>";
        }

        // Khan-style: the answer stays hidden until the student checks/submits.
        html += '<div class="answer-box" data-answer="' + escapeHtml(item.id) + '" hidden>';
        html += "<h4>Suggested answer</h4>";
        html += "<p>" + escapeHtml(item.answer) + "</p>";
        if (item.explanation) {
            // Remediation explanation: hidden until an INCORRECT response reveals it.
            html += '<div class="explanation" data-explanation="' + escapeHtml(item.id) + '" hidden>';
            html += "<h4>Why</h4><p>" + escapeHtml(item.explanation) + "</p>";
            html += "</div>";
        }
        html += "</div>";

        html += '<div class="actions card-foot">';
        html += '<button type="button" class="text-btn" data-action="save-error" data-id="' + escapeHtml(item.id) + '">Add to Mistake Log</button>';
        html += "</div>";

        html += "</article>";
    });

    quizOutput.innerHTML = html;
    typesetMath(quizOutput);
}

// --- P0: study streak (consecutive days) ---
const STREAK_KEY = "studyBoostStreakV1";
function bumpStreak() {
    const today = new Date().toISOString().slice(0, 10);
    let s = {};
    try { s = JSON.parse(localStorage.getItem(STREAK_KEY)) || {}; } catch (e) { s = {}; }
    if (s.lastDay === today) return s.count || 1;            // already counted today
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    s.count = s.lastDay === yesterday ? (s.count || 0) + 1 : 1;
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
    const today = new Date().toISOString().slice(0, 10);
    let d = {};
    try { d = JSON.parse(localStorage.getItem(DAILY_KEY)) || {}; } catch (e) { d = {}; }
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

// Snapshot the practiced topic's level BEFORE grading, so completion can show movement.
// Called once per generated set (the chosen subject+topic; review-injected items are
// secondary). Stores "new" when the topic has no prior data.
function snapshotPreSetMastery(subject, topic) {
    const cur = currentMastery(subject, topic);
    preSetMastery = { subject: subject, topic: topic, level: cur ? cur.level : "new" };
}

// Build the completion-screen growth line: a celebratory level-up if the practiced
// topic crossed a threshold this set, else the current level + recent accuracy.
// Returns "" when there's no graded data for the topic (nothing honest to show).
function masteryGrowthHtml() {
    if (!preSetMastery || !window.MasteryModel) return "";
    const cur = currentMastery(preSetMastery.subject, preSetMastery.topic);
    if (!cur || !cur.stat || !cur.stat.attempts) return "";
    const before = preSetMastery.level;
    const after = cur.level;
    const rawTopic = (preSetMastery.topic || "").trim();
    const label = escapeHtml(rawTopic || preSetMastery.subject || "This topic");
    const acc = Math.round((cur.stat.ema || 0) * 100);
    if ((MASTERY_RANK[after] || 0) > (MASTERY_RANK[before] || 0)) {
        return '<p class="cc-growth is-up">' +
            label + ": " + MASTERY_LABEL[before] + " &rarr; " + MASTERY_LABEL[after] + " &#9650; leveled up</p>";
    }
    return '<p class="cc-growth">' +
        label + " mastery: " + MASTERY_LABEL[after] + " &middot; " + acc + "% recent accuracy</p>";
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

// --- P0: completion screen — a state switch shown once a set is fully graded ---
function maybeShowCompletion() {
    const total = generatedQuestions.length;
    if (!total) return;
    if (scoreSummary().answered !== total) return;          // not finished yet
    enterCompletionMode();
}

function enterCompletionMode() {
    if (document.getElementById("completionCard")) return;  // already shown
    const total = generatedQuestions.length;
    const s = scoreSummary();
    const wrong = s.answered - s.correct;
    // generated items answered incorrectly are auto-captured into the Mistake Log (SM-2)
    const added = generatedQuestions.filter(function (q) {
        const r = quizResults[q.id];
        return q.source !== "review" && r && r.done && !r.correct;
    }).length;
    const streak = bumpStreak();

    // P1: set-completion XP bonus (+20), then read totals for display
    let setXp = 20;
    generatedQuestions.forEach(function (q) {
        const r = quizResults[q.id];
        if (r && r.done) setXp += (r.correct ? 10 : 4) + (q.source === "review" ? 5 : 0);
    });
    addXp(20);
    const daily = bumpDaily({ xp: 20 });
    const lvl = levelInfo(getXp());

    const card = document.createElement("div");
    card.id = "completionCard";
    card.className = "completion-card";
    const progress = window.HomeSummary ? window.HomeSummary.levelProgress(getXp(), XP_PER_LEVEL) : { pct: 0 };
    let html = "";
    html += '<div class="cc-result">';
    html += '<h3 class="cc-title">Set complete</h3>';
    html += '<p class="cc-score">' + s.correct + '<span class="cc-of"> / ' + total + "</span></p>";
    html += "</div>";
    html += '<div class="cc-reward">';
    html += '<p class="cc-xp">+<span id="ccXp">' + setXp + "</span> XP</p>";
    html += '<p class="cc-level">Level ' + lvl.level + " · " + lvl.toNext + " XP to Level " + (lvl.level + 1) + "</p>";
    html += '<span class="bar-track"><span class="bar-fill" style="width:' + progress.pct + '%"></span></span>';
    html += "</div>";
    html += '<div class="cc-detail">';
    html += masteryGrowthHtml(); // v2 #2: the growth signal, at the motivation peak
    html += "<p>" + (wrong === 0
        ? "Perfect set — nothing to review."
        : added + (added === 1 ? " question" : " questions") + " added to your review queue.") + "</p>";
    html += "<p>Today: " + daily.questions + " questions · " + daily.reviews + " reviews · +" + daily.xp + " XP</p>";
    html += "<p>Streak: Day " + streak + "</p>";
    html += "</div>";
    html += '<div class="actions cc-actions">';
    if (wrong > 0) {
        html += '<button type="button" data-action="start-review">Review My Mistakes</button>';
    }
    // Close the loop: an obvious "do it again" next step. Primary when the set was
    // perfect (no Review CTA to compete with), secondary otherwise.
    html += '<button type="button" data-action="new-set"' + (wrong > 0 ? ' class="secondary"' : "") + ">Start a new set</button>";
    html += '<button type="button" class="secondary" data-action="view-progress">View Progress</button>';
    html += '<button type="button" class="outline" data-action="show-questions">Show the questions</button>';
    html += "</div>";
    // Growth loop: sharing sits on its own line so it never competes with the
    // learning actions above it, but is still offered at the motivation peak.
    lastShareText = buildShareText({
        correct: s.correct,
        total: total,
        level: lvl.level,
        streak: streak,
        subject: (preSetMastery && preSetMastery.subject) || subjectLabelFromId(apSubjectInput.value)
    });
    html += '<p class="share-line"><button type="button" class="outline" data-action="share-progress">Share my progress</button></p>';
    const fb = feedbackLinkHtml("feedback-link");
    if (fb) html += '<p class="feedback-line">' + fb + " — 1 minute, helps StudyBoost improve.</p>";
    card.innerHTML = html;

    // state switch: completion card becomes the main view; collapse the question pile
    quizOutput.insertBefore(card, quizOutput.firstChild);
    const sb = document.getElementById("scoreBanner");
    if (sb) sb.style.display = "none";
    quizOutput.querySelectorAll(".qa-card").forEach(function (c) { c.style.display = "none"; });
    card.scrollIntoView({ behavior: "smooth", block: "start" });
    if (window.Shell) window.Shell.countUp(document.getElementById("ccXp"), setXp);
    refreshHud();
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

    // P0 completion-screen CTAs
    if (saveAction === "show-questions") {
        const cc = document.getElementById("completionCard");
        if (cc) cc.remove();
        const sb = document.getElementById("scoreBanner");
        if (sb) sb.style.display = "";
        quizOutput.querySelectorAll(".qa-card").forEach(function (c) { c.style.display = ""; });
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
        renderQuestions();
        quizStatus.textContent = "Reviewing " + generatedQuestions.length +
            (generatedQuestions.length === 1 ? " item" : " items") + " due from your Mistake Log.";
        quizOutput.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
    }
    if (saveAction === "share-progress") {
        shareProgress(t);
        return;
    }
    if (saveAction === "new-set") {
        const cc = document.getElementById("completionCard");
        if (cc) cc.remove();
        const panel = document.getElementById("quiz-title");
        if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
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
            fb.className = "feedback bad";
            fb.textContent = "Select an option first.";
            return;
        }

        const ok = isMcqAnswerCorrect(sel.value, item.answer);
        quizResults[qid] = { done: true, correct: ok };
        fb.hidden = false;
        fb.className = ok ? "feedback ok" : "feedback bad";
        fb.textContent = ok ? "Correct." : "Incorrect. Compare with the suggested answer below.";
        markMcqOptions(card, item);
        revealAnswer(card, qid);
        updateScoreBanner();
        recordAttempt(item, ok);
        applyGradeOutcome(item, ok);
        if (!ok) revealExplanation(card, qid);
        maybeShowCompletion();
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
            fb.className = "feedback bad";
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
        if (fb) {
            fb.hidden = false;
            fb.className = isCorrect ? "feedback ok" : "feedback bad";
            fb.textContent = isCorrect ? "Counted as correct." : "Counted as incorrect.";
        }
        updateScoreBanner();
        const item = generatedQuestions.find(function (x) { return x.id === qid; });
        recordAttempt(item, isCorrect);
        applyGradeOutcome(item, isCorrect);
        if (!isCorrect) revealExplanation(card, qid);
        maybeShowCompletion();
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
    list.push(payload);
    writeAttemptQueue(list);
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
        a.download = "studyboost-backup-" + new Date().toISOString().slice(0, 10) + ".json";
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
        const restoreMessage = "It replaces the mistake log" +
            (hasProgress ? ", topic mastery, XP, and streak" : " and topic mastery") +
            " currently stored in this browser.";
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
        source: item.source === "review" ? "review" : "generated"
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
            at: payload.ts
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

async function flushAttemptQueue() {
    if (window.location.protocol === "file:" || !serverHealthy) return;
    let list = readAttemptQueue();
    if (!list.length) return;

    const remaining = [];
    for (let i = 0; i < list.length; i++) {
        try {
            await postAttempt(list[i]);
        } catch (e) {
            // stop on first failure; keep this item and the rest for next time
            remaining.push.apply(remaining, list.slice(i));
            break;
        }
    }
    writeAttemptQueue(remaining);
}

function computeLocalStats(queue) {
    const total = queue.length;
    const correctTotal = queue.reduce(function (n, a) { return n + (a.correct ? 1 : 0); }, 0);

    const subjMap = {};
    const dayMap = {};
    queue.forEach(function (a) {
        const subj = a.subject || "Uncategorized";
        if (!subjMap[subj]) subjMap[subj] = { answered: 0, correct: 0 };
        subjMap[subj].answered++;
        subjMap[subj].correct += a.correct ? 1 : 0;

        const day = (a.ts || "").slice(0, 10);
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
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
        const d = new Date(today.getTime() - i * 86400000);
        const key = d.toISOString().slice(0, 10);
        const e = dayMap[key] || { answered: 0, correct: 0 };
        daily.push({ date: key, answered: e.answered, correct: e.correct, accuracy: e.answered ? e.correct / e.answered : 0 });
    }

    return {
        overall: { answered: total, correct: correctTotal, accuracy: total ? correctTotal / total : 0 },
        bySubject: bySubject,
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

function renderStats(data, localOnly) {
    const overall = data.overall || { answered: 0, correct: 0, accuracy: 0 };
    let html = "";

    if (localOnly) {
        html += '<p class="stats-notice">Showing local-only data (server unreachable). ' +
            'These are unsynced results queued on this device and will merge once the server is back.</p>';
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

    const daily = data.daily || [];
    const maxVol = daily.reduce(function (m, d) { return Math.max(m, d.answered); }, 0);
    html += "<h3>Last 14 days</h3>";
    html += '<p class="hint">Bar height shows questions answered. Color shows accuracy that day.</p>';
    html += '<ul class="trend-legend">' +
        '<li><i class="acc-high"></i>80% or higher</li>' +
        '<li><i class="acc-mid"></i>50 to 79%</li>' +
        '<li><i class="acc-low"></i>Under 50%</li>' +
        "</ul>";
    html += '<div class="trend">';
    daily.forEach(function (d) {
        const heightPct = maxVol ? Math.max(6, Math.round((d.answered / maxVol) * 100)) : 0;
        const title = d.date + ": " + d.answered + " answered" + (d.answered ? ", " + pct(d.accuracy) + "% correct" : "");
        const label = d.date.slice(5);
        html += '<div class="trend-col" data-tip="' + escapeHtml(title) + '">';
        html += '<span class="trend-bar-wrap">';
        if (d.answered) {
            html += '<span class="trend-bar ' + accuracyClass(d.accuracy, d.answered) + '" style="height:' + heightPct + '%"></span>';
        }
        html += "</span>";
        html += '<span class="trend-label">' + escapeHtml(label) + "</span>";
        html += "</div>";
    });
    html += "</div>";

    statsOutput.innerHTML = html;
}

// A blank topicKey is the subject-general bucket; give it a readable label.
function topicDisplay(stat) {
    const label = (stat && typeof stat.topic === "string") ? stat.topic.trim() : "";
    return label || "General (no topic)";
}

// #6: hand-rolled SVG radar of topic mastery — no charting library (the project has
// no build chain). It's a gestalt complement to the bars below, which stay as the
// accessible, detailed view. Renders only with >=3 topics (a radar needs >=3 axes)
// and caps at the 8 most-practiced. Each axis radius = the topic's recent accuracy
// (ema), matching the bar percentages. Returns "" when there's too little to plot.
function masteryRadarSvg(topics) {
    const axes = (topics || []).slice(0, 8);
    const n = axes.length;
    if (n < 3) return "";
    const cx = 150, cy = 105, R = 66, TAU = Math.PI * 2;
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
        const short = raw.length > 14 ? raw.slice(0, 13) + "..." : raw;
        labels += '<text class="radar-label" x="' + lp[0].toFixed(1) + '" y="' + lp[1].toFixed(1) + '" text-anchor="' + anchor + '" dominant-baseline="middle">' + escapeHtml(short) + "</text>";
    }
    const dataPoly = '<polygon class="radar-shape" points="' + polyPoints(function (i) {
        return R * Math.max(0, Math.min(1, axes[i].ema || 0));
    }) + '"/>';
    const summary = axes.map(function (t) { return topicDisplay(t) + " " + Math.round((t.ema || 0) * 100) + "%"; }).join(", ");
    return '<div class="mastery-radar"><svg viewBox="0 0 300 210" width="100%" role="img" aria-label="Topic mastery radar: ' +
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

    const subjectLabel = subjectLabelFromId(apSubjectInput.value);
    const summary = window.MasteryModel.summarizeMastery(masteryMap, { subject: subjectLabel });
    const topics = summary.topics || [];

    if (!topics.length) {
        topicMasteryOutput.innerHTML = emptyMsg;
        return;
    }

    // Topic Mastery levels are deliberately distinct from SM-2's new/learning/mastered.
    const LEVEL_LABEL = { "new": "New", developing: "Developing", proficient: "Proficient", mastered: "Mastered" };
    const masteredCount = topics.filter(function (t) {
        return window.MasteryModel.masteryLevel(t) === "mastered";
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
        const rank = MASTERY_RANK[level] || 0;
        html += '<div class="mastery-row">';
        html += '<span class="mastery-topic">' + escapeHtml(topicDisplay(t)) + "</span>";
        html += '<span class="tag mastery-' + level + '">' + (LEVEL_LABEL[level] || level) + "</span>";
        html += '<span class="rank-pips" aria-hidden="true">' + [1, 2, 3].map(function (n) {
            return "<i" + (n <= rank ? ' class="on"' : "") + "></i>";
        }).join("") + "</span>";
        html += '<div class="mastery-meter">';
        html += '<span class="bar-track" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100" aria-label="' + escapeHtml(topicDisplay(t)) + ' mastery">';
        html += '<span class="bar-fill level-' + level + '" style="width:' + pct + '%"></span>';
        html += "</span>";
        html += '<span class="mastery-pct">' + pct + "%</span>";
        html += "</div>";
        html += '<span class="mastery-meta">' + t.attempts + " graded</span>";
        html += "</div>";
    });
    html += "</div>";

    topicMasteryOutput.innerHTML = html;
}

// FR3/FR4: load and render stats; FR5 fallback to local queue when offline.
async function loadStats() {
    statsStatus.textContent = "Loading progress...";
    await flushAttemptQueue();

    // Progress is per-user: scope the request to this browser's anonymous id.
    // If storage is unavailable (no id), fall back to the local-queue view rather
    // than requesting global data.
    const uid = getOrCreateUserId();
    if (window.location.protocol === "file:" || !serverHealthy || !uid) {
        renderStats(computeLocalStats(readAttemptQueue()), true);
        statsStatus.textContent = "Showing results saved on this device — they'll sync when the connection returns.";
        return;
    }

    try {
        const res = await fetch("/api/stats?userId=" + encodeURIComponent(uid));
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        renderStats(data, false);
        statsStatus.textContent = "Progress up to date.";
    } catch (e) {
        renderStats(computeLocalStats(readAttemptQueue()), true);
        statsStatus.textContent = "Showing results saved on this device — they'll sync when the connection returns.";
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
    const reviewPlan = window.PracticeSelection
        ? window.PracticeSelection.planPracticeSelection({ reviews: errorRecords, subject: subjectLabel })
        : { selected: [] };
    const reviewItems = reviewPlan.selected;
    const finalizeSet = function (newItems) {
        // R2: stamp topic identity so graded outcomes can feed topic-level mastery.
        const topicKey = window.MasteryModel ? window.MasteryModel.normalizeTopicKey(topic) : "";
        (newItems || []).forEach(function (q) {
            q.subject = subjectLabel || "Uncategorized";
            q.source = "generated";
            q.reason = "generator:new";
            q.topic = topic || "";
            q.topicKey = topicKey;
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

    const ctxLabel =
        ctx.source === "textarea" ? "your notes" :
        ctx.source === "summary" ? "your last summary" :
        "the course and topic";
    quizStatus.textContent = "Generating questions from " + ctxLabel + "...";
    quizResults = {};
    // v2 #2: remember the practiced topic's mastery level before any grading, so the
    // completion screen can show growth. Uses the chosen subject+topic (what the user
    // is practicing); review-injected items from other topics are secondary.
    snapshotPreSetMastery(subjectLabel || "Uncategorized", topic || "");

    const tryDemo = function (reason) {
        const demo = createMockQuestions(topic, apId, difficulty, expected, notesCtx);
        if (!demo || !demo.length) {
            if (reviewItems.length) {
                generatedQuestions = reviewItems.slice();
                renderQuestions();
                quizStatus.textContent = reason + " There's no built-in bank for " + subjectLabel +
                    " — showing " + reviewItems.length + " review(s) due instead.";
            } else {
                generatedQuestions = [];
                renderQuestions();
                quizStatus.textContent = reason + " There's no built-in bank for " + subjectLabel +
                    " yet — add an API key for AI questions, or try a course like " +
                    "AP Calculus AB or AP Biology.";
            }
            return;
        }
        generatedQuestions = finalizeSet(demo);
        renderQuestions();
        const demoNew = generatedQuestions.filter(function (q) { return q.source !== "review"; }).length;
        quizStatus.textContent = reason + " Showing " + demoNew + " new from the built-in bank" +
            (reviewItems.length ? " + " + reviewItems.length + " due review." : ".");
    };

    if (!healthReady) {
        quizStatus.textContent = "Still checking connection — try again in a moment.";
        return;
    }

    if (!canUseLiveAI()) {
        const reason = !serverHealthy
            ? "AI is unavailable right now."
            : "AI isn't set up yet.";
        tryDemo(reason);
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
        let aiQuestions = await generateQuizWithAI(topic, difficulty, expected, apId, notesCtx);
        generatedQuestions = normalizeAIQuestions(aiQuestions);

        if (!generatedQuestions.length) {
            throw new Error("Empty AI result.");
        }

        if (isQuizQualityAcceptable(generatedQuestions, topic || subjectLabel, expected)) {
            recordAiResult("quiz", "ok");
        } else {
            quizStatus.textContent = "Questions were too generic — trying again...";
            aiQuestions = await generateQuizWithAI(topic, difficulty, expected, apId, notesCtx);
            generatedQuestions = normalizeAIQuestions(aiQuestions);
            if (!generatedQuestions.length || !isQuizQualityAcceptable(generatedQuestions, topic || subjectLabel, expected)) {
                throw new Error("Quality check failed.");
            }
            recordAiResult("quiz", "repaired");
        }

        generatedQuestions = finalizeSet(generatedQuestions);
        renderQuestions();
        const aiNew = generatedQuestions.filter(function (q) { return q.source !== "review"; }).length;
        quizStatus.textContent = "Questions ready — " + aiNew + " new from " + ctxLabel +
            (reviewItems.length ? " + " + reviewItems.length + " due review." : ".");
    } catch (err) {
        console.error("AI quiz generation failed:", err); // debug detail stays out of the UI
        recordAiResult("quiz", "failed");
        const timedOut = /timed out|too long/i.test((err && err.message) || "");
        tryDemo(timedOut ? "The AI timed out." : "The AI request didn't go through.");
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
        userAnswer: found.userAnswer || "",
        sr: window.ReviewSystem ? window.ReviewSystem.initReview() : null,
        subject: subj,
        // R2: copy the question's OWN topic (set at finalizeSet), never the live
        // topicInput — same rule as subject, so switching topics mid-session can't
        // mislabel a captured mistake.
        topic: found.topic || "",
        topicKey: found.topicKey || "",
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

function renderErrorRecords() {
    const RS = window.ReviewSystem;
    refreshHud(); // every change to the log passes through here

    // Progress analytics over ALL records (independent of the current filter).
    let analytics = "";
    if (RS && errorRecords.length) {
        const s = RS.summarize(errorRecords);
        analytics =
            '<div class="review-stats">' +
            '<div class="review-stat"><span class="rs-num">' + s.due + '</span><span class="rs-label">Due now</span></div>' +
            '<div class="review-stat"><span class="rs-num">' + s.learning + '</span><span class="rs-label">Learning</span></div>' +
            '<div class="review-stat"><span class="rs-num">' + s.mastered + '</span><span class="rs-label">Mastered</span></div>' +
            '<div class="review-stat"><span class="rs-num">' + s.masteryPct + '%</span><span class="rs-label">Mastery</span></div>' +
            "</div>";
    }

    let records = errorRecords.slice();
    if (showOnlyDue && RS) {
        records = records.filter(function (item) { return RS.isDue(item.sr); });
    }
    if (mistakeSubjectFilter) {
        records = records.filter(function (item) { return item.subject === mistakeSubjectFilter; });
    }
    // Show the most urgent (soonest-due) items first.
    if (RS) {
        records.sort(function (a, b) {
            const da = a.sr && a.sr.due ? new Date(a.sr.due).getTime() : 0;
            const db = b.sr && b.sr.due ? new Date(b.sr.due).getTime() : 0;
            return da - db;
        });
    }

    if (!records.length) {
        // Truly empty log gets the motivational empty; filter-excluded gets filter copy.
        const emptyMsg = errorRecords.length
            ? "No items match this filter."
            : "Questions you miss are saved here automatically for spaced review.";
        errorOutput.innerHTML = analytics + "<p class='empty'>" + emptyMsg + "</p>";
        return;
    }

    const STATUS_LABEL = { "new": "New", learning: "Learning", mastered: "Mastered" };

    const cards = records.map(function (item, index) {
        const sr = item.sr;
        const status = RS ? RS.status(sr) : "new";
        const due = RS ? RS.isDue(sr) : true;
        const days = RS ? RS.daysUntilDue(sr) : 0;
        const dueText = due ? "Due now" : (days === 1 ? "Next review in 1 day" : "Next review in " + days + " days");
        const id = escapeHtml(item.id);
        // Show what each rating would schedule, so the choice has a visible result.
        const ratingButton = function (quality, label) {
            const next = RS ? RS.review(sr, quality).intervalDays : 0;
            const when = next === 1 ? "1 day" : next + " days";
            return '<button type="button" class="outline rate" data-action="review" data-q="' + quality + '" data-id="' + id + '"' +
                (RS ? ' data-next="' + when + '" aria-label="' + label + ', next review in ' + when + '"' : "") + ">" + label + "</button>";
        };
        return (
            '<article class="error-card' + (due ? " is-due" : "") + '">' +
            '<div class="card-head"><strong class="qa-title">Item ' + (index + 1) + "</strong>" +
            '<span class="tag subject">' + escapeHtml(item.subject || "Uncategorized") + "</span>" +
            '<span class="tag">' + escapeHtml(item.type) + "</span>" +
            '<span class="tag status-' + status + '">' + (STATUS_LABEL[status] || status) + "</span>" +
            (due ? '<span class="tag due">Due</span>' : "") +
            "</div>" +
            '<p class="qa-q">' + escapeHtml(item.question) + "</p>" +
            (item.userAnswer
                ? '<p class="your-answer"><strong>Your answer:</strong> ' + escapeHtml(item.userAnswer) + "</p>"
                : "") +
            '<details class="answer-box"><summary>Suggested answer</summary><p>' + escapeHtml(item.answer) + "</p></details>" +
            (item.explanation
                ? '<details class="answer-box"><summary>Why</summary><p>' + escapeHtml(item.explanation) + "</p></details>"
                : "") +
            '<p class="due-info">' + escapeHtml(dueText) + (sr && sr.reviews ? " · reviewed " + sr.reviews + "x" : "") + "</p>" +
            '<div class="actions review-actions">' +
            '<span class="selfgrade-q">How well did you recall it?</span>' +
            ratingButton(2, "Forgot") +
            ratingButton(3, "Hard") +
            ratingButton(5, "Got it") +
            '<button type="button" class="danger small" data-action="remove-error" data-id="' + id + '">Delete</button>' +
            "</div>" +
            "</article>"
        );
    }).join("");

    errorOutput.innerHTML = analytics + cards;
    typesetMath(errorOutput);
}

// One renderer for the AI and offline summaries, ending in the next step of the loop.
function renderSummary(summaryText, listHtml) {
    summaryOutput.innerHTML =
        "<h3>Simplified Summary</h3><p>" + escapeHtml(summaryText) + "</p>" +
        "<h3>Key Points</h3><ul>" + listHtml + "</ul>" +
        '<div class="actions"><button type="button" data-action="practice-notes">Practice these notes</button></div>';
    typesetMath(summaryOutput);
}

summaryOutput.addEventListener("click", function (ev) {
    const btn = ev.target instanceof Element ? ev.target.closest('[data-action="practice-notes"]') : null;
    if (btn) goToPracticeSetup();
});

summaryBtn.addEventListener("click", async function () {
    const raw = sanitizeText(noteInput.value);
    if (!raw) {
        summaryStatus.textContent = "Paste your notes first.";
        summaryOutput.innerHTML = "<p class='empty'>Paste your notes and generate a summary to get started.</p>";
        return;
    }
    if (!healthReady) {
        summaryStatus.textContent = "Still checking connection — try again in a moment.";
        return;
    }

    summaryStatus.textContent = "Generating summary...";

    if (!canUseLiveAI()) {
        const demo = summarizeNotesDemo(raw);
        renderSummary(demo ? demo.simplifiedSummary : raw, demo ? demo.keyPointsHtml : "");
        lastNotesContext = raw;
        summaryStatus.textContent = serverHealthy
            ? "Offline summary — add an API key in Setup & connection to enable AI summaries."
            : "Offline summary — start the local server to enable AI. Your notes are linked to the quiz.";
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
        renderSummary(json.simplifiedSummary, listHtml);
        lastNotesContext = json.simplifiedSummary + "\n" + (json.keyPoints || []).join("\n");
        summaryStatus.textContent = "Summary ready — your practice questions can now use these notes.";
        updateNotesContextUI();
    } catch (err) {
        console.error("AI summary failed:", err); // debug detail stays out of the UI
        summaryStatus.textContent = "AI summary unavailable right now — showing an offline summary instead.";
        const demo = summarizeNotesDemo(raw);
        renderSummary(demo ? demo.simplifiedSummary : raw, demo ? demo.keyPointsHtml : "");
        lastNotesContext = raw;
        updateNotesContextUI();
    } finally {
        setAIControlsBusy(false);
        summaryBtn.removeAttribute("aria-busy");
    }
});

quizBtn.addEventListener("click", generateQuiz);

showAllBtn.addEventListener("click", function () {
    showOnlyDue = false;
    renderErrorRecords();
    errorStatus.textContent = "Showing all items.";
});

showUnknownBtn.addEventListener("click", function () {
    showOnlyDue = true;
    renderErrorRecords();
    errorStatus.textContent = "Showing items due for review.";
});

clearErrorsBtn.addEventListener("click", clearErrorRecords);

mistakeSubjectFilterEl.addEventListener("change", function () {
    mistakeSubjectFilter = mistakeSubjectFilterEl.value;
    renderErrorRecords();
});

errorOutput.addEventListener("click", function (event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.getAttribute("data-action");
    const id = target.getAttribute("data-id");
    if (!id) return;
    if (action === "review") {
        // Count a rating toward today's reviews once. It earns no XP, so the XP totals
        // are unchanged; resurfaced practice items are counted in recordAttempt instead.
        const firstRating = !sessionReviewedErrIds.has(id);
        reviewMistake(id, parseInt(target.getAttribute("data-q"), 10));
        if (firstRating) {
            bumpDaily({ reviews: 1 });
            refreshHud();
        }
    } else if (action === "remove-error") {
        removeErrorRecord(id);
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
apSubjectInput.addEventListener("change", function () {
    if (masteryCourseInput) masteryCourseInput.value = apSubjectInput.value;
    renderTopicMastery();
});
if (masteryCourseInput) {
    masteryCourseInput.addEventListener("change", function () {
        apSubjectInput.value = masteryCourseInput.value;
        renderTopicMastery();
    });
}
if (window.location.protocol === "file:") {
    loadStats();
}

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
function goToPracticeSetup() {
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
    // Same UTC day boundaries as bumpStreak, so the two can never disagree.
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    return window.HomeSummary.activeStreak(stored, today, yesterday);
}

function dayCount(n) {
    return n + (n === 1 ? " day" : " days");
}

function barHtml(pct, extraClass) {
    return '<span class="bar-track"><span class="bar-fill' + (extraClass ? " " + extraClass : "") +
        '" style="width:' + pct + '%"></span></span>';
}

function renderNextStep(counts) {
    const el = document.getElementById("nextStep");
    if (!el) return;
    const weak = window.MasteryModel ? window.MasteryModel.summarizeMastery(masteryMap).weakest : [];
    const step = window.HomeSummary.nextStep({
        due: counts.due,
        weakest: weak[0],
        hasActivity: isReturningUser()
    });
    el.setAttribute("data-kind", step.kind);
    el.innerHTML =
        "<h2>" + escapeHtml(step.title) + "</h2>" +
        "<p>" + escapeHtml(step.body) + "</p>" +
        '<div class="actions"><button type="button" id="nextStepBtn">' + escapeHtml(step.cta) + "</button></div>";
    document.getElementById("nextStepBtn").addEventListener("click", function () {
        if (step.kind === "review") {
            showOnlyDue = true;
            renderErrorRecords();
            errorStatus.textContent = "Showing items due for review.";
            goToView("review");
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
    });
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

// Review orbit: each saved mistake is a dot, and its distance from the center is the
// real number of days until SM-2 brings it back. Rings sit at the first SM-2 intervals.
function renderOrbit(counts) {
    const chart = document.getElementById("orbitChart");
    const caption = document.getElementById("orbitCaption");
    const HS = window.HomeSummary;
    const RS = window.ReviewSystem;
    if (!chart || !RS) return;

    const C = 210;
    const points = HS.orbitPoints(errorRecords.slice(0, 80), RS.daysUntilDue, RS.isDue);
    const dots = points.map(function (p, i) {
        const x = (C + p.r * Math.cos(p.angle)).toFixed(1);
        const y = (C + p.r * Math.sin(p.angle)).toFixed(1);
        const when = p.due ? "due now" : "back in " + dayCount(p.days);
        return '<g class="orbit-dot' + (p.due ? " is-due" : "") + '" style="--i:' + Math.min(i, 24) + '" data-tip="' +
            escapeHtml((p.subject || "Saved question") + ": " + when) + '">' +
            '<circle class="orbit-hit" cx="' + x + '" cy="' + y + '" r="13"/>' +
            '<circle class="orbit-mark" cx="' + x + '" cy="' + y + '" r="' + (p.due ? 5.5 : 6.5) + '"/>' +
            "</g>";
    }).join("");
    const rings = HS.ORBIT_RINGS.map(function (days) {
        const r = HS.orbitRadius(days).toFixed(1);
        const a = -Math.PI / 4;
        const lx = (C + HS.orbitRadius(days) * Math.cos(a)).toFixed(1);
        const ly = (C + HS.orbitRadius(days) * Math.sin(a)).toFixed(1);
        return '<circle class="orbit-ring" cx="' + C + '" cy="' + C + '" r="' + r + '"/>' +
            '<text class="orbit-tick" x="' + lx + '" y="' + ly + '" text-anchor="middle" dominant-baseline="central">' + days + "d</text>";
    }).join("");
    const summary = counts.total
        ? counts.total + " saved questions, " + counts.due + " due now"
        : "No saved questions yet";
    chart.innerHTML = '<svg viewBox="0 0 420 420" role="img" aria-label="Review schedule: ' + escapeHtml(summary) + '">' +
        '<circle class="orbit-core" cx="' + C + '" cy="' + C + '" r="' + HS.ORBIT_CORE + '"/>' +
        rings + dots + "</svg>";

    if (!caption) return;
    if (!counts.total) {
        caption.textContent = "Your review schedule. Questions you miss land here, then move out as you remember them.";
        return;
    }
    const lead = counts.due ? counts.due + " due now. " : "Nothing due now. ";
    caption.textContent = lead + "Each dot is a saved question. Farther from the center means more days until it comes back.";
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
    if (welcome && !welcome.hidden && isReturningUser()) welcome.hidden = true;
    const counts = reviewCounts();
    renderNextStep(counts);
    renderMissions(counts);
    renderOrbit(counts);
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
(function wireStartCta() {
    const cta = document.getElementById("startStudyingCta");
    if (!cta) return;
    cta.addEventListener("click", function (ev) {
        ev.preventDefault();
        goToPracticeSetup();
    });
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
    