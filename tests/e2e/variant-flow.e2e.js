// End-to-end test of similar-question practice in a real browser.
//
//   node --test tests/e2e/variant-flow.e2e.js
//
// Needs Python 3 with the requirements installed and the `playwright` package with
// Chromium. It starts two copies of server.py on free ports, each with its own
// throwaway database: one with no API key (built-in generator only) and one whose
// OPENAI_BASE_URL points at a scripted mock of an OpenAI-compatible provider. No real
// AI provider is contacted. Set KATEX_DIST to a local katex/dist folder to render
// math offline; otherwise the KaTeX CDN request is blocked and math stays raw text,
// which the app is designed to tolerate.

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const PYTHON = process.env.PYTHON || "python3";
const KEY = "e2e-test-key";
const DAY = 86400000;

function freePort() {
    return new Promise((resolve) => {
        const srv = net.createServer();
        srv.listen(0, "127.0.0.1", () => {
            const { port } = srv.address();
            srv.close(() => resolve(port));
        });
    });
}

async function startServer(env) {
    const port = await freePort();
    const db = path.join(os.tmpdir(), "studyboost-e2e-" + port + ".db");
    fs.rmSync(db, { force: true });
    const child = spawn(PYTHON, ["server.py"], {
        cwd: ROOT,
        env: Object.assign({}, process.env, { PORT: String(port), STUDYBOOST_DB: db, OPENAI_API_KEY: "" }, env),
        stdio: ["ignore", "ignore", "pipe"]
    });
    let log = "";
    child.stderr.on("data", (d) => { log += d; });
    const base = "http://127.0.0.1:" + port + "/";
    for (let i = 0; i < 100; i++) {
        try {
            const res = await fetch(base + "api/health");
            if (res.ok) return { base, child, db, log: () => log };
        } catch (e) { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 100));
    }
    child.kill();
    throw new Error("server did not start:\n" + log);
}

// --- a scripted OpenAI-compatible provider ---------------------------------------------

const BIO_ANALYSIS = {
    core_concept: "Enzyme denaturation",
    concept_key: "enzyme-denaturation",
    concept_terms: ["denature", "active site"],
    solution_method: "High temperature breaks the bonds that hold the enzyme's 3D shape, so the active site no longer fits the substrate.",
    difficulty: "basic",
    error_diagnosis: {
        status: "diagnosed",
        likely_error: "Treated the loss of activity as running out of substrate instead of a change in the enzyme's shape.",
        evidence: "Substrate ran out",
        confidence: "medium"
    }
};

function bioVariant(n) {
    return {
        question: n === 1
            ? "A lipase from a hot-spring microbe is moved from 70 C to 4 C overnight and works slowly the next morning. Which best explains the slow rate?"
            : "An enzyme is boiled for ten minutes, cooled, and given fresh substrate. Why does no product form?",
        options: n === 1
            ? ["Cold lowers molecular motion, so collisions with the active site are rarer; the shape is intact",
                "The enzyme denatured permanently in the cold", "The substrate denatured in the cold", "The active site now fits every substrate"]
            : ["Boiling denatured the enzyme, so its active site lost the shape that fits the substrate",
                "Cooling restored the active site, so product forms", "Fresh substrate is used up instantly", "Boiling added a phosphate group to the enzyme"],
        correct_option: 0,
        explanation: n === 1
            ? "Low temperature slows catalysis because molecules collide less often, but it does not denature the enzyme: the active site keeps its shape and activity recovers when warmed."
            : "Boiling breaks the bonds that hold the enzyme's shape, so the active site is permanently altered; cooling does not refold it, so the enzyme cannot bind substrate and is denatured.",
        option_notes: ["correct", "Confuses slowing with denaturing.", "Substrates do not denature like enzymes.", "Active sites are specific."],
        concept_key: "enzyme-denaturation",
        difficulty: "basic",
        changes: n === 1 ? ["cold instead of heat", "different enzyme"] : ["boiled then cooled", "fresh substrate"],
        verification: { kind: "none" }
    };
}

async function startMockProvider() {
    const seen = [];
    const server = http.createServer((req, res) => {
        let body = "";
        req.on("data", (c) => { body += c; });
        req.on("end", () => {
            const payload = JSON.parse(body || "{}");
            const prompt = (payload.messages || []).map((m) => m.content).join("\n");
            seen.push({ auth: req.headers.authorization, prompt, payload });
            if (prompt.includes("RATE-LIMIT-ME")) {
                res.writeHead(429, { "Content-Type": "application/json", "retry-after": "30" });
                res.end(JSON.stringify({ error: { message: "slow down" } }));
                return;
            }
            const content = { analysis: BIO_ANALYSIS, variants: [bioVariant(1), bioVariant(2)] };
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                choices: [{ message: { role: "assistant", content: JSON.stringify(content) }, finish_reason: "stop" }],
                usage: { prompt_tokens: 700, completion_tokens: 900 }
            }));
        });
    });
    const port = await freePort();
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    return { url: "http://127.0.0.1:" + port + "/v1", server, seen };
}

// --- seeded mistakes (the same shape the app saves) ----------------------------------------

function chainMistake() {
    return {
        id: "err-seed-chain",
        sourceId: "mcq-demo-seed",
        type: "Multiple Choice",
        question: "If $y = (3x + 1)^4$, then $\\frac{dy}{dx}$ is:",
        options: ["A. $12(3x+1)^3$", "B. $4(3x+1)^3$", "C. $(3x+1)^3$", "D. $12(3x+1)^4$"],
        answer: "A. $12(3x+1)^3$",
        userAnswer: "B. $4(3x+1)^3$",
        explanation: "Chain rule: 4(3x+1)³ times the inner derivative 3 = 12(3x+1)³. '4(3x+1)³' is the trap of forgetting to multiply by the derivative of the inside (3).",
        subject: "AP Calculus AB",
        topic: "Chain rule",
        topicKey: "chain rule",
        difficulty: "medium",
        sr: { algo: "sm2", reps: 2, ef: 2.5, intervalDays: 6, due: new Date(Date.now() + 10 * DAY).toISOString(), reviews: 2, lastQuality: 5 },
        createdAt: new Date().toISOString()
    };
}

function bioMistake(id, topic) {
    return {
        id: id,
        sourceId: "mcq-seed-" + id,
        type: "Multiple Choice",
        question: "An enzyme is heated to 90 C and stops working. What most likely happened?",
        options: ["A. It denatured", "B. Substrate ran out", "C. It replicated", "D. pH rose"],
        answer: "A. It denatured",
        userAnswer: "B. Substrate ran out",
        explanation: "High heat breaks the bonds that hold the enzyme's shape.",
        subject: "AP Biology",
        topic: topic,
        topicKey: topic.toLowerCase(),
        difficulty: "basic",
        sr: { algo: "sm2", reps: 1, ef: 2.5, intervalDays: 1, due: new Date(Date.now() + 3 * DAY).toISOString(), reviews: 1, lastQuality: 5 },
        createdAt: new Date().toISOString()
    };
}

const WEAK_CHAIN = {
    "AP Calculus AB::chain rule": {
        subject: "AP Calculus AB", topic: "Chain rule", topicKey: "chain rule",
        attempts: 3, correct: 1, ema: 0.4, lastAttemptAt: new Date().toISOString()
    }
};

async function newPage(browser, viewport) {
    const page = await browser.newPage({ viewport: viewport || { width: 1366, height: 900 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const katex = process.env.KATEX_DIST;
    await page.route("https://cdn.jsdelivr.net/**", (route) => {
        if (!katex) return route.abort();
        const file = path.join(katex, route.request().url().split("/dist/")[1] || "");
        if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
        const type = file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "application/javascript" : "font/woff2";
        return route.fulfill({ status: 200, body: fs.readFileSync(file), contentType: type });
    });
    page.errors = errors;
    return page;
}

async function seed(page, base, records, mastery) {
    await page.goto(base + "#home");
    await page.evaluate(([recs, m]) => {
        localStorage.setItem("studyBoostMistakesV2", JSON.stringify(recs));
        localStorage.setItem("studyBoostMasteryV1", JSON.stringify(m || {}));
        localStorage.setItem("studyBoostOnboardedV1", "1");
    }, [records, mastery]);
    await page.reload();
    await page.waitForFunction(() => document.getElementById("aiChip").dataset.state !== "checking");
}

async function currentAnswer(page) {
    return page.evaluate(() => variantSession.item && variantSession.item.answer);
}

async function answerVariant(page, correct) {
    await page.waitForSelector(".variant-card input[type=radio]:not([disabled])");
    const answer = await currentAnswer(page);
    for (const radio of await page.locator(".variant-card input[type=radio]").all()) {
        const value = await radio.getAttribute("value");
        if ((value === answer) === correct) { await radio.check(); break; }
    }
    await page.click('[data-action="variant-check"]');
    await page.waitForSelector(".drill-result .result-strip");
}

async function nextVariant(page) {
    await page.locator('#variantDrill [data-action="variant-start"]').first().click();
    await page.waitForFunction(() => variantSession.item && !variantSession.answered && document.querySelector(".variant-card"));
}

// --- the tests -----------------------------------------------------------------------------

let offline, online, mock, browser;

test.before(async () => {
    mock = await startMockProvider();
    offline = await startServer({});
    online = await startServer({ OPENAI_API_KEY: KEY, OPENAI_BASE_URL: mock.url });
    browser = await chromium.launch();
});

test.after(async () => {
    if (browser) await browser.close();
    for (const s of [offline, online]) {
        if (!s) continue;
        s.child.kill();
        fs.rmSync(s.db, { force: true });
    }
    if (mock) mock.server.close();
});

test("a wrong MCQ answer is saved with the pick, the options, and the level", async () => {
    const page = await newPage(browser);
    await page.goto(offline.base + "#practice");
    await page.waitForFunction(() => document.getElementById("aiChip").dataset.state !== "checking");
    await page.selectOption("#apSubjectInput", "calc_ab");
    await page.selectOption("#questionFormatInput", "5:0");
    await page.selectOption("#difficultyInput", "challenge");
    await page.click("#quizBtn");
    await page.waitForSelector(".qa-card .check-mcq");
    const card = page.locator(".qa-card").first();
    const qid = await card.getAttribute("data-qid");
    const answer = await page.evaluate((id) => generatedQuestions.find((q) => q.id === id).answer, qid);
    for (const radio of await card.locator("input[type=radio]").all()) {
        if ((await radio.getAttribute("value")) !== answer) { await radio.check(); break; }
    }
    await card.locator(".check-mcq").click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("studyBoostMistakesV2"))[0]);
    assert.match(saved.userAnswer, /^[A-D]\. /);
    assert.notEqual(saved.userAnswer, saved.answer);
    assert.equal(saved.options.length, 4);
    assert.equal(saved.difficulty, "challenge");
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("offline: the full loop from a weak topic to likely mastered", async () => {
    const page = await newPage(browser);
    await seed(page, offline.base, [chainMistake()], WEAK_CHAIN);

    // Home recommends similar-question practice for the weak topic, and it leads to the mistake page.
    await page.waitForSelector('#nextStep[data-kind="variant"]');
    await page.click("#nextStepBtn");
    await page.waitForFunction(() => location.hash === "#mistake/err-seed-chain" && window.Shell.current() === "mistake");
    assert.equal(await page.getAttribute(".nav-link[aria-current]", "data-link"), "review");
    await page.waitForSelector("#mistakeOriginal .static-options");
    assert.match(await page.textContent("#mistakeOriginal .is-wrong"), /Your pick/);
    assert.match(await page.textContent("#mistakeOriginal .is-answer"), /Correct answer/);
    assert.match(await page.textContent("#mistakeAnalysis .kp-name"), /Chain rule/);

    // Start: a checked question from the built-in generator, and a grounded diagnosis.
    await nextVariant(page);
    const tags = await page.textContent(".variant-card .card-head");
    assert.match(tags, /Answer checked/);
    assert.match(tags, /Built-in generator/);
    assert.match(tags, /Same level/);
    const diag = await page.textContent("#mistakeAnalysis .diag");
    assert.match(diag, /forgetting to multiply by the derivative of the inside/);
    assert.match(diag, /matches a trap named in the question's explanation/);

    // One correct answer: credit, but never "mastered".
    await answerVariant(page, true);
    assert.equal((await page.textContent(".variant-card [data-variant-feedback]")).trim(), "Correct.");
    let result = await page.textContent("#variantResult");
    assert.match(result, /Topic mastery: Chain rule/);
    assert.match(result, /Building evidence/);
    assert.doesNotMatch(result, /Likely mastered/);

    // A miss: the misconception is named, the level steps down, the spaced review moves up.
    await nextVariant(page);
    await answerVariant(page, false);
    assert.match(await page.textContent(".variant-card [data-variant-feedback]"), /^Not quite\. Your pick: /);
    result = await page.textContent("#variantResult");
    assert.match(result, /moved up to tomorrow/);
    assert.match(result, /Next similar question \(Basic\)/);
    assert.match(await page.textContent("#mistakeOriginal"), /moved up after a missed similar question/);

    // Keep answering correctly until the evidence is strong enough.
    let rounds = 0;
    while (!/Likely mastered/.test(await page.textContent("#drillEvidence")) && rounds < 10) {
        await nextVariant(page);
        await answerVariant(page, true);
        rounds += 1;
    }
    assert.match(await page.textContent("#drillEvidence"), /Likely mastered/);
    assert.ok(rounds >= 3, "mastery needs several correct answers after a miss, got " + rounds);

    const rec = await page.evaluate(() => JSON.parse(localStorage.getItem("studyBoostMistakesV2"))[0]);
    assert.equal(rec.variantPractice.history.length, rounds + 2);
    assert.equal(rec.analysis.conceptKey, "chain-rule");
    assert.ok(new Date(rec.sr.due).getTime() - Date.now() < 1.1 * DAY, "the miss brought the review forward");
    assert.equal(rec.sr.reps, 2, "SM-2 memory state is untouched");
    const mastery = await page.evaluate(() => JSON.parse(localStorage.getItem("studyBoostMasteryV1"))["AP Calculus AB::chain rule"]);
    assert.equal(mastery.sources.variant.attempts, rounds + 2);

    // Progress separates similar questions from other practice.
    await page.goto(offline.base + "#progress");
    await page.waitForFunction(() => /Similar questions/.test(document.getElementById("statsOutput").textContent));
    await page.selectOption("#masteryCourseInput", "calc_ab");   // the panel shows one course at a time
    assert.match(await page.textContent("#topicMasteryOutput"), /Chain rule/);
    assert.match(await page.textContent("#topicMasteryOutput"), /similar/);
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("offline: a topic without a built-in generator is honest and offers a real next step", async () => {
    const page = await newPage(browser);
    await seed(page, offline.base, [bioMistake("err-seed-bio", "Enzymes")], {});
    await page.goto(offline.base + "#mistake/err-seed-bio");
    await page.click('#variantDrill [data-action="variant-start"]');
    await page.waitForSelector('[data-action="practice-course"]');
    assert.match(await page.textContent("#variantArea"), /need the AI connection/);
    assert.match(await page.textContent("#mistakeAnalysis .kp-name"), /Enzymes/);
    assert.match(await page.textContent("#mistakeAnalysis .diag"), /Not enough information/);
    await page.click('[data-action="practice-course"]');
    await page.waitForFunction(() => location.hash === "#practice");
    assert.equal(await page.inputValue("#apSubjectInput"), "bio");
    assert.equal(await page.inputValue("#topicInput"), "Enzymes");

    await page.goto(offline.base + "#mistake/err-does-not-exist");
    await page.waitForSelector("#mistakeOriginal .empty");
    assert.match(await page.textContent("#mistakeOriginal"), /no longer in your Mistake Log/);
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("with AI: analysis and variants come from the provider, the key never reaches the browser", async () => {
    const page = await newPage(browser);
    const bodies = [];
    page.on("response", async (r) => { try { bodies.push(await r.text()); } catch (e) { /* binary */ } });
    await seed(page, online.base, [bioMistake("err-ai-bio", "Enzymes"), bioMistake("err-ai-busy", "RATE-LIMIT-ME")], {});
    await page.goto(online.base + "#mistake/err-ai-bio");
    await nextVariant(page);
    const card = await page.textContent(".variant-card");
    assert.doesNotMatch(card, /Built-in generator/);
    assert.doesNotMatch(card, /Answer checked/);       // conceptual question: nothing to compute
    assert.match(await page.textContent("#mistakeAnalysis .kp-name"), /Enzyme denaturation/);
    assert.match(await page.textContent("#mistakeAnalysis .diag"), /Based on your answer: .Substrate ran out/);
    await answerVariant(page, true);
    assert.match(await page.textContent("#variantResult"), /Topic mastery: Enzymes/);

    // The second batch question was stored, so the next one needs no new AI call.
    const calls = mock.seen.length;
    await nextVariant(page);
    assert.equal(mock.seen.length, calls);

    // A provider rate limit is explained with its wait time.
    await page.goto(online.base + "#mistake/err-ai-busy");
    await page.click('#variantDrill [data-action="variant-start"]');
    await page.waitForFunction(() => /busy/.test(document.getElementById("variantStatus").textContent));
    assert.match(await page.textContent("#variantStatus"), /Try again in about 30 seconds/);

    assert.ok(mock.seen.every((c) => c.auth === "Bearer " + KEY));
    assert.ok(mock.seen.every((c) => c.payload.response_format.type === "json_object"));
    assert.ok(bodies.every((b) => !b.includes(KEY)), "the API key must never be sent to the browser");
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("phone width: the mistake page fits without sideways scrolling", async () => {
    const page = await newPage(browser, { width: 390, height: 844 });
    await seed(page, offline.base, [chainMistake()], WEAK_CHAIN);
    await page.goto(offline.base + "#mistake/err-seed-chain");
    await nextVariant(page);
    await answerVariant(page, true);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, "page is " + overflow + "px wider than the screen");
    assert.deepEqual(page.errors, []);
    await page.close();
});
