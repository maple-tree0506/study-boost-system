// End-to-end tests of the redesigned flows in a real browser: the Home command center,
// Practice focus mode (keyboard included) and the result sequence, the Review Orbit
// (filters, keyboard selection, list view) with the Mistake Library (search, confirmed
// delete), the offline Notes excerpt, and the Reduce-motion setting. The last section
// covers trustworthy learning feedback: skill tags, per-skill evidence, offline Progress,
// the separate Progress course filter, locked recall ratings, and refresh-safe picks.
//
//   node --test tests/e2e/redesign-flow.e2e.js
//
// Needs Python 3 with the requirements installed and the `playwright` package with
// Chromium. Starts one server.py with no API key and a throwaway database; no AI provider
// is contacted. KATEX_DIST (optional) renders math offline, as in variant-flow.e2e.js.

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const PYTHON = process.env.PYTHON || "python3";
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

async function startServer(extraEnv) {
    const port = await freePort();
    const db = path.join(os.tmpdir(), "studyboost-redesign-e2e-" + port + ".db");
    fs.rmSync(db, { force: true });
    const child = spawn(PYTHON, ["server.py"], {
        cwd: ROOT,
        env: Object.assign({}, process.env, { PORT: String(port), STUDYBOOST_DB: db, OPENAI_API_KEY: "", ATTEMPT_RATE_LIMIT_PER_MIN: "1000" }, extraEnv || {}),
        stdio: ["ignore", "ignore", "pipe"]
    });
    let log = "";
    child.stderr.on("data", (d) => { log += d; });
    const base = "http://127.0.0.1:" + port + "/";
    for (let i = 0; i < 100; i++) {
        try {
            const res = await fetch(base + "api/health");
            if (res.ok) return { base, child, db };
        } catch (e) { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 100));
    }
    child.kill();
    throw new Error("server did not start:\n" + log);
}

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

function mistake(id, subject, topic, daysFromNow, extra) {
    return Object.assign({
        id: id,
        sourceId: "seed-" + id,
        type: "Multiple Choice",
        question: "Seeded question " + id + " about " + topic,
        options: ["A. one", "B. two", "C. three", "D. four"],
        answer: "A. one",
        userAnswer: "B. two",
        explanation: "Seeded explanation.",
        subject: subject,
        topic: topic,
        topicKey: topic.toLowerCase(),
        difficulty: "medium",
        sr: {
            algo: "sm2", reps: 1, ef: 2.5, intervalDays: Math.max(1, daysFromNow),
            due: new Date(Date.now() + daysFromNow * DAY - 60000).toISOString(),
            reviews: daysFromNow > 0 ? 1 : 0, lastQuality: 5
        },
        createdAt: new Date(Date.now() - 1000).toISOString()
    }, extra || {});
}

const LOG = [
    mistake("err-due-chain", "AP Calculus AB", "Chain rule", 0, { question: "If $y = (3x+1)^4$, then $\\frac{dy}{dx}$ is:" }),
    mistake("err-due-enzyme", "AP Biology", "Enzymes", 0),
    mistake("err-week-product", "AP Calculus AB", "Product rule", 3),
    mistake("err-later-memory", "AP Psychology", "Memory", 20)
];

async function seed(page, base, records, extra) {
    await page.goto(base + "robots.txt");
    await page.evaluate(([recs, more]) => {
        localStorage.clear();
        localStorage.setItem("studyBoostMistakesV2", JSON.stringify(recs));
        localStorage.setItem("studyBoostOnboardedV1", "1");
        Object.keys(more || {}).forEach((k) => localStorage.setItem(k, more[k]));
    }, [records, extra || {}]);
}

async function open(page, base, hash) {
    await page.goto(base + "#" + hash);
    await page.waitForFunction(() => document.getElementById("aiChip").dataset.state !== "checking");
}

let server, browser;

test.before(async () => {
    server = await startServer();
    browser = await chromium.launch();
});

test.after(async () => {
    if (browser) await browser.close();
    if (server) {
        server.child.kill();
        fs.rmSync(server.db, { force: true });
    }
});

test("Home: a returning student sees the due count and the due list first", async () => {
    const page = await newPage(browser);
    await seed(page, server.base, LOG);
    await open(page, server.base, "home");
    await page.waitForSelector('#nextStep[data-kind="review"][data-state="returning"]');
    assert.equal((await page.textContent("#home-title")).replace(/\s+/g, " ").trim(), "2 questions are due");
    assert.equal(await page.locator("#commandList li").count(), 2);
    assert.match(await page.textContent("#commandList"), /Chain rule/);
    assert.equal((await page.textContent("#nextStepBtn")).trim(), "Start review");
    // The command's button lands on Review, filtered to what is due.
    await page.click("#nextStepBtn");
    await page.waitForFunction(() => window.Shell.current() === "review");
    assert.equal(await page.getAttribute("#showUnknownBtn", "aria-pressed"), "true");
    assert.equal(await page.locator("#errorOutput .error-card").count(), 2);
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("Home: a first visit keeps the product promise and the welcome card", async () => {
    const page = await newPage(browser);
    await page.goto(server.base + "robots.txt");
    await page.evaluate(() => localStorage.clear());
    await open(page, server.base, "home");
    await page.waitForSelector('#nextStep[data-state="first"]');
    assert.match(await page.textContent("#home-title"), /Practice that brings back what you miss/);
    // Without an AI connection nothing on Home may promise questions built from notes.
    assert.match(await page.textContent("#commandDek"), /built-in bank/);
    assert.match(await page.textContent("#welcomeStepGenerate"), /built-in bank/);
    assert.equal(await page.isVisible("#welcomeCard"), true);
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("Home: with an AI connection the first visit may promise questions from notes", async () => {
    // A key is configured but never used here: Home only reads /api/health.
    const ai = await startServer({ OPENAI_API_KEY: "e2e-dummy-key", OPENAI_BASE_URL: "http://127.0.0.1:9/v1" });
    try {
        const page = await newPage(browser);
        await page.goto(ai.base + "robots.txt");
        await page.evaluate(() => localStorage.clear());
        await open(page, ai.base, "home");
        await page.waitForFunction(() => /your own notes/.test(document.getElementById("commandDek").textContent));
        assert.match(await page.textContent("#welcomeStepGenerate"), /from your own notes/);
        assert.deepEqual(page.errors, []);
        await page.close();
    } finally {
        ai.child.kill();
        fs.rmSync(ai.db, { force: true });
    }
});

test("Practice: one question at a time, keyboard answers, then the result sequence", async () => {
    const page = await newPage(browser);
    await seed(page, server.base, []);
    await open(page, server.base, "practice");
    await page.selectOption("#apSubjectInput", "calc_ab");
    await page.selectOption("#questionFormatInput", "5:0");
    await page.click("#quizBtn");
    await page.waitForSelector(".qa-card.is-current .check-mcq");
    // The setup folds away, the source is named, and only one card shows.
    assert.equal(await page.isVisible("#practiceSetup"), false);
    assert.match(await page.textContent(".set-meta"), /Built-in question bank/);
    assert.equal(await page.locator(".qa-card:not([hidden])").count(), 1);
    assert.equal((await page.textContent("#bandCount b")).trim(), "01");
    // Bank questions no longer carry a "[Medium · course]" or "[From your notes]" prefix.
    const stems = await page.evaluate(() => generatedQuestions.map((q) => q.question));
    assert.ok(stems.every((q) => !/^\[/.test(q)), "no bracket prefix: " + stems[0]);

    for (let i = 0; i < 5; i++) {
        const card = page.locator(".qa-card.is-current");
        const qid = await card.getAttribute("data-qid");
        const letter = await page.evaluate((id) => {
            const q = generatedQuestions.find((x) => x.id === id);
            return /^\s*([A-F])[.)]/.exec(q.answer)[1];
        }, qid);
        // Letter keys choose; Enter checks; the second Enter moves on.
        await page.locator(".qa-card.is-current .qa-title").focus();
        await page.keyboard.press(i % 2 === 0 ? letter.toLowerCase() : (letter === "A" ? "b" : "a"));
        await page.keyboard.press("Enter");
        await page.waitForFunction((id) => quizResults[id] && quizResults[id].done, qid);
        if (i < 4) {
            await page.keyboard.press("Enter");
            await page.waitForFunction((n) => practiceIndex === n, i + 1);
            assert.equal((await page.textContent("#bandCount b")).trim(), "0" + (i + 2));
        }
    }
    // The last card offers the results; they wait until asked for.
    assert.equal(await page.isVisible("#completionCard"), false);
    assert.equal((await page.textContent(".qa-card.is-current .q-next")).trim(), "See results");
    await page.click(".qa-card.is-current .q-next");
    await page.waitForSelector("#completionCard:not([hidden])");
    assert.equal(await page.locator(".cc-step").count(), 5);
    assert.equal(await page.locator(".cc-step.is-ok").count(), 3);
    assert.equal(await page.locator(".cc-missed-list li").count(), 2);
    assert.match(await page.textContent(".cc-score"), /3 of 5 right/);
    // "See the answer" goes back to that question in focus mode.
    await page.locator(".cc-missed-list [data-goto]").first().click();
    await page.waitForFunction(() => !resultsShown && document.querySelector(".qa-card.is-current"));
    assert.equal(await page.isVisible(".qa-card.is-current .answer-box"), true);
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("Practice: typing in a short answer is never taken as a shortcut", async () => {
    const page = await newPage(browser);
    await seed(page, server.base, []);
    await open(page, server.base, "practice");
    await page.selectOption("#apSubjectInput", "calc_ab");
    await page.selectOption("#questionFormatInput", "0:5");
    await page.click("#quizBtn");
    await page.waitForSelector(".qa-card.is-current .sa-input");
    await page.click(".qa-card.is-current .sa-input");
    await page.keyboard.type("n a b 1");
    assert.equal(await page.inputValue(".qa-card.is-current .sa-input"), "n a b 1");
    assert.equal(await page.evaluate(() => practiceIndex), 0);
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("Review: filters, keyboard selection, list view, search, and a confirmed delete", async () => {
    const page = await newPage(browser);
    await seed(page, server.base, LOG);
    await open(page, server.base, "review");
    await page.waitForSelector("#reviewOrbitChart [data-node]");
    assert.equal(await page.locator("#reviewOrbitChart [data-node]").count(), 4);
    assert.match(await page.textContent("#showUnknownBtn"), /Due now · 2/);
    // The soonest-due mistake is selected first; its card offers the review action.
    assert.match(await page.textContent("#orbitDetail"), /Due now/);
    // Keyboard: focus the selected node, move with the arrows, select with Enter.
    await page.locator('#reviewOrbitChart [data-node][tabindex="0"]').focus();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    assert.match(await page.textContent("#orbitDetail .od-title"), /Memory/);
    assert.match(await page.textContent("#orbitDetail"), /Back in 20 days/);
    // Next 7 days: the chart dims the rest, the library lists only the match.
    await page.click('[data-when="week"]');
    assert.equal(await page.locator("#reviewOrbitChart [data-node].is-dim").count(), 3);
    assert.equal(await page.locator("#errorOutput .error-card").count(), 1);
    assert.match(await page.textContent("#libraryCount"), /Showing 1 of 4/);
    // List view shows the same filter.
    await page.click('[data-orbit-view="list"]');
    assert.equal(await page.locator("#reviewOrbitList .ol-item").count(), 1);
    await page.click('[data-orbit-view="chart"]');
    await page.click('[data-when="all"]');
    // Search ignores LaTeX markup.
    await page.fill("#mistakeSearch", "3x+1");
    await page.waitForFunction(() => document.querySelectorAll("#errorOutput .error-card").length === 1);
    assert.match(await page.textContent("#errorOutput .error-card .qa-title"), /Chain rule/);
    await page.fill("#mistakeSearch", "");
    await page.waitForFunction(() => document.querySelectorAll("#errorOutput .error-card").length === 4);
    // Delete asks first; Cancel keeps the mistake.
    const del = page.locator('#errorOutput [data-action="remove-error"]').first();
    await del.click();
    await page.waitForSelector("#confirmDialog[open]");
    await page.click('#confirmDialog button[value="cancel"]');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("studyBoostMistakesV2")).length), 4);
    await del.click();
    await page.waitForSelector("#confirmDialog[open]");
    await page.click("#confirmOk");
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("studyBoostMistakesV2")).length === 3);
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("Notes: the offline summary keeps one key point per line", async () => {
    const page = await newPage(browser);
    await seed(page, server.base, []);
    await open(page, server.base, "notes");
    await page.fill("#noteInput", "Chain rule\n- Differentiate the outside\n- Multiply by the inside derivative\nProduct rule");
    await page.click("#summaryBtn");
    await page.waitForSelector("#summaryOutput .key-points li");
    const points = await page.locator("#summaryOutput .key-points li").allTextContents();
    assert.deepEqual(points.map((t) => t.trim()), ["Chain rule", "Differentiate the outside", "Multiply by the inside derivative", "Product rule"]);
    assert.match(await page.textContent("#summaryOutput .kicker"), /Offline excerpt/);
    assert.equal(await page.locator("#summaryOutput .summary-lede").count(), 0, "offline nothing is rewritten, so no summary lede");
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("Setup: Reduce motion is saved and applied before the first paint", async () => {
    const page = await newPage(browser);
    await seed(page, server.base, []);
    await open(page, server.base, "setup");
    assert.equal(await page.isVisible("#modelInput"), false, "the AI connection starts folded");
    await page.check('input[name="motionPref"][value="reduce"]');
    assert.equal(await page.getAttribute("html", "data-motion"), "reduce");
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("studyBoostUIPrefsV1")).motion), "reduce");
    // On reload the inline head script sets it before the app scripts run.
    await page.reload();
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute("data-motion")), "reduce");
    assert.equal(await page.evaluate(() => window.Shell.reducedMotion()), true);
    await page.check('input[name="motionPref"][value="system"]');
    assert.equal(await page.getAttribute("html", "data-motion"), null);
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("phone width: Home, Practice, and Review fit without sideways scrolling", async () => {
    const page = await newPage(browser, { width: 320, height: 640 });
    await seed(page, server.base, LOG);
    for (const hash of ["home", "practice", "review"]) {
        await open(page, server.base, hash);
        await page.waitForTimeout(300);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 0, hash + " is " + overflow + "px wider than the screen");
    }
    assert.deepEqual(page.errors, []);
    await page.close();
});

// --- fixes from a walkthrough of the public site --------------------------------------------

test("topic practice offline: only questions about the topic count toward it", async () => {
    const page = await newPage(browser);
    await seed(page, server.base, []);
    await open(page, server.base, "practice");
    await page.selectOption("#apSubjectInput", "bio");
    await page.selectOption("#difficultyInput", "medium");
    await page.selectOption("#questionFormatInput", "5:0");
    await page.fill("#topicInput", "Glycolysis");
    // Before generating, the setup says what the bank has for this topic.
    await page.waitForFunction(() => /Glycolysis/.test(document.getElementById("bankHint").textContent));
    await page.click("#quizBtn");
    await page.waitForSelector(".qa-card.is-current .check-mcq");
    const set = await page.evaluate(() => generatedQuestions.map((q) => ({ q: q.question + " " + q.answer, topic: q.topic })));
    // Every question filed under Glycolysis really is about glycolysis; every other one is general.
    for (const item of set) {
        if (item.topic) assert.match(item.q, /glycol/i, "filed under the topic: " + item.q);
        else assert.equal(item.topic, "");
    }
    assert.match(await page.textContent("#quizStatus"), /general AP Biology|about “Glycolysis”/);
    // Answer a general question wrong: the mistake and the mastery go to the course bucket.
    const generalIdx = await page.evaluate(() => generatedQuestions.findIndex((q) => !q.topic));
    if (generalIdx >= 0) {
        await page.locator(".set-cell").nth(generalIdx).click();
        const qid = await page.locator(".qa-card.is-current").getAttribute("data-qid");
        const answer = await page.evaluate((id) => generatedQuestions.find((q) => q.id === id).answer, qid);
        for (const r of await page.locator(".qa-card.is-current input[type=radio]").all()) {
            if ((await r.getAttribute("value")) !== answer) { await r.check(); break; }
        }
        await page.click(".qa-card.is-current .check-mcq");
        assert.match(await page.textContent(".qa-card.is-current .tag.counts"), /General · counts toward AP Biology/);
        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("studyBoostMistakesV2"))[0]);
        assert.equal(saved.topic, "");
        const mastery = await page.evaluate(() => JSON.parse(localStorage.getItem("studyBoostMasteryV1")));
        assert.equal(mastery["AP Biology::glycolysis"], undefined, "a general question never feeds the Glycolysis estimate");
        assert.ok(mastery["AP Biology::"], "it feeds the course's general bucket");
    }
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("a topic the bank does not cover gives a clearly general set", async () => {
    const page = await newPage(browser);
    await seed(page, server.base, []);
    await open(page, server.base, "practice");
    await page.selectOption("#apSubjectInput", "bio");
    await page.fill("#topicInput", "Quantum tunnelling");
    await page.waitForFunction(() => /None are about/.test(document.getElementById("bankHint").textContent));
    await page.click("#quizBtn");
    await page.waitForSelector(".qa-card.is-current");
    // The status names what happened: nothing on the topic, so general course practice.
    assert.match(await page.textContent("#quizStatus"), /No built-in AP Biology questions at this level are about .Quantum tunnelling./);
    assert.match(await page.textContent("#quizStatus"), /are general AP Biology practice and count toward AP Biology overall/);
    assert.match(await page.textContent(".set-meta"), /General practice \(no built-in questions on Quantum tunnelling\)/);
    assert.ok(await page.evaluate(() => generatedQuestions.every((q) => q.topic === "")));
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("the setup says how many built-in questions a format will really get", async () => {
    const page = await newPage(browser);
    await seed(page, server.base, []);
    await open(page, server.base, "practice");
    await page.selectOption("#apSubjectInput", "calc_ab");
    await page.selectOption("#difficultyInput", "basic");
    await page.selectOption("#questionFormatInput", "0:5");
    await page.waitForFunction(() => /so the set will have \d+ short answer/.test(document.getElementById("bankHint").textContent));
    const have = await page.evaluate(() => window.OFFLINE_BANK.calc_ab.basic.sa.length);
    assert.match(await page.textContent("#bankHint"), new RegExp("so the set will have " + have + " short answer"));
    await page.click("#quizBtn");
    await page.waitForSelector(".qa-card.is-current");
    assert.equal(await page.locator(".qa-card").count(), have);
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("a refresh keeps the unfinished set, checked answers, drafts, and notes, without re-counting", async () => {
    const page = await newPage(browser);
    await seed(page, server.base, []);
    await open(page, server.base, "notes");
    await page.fill("#noteInput", "Draft notes that must survive a refresh");
    await open(page, server.base, "practice");
    await page.selectOption("#apSubjectInput", "calc_ab");
    await page.selectOption("#questionFormatInput", "3:2");
    await page.click("#quizBtn");
    await page.waitForSelector(".qa-card.is-current .check-mcq");
    const firstId = await page.locator(".qa-card.is-current").getAttribute("data-qid");
    await page.locator(".qa-card.is-current input[type=radio]").first().check();
    await page.click(".qa-card.is-current .check-mcq");
    // Type a short-answer draft without submitting it.
    const saIdx = await page.evaluate(() => generatedQuestions.findIndex((q) => q.type === "Short Answer"));
    await page.locator(".set-cell").nth(saIdx).click();
    await page.fill(".qa-card.is-current .sa-input", "my unfinished answer");
    const before = await page.evaluate(() => ({ xp: localStorage.getItem("studyBoostXpV1"), daily: localStorage.getItem("studyBoostDailyV1") }));
    await page.waitForTimeout(400);
    await page.reload();
    await page.waitForFunction(() => document.getElementById("aiChip").dataset.state !== "checking");
    await page.waitForSelector(".qa-card.is-current");
    assert.match(await page.textContent("#quizStatus"), /Restored your unfinished set/);
    assert.equal(await page.evaluate(() => practiceIndex), saIdx);
    assert.equal(await page.inputValue(".qa-card.is-current .sa-input"), "my unfinished answer");
    assert.equal(await page.evaluate((id) => !!(quizResults[id] && quizResults[id].done), firstId), true);
    await page.locator(".set-cell").first().click();
    assert.equal(await page.isVisible(".qa-card.is-current .answer-box"), true, "the checked answer is still revealed");
    assert.equal(await page.isDisabled(".qa-card.is-current .check-mcq"), true);
    const after = await page.evaluate(() => ({ xp: localStorage.getItem("studyBoostXpV1"), daily: localStorage.getItem("studyBoostDailyV1") }));
    assert.deepEqual(after, before, "restoring never grades or awards XP again");
    assert.equal(await page.inputValue("#noteInput"), "Draft notes that must survive a refresh");
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("offline, Notes and the setup never promise questions from notes", async () => {
    const page = await newPage(browser);
    await seed(page, server.base, []);
    await open(page, server.base, "notes");
    await page.fill("#noteInput", "Glycolysis\nSplits glucose into pyruvate");
    await page.click("#summaryBtn");
    await page.waitForSelector("#summaryOutput .key-points li");
    assert.match(await page.textContent("#summaryOutput"), /need the AI connection/);
    assert.equal(await page.locator('#summaryOutput button:has-text("Practice these notes")').count(), 0);
    await open(page, server.base, "practice");
    assert.equal(await page.isDisabled("#useNotesContextInput"), true);
    assert.match(await page.textContent("#notesContextHint"), /don't use notes/);
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("offline, a non-calculus mistake says on its card that similar questions need the AI", async () => {
    const page = await newPage(browser);
    await seed(page, server.base, [mistake("err-bio", "AP Biology", "Enzymes", 3), mistake("err-calc", "AP Calculus AB", "Chain rule", 3)]);
    await open(page, server.base, "review");
    const bio = page.locator('[data-card-id="err-bio"]');
    const calc = page.locator('[data-card-id="err-calc"]');
    assert.match(await bio.textContent(), /Similar questions for AP Biology need the AI connection/);
    assert.equal(await bio.locator(".similar-btn").count(), 0);
    assert.equal(await calc.locator(".similar-btn").count(), 1);
    assert.deepEqual(page.errors, []);
    await page.close();
});

// --- Trustworthy learning feedback (design review, November 2026) --------------------

async function answerCurrentSet(page) {
    const n = await page.evaluate(() => generatedQuestions.length);
    for (let i = 0; i < n; i++) {
        await page.waitForFunction((k) => practiceIndex === k, i);
        const qid = await page.locator(".qa-card.is-current").getAttribute("data-qid");
        await page.locator(".qa-card.is-current input[type=radio]").first().check();
        await page.click(".qa-card.is-current .check-mcq");
        await page.waitForFunction((id) => quizResults[id] && quizResults[id].done, qid);
        await page.click(".qa-card.is-current .q-next");
    }
    await page.waitForSelector("#completionCard:not([hidden])");
}

test("Calc AB · Medium · Chain rule finds the tagged bank questions, and 'only this topic' keeps the set to them", async () => {
    const page = await newPage(browser);
    await seed(page, server.base, []);
    await open(page, server.base, "practice");
    await page.selectOption("#apSubjectInput", "calc_ab");
    await page.selectOption("#difficultyInput", "medium");
    await page.selectOption("#questionFormatInput", "5:0");
    assert.equal(await page.locator('#topicOptions option[value="Chain rule"]').count(), 1, "the topic list offers the course's skills");
    await page.fill("#topicInput", "chain rule");
    await page.waitForSelector("#topicFill:not([hidden])");
    await page.click("#quizBtn");
    await page.waitForSelector(".qa-card.is-current");
    let set = await page.evaluate(() => generatedQuestions.map((q) => ({ q: q.question, topic: q.topic, skills: q.skills || [] })));
    assert.equal(set.length, 5);
    const chain = set.filter((x) => x.topic === "Chain rule");
    assert.equal(chain.length, 2, "both tagged chain-rule questions at this level");
    assert.ok(chain.every((x) => x.skills.indexOf("chain-rule") !== -1));
    assert.ok(set.some((x) => /ln\(5x\^2 \+ 1\)/.test(x.q)), "the ln(5x^2+1) question is found by its tag");
    // The fillers count toward their own tagged skill, never toward Chain rule.
    for (const x of set.filter((y) => y.topic !== "Chain rule")) {
        assert.notEqual(x.skills[0], "chain-rule");
        assert.ok(x.topic.length > 0, "a tagged filler names its own skill");
    }

    // Only this topic: a shorter set, every question on the skill.
    await seed(page, server.base, []);
    await open(page, server.base, "practice");
    await page.selectOption("#apSubjectInput", "calc_ab");
    await page.selectOption("#difficultyInput", "medium");
    await page.selectOption("#questionFormatInput", "5:0");
    await page.fill("#topicInput", "Chain rule");
    await page.waitForSelector("#topicFill:not([hidden])");
    await page.selectOption("#topicFillInput", "only");
    await page.click("#quizBtn");
    await page.waitForFunction(() => generatedQuestions.length === 2 && document.querySelector(".qa-card.is-current"));
    set = await page.evaluate(() => generatedQuestions.map((q) => q.topic));
    assert.deepEqual(set, ["Chain rule", "Chain rule"]);
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("a general set never claims a course-level mastery change on the result screen", async () => {
    const page = await newPage(browser);
    await seed(page, server.base, []);
    await open(page, server.base, "practice");
    await page.selectOption("#apSubjectInput", "bio");
    await page.selectOption("#questionFormatInput", "5:0");
    await page.click("#quizBtn");
    await page.waitForSelector(".qa-card.is-current .check-mcq");
    await answerCurrentSet(page);
    const card = await page.textContent("#completionCard");
    assert.match(card, /This was general AP Biology practice, so no skill estimate changed/);
    assert.doesNotMatch(card, /Mastered|Proficient|New\s*→/);
    // Progress shows the course bucket with its accuracy but no level.
    await open(page, server.base, "progress");
    await page.waitForSelector("#topicMasteryOutput .mastery-row");
    assert.match(await page.textContent("#topicMasteryOutput .mastery-row"), /General course practice/);
    assert.match(await page.textContent("#topicMasteryOutput .mastery-row"), /No skill level/);
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("a tagged set reports each skill with its evidence on the result screen", async () => {
    const page = await newPage(browser);
    await seed(page, server.base, []);
    await open(page, server.base, "practice");
    await page.selectOption("#apSubjectInput", "calc_ab");
    await page.selectOption("#difficultyInput", "medium");
    await page.selectOption("#questionFormatInput", "5:0");
    await page.fill("#topicInput", "Chain rule");
    await page.waitForSelector("#topicFill:not([hidden])");
    await page.selectOption("#topicFillInput", "only");
    await page.click("#quizBtn");
    await page.waitForFunction(() => generatedQuestions.length === 2 && document.querySelector(".qa-card.is-current .check-mcq"));
    await answerCurrentSet(page);
    const line = await page.textContent("#completionCard .cc-skills");
    assert.match(line, /Chain rule: \d of 2 right in this set · 2 graded so far, \d right · estimate: (New|Developing)/);
    assert.doesNotMatch(await page.textContent("#completionCard"), /AP Calculus AB: /, "no course-level claim");
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("Progress keeps the last synced numbers offline, and its course filter leaves Practice alone", async () => {
    const page = await newPage(browser);
    await seed(page, server.base, []);
    await open(page, server.base, "practice");
    const uid = await page.evaluate(() => getOrCreateUserId());
    for (const correct of [true, true, false]) {
        const res = await fetch(server.base + "api/attempt", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ subject: "AP Biology", type: "Multiple Choice", correct, userId: uid, source: "generated" })
        });
        assert.equal(res.status, 200);
    }
    // The Progress course filter follows Practice until it is changed, then stays separate.
    await page.selectOption("#apSubjectInput", "calc_ab");
    await page.fill("#topicInput", "Chain rule");
    await open(page, server.base, "progress");
    await page.waitForFunction(() => /67%/.test(document.getElementById("statsOutput").textContent));
    assert.match(await page.textContent("#statsStatus"), /up to date/);
    assert.match(await page.textContent("#statsOutput .stat-cards"), /67%[\s\S]*3[\s\S]*2/);
    assert.equal(await page.inputValue("#masteryCourseInput"), "calc_ab");
    await page.selectOption("#masteryCourseInput", "bio");
    assert.equal(await page.inputValue("#apSubjectInput"), "calc_ab");
    assert.equal(await page.inputValue("#topicInput"), "Chain rule");

    // The connection drops: the synced numbers stay, labelled with when they were synced.
    await page.route("**/api/stats**", (route) => route.abort());
    await page.reload();
    await page.waitForFunction(() => /Offline/.test(document.getElementById("statsStatus").textContent));
    assert.match(await page.textContent("#statsOutput .stats-notice"), /from your last sync \(today, /);
    assert.match(await page.textContent("#statsOutput .stat-cards"), /67%[\s\S]*3[\s\S]*2/);
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("switching Practice to another course clears a skill that belongs to the old one", async () => {
    const page = await newPage(browser);
    await seed(page, server.base, []);
    await open(page, server.base, "practice");
    await page.selectOption("#apSubjectInput", "calc_ab");
    await page.fill("#topicInput", "Chain rule");
    await page.selectOption("#apSubjectInput", "calc_bc");
    assert.equal(await page.inputValue("#topicInput"), "Chain rule", "Calculus BC covers the AB skills");
    await page.selectOption("#apSubjectInput", "bio");
    assert.equal(await page.inputValue("#topicInput"), "");
    assert.match(await page.textContent("#quizStatus"), /Cleared the topic .Chain rule.: it's a AP Calculus AB skill/);
    await page.fill("#topicInput", "Glycolysis");
    await page.selectOption("#apSubjectInput", "chem");
    assert.equal(await page.inputValue("#topicInput"), "Glycolysis", "a free-text topic is kept");
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("recall ratings unlock only after the answer is shown", async () => {
    const page = await newPage(browser);
    await seed(page, server.base, LOG);
    await open(page, server.base, "review");
    const card = page.locator('[data-card-id="err-due-enzyme"]');
    await card.waitFor();
    assert.equal(await card.locator('[data-action="review"]').first().isDisabled(), true);
    assert.match(await card.textContent(), /Try to recall the answer, then show it to rate yourself/);
    await card.locator("details.answer-box summary").first().click();
    await page.waitForFunction(() => !document.querySelector('[data-card-id="err-due-enzyme"] [data-action="review"]').disabled);
    assert.match(await card.textContent(), /How well did you recall it\?/);
    // The mistake page works the same way.
    await page.goto(server.base + "#mistake/err-due-chain");
    await page.waitForSelector('#mistakeOriginal [data-action="review"]');
    assert.equal(await page.isDisabled('#mistakeOriginal [data-action="review"]'), true);
    await page.click("#mistakeOriginal details.reveal summary");
    await page.waitForFunction(() => !document.querySelector('#mistakeOriginal [data-action="review"]').disabled);
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("a picked but unchecked option survives a refresh", async () => {
    const page = await newPage(browser);
    await seed(page, server.base, []);
    await open(page, server.base, "practice");
    await page.selectOption("#apSubjectInput", "calc_ab");
    await page.selectOption("#questionFormatInput", "5:0");
    await page.click("#quizBtn");
    await page.waitForSelector(".qa-card.is-current .check-mcq");
    const qid = await page.locator(".qa-card.is-current").getAttribute("data-qid");
    await page.locator(".qa-card.is-current .qa-title").focus();
    await page.keyboard.press("c"); // keyboard pick, no click
    const picked = await page.locator(".qa-card.is-current input[type=radio]:checked").getAttribute("value");
    await page.waitForTimeout(400);
    await page.reload();
    await page.waitForFunction(() => document.getElementById("aiChip").dataset.state !== "checking");
    await page.waitForSelector(".qa-card.is-current");
    assert.equal(await page.locator(".qa-card.is-current input[type=radio]:checked").getAttribute("value"), picked);
    assert.equal(await page.evaluate((id) => !!(quizResults[id] && quizResults[id].done), qid), false, "still not graded");
    assert.deepEqual(page.errors, []);
    await page.close();
});
