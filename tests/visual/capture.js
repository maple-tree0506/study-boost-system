// Visual review harness: real screenshots of real app states, plus layout, console,
// accessibility, and lab-performance checks. Used for before/after comparisons.
//
//   node tests/visual/capture.js <outDir> [--only=state,state] [--perf] [--axe] [--sizes]
//
// Starts server.py on a free port with a throwaway database (never the real one), loads
// the labelled fixtures in tests/visual/fixtures.js into an isolated browser context, and
// writes PNGs and report.json into <outDir>. Optional environment:
//   KATEX_DIST  local katex/dist folder, so math renders without the CDN
//   AXE_JS      path to axe.min.js, for --axe
// Lab numbers are diagnostics on this machine, not real-user Core Web Vitals.

"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const { buildState, extremeSet } = require("./fixtures");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.resolve(process.argv[2] || "visual-out");
const ARGS = process.argv.slice(3);
const ONLY = (ARGS.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
const PERF = ARGS.includes("--perf");
const AXE = ARGS.includes("--axe");
const SIZES = ARGS.includes("--sizes");

const VIEWPORTS = {
    xl: { width: 1920, height: 1080 }, desk: { width: 1440, height: 900 }, laptop: { width: 1366, height: 768 },
    tabletL: { width: 1024, height: 768 }, tabletP: { width: 768, height: 1024 }, phone: { width: 390, height: 844 },
    narrow: { width: 320, height: 640 }
};

function freePort() {
    return new Promise((resolve) => {
        const srv = net.createServer();
        srv.listen(0, "127.0.0.1", () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
    });
}

async function startServer() {
    const port = await freePort();
    const db = path.join(os.tmpdir(), "studyboost-visual-" + port + ".db");
    fs.rmSync(db, { force: true });
    const child = spawn(process.env.PYTHON || "python3", ["server.py"], {
        cwd: ROOT,
        env: Object.assign({}, process.env, { PORT: String(port), STUDYBOOST_DB: db, OPENAI_API_KEY: "", ATTEMPT_RATE_LIMIT_PER_MIN: "5000" }),
        stdio: ["ignore", "ignore", "pipe"]
    });
    // Drain the request log: an unread pipe fills up and blocks the server.
    let log = "";
    child.stderr.on("data", (d) => { log = (log + d).slice(-4000); });
    const base = "http://127.0.0.1:" + port + "/";
    for (let i = 0; i < 100; i++) {
        try { if ((await fetch(base + "api/health")).ok) return { base, child, db }; } catch (e) { /* starting */ }
        await new Promise((r) => setTimeout(r, 100));
    }
    child.kill();
    throw new Error("server did not start");
}

async function routeKatex(page) {
    const dist = process.env.KATEX_DIST;
    await page.route("https://cdn.jsdelivr.net/**", (route) => {
        if (!dist) return route.abort();
        const file = path.join(dist, route.request().url().split("/dist/")[1] || "");
        if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
        const type = file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "application/javascript" : "font/woff2";
        return route.fulfill({ status: 200, body: fs.readFileSync(file), contentType: type });
    });
}

const seeded = new Set();
async function seedAttempts(base, attempts) {
    if (!attempts.length || seeded.has(attempts[0].userId)) return;
    seeded.add(attempts[0].userId);
    for (const a of attempts) {
        await fetch(base + "api/attempt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a) });
    }
}

async function openState(browser, server, fixture, viewport, hash) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: process.env.REDUCED_MOTION ? "reduce" : "no-preference" });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
    await routeKatex(page);
    const state = buildState(fixture);
    await seedAttempts(server.base, state.attempts);
    await page.goto(server.base + "#home");
    await page.evaluate((ls) => {
        localStorage.clear();
        Object.keys(ls).forEach((k) => localStorage.setItem(k, ls[k]));
    }, state.localStorage);
    await page.goto(server.base + "#" + (hash || "home"));
    await page.reload();
    await page.waitForFunction(() => document.getElementById("aiChip").dataset.state !== "checking");
    await page.waitForTimeout(1700); // let entrance motion settle (boot class clears at 1.5 s)
    return { ctx, page, errors };
}

// Practice shows one question at a time: answer the current card, then move on with its
// Next button. Stops after `limit` answers, or opens the results after the last one.
async function answerAll(page, pickCorrect, limit) {
    let answered = 0;
    for (let guard = 0; guard < 30; guard++) {
        const card = page.locator(".qa-card.is-current");
        if (!(await card.count())) break;
        const qid = await card.getAttribute("data-qid");
        const graded = await page.evaluate((id) => !!(quizResults[id] && quizResults[id].done), qid);
        if (!graded) {
            if (await card.locator(".check-mcq").count()) {
                const answer = await page.evaluate((id) => generatedQuestions.find((q) => q.id === id).answer, qid);
                const want = typeof pickCorrect === "function" ? pickCorrect(qid) : pickCorrect;
                for (const r of await card.locator("input[type=radio]").all()) {
                    if (((await r.getAttribute("value")) === answer) === want) { await r.check(); break; }
                }
                await card.locator(".check-mcq").click();
            } else if (await card.locator(".submit-sa").count()) {
                await card.locator("textarea").fill("My answer, written for the visual review.");
                await card.locator(".submit-sa").click();
                await card.locator(".self-correct").click();
            }
            answered++;
            if (limit && answered >= limit) return;
        }
        const next = card.locator(".q-next");
        const action = await next.getAttribute("data-action");
        await next.click();
        if (action === "show-results") return;
    }
}

// Each state: fixture, hash, optional setup actions, and which viewports to capture.
const STATES = [
    { name: "home-first", fixture: "empty", hash: "home", shots: ["desk", "laptop", "phone"] },
    { name: "home-returning", fixture: "returning", hash: "home", shots: ["xl", "desk", "laptop", "tabletP", "phone"], full: true },
    { name: "home-dense", fixture: "dense", hash: "home", shots: ["desk"] },
    { name: "notes", fixture: "returning", hash: "notes", shots: ["desk", "phone"], setup: async (p) => {
        await p.fill("#noteInput", "Chain rule\n- If y = f(g(x)), then dy/dx = f'(g(x)) · g'(x).\n- Differentiate the outer function, keep the inner function, multiply by the inner derivative.\n- Example: d/dx (3x+1)^4 = 12(3x+1)^3\nProduct rule\n- (uv)' = u'v + uv'");
        await p.click("#summaryBtn");
        await p.waitForTimeout(600);
    } },
    { name: "practice-setup", fixture: "returning", hash: "practice", shots: ["desk", "phone"] },
    { name: "practice-active", fixture: "returning", hash: "practice", shots: ["desk", "laptop", "phone"], full: true, setup: async (p) => {
        await p.selectOption("#apSubjectInput", "calc_ab");
        await p.selectOption("#questionFormatInput", "3:2");
        await p.selectOption("#difficultyInput", "medium");
        await p.fill("#topicInput", "Derivatives");
        await p.click("#quizBtn");
        await p.waitForSelector(".qa-card");
        // answer the first two questions only: one right, one wrong (the second stays on screen)
        let n = 0;
        await answerAll(p, () => n++ === 0, 2);
        await p.waitForTimeout(500);
    } },
    { name: "practice-extreme", fixture: "returning", hash: "practice", shots: ["desk", "phone"], full: true, setup: async (p, x) => {
        await p.evaluate((items) => { generatedQuestions = items; quizResults = {}; renderQuestions(); }, x);
        await p.waitForTimeout(500);
    } },
    { name: "practice-complete", fixture: "returning", hash: "practice", shots: ["desk", "phone"], setup: async (p) => {
        await p.selectOption("#apSubjectInput", "calc_ab");
        await p.selectOption("#questionFormatInput", "5:0");
        await p.click("#quizBtn");
        await p.waitForSelector(".qa-card");
        let n = 0;
        await answerAll(p, () => (n++ % 2 === 0));
        await p.waitForSelector("#completionCard:not([hidden])");
        await p.waitForTimeout(900);
    } },
    { name: "review", fixture: "returning", hash: "review", shots: ["desk", "laptop", "phone"], full: true },
    { name: "review-dense", fixture: "dense", hash: "review", shots: ["desk"] },
    { name: "mistake", fixture: "returning", hash: "mistake/fixture-err-001", shots: ["desk", "phone"], full: true, setup: async (p) => {
        await p.locator('#variantDrill [data-action="variant-start"]').first().click();
        await p.waitForSelector(".variant-card");
        const ans = await p.evaluate(() => variantSession.item.answer);
        for (const r of await p.locator(".variant-card input[type=radio]").all()) {
            if ((await r.getAttribute("value")) !== ans) { await r.check(); break; }
        }
        await p.click('[data-action="variant-check"]');
        await p.waitForSelector(".drill-result .result-strip");
        await p.waitForTimeout(500);
    } },
    { name: "progress", fixture: "returning", hash: "progress", shots: ["desk", "laptop", "phone"], full: true, setup: async (p) => {
        await p.waitForFunction(() => /accuracy/i.test(document.getElementById("statsOutput").textContent));
        if (await p.locator("#masteryCourseInput").count()) await p.selectOption("#masteryCourseInput", "calc_ab");
        await p.waitForTimeout(600);
    } },
    { name: "progress-empty", fixture: "empty", hash: "progress", shots: ["desk"] },
    { name: "setup", fixture: "returning", hash: "setup", shots: ["desk", "phone"] }
];

async function measurePerf(browser, server, fixture, hash, throttle) {
    const ctx = await browser.newContext({ viewport: VIEWPORTS.desk });
    const page = await ctx.newPage();
    await routeKatex(page);
    const state = buildState(fixture);
    await page.goto(server.base + "robots.txt");
    await page.evaluate((ls) => { localStorage.clear(); Object.keys(ls).forEach((k) => localStorage.setItem(k, ls[k])); }, state.localStorage);
    await page.addInitScript(() => {
        window.__perf = { lcp: 0, cls: 0, longTasks: 0, lcpEl: "" };
        new PerformanceObserver((l) => { const e = l.getEntries().pop(); window.__perf.lcp = e.startTime; window.__perf.lcpEl = (e.element && (e.element.id || e.element.className || e.element.tagName)) + ""; }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((l) => { l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__perf.cls += e.value; }); }).observe({ type: "layout-shift", buffered: true });
        new PerformanceObserver((l) => { l.getEntries().forEach((e) => { window.__perf.longTasks += Math.max(0, e.duration - 50); }); }).observe({ type: "longtask", buffered: true });
    });
    const cdp = await ctx.newCDPSession(page);
    if (throttle) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
    await page.goto(server.base + "#" + hash, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const res = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0];
        const fcp = performance.getEntriesByName("first-contentful-paint")[0];
        const size = (r) => r.transferSize || r.encodedBodySize || 0;
        const resources = performance.getEntriesByType("resource");
        const bytes = resources.reduce((s, r) => s + size(r), 0) + (nav.transferSize || 0);
        // What the first page load needs (finished by the load event), separate from
        // anything fetched afterwards (e.g. the question bank prefetched when idle).
        const atLoad = resources.filter((r) => r.responseEnd <= nav.loadEventEnd).reduce((s, r) => s + size(r), 0) + (nav.transferSize || 0);
        return { fcp: fcp ? Math.round(fcp.startTime) : null, lcp: Math.round(window.__perf.lcp), lcpElement: window.__perf.lcpEl,
            cls: Math.round(window.__perf.cls * 1000) / 1000, blockingMsOver50: Math.round(window.__perf.longTasks),
            domContentLoaded: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), kilobytes: Math.round(bytes / 1024),
            kilobytesAtLoad: Math.round(atLoad / 1024),
            resources: resources.map((r) => r.name.replace(/^https?:\/\/[^/]+\//, "") + " " + Math.round(size(r) / 1024) + "KB" + (r.responseEnd > nav.loadEventEnd ? " (after load)" : "")) };
    });
    await ctx.close();
    return res;
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const server = await startServer();
    const browser = await chromium.launch();
    const report = { when: new Date().toISOString(), states: {}, overflow: {}, perf: {}, axe: {} };
    try {
        const x = extremeSet();
        for (const st of STATES) {
            if (ONLY.length && !ONLY.includes(st.name)) continue;
            report.states[st.name] = { errors: [] };
            for (const vp of st.shots) {
                const { ctx, page, errors } = await openState(browser, server, st.fixture, VIEWPORTS[vp], st.hash);
                if (st.setup) await st.setup(page, x);
                const file = path.join(OUT, st.name + "-" + vp + ".png");
                await page.screenshot({ path: file, fullPage: false });
                if (st.full && vp === "desk") await page.screenshot({ path: path.join(OUT, st.name + "-" + vp + "-full.png"), fullPage: true });
                report.states[st.name][vp] = {
                    overflowX: await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
                };
                if (AXE && vp === "desk" && process.env.AXE_JS) {
                    await page.addScriptTag({ path: process.env.AXE_JS });
                    report.axe[st.name] = await page.evaluate(async () => {
                        const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
                        return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help, sample: v.nodes.slice(0, 2).map((n) => n.target.join(" ")) }));
                    });
                }
                report.states[st.name].errors.push(...errors.filter((e) => !/ERR_FAILED|net::/.test(e)));
                await ctx.close();
            }
        }
        if (SIZES) {
            for (const [hash, fixture] of [["home", "returning"], ["home", "empty"], ["notes", "returning"], ["practice", "returning"], ["review", "returning"], ["progress", "returning"], ["setup", "returning"], ["mistake/fixture-err-001", "returning"]]) {
                for (const [name, vp] of Object.entries(VIEWPORTS)) {
                    const { ctx, page } = await openState(browser, server, fixture, vp, hash);
                    report.overflow[hash + "/" + fixture + "@" + name] = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
                    await ctx.close();
                }
            }
        }
        if (PERF) {
            for (const [hash, fixture] of [["home", "empty"], ["home", "returning"], ["practice", "returning"], ["review", "returning"], ["progress", "returning"]]) {
                const runs = [];
                for (let i = 0; i < 3; i++) runs.push(await measurePerf(browser, server, fixture, hash, 0));
                const slow = await measurePerf(browser, server, fixture, hash, 4);
                const median = (k) => runs.map((r) => r[k]).sort((a, b) => a - b)[1];
                report.perf[hash + "/" + fixture] = { fcp: median("fcp"), lcp: median("lcp"), cls: median("cls"), blockingMsOver50: median("blockingMsOver50"),
                    kilobytes: runs[0].kilobytes, kilobytesAtLoad: runs[0].kilobytesAtLoad, resources: runs[0].resources,
                    lcpElement: runs[0].lcpElement, cpu4x: { lcp: slow.lcp, blockingMsOver50: slow.blockingMsOver50, cls: slow.cls } };
            }
        }
    } finally {
        await browser.close();
        server.child.kill();
        fs.rmSync(server.db, { force: true });
        fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
    }
    console.log(JSON.stringify(report, null, 1).slice(0, 6000));
})().catch((e) => { console.error(e); process.exit(1); });
