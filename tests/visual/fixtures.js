// Labelled TEST fixtures for visual review and stress testing.
//
// Every record here is synthetic test data: ids start with "fixture-", user ids with
// "u-fixture-". They are written only into an isolated browser context and a temporary
// database started by tests/visual/capture.js, never into real user data.
//
//   buildState(name, now) -> { localStorage: {key: rawString}, attempts: [payload] }
//   names: "empty" | "returning" | "dense"
//   extremeSet() -> practice items with long stems, long options, and heavy LaTeX

"use strict";

const DAY = 86400000;

function iso(ms) { return new Date(ms).toISOString(); }

function srFor(now, kind, dueInDays) {
    // SM-2 states that match what the scheduler produces for each status.
    const base = { algo: "sm2", lastQuality: 5 };
    if (kind === "new") return Object.assign(base, { reps: 0, ef: 2.5, intervalDays: 0, reviews: 0, lastQuality: null, due: iso(now - DAY) });
    if (kind === "mastered") return Object.assign(base, { reps: 4, ef: 2.7, intervalDays: 38, reviews: 4, due: iso(now + dueInDays * DAY) });
    const interval = Math.max(1, Math.round(Math.abs(dueInDays)) || 1);
    return Object.assign(base, { reps: dueInDays <= 0 ? 1 : 2, ef: 2.5, intervalDays: interval, reviews: 2, due: iso(now + dueInDays * DAY) });
}

const MISTAKES = [
    // subject, topic, difficulty, status, due (days), question, options, answer, userAnswer, explanation
    ["AP Calculus AB", "Chain rule", "medium", "learning", -1,
        "If $y = (3x + 1)^4$, then $\\frac{dy}{dx}$ is:",
        ["A. $12(3x+1)^3$", "B. $4(3x+1)^3$", "C. $(3x+1)^3$", "D. $12(3x+1)^4$"], "A. $12(3x+1)^3$", "B. $4(3x+1)^3$",
        "Chain rule: 4(3x+1)³ times the inner derivative 3 = 12(3x+1)³. '4(3x+1)³' is the trap of forgetting to multiply by the derivative of the inside (3)."],
    ["AP Calculus AB", "Chain rule", "medium", "new", 0,
        "The derivative of $\\ln(5x^2 + 1)$ is:",
        ["A. $\\frac{10x}{5x^2+1}$", "B. $\\frac{1}{5x^2+1}$", "C. $\\frac{5}{5x^2+1}$", "D. $\\frac{10x}{5x^2}$"], "A. $\\frac{10x}{5x^2+1}$", "B. $\\frac{1}{5x^2+1}$",
        "Chain rule: d/dx ln(u) = u'/u with u = 5x²+1 and u' = 10x, giving 10x/(5x²+1). '1/(5x²+1)' is the trap of forgetting to multiply by the inner derivative."],
    ["AP Calculus AB", "Product rule", "medium", "learning", 3,
        "The derivative of $x^2 e^x$ is:",
        ["A. $2x e^x + x^2 e^x$", "B. $2x e^x$", "C. $x^2 e^x$", "D. $2x e^x \\cdot x^2 e^x$"], "A. $2x e^x + x^2 e^x$", "B. $2x e^x$",
        "Product rule: (uv)' = u'v + uv' = 2x·eˣ + x²·eˣ. '2x·eˣ' is the trap of differentiating only the first factor and ignoring the second."],
    ["AP Calculus AB", "Definite integrals", "medium", "learning", 6,
        "$\\int_0^2 3x^2\\,dx$ equals:",
        ["A. $8$", "B. $12$", "C. $6$", "D. $4$"], "A. $8$", "B. $12$",
        "The antiderivative of 3x² is x³, so the integral is 2³ − 0³ = 8. '12' is the trap of evaluating the integrand 3x² at x=2 (3·4) instead of antidifferentiating."],
    ["AP Biology", "Enzymes", "basic", "new", 0,
        "An enzyme is heated to 90 °C and stops working, even after it cools. What most likely happened?",
        ["A. It denatured", "B. Its substrate ran out", "C. It replicated", "D. The pH rose"], "A. It denatured", "B. Its substrate ran out",
        "High heat breaks the bonds that hold the enzyme's three-dimensional shape, so the active site no longer fits the substrate."],
    ["AP Biology", "Enzymes", "medium", "learning", 1,
        "Adding more substrate no longer raises the reaction rate. Which change would most likely increase it?",
        ["A. Add more enzyme", "B. Add more substrate", "C. Lower the temperature to 4 °C", "D. Add a competitive inhibitor"], "A. Add more enzyme", "B. Add more substrate",
        "At saturation every active site is occupied, so only more enzyme raises the maximum rate. 'More substrate' is the trap of ignoring saturation."],
    ["AP Biology", "Cell membranes", "medium", "mastered", 27,
        "A red blood cell is placed in a hypertonic solution. What happens?",
        ["A. It shrinks as water leaves", "B. It swells and bursts", "C. Nothing changes", "D. Salt enters until it bursts"], "A. It shrinks as water leaves", "B. It swells and bursts",
        "Water moves by osmosis toward the higher solute concentration outside the cell, so the cell loses water and shrinks."],
    ["AP Chemistry", "Equilibrium", "challenge", "learning", 2,
        "For $N_2(g) + 3H_2(g) \\rightleftharpoons 2NH_3(g)$, $K_c = 64$. If $Q_c = 16$, the reaction:",
        ["A. shifts right, toward products", "B. shifts left, toward reactants", "C. is at equilibrium", "D. stops"], "A. shifts right, toward products", "B. shifts left, toward reactants",
        "Q < K means there are too few products relative to equilibrium, so the net reaction proceeds forward. Reversing the Q vs K direction is the classic trap."],
    ["AP Chemistry", "Acids and bases", "medium", "learning", 9,
        "What is the pH of a $1.0 \\times 10^{-3}$ M HCl solution?",
        ["A. 3", "B. 11", "C. 1", "D. 7"], "A. 3", "B. 11",
        "HCl is a strong acid, so [H⁺] = 1.0×10⁻³ M and pH = −log(10⁻³) = 3. '11' is the pOH."],
    ["AP Physics 1", "Kinematics", "medium", "learning", 4,
        "A ball is dropped from rest. Ignoring air resistance and using $g = 10\\,\\text{m/s}^2$, how far does it fall in 3 s?",
        ["A. 45 m", "B. 30 m", "C. 90 m", "D. 15 m"], "A. 45 m", "B. 30 m",
        "Δy = ½gt² = ½(10)(3²) = 45 m. '30 m' multiplies g by t instead of using ½gt²."],
    ["AP Physics 1", "Momentum", "challenge", "new", 0,
        "A 2 kg cart at 3 m/s sticks to a 1 kg cart at rest. Their speed after the collision is:",
        ["A. 2 m/s", "B. 3 m/s", "C. 1.5 m/s", "D. 6 m/s"], "A. 2 m/s", "B. 3 m/s",
        "Momentum is conserved: 2·3 = (2+1)v, so v = 2 m/s. Keeping 3 m/s ignores the added mass."],
    ["AP United States History", "Reconstruction", "medium", "learning", 14,
        "Which development most directly undermined the goals of Radical Reconstruction in the 1870s?",
        ["A. The Compromise of 1877", "B. The Homestead Act", "C. The Missouri Compromise", "D. The Dawes Act"], "A. The Compromise of 1877", "C. The Missouri Compromise",
        "The Compromise of 1877 withdrew federal troops from the South, ending federal enforcement of Reconstruction. The Missouri Compromise is from 1820."],
    ["AP Psychology", "Memory", "basic", "mastered", 40,
        "Studying in short sessions spread over days, rather than one long session, takes advantage of:",
        ["A. the spacing effect", "B. the serial position effect", "C. proactive interference", "D. state-dependent memory"], "A. the spacing effect", "B. the serial position effect",
        "Distributed practice improves long-term retention: the spacing effect. Serial position is about the order of items in a list."],
    ["AP Statistics", "Inference", "challenge", "learning", 5,
        "A 95% confidence interval for a mean is (12.1, 15.3). Which interpretation is correct?",
        ["A. We are 95% confident the population mean is between 12.1 and 15.3", "B. 95% of sample means lie in this interval",
            "C. There is a 95% probability the sample mean is in the interval", "D. 95% of the data lie between 12.1 and 15.3"],
        "A. We are 95% confident the population mean is between 12.1 and 15.3", "D. 95% of the data lie between 12.1 and 15.3",
        "The confidence is about the method capturing the population parameter, not about individual data values or the sample mean."]
];

function mistakeRecord(row, i, now) {
    const [subject, topic, difficulty, status, due, question, options, answer, userAnswer, explanation] = row;
    return {
        id: "fixture-err-" + String(i + 1).padStart(3, "0"),
        sourceId: "fixture-q-" + (i + 1),
        type: "Multiple Choice",
        question, options, answer, userAnswer, explanation,
        subject, topic, topicKey: topic.toLowerCase(), difficulty,
        sr: srFor(now, status, due),
        createdAt: iso(now - (20 - i) * DAY)
    };
}

function masteryFor(records, now) {
    const map = {};
    const ema = { "chain rule": 0.38, "product rule": 0.55, "definite integrals": 0.72, "enzymes": 0.46, "cell membranes": 0.9,
        "equilibrium": 0.52, "acids and bases": 0.8, "kinematics": 0.66, "momentum": 0.4, "reconstruction": 0.74,
        "memory": 0.92, "inference": 0.58 };
    records.forEach((r) => {
        const key = r.subject + "::" + r.topicKey;
        if (map[key]) return;
        const e = ema[r.topicKey] == null ? 0.6 : ema[r.topicKey];
        const attempts = 3 + (r.topicKey.length % 5);
        map[key] = { subject: r.subject, topic: r.topic, topicKey: r.topicKey, attempts,
            correct: Math.round(attempts * e), ema: e, lastAttemptAt: iso(now - 2 * DAY),
            sources: { generated: { attempts: attempts - 1, correct: Math.max(0, Math.round(attempts * e) - 1) }, review: { attempts: 1, correct: 1 } } };
    });
    return map;
}

function attemptsFor(userId, now) {
    // ~4 graded answers a day over the last 14 days, improving over time.
    const subjects = ["AP Calculus AB", "AP Biology", "AP Chemistry", "AP Physics 1"];
    const out = [];
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let d = 13; d >= 0; d--) {
        const n = d === 5 || d === 9 ? 0 : 2 + Math.floor(rand() * 5);
        for (let k = 0; k < n; k++) {
            const p = 0.45 + (13 - d) * 0.025;
            out.push({
                subject: subjects[(d + k) % subjects.length],
                type: k % 3 === 2 ? "Short Answer" : "Multiple Choice",
                correct: rand() < p,
                ts: iso(now - d * DAY - k * 3600000),
                userId,
                source: k % 4 === 3 ? "review" : (k % 5 === 4 ? "variant" : "generated")
            });
        }
    }
    return out;
}

function common(userId, now, extra) {
    const today = iso(now).slice(0, 10);
    return Object.assign({
        studyBoostUserIdV1: userId,
        studyBoostOnboardedV1: "1",
        studyBoostXpV1: "340",
        studyBoostStreakV1: JSON.stringify({ count: 4, lastDay: today }),
        studyBoostDailyV1: JSON.stringify({ day: today, questions: 3, reviews: 1, xp: 42 })
    }, extra);
}

function denseRecords(now) {
    const courses = [
        ["AP Calculus AB", ["Chain rule", "Product rule", "Limits", "Related rates", "Definite integrals"]],
        ["AP Calculus BC", ["Series", "Parametric curves", "Polar area"]],
        ["AP Biology", ["Enzymes", "Cell membranes", "Genetics", "Ecology"]],
        ["AP Chemistry", ["Equilibrium", "Kinetics", "Thermodynamics", "Acids and bases"]],
        ["AP Physics 1", ["Kinematics", "Momentum", "Energy", "Rotation"]],
        ["AP Statistics", ["Inference", "Probability", "Regression"]],
        ["AP United States History", ["Reconstruction", "Progressive Era", "Cold War"]],
        ["AP Psychology", ["Memory", "Learning", "Research methods"]]
    ];
    const recs = [];
    let seed = 42;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 160; i++) {
        const [subject, topics] = courses[Math.floor(rand() * courses.length)];
        const topic = topics[Math.floor(rand() * topics.length)];
        const r = rand();
        const status = r < 0.18 ? "new" : (r < 0.85 ? "learning" : "mastered");
        const due = status === "new" ? 0 : (status === "mastered" ? 21 + Math.floor(rand() * 30) : Math.floor(rand() * 20) - 3);
        recs.push({
            id: "fixture-dense-" + String(i + 1).padStart(3, "0"),
            sourceId: "fixture-dq-" + i,
            type: i % 6 === 5 ? "Short Answer" : "Multiple Choice",
            question: "Fixture question " + (i + 1) + " about " + topic.toLowerCase() + " in " + subject + ". Which statement is correct?",
            options: i % 6 === 5 ? undefined : ["A. First option", "B. Second option", "C. Third option", "D. Fourth option"],
            answer: i % 6 === 5 ? "A short model answer." : "A. First option",
            userAnswer: i % 6 === 5 ? "My attempt." : "C. Third option",
            explanation: "Fixture explanation for item " + (i + 1) + ".",
            subject, topic, topicKey: topic.toLowerCase(),
            difficulty: ["basic", "medium", "challenge"][i % 3],
            sr: srFor(now, status, due),
            createdAt: iso(now - (160 - i) * 3600000)
        });
    }
    return recs;
}

function buildState(name, now) {
    now = now || Date.now();
    if (name === "empty") return { localStorage: {}, attempts: [] };
    if (name === "returning") {
        const recs = MISTAKES.map((row, i) => mistakeRecord(row, i, now));
        return {
            localStorage: common("u-fixture-returning", now, {
                studyBoostMistakesV2: JSON.stringify(recs),
                studyBoostMasteryV1: JSON.stringify(masteryFor(recs, now))
            }),
            attempts: attemptsFor("u-fixture-returning", now)
        };
    }
    if (name === "dense") {
        const recs = denseRecords(now);
        return {
            localStorage: common("u-fixture-dense", now, {
                studyBoostMistakesV2: JSON.stringify(recs),
                studyBoostMasteryV1: JSON.stringify(masteryFor(recs, now))
            }),
            attempts: attemptsFor("u-fixture-dense", now)
        };
    }
    throw new Error("unknown fixture state " + name);
}

// Practice items that stress the reading layout (long stems, long options, heavy math).
function extremeSet() {
    const longStem = "A researcher studies the growth of a bacterial culture in a nutrient broth kept at 37 °C. " +
        "Samples are taken every 20 minutes, and the optical density of each sample is recorded. After an initial lag phase " +
        "of roughly 60 minutes, the density increases rapidly before leveling off near 1.8. The researcher fits the model " +
        "$P(t) = \\dfrac{K}{1 + A e^{-rt}}$ with $K = 1.8$, $A = 35$, and $r = 0.04\\ \\text{min}^{-1}$. " +
        "Based on this logistic model, at what time $t$ (in minutes) is the population growing fastest, and why does the rate fall afterwards?";
    return [
        {
            id: "fixture-x-1", type: "Multiple Choice", subject: "AP Calculus BC", topic: "Logistic growth", source: "generated", difficulty: "challenge",
            question: longStem,
            options: [
                "A. At $t = \\dfrac{\\ln 35}{0.04} \\approx 89$ min, where $P = \\dfrac{K}{2}$; afterwards crowding makes $\\dfrac{dP}{dt} = rP\\left(1 - \\dfrac{P}{K}\\right)$ shrink",
                "B. At $t = 0$, because the population is smallest and so has the most room to grow, which makes the derivative largest at the start of the experiment",
                "C. At $t = \\dfrac{K}{r} = 45$ min, the time it takes the culture to reach its carrying capacity",
                "D. The growth rate never falls: a logistic curve increases without bound as $t \\to \\infty$"
            ],
            answer: "A. At $t = \\dfrac{\\ln 35}{0.04} \\approx 89$ min, where $P = \\dfrac{K}{2}$; afterwards crowding makes $\\dfrac{dP}{dt} = rP\\left(1 - \\dfrac{P}{K}\\right)$ shrink",
            explanation: "The logistic rate $\\frac{dP}{dt} = rP(1 - P/K)$ is maximized when $P = K/2$. Solving $\\frac{K}{1 + 35e^{-0.04t}} = \\frac{K}{2}$ gives $35e^{-0.04t} = 1$, so $t = \\frac{\\ln 35}{0.04} \\approx 88.9$ minutes. After that point the factor $(1 - P/K)$ keeps decreasing, so growth slows as the culture approaches $K$."
        },
        {
            id: "fixture-x-2", type: "Multiple Choice", subject: "AP Calculus BC", topic: "Series", source: "generated", difficulty: "challenge",
            question: "Which series converges? $\\displaystyle\\sum_{n=1}^{\\infty} \\frac{(-1)^{n+1}}{\\sqrt{n}}$, $\\displaystyle\\sum_{n=1}^{\\infty} \\frac{1}{n}$, $\\displaystyle\\sum_{n=1}^{\\infty} \\frac{n!}{2^n}$, $\\displaystyle\\sum_{n=1}^{\\infty} \\left(1 + \\frac{1}{n}\\right)^{n}$",
            options: ["A. $\\displaystyle\\sum \\frac{(-1)^{n+1}}{\\sqrt{n}}$", "B. $\\displaystyle\\sum \\frac{1}{n}$", "C. $\\displaystyle\\sum \\frac{n!}{2^n}$", "D. $\\displaystyle\\sum \\left(1+\\frac1n\\right)^n$"],
            answer: "A. $\\displaystyle\\sum \\frac{(-1)^{n+1}}{\\sqrt{n}}$",
            explanation: "The alternating series test applies: $\\frac{1}{\\sqrt n}$ decreases to 0. The harmonic series diverges, $\\frac{n!}{2^n} \\to \\infty$, and $(1+\\frac1n)^n \\to e \\neq 0$."
        },
        {
            id: "fixture-x-3", type: "Short Answer", subject: "AP Chemistry", topic: "Thermodynamics", source: "generated", difficulty: "challenge",
            question: "Using $\\Delta G^\\circ = \\Delta H^\\circ - T\\Delta S^\\circ$ with $\\Delta H^\\circ = +40.0\\ \\text{kJ/mol}$ and $\\Delta S^\\circ = +120\\ \\text{J/(mol·K)}$, find the temperature above which the reaction becomes thermodynamically favorable, and explain what the sign of each term means for spontaneity.",
            answer: "Set ΔG° = 0: T = ΔH°/ΔS° = 40 000 / 120 ≈ 333 K. Above about 333 K the −TΔS° term outweighs the positive ΔH°, so ΔG° < 0 and the reaction is favorable.",
            explanation: "Convert units first (kJ to J). A positive ΔH° opposes spontaneity; a positive ΔS° favors it, more strongly at higher T."
        }
    ];
}

module.exports = { buildState, extremeSet, DAY };
