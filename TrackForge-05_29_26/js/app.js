
const STORAGE_KEY_ERRORS = "studyBoostMistakesV2";
const STORAGE_UI = "studyBoostUIPrefsV1";

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
let showOnlyNotUnderstood = false;
let mistakeSubjectFilter = "";
let lastNotesContext = "";
let serverHealthy = false;
let healthReady = false;
let healthConfig = { openai_configured: false, gemini_configured: false };

let quizResults = {};

const noteInput = document.getElementById("noteInput");
const summaryBtn = document.getElementById("summaryBtn");
const summaryStatus = document.getElementById("summaryStatus");
const summaryOutput = document.getElementById("summaryOutput");

const providerInput = document.getElementById("providerInput");
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

function isProviderConfigured() {
    const provider = providerInput.value || "openai";
    return provider === "gemini"
        ? healthConfig.gemini_configured
        : healthConfig.openai_configured;
}

function providerKeyHint() {
    const provider = providerInput.value || "openai";
    return provider === "gemini"
        ? "Set GEMINI_API_KEY in the environment and restart server.py."
        : "Set OPENAI_API_KEY in the environment and restart server.py.";
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
        if (!raw) return { provider: "openai", model: "" };
        const p = JSON.parse(raw);
        return {
            provider: p.provider === "gemini" ? "gemini" : "openai",
            model: typeof p.model === "string" ? p.model : ""
        };
    } catch (e) {
        return { provider: "openai", model: "" };
    }
}

function saveUIPrefs() {
    const prefs = {
        provider: providerInput.value,
        model: sanitizeText(modelInput.value)
    };
    localStorage.setItem(STORAGE_UI, JSON.stringify(prefs));
    uiPrefsStatus.textContent = "Preferences saved.";
}

function applyUIPrefs() {
    const p = readUIPrefs();
    providerInput.value = p.provider;
    modelInput.value = p.model || defaultModelPlaceholder();
}

function defaultModelPlaceholder() {
    return providerInput.value === "gemini" ? "gemini-2.0-flash" : "gpt-4o-mini";
}

providerInput.addEventListener("change", function () {
    if (!sanitizeText(modelInput.value)) {
        modelInput.placeholder = defaultModelPlaceholder();
    }
    if (healthReady && serverHealthy) {
        const base = healthStatus.textContent.split(" Selected provider")[0];
        healthStatus.textContent = isProviderConfigured()
            ? base + "."
            : base + " Selected provider has no key — offline/demo mode until configured.";
    }
});

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
    return copy;
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

function updateNotesContextUI() {
    const hasNotes = !!sanitizeText(lastNotesContext);
    useNotesContextInput.disabled = !hasNotes;
    if (!hasNotes) {
        useNotesContextInput.checked = false;
    } else {
        useNotesContextInput.checked = true;
    }
    notesContextHint.textContent = hasNotes
        ? "Questions can use your summarized notes for tighter alignment."
        : "Generate a summary above first to enable this.";
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

            return {
                id: (renderType === "Multiple Choice" ? "mcq-" : "sa-") + Date.now() + "-" + index,
                type: renderType,
                question: questionText,
                options: options,
                answer: answerText || "No answer provided by AI."
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

function getTopicKeywords(topic) {
    return String(topic || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(function (word) { return word.length >= 4; })
        .slice(0, 6);
}

function isQuizQualityAcceptable(questions, topic, expected) {
    if (!Array.isArray(questions) || questions.length < 1) return false;
    const mcqCount = questions.filter(function (q) { return q && q.type === "Multiple Choice"; }).length;
    const shortCount = questions.filter(function (q) { return q && q.type === "Short Answer"; }).length;
    if (mcqCount < expected.mcq || shortCount < expected.sa) return false;

    const keywords = getTopicKeywords(topic);
    if (!keywords.length) return true;

    const joinedText = questions
        .map(function (q) {
            return ((q && q.question) ? q.question : "") + " " + ((q && q.answer) ? q.answer : "");
        })
        .join(" ")
        .toLowerCase();

    const matched = keywords.filter(function (kw) {
        return joinedText.indexOf(kw) !== -1;
    }).length;

    return matched >= Math.min(1, keywords.length);
}

async function fetchHealth() {
    healthReady = false;
    setAIControlsBusy(true);
    healthStatus.textContent = "Checking proxy connection...";
    try {
        const res = await fetch("/api/health", { method: "GET" });
        if (!res.ok) throw new Error("bad");
        const data = await res.json();
        serverHealthy = !!data.ok;
        healthConfig.openai_configured = !!data.openai_configured;
        healthConfig.gemini_configured = !!data.gemini_configured;
        const o = healthConfig.openai_configured ? "OpenAI key OK" : "OpenAI key missing";
        const g = healthConfig.gemini_configured ? "Gemini key OK" : "Gemini key missing";
        healthStatus.textContent = "Proxy: connected · " + o + " · " + g + ".";
        if (!isProviderConfigured()) {
            healthStatus.textContent += " Selected provider has no key — offline/demo mode until configured.";
        }
    } catch (e) {
        serverHealthy = false;
        healthConfig.openai_configured = false;
        healthConfig.gemini_configured = false;
        healthStatus.textContent = "Proxy not reachable. Run server.py and open http://127.0.0.1:8765/ — do not use file://.";
    } finally {
        healthReady = true;
        setAIControlsBusy(false);
    }
}

function canUseLiveAI() {
    return healthReady && serverHealthy && isProviderConfigured();
}

async function proxyChat(messages) {
    const provider = providerInput.value || "openai";
    const model = sanitizeText(modelInput.value);
    if (!model) {
        throw new Error("Set a model in Connection & model (e.g. gpt-4o-mini).");
    }
    if (!isProviderConfigured()) {
        throw new Error(providerKeyHint());
    }
    const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: provider, model: model, messages: messages })
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
        "No markdown fences.";
    const user = "Summarize for study:\n\n" + rawNotes;
    const content = await proxyChat([
        { role: "system", content: system },
        { role: "user", content: user }
    ]);
    const json = extractJsonObject(content);
    if (!json || typeof json.simplifiedSummary !== "string" || !Array.isArray(json.keyPoints)) {
        throw new Error("Could not parse summary JSON.");
    }
    return json;
}

function subjectLabelFromId(id) {
    const found = AP_SUBJECTS.find(function (s) { return s.id === id; });
    return found ? found.label : id;
}

async function generateQuizWithAI(topic, difficulty, expected, apSubjectId, notesContext) {
    const diffMap = { basic: "basic", medium: "medium", challenge: "challenge" };
    const diffLabel = diffMap[difficulty] || "medium";
    const courseName = subjectLabelFromId(apSubjectId);

    const system =
        "You write AP-style practice questions. Return ONLY valid JSON with key questions (array). " +
        "You MUST output exactly " + expected.mcq + " multiple_choice and " + expected.sa + " short_answer questions, in that total order preference: list MCQs first, then short answers. " +
        "multiple_choice: type 'multiple_choice', question string, options array of exactly 4 strings starting with 'A. '..'D. ', answer equals the full correct option string. " +
        "short_answer: type 'short_answer', question string, answer is a concise model answer (2-5 sentences). " +
        "Questions must match the AP course style and difficulty; use authentic terminology and structures for that exam. " +
        "Avoid generic study-skills questions. No markdown fences.";

    let user = "AP course: " + courseName + "\n";
    user += "Difficulty: " + diffLabel + "\n";
    if (sanitizeText(topic)) {
        user += "Topic focus: " + topic + "\n";
    }
    if (sanitizeText(notesContext)) {
        user += "\nContext from student notes (use for alignment, do not quote verbatim):\n" + notesContext.slice(0, 8000) + "\n";
    }
    user += "\nGenerate exactly " + (expected.mcq + expected.sa) + " questions as specified.";

    const content = await proxyChat([
        { role: "system", content: system },
        { role: "user", content: user }
    ]);

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

function createMockQuestions(topic, apSubjectId, difficulty, expected) {
    const label = { basic: "Basic", medium: "Medium", challenge: "Challenge" }[difficulty] || "Medium";
    const course = subjectLabelFromId(apSubjectId);
    const focus = sanitizeText(topic) || course;

    const bank = {
        calc_ab: {
            mcq: [
                {
                    q: "[" + label + " · " + course + "] A particle moves along the x-axis with velocity v(t) = 3t^2 - 12t. At which t in [0,4] is the acceleration zero?",
                    o: ["A. t = 0", "B. t = 1", "C. t = 2", "D. t = 4"],
                    a: "C. t = 2"
                },
                {
                    q: "[" + label + " · " + course + "] Which expression gives the derivative of ln(5x^2 + 1)?",
                    o: ["A. 1/(5x^2+1)", "B. 10x/(5x^2+1)", "C. 5/(5x^2+1)", "D. 2x ln(5x^2+1)"],
                    a: "B. 10x/(5x^2+1)"
                },
                {
                    q: "[" + label + " · " + course + "] ∫ from 1 to e of (1/x) dx equals",
                    o: ["A. 0", "B. 1", "C. e", "D. e − 1"],
                    a: "B. 1"
                },
                {
                    q: "[" + label + " · " + course + "] For f(x) = x^3 − 3x, which statement about local extrema on ℝ is correct?",
                    o: ["A. Local max at x=1 only", "B. Local min at x=−1, local max at x=1", "C. No critical points", "D. Local max at x=−1 only"],
                    a: "B. Local min at x=−1, local max at x=1"
                },
                {
                    q: "[" + label + " · " + course + "] The definite integral represents the net area under a curve. If ∫_a^b f(x) dx = −3, what is a reasonable interpretation?",
                    o: ["A. f is always negative", "B. area below the axis dominates", "C. f has no zeros", "D. integral is always positive"],
                    a: "B. area below the axis dominates"
                }
            ],
            sa: [
                {
                    q: "Explain the relationship between position, velocity, and acceleration for " + focus + " using one sentence each.",
                    a: "Velocity is the derivative of position; acceleration is the derivative of velocity (or second derivative of position). Connect to your topic by naming what is changing and what rate."
                },
                {
                    q: "Set up (do not evaluate) the integral for the volume of revolution for a representative problem related to " + focus + ".",
                    a: "State disk/washer or shell, show radius/height in terms of the variable, and give correct bounds."
                },
                {
                    q: "For a related rates problem about " + focus + ", what quantities are typically held constant vs changing?",
                    a: "State which geometric relation links variables, differentiate with respect to time, and substitute known rates."
                },
                {
                    q: "Describe how you would justify a local minimum using calculus tests for a function tied to " + focus + ".",
                    a: "Find critical points, use first or second derivative test, conclude with function values."
                },
                {
                    q: "Compare Riemann sum estimates vs exact integral for a concept from " + focus + ".",
                    a: "Explain rectangles/trapezoids vs limit of sums; mention refinement as n increases."
                }
            ]
        },
        bio: {
            mcq: [
                {
                    q: "[" + label + " · " + course + "] During glycolysis, the net ATP yield per glucose is typically:",
                    o: ["A. 0", "B. 1", "C. 2", "D. 4"],
                    a: "C. 2"
                },
                {
                    q: "[" + label + " · " + course + "] Which organelle is the primary site of cellular respiration (Krebs & ETC)?",
                    o: ["A. Chloroplast", "B. Mitochondrion", "C. Golgi", "D. Nucleus"],
                    a: "B. Mitochondrion"
                },
                {
                    q: "[" + label + " · " + course + "] Photosynthesis produces O2 from splitting which molecule?",
                    o: ["A. CO2", "B. Glucose", "C. H2O", "D. ATP"],
                    a: "C. H2O"
                },
                {
                    q: "[" + label + " · " + course + "] DNA replication is semiconservative because:",
                    o: ["A. Both strands are destroyed", "B. Each daughter duplex has one parental strand", "C. RNA primes both ends only", "D. Telomeres prevent replication"],
                    a: "B. Each daughter duplex has one parental strand"
                },
                {
                    q: "[" + label + " · " + course + "] Which change most directly increases genetic variation in meiosis?",
                    o: ["A. Mitosis", "B. Crossing over", "C. Binary fission", "D. Photosynthesis"],
                    a: "B. Crossing over"
                }
            ],
            sa: [
                {
                    q: "Compare aerobic respiration and fermentation for " + focus + " in terms of NAD+ recycling.",
                    a: "Aerobic uses ETC/O2 to regenerate NAD+; fermentation regenerates NAD+ without O2 by reducing pyruvate to lactate or ethanol+CO2."
                },
                {
                    q: "Explain negative feedback in a homeostatic pathway relevant to " + focus + ".",
                    a: "Sensor detects deviation, control center responds, effector reduces deviation; give one concrete example."
                },
                {
                    q: "Describe how enzyme activity could be regulated for a pathway connected to " + focus + ".",
                    a: "Competitive vs noncompetitive inhibition; allosteric regulation; environmental factors (pH/temperature)."
                },
                {
                    q: "Outline how natural selection could act on a trait you studied in " + focus + ".",
                    a: "Variation, heritability, differential survival/reproduction, change in allele frequencies."
                },
                {
                    q: "Contrast DNA vs RNA structure/function for information flow relevant to " + focus + ".",
                    a: "DNA double-stranded genetic storage; RNA single-stranded roles (mRNA/tRNA/rRNA); mention transcription."
                }
            ]
        }
    };

    const key = apSubjectId === "bio" || apSubjectId === "chem" || apSubjectId === "envsci" ? "bio" : "calc_ab";
    const pack = bank[key] || bank.calc_ab;

    const out = [];
    let mi = 0;
    let si = 0;
    for (let i = 0; i < expected.mcq; i++) {
        const item = pack.mcq[mi % pack.mcq.length];
        mi++;
        out.push({
            id: "mcq-demo-" + Date.now() + "-" + i,
            type: "Multiple Choice",
            question: item.q,
            options: item.o.slice(),
            answer: item.a
        });
    }
    for (let j = 0; j < expected.sa; j++) {
        const item = pack.sa[si % pack.sa.length];
        si++;
        out.push({
            id: "sa-demo-" + Date.now() + "-" + j,
            type: "Short Answer",
            question: item.q,
            answer: item.a
        });
    }
    return out;
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
            html += '<div class="short-actions">';
            html += '<button type="button" class="outline self-correct" data-qid="' + escapeHtml(item.id) + '" data-correct="1">Mark correct</button>';
            html += '<button type="button" class="outline self-wrong" data-qid="' + escapeHtml(item.id) + '" data-correct="0">Mark incorrect</button>';
            html += "</div>";
            html += '<div class="feedback" data-feedback="' + escapeHtml(item.id) + '" hidden></div>';
        }

        html += "<details class=\"answer-box\">";
        html += "<summary>Suggested answer (after you try)</summary>";
        html += "<p>" + escapeHtml(item.answer) + "</p>";
        html += "</details>";

        html += '<div class="actions" style="margin-top:10px">';
        html += '<button type="button" data-action="save-error" data-id="' + escapeHtml(item.id) + '">Add to Mistake Log</button>';
        html += "</div>";

        html += "</article>";
    });

    quizOutput.innerHTML = html;
}

function findQuestionCard(qid) {
    if (typeof qid !== "string") return null;
    const esc = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(qid) : qid;
    return quizOutput.querySelector("[data-qid=\"" + esc + "\"]");
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
        fb.textContent = ok ? "Correct." : "Incorrect. Compare with the suggested answer below.";
        updateScoreBanner();
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
    }
}

quizOutput.addEventListener("click", handleQuizClick);

async function generateQuiz() {
    const topic = sanitizeText(topicInput.value);
    const difficulty = difficultyInput.value;
    const expected = parseFormat(questionFormatInput.value);
    const apId = apSubjectInput.value;
    const subjectLabel = subjectLabelFromId(apId);
    const notesCtx = useNotesContextInput.checked ? lastNotesContext : "";

    if (expected.mcq + expected.sa < 1) {
        quizStatus.textContent = "Choose a format with at least one question.";
        return;
    }

    quizStatus.textContent = "Generating questions...";
    quizResults = {};

    const tryDemo = function (reason) {
        quizStatus.textContent = reason + " Showing AP-style offline questions.";
        generatedQuestions = createMockQuestions(topic, apId, difficulty, expected);
        renderQuestions();
    };

    if (!healthReady) {
        quizStatus.textContent = "Still checking connection — try again in a moment.";
        return;
    }

    if (!canUseLiveAI()) {
        const reason = !serverHealthy
            ? "Proxy unavailable."
            : "API key missing for selected provider.";
        tryDemo(reason);
        return;
    }

    setAIControlsBusy(true);
    try {
        let aiQuestions = await generateQuizWithAI(topic, difficulty, expected, apId, notesCtx);
        generatedQuestions = normalizeAIQuestions(aiQuestions);

        if (!generatedQuestions.length) {
            throw new Error("Empty AI result.");
        }

        if (!isQuizQualityAcceptable(generatedQuestions, topic || subjectLabel, expected)) {
            quizStatus.textContent = "First result was too generic. Regenerating once...";
            aiQuestions = await generateQuizWithAI(topic, difficulty, expected, apId, notesCtx);
            generatedQuestions = normalizeAIQuestions(aiQuestions);
            if (!generatedQuestions.length || !isQuizQualityAcceptable(generatedQuestions, topic || subjectLabel, expected)) {
                throw new Error("Quality check failed.");
            }
        }

        renderQuestions();
        quizStatus.textContent = "Questions generated (AI).";
    } catch (err) {
        tryDemo("AI quiz failed: " + err.message);
    } finally {
        setAIControlsBusy(false);
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
    const subj = subjectLabelFromId(apSubjectInput.value);
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
        status: "not_understood",
        subject: subj,
        createdAt: new Date().toISOString()
    });
    saveErrorRecords();
    renderErrorRecords();
    refreshMistakeFilterOptions();
    errorStatus.textContent = "Saved to mistake log.";
}

function toggleErrorStatus(errorId) {
    errorRecords = errorRecords.map(function (item) {
        if (item.id !== errorId) return item;
        return Object.assign({}, item, {
            status: item.status === "not_understood" ? "mastered" : "not_understood"
        });
    });
    saveErrorRecords();
    renderErrorRecords();
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
    saveErrorRecords();
    renderErrorRecords();
    refreshMistakeFilterOptions();
    errorStatus.textContent = "Cleared.";
}

function renderErrorRecords() {
    let records = errorRecords.slice();
    if (showOnlyNotUnderstood) {
        records = records.filter(function (item) {
            return item.status === "not_understood";
        });
    }
    if (mistakeSubjectFilter) {
        records = records.filter(function (item) {
            return item.subject === mistakeSubjectFilter;
        });
    }

    if (!records.length) {
        errorOutput.innerHTML = "<p class='empty'>No records for this filter.</p>";
        return;
    }

    const html = records
        .map(function (item, index) {
            const statusLabel = item.status === "not_understood" ? "Not Understood" : "Mastered";
            const statusClass = item.status === "not_understood" ? "not-understood" : "";
            return (
                '<article class="error-card">' +
                '<div><span class="tag subject">' + escapeHtml(item.subject || "Uncategorized") + "</span>" +
                '<span class="tag">' + escapeHtml(item.type) + "</span>" +
                '<span class="tag ' + statusClass + '">' + statusLabel + "</span>" +
                "<strong>Mistake " + (index + 1) + "</strong></div>" +
                "<p>" + escapeHtml(item.question) + "</p>" +
                '<details class="answer-box"><summary>Suggested answer</summary><p>' + escapeHtml(item.answer) + "</p></details>" +
                '<div class="actions">' +
                '<button type="button" class="secondary" data-action="toggle-status" data-id="' + escapeHtml(item.id) + '">' +
                (item.status === "not_understood" ? "Mark as Mastered" : "Mark Not Understood") +
                "</button>" +
                '<button type="button" class="danger" data-action="remove-error" data-id="' + escapeHtml(item.id) + '">Delete</button>' +
                "</div>" +
                "</article>"
            );
        })
        .join("");
    errorOutput.innerHTML = html;
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
        lastNotesContext = raw;
        summaryStatus.textContent = serverHealthy
            ? "Offline summary — " + providerKeyHint()
            : "Offline summary (start server for AI). Notes linked to quiz.";
        updateNotesContextUI();
        return;
    }

    setAIControlsBusy(true);
    try {
        const json = await summarizeNotesWithAI(raw);
        const listHtml = (json.keyPoints || []).map(function (pt) {
            return "<li>" + escapeHtml(pt) + "</li>";
        }).join("");
        summaryOutput.innerHTML =
            "<h3>Simplified Summary</h3><p>" + escapeHtml(json.simplifiedSummary) + "</p>" +
            "<h3>Key Points</h3><ul>" + listHtml + "</ul>";
        lastNotesContext = json.simplifiedSummary + "\n" + (json.keyPoints || []).join("\n");
        summaryStatus.textContent = "Summary ready — quiz can use this context.";
        updateNotesContextUI();
    } catch (err) {
        summaryStatus.textContent = "AI summary failed: " + err.message;
        const demo = summarizeNotesDemo(raw);
        summaryOutput.innerHTML =
            "<h3>Simplified Summary</h3><p>" + escapeHtml(demo ? demo.simplifiedSummary : raw) + "</p>" +
            "<h3>Key Points</h3><ul>" + (demo ? demo.keyPointsHtml : "") + "</ul>";
        lastNotesContext = raw;
        updateNotesContextUI();
    } finally {
        setAIControlsBusy(false);
    }
});

quizBtn.addEventListener("click", generateQuiz);

showAllBtn.addEventListener("click", function () {
    showOnlyNotUnderstood = false;
    renderErrorRecords();
    errorStatus.textContent = "Filter: all statuses.";
});

showUnknownBtn.addEventListener("click", function () {
    showOnlyNotUnderstood = true;
    renderErrorRecords();
    errorStatus.textContent = 'Filter: only “Not Understood”.';
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
    if (action === "toggle-status") toggleErrorStatus(id);
    else if (action === "remove-error") removeErrorRecord(id);
});

saveUIPrefsBtn.addEventListener("click", saveUIPrefs);

retryHealthBtn.addEventListener("click", fetchHealth);

if (window.location.protocol === "file:") {
    healthStatus.textContent =
        "Opened as a local file — styles may work, but AI needs the server. Run: py server.py, then open http://127.0.0.1:8765/";
    healthReady = true;
    serverHealthy = false;
}

populateSubjectSelects();
applyUIPrefs();
if (window.location.protocol !== "file:") {
    setAIControlsBusy(true);
    fetchHealth();
}
updateNotesContextUI();
renderErrorRecords();
refreshMistakeFilterOptions();
    