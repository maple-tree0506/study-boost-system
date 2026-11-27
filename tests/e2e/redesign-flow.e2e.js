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

// Waits for the practice status line to say something, and on a timeout says which wait it
// was and what the line said instead (a bare waitForFunction timeout says neither).
async function waitForStatus(page, re, label) {
    try {
        await page.waitForFunction((src) => new RegExp(src).test(document.getElementById("quizStatus").textContent), re.source, { timeout: 20000 });
    } catch (e) {
        const now = await page.textContent("#quizStatus").catch(() => "(unreadable)");
        const dialog = await page.evaluate(() => document.getElementById("confirmDialog").open).catch(() => "?");
        throw new Error(label + ": waited for " + re + "; status was " + JSON.stringify(now) + "; dialog open: " + dialog);
    }
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
    // The command's button starts the review queue on the first due mistake.
    await page.click("#nextStepBtn");
    await page.waitForFunction(() => window.Shell.current() === "mistake");
    assert.match(await page.textContent("#queueBar .qb-count"), /1\s*of 2 due/);
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

test("'only this topic' keeps due reviews of other skills out of the set and points to them", async () => {
    const page = await newPage(browser);
    // A due definite-integral mistake, from an earlier set.
    const integral = mistake("err-due-integral", "AP Calculus AB", "Evaluating definite integrals", 0,
        { question: "$\\int_0^2 3x^2\\,dx$ equals:", skills: ["definite-integral"] });
    const chainMiss = mistake("err-due-chainmiss", "AP Calculus AB", "Chain rule", 0, { skills: ["chain-rule"] });
    await seed(page, server.base, [integral]);
    await open(page, server.base, "practice");
    await page.selectOption("#apSubjectInput", "calc_ab");
    await page.selectOption("#difficultyInput", "medium");
    await page.selectOption("#questionFormatInput", "5:0");
    await page.fill("#topicInput", "Chain rule");
    await page.waitForSelector("#topicFill:not([hidden])");
    await page.selectOption("#topicFillInput", "only");
    await page.waitForFunction(() => /2 are about .Chain rule./.test(document.getElementById("bankHint").textContent));
    await page.click("#quizBtn");
    await page.waitForSelector(".qa-card.is-current");
    const set = await page.evaluate(() => generatedQuestions.map((q) => ({ source: q.source, topic: q.topic })));
    assert.equal(set.length, 2, "the hint said 2, the set has 2");
    assert.ok(set.every((q) => q.topic === "Chain rule" && q.source !== "review"));
    assert.match(await page.textContent("#quizStatus"), /1 due review on another topic is waiting in Review/);
    assert.equal(await page.getAttribute(".set-heldback", "href"), "#review");

    // A due chain-rule mistake does belong in the strict set.
    await seed(page, server.base, [integral, chainMiss]);
    await open(page, server.base, "practice");
    await page.selectOption("#apSubjectInput", "calc_ab");
    await page.selectOption("#difficultyInput", "medium");
    await page.selectOption("#questionFormatInput", "5:0");
    await page.fill("#topicInput", "Chain rule");
    await page.waitForSelector("#topicFill:not([hidden])");
    await page.selectOption("#topicFillInput", "only");
    await page.click("#quizBtn");
    await page.waitForSelector(".qa-card.is-current");
    const ids = await page.evaluate(() => generatedQuestions.map((q) => q.errId || q.topic));
    assert.deepEqual(ids, ["err-due-chainmiss", "Chain rule", "Chain rule"]);
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("a new set asks before replacing an unfinished one, and a failed request keeps it", async () => {
    const page = await newPage(browser);
    await seed(page, server.base, []);
    await open(page, server.base, "practice");
    await page.selectOption("#apSubjectInput", "calc_ab");
    await page.selectOption("#questionFormatInput", "5:0");
    await page.click("#quizBtn");
    await page.waitForSelector(".qa-card.is-current .check-mcq");
    const firstId = await page.locator(".qa-card.is-current").getAttribute("data-qid");
    // Answer it correctly, so no mistake is saved: a saved chain-rule miss (the set is drawn
    // at random) would rightly make the strict "Chain rule" request below a set of its due
    // review, and this test is about a request that finds nothing.
    const answer = await page.evaluate((id) => generatedQuestions.find((q) => q.id === id).answer, firstId);
    for (const radio of await page.locator(".qa-card.is-current input[type=radio]").all()) {
        if ((await radio.getAttribute("value")) === answer) { await radio.check(); break; }
    }
    await page.click(".qa-card.is-current .check-mcq");
    assert.equal(await page.evaluate(() => errorRecords.length), 0);
    const before = await page.evaluate(() => generatedQuestions.map((q) => q.id));

    // Cancel: nothing changes.
    await page.click('[data-action="change-set"]');
    await page.click("#quizBtn");
    await page.waitForSelector("#confirmDialog[open]");
    assert.match(await page.textContent("#confirmBody"), /1 of 5 answered/);
    await page.click('#confirmDialog button[value="cancel"]');
    await waitForStatus(page, /Kept your current set/, "after Cancel");
    assert.deepEqual(await page.evaluate(() => generatedQuestions.map((q) => q.id)), before);
    assert.equal(await page.evaluate((id) => quizResults[id] && quizResults[id].done, firstId), true);

    // Confirm, but nothing matches: the current set and its results stay.
    await page.selectOption("#difficultyInput", "basic");
    await page.fill("#topicInput", "Chain rule");
    await page.waitForSelector("#topicFill:not([hidden])");
    await page.selectOption("#topicFillInput", "only");
    await page.click("#quizBtn");
    await page.waitForSelector("#confirmDialog[open]");
    await page.click("#confirmOk");
    await waitForStatus(page, /Your current set is unchanged/, "after Start new set with nothing matching");
    assert.deepEqual(await page.evaluate(() => generatedQuestions.map((q) => q.id)), before);
    assert.equal(await page.evaluate((id) => quizResults[id] && quizResults[id].done, firstId), true);
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("first visit: the Home button is fully on screen with the real fonts and with the fallback", async () => {
    // Fallback = the font files never arrive (a slow first visit keeps the fallback,
    // font-display: optional). The button must not sink below the fold or the tab bar.
    const sizes = [[320, 568], [390, 844], [1100, 768], [1440, 900]];
    for (const fonts of ["real", "fallback"]) {
        for (const [w, h] of sizes) {
            const page = await newPage(browser, { width: w, height: h });
            if (fonts === "fallback") await page.route("**/assets/fonts/**", (route) => route.abort());
            await page.goto(server.base + "robots.txt");
            await page.evaluate(() => localStorage.clear());
            await open(page, server.base, "home");
            await page.waitForSelector('#nextStep[data-state="first"]');
            // The headline crosses into the orbit's disc on wide screens; the colour change
            // there is set by script once the layout is known.
            if (w >= 960) await page.waitForSelector("#home-title.is-inverted");
            const m = await page.evaluate(() => {
                const btn = document.getElementById("nextStepBtn").getBoundingClientRect();
                // The headline's own letters: the giant word and the slab (the h1's box spans the poster).
                const parts = [...document.querySelectorAll("#home-title .h1-big, #home-title .h1-tag")].map((el) => el.getBoundingClientRect());
                const title = { right: Math.max(...parts.map((r) => r.right)) };
                const tabs = document.querySelector(".rail").getBoundingClientRect();
                // On a phone the rail is the bottom tab bar; elsewhere it's the top bar.
                const usable = tabs.top > innerHeight / 2 ? tabs.top : innerHeight;
                const disc = document.querySelector("#orbitChart .ob-disc").getBoundingClientRect();
                const core = document.querySelector("#orbitChart .ob-core").getBoundingClientRect();
                const dek = document.getElementById("commandDek").getBoundingClientRect();
                // Nothing (the orbit, the tab bar) lies over the button's centre.
                const hit = document.elementFromPoint(btn.left + btn.width / 2, btn.top + btn.height / 2);
                const clickable = !!hit && document.getElementById("nextStepBtn").contains(hit);
                return {
                    top: btn.top, bottom: btn.bottom, usable, clickable, titleRight: title.right,
                    coreLeft: core.left, discLeft: disc.left, discTop: disc.top, dekRight: dek.right, dekBottom: dek.bottom,
                    inverted: document.getElementById("home-title").classList.contains("is-inverted")
                };
            });
            const where = fonts + " " + w + "x" + h;
            assert.ok(m.top >= 0 && m.bottom <= m.usable, where + ": button " + Math.round(m.top) + "-" + Math.round(m.bottom) + " vs usable " + Math.round(m.usable));
            assert.ok(m.clickable, where + ": the button's centre is not covered");
            if (w >= 960) {
                // V5: the headline may cross the disc (drawn in black there) but never reaches
                // the core, where the button is; the description stays off the disc.
                assert.ok(m.titleRight <= m.coreLeft - 8, where + ": headline " + Math.round(m.titleRight) + " stops before the core " + Math.round(m.coreLeft));
                if (m.titleRight > m.discLeft) assert.ok(m.inverted, where + ": the part on the disc is inverted");
                assert.ok(m.dekRight <= m.discLeft, where + ": the description stays off the disc");
            } else {
                assert.ok(m.dekBottom <= m.discTop, where + ": the description sits above the disc");
            }
            assert.deepEqual(page.errors, []);
            await page.close();
        }
    }
});

test("phone band: the page name never runs into the band's decoration or counter", async () => {
    const page = await newPage(browser, { width: 390, height: 844 });
    await page.route("**/assets/fonts/**", (route) => route.abort());
    await seed(page, server.base, []);
    for (const view of ["progress", "practice", "review"]) {
        await open(page, server.base, view);
        await page.waitForTimeout(150);
        const m = await page.evaluate(() => {
            const word = document.getElementById("bandWord").getBoundingClientRect();
            const stripes = document.getElementById("bandStripes").getBoundingClientRect();
            return { wordRight: word.right, stripesLeft: stripes.left, stepShown: getComputedStyle(document.getElementById("bandStep")).display !== "none" };
        });
        assert.ok(m.wordRight < m.stripesLeft, view + ": " + Math.round(m.wordRight) + " < " + Math.round(m.stripesLeft));
        assert.equal(m.stepShown, false, "the step number is said once, in the kicker");
    }
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("review queue on a phone: start from Review, rate after showing the answer, see when it comes back, move on", async () => {
    const page = await newPage(browser, { width: 390, height: 844 });
    await seed(page, server.base, LOG);
    await open(page, server.base, "review");
    await page.waitForSelector("#reviewToday:not([hidden])");
    assert.match(await page.textContent("#reviewToday .rt-title"), /2\s*reviews are due now/);
    const start = await page.locator('#reviewToday [data-action="queue-start"]').boundingBox();
    assert.ok(start.y + start.height < 844 - 60, "Start review is in the first screen, above the tab bar: " + start.y);
    await page.click('#reviewToday [data-action="queue-start"]');
    await page.waitForFunction(() => window.Shell.current() === "mistake");
    const first = await page.evaluate(() => window.Shell.param());
    assert.match(await page.textContent("#queueBar .qb-count"), /1\s*of 2 due/);
    assert.equal(await page.isDisabled('#mistakeOriginal [data-action="review"][data-q="2"]'), true);
    await page.click("#mistakeOriginal details.reveal summary");
    await page.click('#mistakeOriginal [data-action="review"][data-q="2"]');
    await page.waitForSelector('#queueBar [data-action="queue-next"]');
    assert.match(await page.textContent("#queueBar .qb-note"), /Forgot: back tomorrow/);
    assert.match(await page.textContent('#queueBar [data-action="queue-next"]'), /1 left/);
    // A missed calculus card offers a similar question before moving on.
    if (first === "err-due-chain") assert.equal(await page.locator('#queueBar [data-action="queue-similar"]').count(), 1);
    await page.click('#queueBar [data-action="queue-next"]');
    await page.waitForFunction((id) => window.Shell.current() === "mistake" && window.Shell.param() !== id, first);
    assert.match(await page.textContent("#queueBar .qb-count"), /2\s*of 2 due/);
    await page.click("#mistakeOriginal details.reveal summary");
    await page.click('#mistakeOriginal [data-action="review"][data-q="5"]');
    await page.waitForSelector('#queueBar [data-action="queue-finish"]');
    assert.equal(await page.locator('#queueBar [data-action="queue-similar"]').count(), 0, "nothing to fix after Got it");
    await page.click('#queueBar [data-action="queue-finish"]');
    await page.waitForFunction(() => window.Shell.current() === "review");
    assert.match(await page.textContent("#reviewToday"), /Reviewed 2: 1 Got it, 1 Forgot/);
    assert.match(await page.textContent("#reviewToday .rt-title"), /Nothing is due now/);
    // SM-2 did the scheduling: both mistakes are out of the core.
    const due = await page.evaluate(() => errorRecords.filter((r) => window.ReviewSystem.isDue(r.sr)).length);
    assert.equal(due, 0);
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("phone path: a miss, its explanation, a similar question, then the due review", async () => {
    const page = await newPage(browser, { width: 390, height: 844 });
    await seed(page, server.base, []);
    await open(page, server.base, "practice");
    await page.selectOption("#apSubjectInput", "calc_ab");
    await page.selectOption("#difficultyInput", "medium");
    await page.selectOption("#questionFormatInput", "5:0");
    await page.fill("#topicInput", "Chain rule");
    await page.waitForSelector("#topicFill:not([hidden])");
    await page.selectOption("#topicFillInput", "only");
    await page.click("#quizBtn");
    await page.waitForSelector(".qa-card.is-current .check-mcq");
    // On a phone the question comes first: the page heading steps aside, the source stays.
    const head = await page.locator("#view-practice > .view-head").boundingBox();
    assert.ok(head.height <= 1, "the page heading is visually hidden (still read by screen readers)");
    assert.match(await page.textContent(".set-meta"), /Built-in question bank/);
    // Miss the first, get the second right.
    for (let i = 0; i < 2; i++) {
        await page.waitForFunction((k) => practiceIndex === k, i);
        const wrong = i === 0;
        const pick = await page.evaluate((w) => {
            const id = document.querySelector(".qa-card.is-current").dataset.qid;
            const q = generatedQuestions.find((x) => x.id === id);
            const radios = [...document.querySelectorAll(".qa-card.is-current input[type=radio]")];
            return radios.findIndex((r) => (r.value === q.answer) !== w);
        }, wrong);
        await page.locator(".qa-card.is-current input[type=radio]").nth(pick).check();
        await page.click(".qa-card.is-current .check-mcq");
        if (wrong) {
            const fb = await page.textContent(".qa-card.is-current .feedback");
            assert.match(fb, /^Not quite\. You chose [A-D]; the answer is [A-D]\./);
            assert.match(fb, /Saved to your review queue/);
            assert.equal(await page.isVisible(".qa-card.is-current .answer-box"), true);
        }
        await page.click(".qa-card.is-current .q-next");
    }
    await page.waitForSelector("#completionCard:not([hidden])");
    // One next step, before the list: a similar question on the miss.
    const next = page.locator('#completionCard .cc-next [data-action="open-mistake"]');
    assert.equal((await next.textContent()).trim(), "Practice a similar question");
    const nextBox = await next.boundingBox();
    const listBox = await page.locator("#completionCard .cc-sequence").boundingBox();
    assert.ok(nextBox.y < listBox.y, "the next step comes before the question list");
    await next.click();
    await page.waitForFunction(() => window.Shell.current() === "mistake");
    assert.match(await page.textContent("#queueBar"), /1 review is due now/);
    // The built-in generator makes a checked chain-rule question.
    await page.click('#variantDrill [data-action="variant-start"]');
    await page.waitForFunction(() => variantSession.item && document.querySelector(".variant-card"));
    const answer = await page.evaluate(() => variantSession.item.answer);
    for (const radio of await page.locator(".variant-card input[type=radio]").all()) {
        if ((await radio.getAttribute("value")) === answer) { await radio.check(); break; }
    }
    await page.click('[data-action="variant-check"]');
    await page.waitForSelector(".drill-result .result-strip");
    // Then the due review, one tap away.
    await page.click('#queueBar [data-action="queue-start"]');
    await page.waitForFunction(() => /1\s*of 1 due/.test(document.getElementById("queueBar").textContent));
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("uploads: a retried answer is counted once, and answers queued during an upload are kept", async () => {
    const page = await newPage(browser);
    await seed(page, server.base, []);
    await open(page, server.base, "practice");
    const uid = await page.evaluate(() => getOrCreateUserId());
    const answered = async () => (await (await fetch(server.base + "api/stats?userId=" + uid)).json()).overall.answered;

    // 1. The server stores the answer but the reply is lost: the answer is queued, then
    //    sent again with the same event id, and the server keeps one row.
    let lost = false;
    await page.route("**/api/attempt", async (route) => {
        if (!lost) { lost = true; await route.fetch(); return route.abort(); }
        return route.continue();
    });
    await page.selectOption("#apSubjectInput", "calc_ab");
    await page.selectOption("#questionFormatInput", "5:0");
    await page.click("#quizBtn");
    await page.waitForSelector(".qa-card.is-current .check-mcq");
    await page.locator(".qa-card.is-current input[type=radio]").first().check();
    await page.click(".qa-card.is-current .check-mcq");
    await page.waitForFunction(() => readAttemptQueue().length === 1);
    assert.equal(await answered(), 1, "stored once on the server already");
    await page.evaluate(() => flushAttemptQueue());
    assert.equal(await page.evaluate(() => readAttemptQueue().length), 0);
    assert.equal(await answered(), 1, "the retry was not counted again");
    await page.unroute("**/api/attempt");

    // 2. Two answers wait offline; while the upload is under way a third one is queued.
    await page.evaluate((u) => {
        const a = (n) => ({ subject: "AP Biology", type: "Multiple Choice", correct: true, ts: new Date().toISOString(), userId: u, source: "generated", eventId: "ev-queued-" + n });
        localStorage.setItem("studyBoostAttemptQueueV1", JSON.stringify([a(1), a(2)]));
    }, uid);
    let release;
    const gate = new Promise((r) => { release = r; });
    let held = false;
    await page.route("**/api/attempt", async (route) => {
        if (!held) { held = true; await gate; }
        return route.continue();
    });
    const flushing = page.evaluate(() => flushAttemptQueue());
    await page.waitForFunction(() => attemptFlush !== null);
    assert.equal(await page.evaluate(() => flushAttemptQueue() === attemptFlush), true, "a second call joins the upload in flight");
    await page.evaluate((u) => queueAttempt({ subject: "AP Biology", type: "Multiple Choice", correct: false, ts: new Date().toISOString(), userId: u, source: "generated", eventId: "ev-during-upload" }), uid);
    release();
    await flushing;
    assert.deepEqual(await page.evaluate(() => readAttemptQueue().map((a) => a.eventId)), ["ev-during-upload"]);
    assert.equal(await answered(), 3);
    await page.evaluate(() => flushAttemptQueue());
    assert.equal(await answered(), 4);
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("a finished set and its result survive a refresh, before and after See results, counted once", async () => {
    const page = await newPage(browser);
    await seed(page, server.base, []);
    await open(page, server.base, "practice");
    await page.selectOption("#apSubjectInput", "calc_ab");
    await page.selectOption("#questionFormatInput", "5:0");
    await page.click("#quizBtn");
    await page.waitForSelector(".qa-card.is-current .check-mcq");
    const n = await page.evaluate(() => generatedQuestions.length);
    for (let i = 0; i < n; i++) {
        await page.waitForFunction((k) => practiceIndex === k, i);
        await page.locator(".qa-card.is-current input[type=radio]").first().check();
        await page.click(".qa-card.is-current .check-mcq");
        if (i < n - 1) await page.click(".qa-card.is-current .q-next");
    }
    const totals = () => page.evaluate(() => ({ xp: localStorage.getItem("studyBoostXpV1"), daily: localStorage.getItem("studyBoostDailyV1"), streak: localStorage.getItem("studyBoostStreakV1") }));
    const before = await totals();
    const score = await page.evaluate(() => scoreSummary().correct);

    // 1. Refresh after the last answer, before "See results".
    await page.waitForTimeout(400);
    await page.reload();
    await page.waitForFunction(() => document.getElementById("aiChip").dataset.state !== "checking");
    await page.waitForSelector(".qa-card.is-current");
    assert.match(await page.textContent("#quizStatus"), /Restored your finished set/);
    assert.deepEqual(await totals(), before, "nothing counted again");
    await page.click('[data-action="show-results"]');
    await page.waitForSelector("#completionCard:not([hidden])");
    assert.match(await page.textContent(".cc-score"), new RegExp(score + "\\s*/\\s*" + n));

    // 2. Refresh with the result on screen: the result comes back, still counted once.
    await page.waitForTimeout(400);
    await page.reload();
    await page.waitForFunction(() => document.getElementById("aiChip").dataset.state !== "checking");
    await page.waitForSelector("#completionCard:not([hidden])");
    assert.match(await page.textContent(".cc-score"), new RegExp(score + "\\s*/\\s*" + n));
    assert.deepEqual(await totals(), before, "nothing counted again");
    // Starting a new set clears it.
    await page.click('#completionCard [data-action="new-set"]');
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("studyBoostSessionV1") || "{}").set || null), null);
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("the Notes excerpt survives a refresh and says when the notes changed since", async () => {
    const page = await newPage(browser);
    await seed(page, server.base, []);
    await open(page, server.base, "notes");
    await page.fill("#noteInput", "Glycolysis\n- Splits glucose into two pyruvate\nHappens in the cytoplasm");
    await page.click("#summaryBtn");
    await page.waitForSelector("#summaryOutput .key-points li");
    await page.waitForTimeout(400);
    await page.reload();
    await page.waitForSelector("#summaryOutput .key-points li");
    assert.deepEqual((await page.locator("#summaryOutput .key-points li").allTextContents()).map((t) => t.trim()),
        ["Glycolysis", "Splits glucose into two pyruvate", "Happens in the cytoplasm"]);
    assert.match(await page.textContent("#summaryOutput .kicker"), /Offline excerpt/);
    assert.match(await page.textContent("#summaryStatus"), /Restored from before the refresh/);
    await page.fill("#noteInput", "Glycolysis\nNet 2 ATP");
    await page.waitForTimeout(400);
    await page.reload();
    await page.waitForSelector("#summaryOutput .key-points li");
    assert.match(await page.textContent("#summaryStatus"), /Your notes changed since this was made/);
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("phone touch targets: formula buttons and orbit dots", async () => {
    const page = await newPage(browser, { width: 390, height: 844 });
    await seed(page, server.base, LOG);
    await open(page, server.base, "notes");
    const heights = await page.$$eval("button.formula-btn", (bs) => bs.map((b) => b.getBoundingClientRect().height));
    assert.ok(heights.length && heights.every((h) => h >= 44), "formula buttons: " + heights.join(", "));
    await open(page, server.base, "review");
    await page.waitForSelector("#reviewOrbitChart [data-node]");
    const hits = await page.$$eval("#reviewOrbitChart .ob-hit", (cs) => cs.map((c) => {
        const r = c.getBoundingClientRect();
        return { w: r.width, x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }));
    // Every target is at least 24 px (WCAG 2.2 target size, AA); a dot with room around it
    // gets about 44 px; neighbouring targets never overlap.
    assert.ok(hits.every((h) => h.w >= 24), "orbit targets: " + hits.map((h) => Math.round(h.w)).join(", "));
    assert.ok(hits.some((h) => h.w >= 40), "a dot with room gets a full-size target");
    for (const a of hits) for (const b of hits) {
        if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) + 1 >= (a.w + b.w) / 2, "targets do not overlap");
    }
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("Home: a set in progress comes first, and continues where it stopped", async () => {
    const page = await newPage(browser);
    await seed(page, server.base, []);
    await open(page, server.base, "practice");
    await page.selectOption("#apSubjectInput", "calc_ab");
    await page.selectOption("#questionFormatInput", "5:0");
    await page.click("#quizBtn");
    await page.waitForSelector(".qa-card.is-current .check-mcq");
    for (let i = 0; i < 3; i++) {
        await page.waitForFunction((k) => practiceIndex === k, i);
        await page.locator(".qa-card.is-current input[type=radio]").first().check();
        await page.click(".qa-card.is-current .check-mcq");
        await page.click(".qa-card.is-current .q-next");
    }
    await page.waitForTimeout(400);
    await page.reload();
    await page.waitForFunction(() => document.getElementById("aiChip").dataset.state !== "checking");
    await open(page, server.base, "home");
    await page.waitForSelector('#nextStep[data-kind="continue"]');
    assert.equal((await page.textContent("#nextStepBtn")).trim(), "Continue at question 4");
    assert.match(await page.textContent("#commandFigure"), /3\s*of 5 answered/);
    await page.click("#nextStepBtn");
    await page.waitForFunction(() => window.Shell.current() === "practice" && practiceIndex === 3);
    assert.deepEqual(page.errors, []);
    await page.close();
});

// --- Load guard: a request for one of the app's own files can fail (a dropped connection,
// a 502 from the network path). The page asks again and still runs its scripts in order.

// Fail the first `times` requests for a path (any query string), then let them through.
async function failFirst(page, pattern, times, how) {
    let seen = 0;
    await page.route(pattern, (route) => {
        seen += 1;
        if (seen <= times) {
            return how === "abort" ? route.abort("connectionreset") : route.fulfill({ status: 502, contentType: "text/plain", body: "upstream request failed" });
        }
        return route.continue();
    });
    return () => seen;
}

test("load guard: failed script requests are retried, and the scripts still run in order", async () => {
    const page = await newPage(browser, { width: 1366, height: 900 });
    const orbitTries = await failFirst(page, "**/js/review-orbit.js*", 2, "502");
    const appTries = await failFirst(page, "**/js/app.js*", 1, "abort");
    const bankTries = await failFirst(page, "**/js/question-bank.js*", 1, "502");
    await page.goto(server.base + "robots.txt");
    await page.evaluate(() => localStorage.clear());
    await open(page, server.base, "home");
    const state = await page.evaluate(() => ({
        done: window.StudyBoostBoot.done,
        failed: window.StudyBoostBoot.failed,
        modules: [typeof window.ReviewSystem, typeof window.PracticeSelection, typeof window.MasteryModel,
            typeof window.HomeSummary, typeof window.ReviewOrbit, typeof window.VariantPractice, typeof window.Shell],
        orbitDrawn: !!document.querySelector("#orbitChart .ob-disc"),
        problem: !!document.getElementById("loadProblem")
    }));
    assert.equal(state.done, true, "every script ran");
    assert.deepEqual(state.failed, []);
    assert.deepEqual(state.modules, ["object", "object", "object", "object", "object", "object", "object"]);
    assert.ok(state.orbitDrawn, "app.js ran after the modules it needs and drew the Home orbit");
    assert.equal(state.problem, false);
    assert.ok(orbitTries() >= 3, "review-orbit.js was asked for again: " + orbitTries());
    assert.ok(appTries() >= 2, "app.js was asked for again: " + appTries());
    // The offline bank, fetched on demand, gets the same retries.
    await open(page, server.base, "practice");
    await page.selectOption("#apSubjectInput", "calc_ab");
    await page.click("#quizBtn");
    await page.waitForSelector(".qa-card.is-current", { timeout: 20000 });
    assert.ok(bankTries() >= 2, "question-bank.js was asked for again: " + bankTries());
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("load guard: a script that never arrives says so and offers a reload; nothing after it runs", async () => {
    const page = await newPage(browser, { width: 390, height: 844 });
    await page.route("**/js/home-summary.js*", (route) => route.fulfill({ status: 502, contentType: "text/plain", body: "upstream request failed" }));
    await page.goto(server.base + "#home");
    await page.waitForSelector("#loadProblem", { timeout: 15000 });
    const m = await page.evaluate(() => {
        const box = document.getElementById("loadProblem");
        const btn = box.querySelector("button");
        const r = btn.getBoundingClientRect();
        return {
            role: box.getAttribute("role"), text: box.textContent, button: btn.textContent, buttonHeight: Math.round(r.height),
            failed: window.StudyBoostBoot.failed, shell: typeof window.Shell, before: typeof window.MasteryModel
        };
    });
    assert.equal(m.role, "alert");
    assert.match(m.text, /didn't load/);
    assert.equal(m.button, "Reload");
    assert.ok(m.buttonHeight >= 44, "touch target " + m.buttonHeight);
    assert.deepEqual(m.failed, ["js/home-summary.js"]);
    assert.equal(m.before, "object", "the files before it ran");
    assert.equal(m.shell, "undefined", "the files after it never ran with a module missing");
    assert.deepEqual(page.errors, []);
    await page.close();
});

test("load guard: a failed stylesheet request is retried", async () => {
    const page = await newPage(browser, { width: 1366, height: 900 });
    const cssTries = await failFirst(page, "**/css/styles.css*", 1, "502");
    await open(page, server.base, "home");
    await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor === "rgb(5, 10, 20)", null, { timeout: 15000 });
    assert.ok(cssTries() >= 2, "styles.css was asked for again: " + cssTries());
    assert.equal(await page.evaluate(() => !!document.getElementById("loadProblem")), false);
    assert.deepEqual(page.errors, []);
    await page.close();
});
