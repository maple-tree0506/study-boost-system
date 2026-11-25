// End-to-end tests of the redesigned flows in a real browser: the Home command center,
// Practice focus mode (keyboard included) and the result sequence, the Review Orbit
// (filters, keyboard selection, list view) with the Mistake Library (search, confirmed
// delete), the offline Notes summary, and the Reduce-motion setting.
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

async function startServer() {
    const port = await freePort();
    const db = path.join(os.tmpdir(), "studyboost-redesign-e2e-" + port + ".db");
    fs.rmSync(db, { force: true });
    const child = spawn(PYTHON, ["server.py"], {
        cwd: ROOT,
        env: Object.assign({}, process.env, { PORT: String(port), STUDYBOOST_DB: db, OPENAI_API_KEY: "", ATTEMPT_RATE_LIMIT_PER_MIN: "1000" }),
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
    assert.match(await page.textContent("#home-title"), /Turn your notes into adaptive practice/);
    assert.equal(await page.isVisible("#welcomeCard"), true);
    assert.deepEqual(page.errors, []);
    await page.close();
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
    assert.match(await page.textContent("#summaryOutput .kicker"), /Offline summary/);
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
