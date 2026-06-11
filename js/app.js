
const STORAGE_KEY_ERRORS = "studyBoostMistakesV2";
const STORAGE_UI = "studyBoostUIPrefsV1";
const STORAGE_ATTEMPT_QUEUE = "studyBoostAttemptQueueV1";
const STORAGE_AI_RELIABILITY = "studyBoostAiReliabilityV1";
const STORAGE_MASTERY = "studyBoostMasteryV1";

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

function notesContextSeed(text) {
    const s = String(text || "default");
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}

function updateNotesContextUI() {
    const fromBox = !!sanitizeText(noteInput.value);
    const fromSummary = !!sanitizeText(lastNotesContext);
    const hasAny = fromBox || fromSummary;
    useNotesContextInput.disabled = false;
    if (!hasAny && useNotesContextInput.checked) {
        notesContextHint.textContent = "Paste notes in the box above (or generate a summary) before using note-based questions.";
    } else if (fromBox) {
        notesContextHint.textContent = "Will use the notes currently in the box (" + sanitizeText(noteInput.value).length + " chars). Change notes, then click Generate again.";
    } else if (fromSummary) {
        notesContextHint.textContent = "Box is empty — will use your last AI summary. Paste new notes in the box for different questions.";
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

async function fetchHealth() {
    healthReady = false;
    setAIControlsBusy(true);
    healthStatus.textContent = "Checking proxy connection...";
    try {
        const res = await fetch("/api/health", { method: "GET" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        serverHealthy = !!data.ok;
        healthConfig.openai_configured = !!data.openai_configured;
        const o = healthConfig.openai_configured ? "API key OK" : "API key missing";
        healthStatus.textContent = "Proxy: connected · " + o + ".";
        if (!isProviderConfigured()) {
            healthStatus.textContent += " No API key — offline/demo mode until configured.";
        }
    } catch (e) {
        serverHealthy = false;
        healthConfig.openai_configured = false;
        healthStatus.textContent = "Proxy not reachable. Run server.py and open http://127.0.0.1:8765/ — do not use file://.";
    } finally {
        healthReady = true;
        setAIControlsBusy(false);
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
        throw new Error("Set a model in Connection & model (e.g. llama-3.3-70b-versatile).");
    }
    if (!isProviderConfigured()) {
        throw new Error(providerKeyHint());
    }
    const payload = { model: model, messages: messages };
    if (opts && opts.json) {
        payload.json = true;  // ask the proxy to enable provider JSON mode
    }
    const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
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

function summarizeNotesDemo(raw) {
    const normalized = sanitizeText(raw);
    if (!normalized) return null;
    const sentences = getSentences(normalized);
    const summaryText = sentences.slice(0, 2).join(" ");
    const keyPoints = sentences.slice(0, 6);
    const listHtml = keyPoints.map(function (p) {
        return "<li>" + escapeHtml(p) + "</li>";
    }).join("");
    return { simplifiedSummary: summaryText || normalized, keyPointsHtml: listHtml };
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

    // Seed also depends on difficulty so rotation differs per level, on top of the
    // genuinely tiered banks (basic/medium/challenge) selected above.
    const notesSeed = notesContextSeed((difficulty || "medium") + "|" + (notesContext || topic || course));
    const notesLead = sanitizeText(notesContext).slice(0, 120);
    const notesPrefix = notesLead
        ? "[From your notes: \"" + notesLead + (notesLead.length >= 120 ? "…" : "") + "\"] "
        : "";

    const out = [];
    if (expected.mcq > 0 && pack.mcq.length) {
        const mi = notesSeed % pack.mcq.length;
        for (let i = 0; i < expected.mcq; i++) {
            const item = pack.mcq[(mi + i) % pack.mcq.length];
            out.push({
                id: "mcq-demo-" + Date.now() + "-" + i + "-" + notesSeed,
                type: "Multiple Choice",
                question: notesPrefix + prefix + fill(item.q),
                options: (item.o || []).slice(),
                answer: item.a,
                explanation: fill(item.e || "")
            });
        }
    }
    if (expected.sa > 0 && pack.sa.length) {
        const si = (notesSeed >> 4) % pack.sa.length;
        for (let j = 0; j < expected.sa; j++) {
            const item = pack.sa[(si + j) % pack.sa.length];
            out.push({
                id: "sa-demo-" + Date.now() + "-" + j + "-" + notesSeed,
                type: "Short Answer",
                question: notesPrefix + fill(item.q),
                answer: item.a,
                explanation: fill(item.e || "")
            });
        }
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

function renderScoreBanner() {
    const total = generatedQuestions.length;
    const s = scoreSummary();
    if (!total) return "";
    return (
        '<div class="score-banner" id="scoreBanner">' +
        "Score: " + s.correct + " correct · " + s.answered + " graded · " + total + " questions in this set." +
        "</div>"
    );
}

function updateScoreBanner() {
    const el = document.getElementById("scoreBanner");
    if (el) {
        const s = scoreSummary();
        const total = generatedQuestions.length;
        el.textContent = "Score: " + s.correct + " correct · " + s.answered + " graded · " + total + " questions in this set.";
    }
}

function renderQuestions() {
    if (!generatedQuestions.length) {
        quizOutput.innerHTML = "<p class='empty'>No questions generated yet.</p>";
        return;
    }

    let html = renderScoreBanner();

    generatedQuestions.forEach(function (item, index) {
        const isMcq = item.type === "Multiple Choice" && item.options && item.options.length;
        html += '<article class="qa-card" data-qid="' + escapeHtml(item.id) + '">';
        html += '<div><span class="tag">' + escapeHtml(item.type) + "</span>";
        html += "<strong>Question " + (index + 1) + "</strong></div>";
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
            html += '<div class="feedback" data-feedback="' + escapeHtml(item.id) + '" hidden></div>';
        } else {
            html += '<div class="field">';
            html += '<textarea class="sa-input" data-sa-input="' + escapeHtml(item.id) + '" placeholder="Type your answer here, then submit to reveal the model answer."></textarea>';
            html += "</div>";
            html += '<div class="actions"><button type="button" class="secondary submit-sa" data-qid="' + escapeHtml(item.id) + '">Submit answer</button></div>';
            html += '<div class="feedback" data-feedback="' + escapeHtml(item.id) + '" hidden></div>';
            // Self-grade buttons appear only AFTER the student submits their answer.
            html += '<div class="short-actions" data-selfgrade="' + escapeHtml(item.id) + '" hidden>';
            html += '<span class="selfgrade-q">Compare with the model answer below. Did you get it right?</span>';
            html += '<button type="button" class="outline self-correct" data-qid="' + escapeHtml(item.id) + '" data-correct="1">I was right</button>';
            html += '<button type="button" class="outline self-wrong" data-qid="' + escapeHtml(item.id) + '" data-correct="0">I was wrong</button>';
            html += "</div>";
        }

        // Khan-style: the answer stays hidden until the student checks/submits.
        html += '<div class="answer-box" data-answer="' + escapeHtml(item.id) + '" hidden>';
        html += "<h4>Answer</h4>";
        html += "<p>" + escapeHtml(item.answer) + "</p>";
        if (item.explanation) {
            // Remediation explanation: hidden until an INCORRECT response reveals it.
            html += '<div class="explanation" data-explanation="' + escapeHtml(item.id) + '" hidden>';
            html += "<h4>Why</h4><p>" + escapeHtml(item.explanation) + "</p>";
            html += "</div>";
        }
        html += "</div>";

        html += '<div class="actions" style="margin-top:10px">';
        html += '<button type="button" data-action="save-error" data-id="' + escapeHtml(item.id) + '">Add to Mistake Log</button>';
        html += "</div>";

        html += "</article>";
    });

    quizOutput.innerHTML = html;
    typesetMath(quizOutput);
}

function findQuestionCard(qid) {
    if (typeof qid !== "string") return null;
    const esc = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(qid) : qid;
    return quizOutput.querySelector("[data-qid=\"" + esc + "\"]");
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
            fb.textContent = "Already graded for this question.";
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
        fb.textContent = ok ? "Correct." : "Incorrect. Compare with the answer below.";
        revealAnswer(card, qid);
        updateScoreBanner();
        recordAttempt(item, ok);
        applyGradeOutcome(item, ok);
        if (!ok) revealExplanation(card, qid);
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
        fb.textContent = "Answer submitted. Compare with the model answer, then self-grade.";
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
                fb.textContent = "Already graded.";
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

// FR1/FR2/FR5: record a graded result. Always succeeds locally; syncs when possible.
function recordAttempt(item, correct) {
    if (!item) return;
    const payload = {
        subject: item.subject || subjectLabelFromId(apSubjectInput.value) || "Uncategorized",
        type: item.type || "Unknown",
        correct: !!correct,
        ts: new Date().toISOString()
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
    html += '<div class="stat-card"><span class="stat-num">' + pct(overall.accuracy) + '%</span><span class="stat-label">Overall accuracy</span></div>';
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
    html += '<p class="hint">Bar height = questions answered · color = accuracy (red &lt;50%, amber 50–79%, green ≥80%).</p>';
    html += '<div class="trend">';
    daily.forEach(function (d) {
        const heightPct = maxVol ? Math.max(6, Math.round((d.answered / maxVol) * 100)) : 0;
        const title = d.date + ": " + d.answered + " answered" + (d.answered ? ", " + pct(d.accuracy) + "% correct" : "");
        const label = d.date.slice(5);
        html += '<div class="trend-col" title="' + escapeHtml(title) + '">';
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

// R2 Stage 2C: read-only Topic Mastery panel, scoped to the selected course.
// Single data source: MasteryModel.summarizeMastery. No writes; synchronous
// localStorage-backed state, so there is no loading state to show. Degrades to the
// empty message if the module is missing or the map is unusable (error state).
function renderTopicMastery() {
    if (!topicMasteryOutput) return;
    const emptyMsg = '<p class="empty">No topic mastery yet — grade practice questions for this course to build it.</p>';

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

    html += '<div class="mastery-list">';
    topics.forEach(function (t) {
        const level = window.MasteryModel.masteryLevel(t);
        html += '<div class="mastery-row">';
        html += '<span class="mastery-topic">' + escapeHtml(topicDisplay(t)) + "</span>";
        html += '<span class="tag mastery-' + level + '">' + (LEVEL_LABEL[level] || level) + "</span>";
        html += '<span class="mastery-meta">' + Math.round(t.ema * 100) + "% accuracy · " + t.attempts + " graded</span>";
        html += "</div>";
    });
    html += "</div>";

    topicMasteryOutput.innerHTML = html;
}

// FR3/FR4: load and render stats; FR5 fallback to local queue when offline.
async function loadStats() {
    statsStatus.textContent = "Loading progress...";
    await flushAttemptQueue();

    if (window.location.protocol === "file:" || !serverHealthy) {
        renderStats(computeLocalStats(readAttemptQueue()), true);
        statsStatus.textContent = "Local-only mode (server unreachable).";
        return;
    }

    try {
        const res = await fetch("/api/stats");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        renderStats(data, false);
        statsStatus.textContent = "Progress updated from server.";
    } catch (e) {
        renderStats(computeLocalStats(readAttemptQueue()), true);
        statsStatus.textContent = "Server unreachable — showing local-only data.";
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
        return reviewItems.concat(newItems || []);
    };

    if (expected.mcq + expected.sa < 1) {
        quizStatus.textContent = "Choose a format with at least one question.";
        return;
    }

    const ctxLabel =
        ctx.source === "textarea" ? "notes in box (" + notesCtx.length + " chars)" :
        ctx.source === "summary" ? "last AI summary (" + notesCtx.length + " chars)" :
        "no notes (course/topic only)";
    quizStatus.textContent = "Generating questions using " + ctxLabel + "...";
    quizResults = {};

    const tryDemo = function (reason) {
        const demo = createMockQuestions(topic, apId, difficulty, expected, notesCtx);
        if (!demo || !demo.length) {
            if (reviewItems.length) {
                generatedQuestions = reviewItems.slice();
                renderQuestions();
                quizStatus.textContent = reason + " No offline bank for " + subjectLabel +
                    "; showing " + reviewItems.length + " due review item(s).";
            } else {
                generatedQuestions = [];
                renderQuestions();
                quizStatus.textContent = reason + " No offline question bank for " + subjectLabel +
                    " yet — connect an API key for AI questions, or try a subject with an offline bank " +
                    "(e.g. AP Calculus AB or AP Biology).";
            }
            return;
        }
        generatedQuestions = finalizeSet(demo);
        renderQuestions();
        quizStatus.textContent = reason + " Offline questions. " + ctxLabel +
            (reviewItems.length ? " · " + reviewItems.length + " due review(s) added." : ".");
    };

    if (!healthReady) {
        quizStatus.textContent = "Still checking connection — try again in a moment.";
        return;
    }

    if (!canUseLiveAI()) {
        const reason = !serverHealthy
            ? "Proxy unavailable."
            : "API key missing.";
        tryDemo(reason);
        return;
    }

    setAIControlsBusy(true);
    quizBtn.setAttribute("aria-busy", "true"); // presentational: drives the busy spinner + SR state
    try {
        let aiQuestions = await generateQuizWithAI(topic, difficulty, expected, apId, notesCtx);
        generatedQuestions = normalizeAIQuestions(aiQuestions);

        if (!generatedQuestions.length) {
            throw new Error("Empty AI result.");
        }

        if (isQuizQualityAcceptable(generatedQuestions, topic || subjectLabel, expected)) {
            recordAiResult("quiz", "ok");
        } else {
            quizStatus.textContent = "First result was too generic. Regenerating once...";
            aiQuestions = await generateQuizWithAI(topic, difficulty, expected, apId, notesCtx);
            generatedQuestions = normalizeAIQuestions(aiQuestions);
            if (!generatedQuestions.length || !isQuizQualityAcceptable(generatedQuestions, topic || subjectLabel, expected)) {
                throw new Error("Quality check failed.");
            }
            recordAiResult("quiz", "repaired");
        }

        generatedQuestions = finalizeSet(generatedQuestions);
        renderQuestions();
        quizStatus.textContent = "Questions generated (AI) from " + ctxLabel +
            (reviewItems.length ? " · " + reviewItems.length + " due review(s) added." : ".");
    } catch (err) {
        recordAiResult("quiz", "failed");
        tryDemo("AI quiz failed: " + err.message);
    } finally {
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
        errorStatus.textContent = "Already in the mistake log.";
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
    errorStatus.textContent = "Saved to mistake log.";
}

function reviewMistake(errorId, quality) {
    // H-F: one SM-2 update per item per session. A resurfaced item can be graded both
    // in practice (applyGradeOutcome) and in Section 3 — first grade wins. The Set is
    // in-memory, so it resets on reload (documented leak); a durable day-level dedup is
    // a future R3 upgrade once review recency lives in the unified event log.
    if (sessionReviewedErrIds.has(errorId)) {
        errorStatus.textContent = "Already reviewed this session — schedule unchanged.";
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

function clearErrorRecords() {
    if (!errorRecords.length) {
        errorStatus.textContent = "Mistake log is already empty.";
        return;
    }
    errorRecords = [];
    sessionReviewedErrIds.clear();
    saveErrorRecords();
    renderErrorRecords();
    refreshMistakeFilterOptions();
    errorStatus.textContent = "Cleared.";
}

function renderErrorRecords() {
    const RS = window.ReviewSystem;

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
        errorOutput.innerHTML = analytics + "<p class='empty'>No items for this filter.</p>";
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
        return (
            '<article class="error-card">' +
            '<div><span class="tag subject">' + escapeHtml(item.subject || "Uncategorized") + "</span>" +
            '<span class="tag">' + escapeHtml(item.type) + "</span>" +
            '<span class="tag status-' + status + '">' + (STATUS_LABEL[status] || status) + "</span>" +
            (due ? '<span class="tag due">Due</span>' : "") +
            "<strong>Item " + (index + 1) + "</strong></div>" +
            "<p>" + escapeHtml(item.question) + "</p>" +
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
            '<button type="button" class="outline" data-action="review" data-q="2" data-id="' + id + '">Forgot</button>' +
            '<button type="button" class="outline" data-action="review" data-q="3" data-id="' + id + '">Hard</button>' +
            '<button type="button" class="outline" data-action="review" data-q="5" data-id="' + id + '">Got it</button>' +
            '<button type="button" class="danger" data-action="remove-error" data-id="' + id + '">Delete</button>' +
            "</div>" +
            "</article>"
        );
    }).join("");

    errorOutput.innerHTML = analytics + cards;
    typesetMath(errorOutput);
}

summaryBtn.addEventListener("click", async function () {
    const raw = sanitizeText(noteInput.value);
    if (!raw) {
        summaryStatus.textContent = "Paste notes first.";
        summaryOutput.innerHTML = "<p class='empty'>No summary yet.</p>";
        return;
    }
    if (!healthReady) {
        summaryStatus.textContent = "Still checking connection — try again in a moment.";
        return;
    }

    summaryStatus.textContent = "Generating summary...";

    if (!canUseLiveAI()) {
        const demo = summarizeNotesDemo(raw);
        summaryOutput.innerHTML =
            "<h3>Simplified Summary</h3><p>" + escapeHtml(demo ? demo.simplifiedSummary : raw) + "</p>" +
            "<h3>Key Points</h3><ul>" + (demo ? demo.keyPointsHtml : "") + "</ul>";
        typesetMath(summaryOutput);
        lastNotesContext = raw;
        summaryStatus.textContent = serverHealthy
            ? "Offline summary — " + providerKeyHint()
            : "Offline summary (start server for AI). Notes linked to quiz.";
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
        summaryOutput.innerHTML =
            "<h3>Simplified Summary</h3><p>" + escapeHtml(json.simplifiedSummary) + "</p>" +
            "<h3>Key Points</h3><ul>" + listHtml + "</ul>";
        typesetMath(summaryOutput);
        lastNotesContext = json.simplifiedSummary + "\n" + (json.keyPoints || []).join("\n");
        summaryStatus.textContent = "Summary ready — quiz can use this context.";
        updateNotesContextUI();
    } catch (err) {
        summaryStatus.textContent = "AI summary failed: " + err.message;
        const demo = summarizeNotesDemo(raw);
        summaryOutput.innerHTML =
            "<h3>Simplified Summary</h3><p>" + escapeHtml(demo ? demo.simplifiedSummary : raw) + "</p>" +
            "<h3>Key Points</h3><ul>" + (demo ? demo.keyPointsHtml : "") + "</ul>";
        typesetMath(summaryOutput);
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
    errorStatus.textContent = "Filter: all items.";
});

showUnknownBtn.addEventListener("click", function () {
    showOnlyDue = true;
    renderErrorRecords();
    errorStatus.textContent = "Filter: due for review.";
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
        reviewMistake(id, parseInt(target.getAttribute("data-q"), 10));
    } else if (action === "remove-error") {
        removeErrorRecord(id);
    }
});

saveUIPrefsBtn.addEventListener("click", saveUIPrefs);

retryHealthBtn.addEventListener("click", fetchHealth);

if (refreshStatsBtn) {
    refreshStatsBtn.addEventListener("click", loadStats);
}

if (window.location.protocol === "file:") {
    healthStatus.textContent =
        "Opened as a local file — styles may work, but AI needs the server. Run: py server.py, then open http://127.0.0.1:8765/";
    healthReady = true;
    serverHealthy = false;
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
// 2C: re-scope the Topic Mastery panel when the course selection changes.
apSubjectInput.addEventListener("change", renderTopicMastery);
if (window.location.protocol === "file:") {
    loadStats();
}
    