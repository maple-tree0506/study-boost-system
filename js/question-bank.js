/*
 * Offline question bank for StudyBoost AI.
 *
 * Shape:  OFFLINE_BANK[subjectId][tier] = { mcq: [...], sa: [...] }
 *   - subjectId matches the ids in AP_SUBJECTS (app.js)
 *   - tier is "basic" | "medium" | "challenge"
 *   - mcq item: { q, o: [4 options "A. .."], a: "full correct option string" }
 *   - sa  item: { q, a }   ('q' may contain the token {focus}, replaced at render time)
 *
 * Loaded as a plain <script> (before app.js) so it also works from file://
 * (a fetch of a local .json would be blocked by the browser).
 *
 * Subjects without an entry here degrade honestly: the UI says the offline
 * bank is unavailable for that subject instead of showing wrong-subject items.
 */
window.OFFLINE_BANK = {
    calc_ab: {
        basic: {
            mcq: [
                { q: "What is the derivative of x^5?", o: ["A. 5x^4", "B. x^4", "C. 5x^5", "D. 4x^5"], a: "A. 5x^4" },
                { q: "Evaluate the indefinite integral of 2x dx.", o: ["A. x^2 + C", "B. 2 + C", "C. 2x^2 + C", "D. x + C"], a: "A. x^2 + C" },
                { q: "What is the limit of sin(x)/x as x approaches 0?", o: ["A. 0", "B. 1", "C. infinity", "D. undefined"], a: "B. 1" },
                { q: "The derivative of the constant function f(x) = 7 is:", o: ["A. 7", "B. 1", "C. 0", "D. x"], a: "C. 0" }
            ],
            sa: [
                { q: "State the power rule for derivatives and give one example.", a: "d/dx[x^n] = n*x^(n-1); e.g., d/dx[x^3] = 3x^2." },
                { q: "Define what a definite integral represents geometrically.", a: "The signed area between the curve and the x-axis over the interval [a, b]." },
                { q: "What is the derivative of any constant, and why?", a: "Zero, because a constant never changes, so its rate of change is 0." },
                { q: "Write the limit definition of the derivative of f at x.", a: "f'(x) = lim(h->0) [f(x+h) - f(x)] / h." }
            ]
        },
        medium: {
            mcq: [
                { q: "A particle moves along the x-axis with velocity v(t) = 3t^2 - 12t. At which t in [0,4] is the acceleration zero?", o: ["A. t = 0", "B. t = 1", "C. t = 2", "D. t = 4"], a: "C. t = 2" },
                { q: "Which expression gives the derivative of ln(5x^2 + 1)?", o: ["A. 1/(5x^2+1)", "B. 10x/(5x^2+1)", "C. 5/(5x^2+1)", "D. 2x ln(5x^2+1)"], a: "B. 10x/(5x^2+1)" },
                { q: "The integral from 1 to e of (1/x) dx equals", o: ["A. 0", "B. 1", "C. e", "D. e - 1"], a: "B. 1" },
                { q: "For f(x) = x^3 - 3x, which statement about local extrema on the real line is correct?", o: ["A. Local max at x=1 only", "B. Local min at x=-1, local max at x=1", "C. No critical points", "D. Local max at x=-1 only"], a: "B. Local min at x=-1, local max at x=1" },
                { q: "If the integral from a to b of f(x) dx = -3, what is a reasonable interpretation?", o: ["A. f is always negative", "B. area below the axis dominates", "C. f has no zeros", "D. integral is always positive"], a: "B. area below the axis dominates" }
            ],
            sa: [
                { q: "Explain the relationship between position, velocity, and acceleration for {focus} using one sentence each.", a: "Velocity is the derivative of position; acceleration is the derivative of velocity (or second derivative of position). Connect to your topic by naming what is changing and what rate." },
                { q: "Set up (do not evaluate) the integral for the volume of revolution for a representative problem related to {focus}.", a: "State disk/washer or shell, show radius/height in terms of the variable, and give correct bounds." },
                { q: "For a related rates problem about {focus}, what quantities are typically held constant vs changing?", a: "State which geometric relation links variables, differentiate with respect to time, and substitute known rates." },
                { q: "Describe how you would justify a local minimum using calculus tests for a function tied to {focus}.", a: "Find critical points, use first or second derivative test, conclude with function values." },
                { q: "Compare Riemann sum estimates vs exact integral for a concept from {focus}.", a: "Explain rectangles/trapezoids vs limit of sums; mention refinement as n increases." }
            ]
        },
        challenge: {
            mcq: [
                { q: "For f(x) = x^3 - 3x, identify the local extrema on the real line.", o: ["A. Local max at x = 1 only", "B. Local min at x = -1 and local max at x = 1", "C. No critical points", "D. Local max at x = -1 and local min at x = 1"], a: "B. Local min at x = -1 and local max at x = 1" },
                { q: "If the integral of f from a to b equals -3, which interpretation is best?", o: ["A. f is always negative", "B. Net signed area is negative; area below the axis dominates", "C. f has no zeros on [a, b]", "D. The integral must be positive"], a: "B. Net signed area is negative; area below the axis dominates" },
                { q: "By the Mean Value Theorem, for f continuous on [a, b] and differentiable on (a, b), there exists c such that:", o: ["A. f(c) = 0", "B. f'(c) = (f(b) - f(a)) / (b - a)", "C. f'(c) = 0 always", "D. f(c) = f(a) + f(b)"], a: "B. f'(c) = (f(b) - f(a)) / (b - a)" },
                { q: "Let g(x) = integral from 0 to x of f(t) dt. If f is positive and increasing, then g is:", o: ["A. Decreasing and concave down", "B. Increasing and concave up", "C. Constant", "D. Increasing and concave down"], a: "B. Increasing and concave up" }
            ],
            sa: [
                { q: "Justify the existence of a local minimum for a function tied to {focus} using both the first and second derivative tests.", a: "Find critical points where f' = 0; first-derivative test: sign change - to + implies a min; second-derivative test: f'' > 0 implies a min; confirm with function values." },
                { q: "Given the graph of f', describe the concavity and locate inflection points for a problem connected to {focus}.", a: "f is concave up where f' is increasing (f'' > 0) and concave down where f' is decreasing; inflection points occur where f'' changes sign." },
                { q: "Use the Fundamental Theorem of Calculus to explain how an accumulation function relates to {focus}.", a: "If F(x) = integral from a to x of f(t) dt, then F'(x) = f(x); the accumulation's rate of change equals the integrand." },
                { q: "Set up and justify (do not evaluate) a definite integral modeling total change for {focus}.", a: "Identify the rate function, integrate the rate over the interval, and interpret the result as net accumulated change with correct units." }
            ]
        }
    },

    bio: {
        basic: {
            mcq: [
                { q: "The net ATP yield from glycolysis per glucose is:", o: ["A. 0", "B. 1", "C. 2", "D. 4"], a: "C. 2" },
                { q: "Which organelle is the main site of aerobic cellular respiration?", o: ["A. Chloroplast", "B. Mitochondrion", "C. Golgi apparatus", "D. Nucleus"], a: "B. Mitochondrion" },
                { q: "Photosynthesis releases O2 by splitting which molecule?", o: ["A. CO2", "B. Glucose", "C. H2O", "D. ATP"], a: "C. H2O" },
                { q: "The monomers (building blocks) of proteins are:", o: ["A. Nucleotides", "B. Amino acids", "C. Monosaccharides", "D. Fatty acids"], a: "B. Amino acids" }
            ],
            sa: [
                { q: "Define homeostasis in one sentence.", a: "The maintenance of a stable internal environment despite external changes." },
                { q: "Name the main products of glycolysis.", a: "Two pyruvate molecules, a net of 2 ATP, and 2 NADH." },
                { q: "State the primary role of DNA in a cell.", a: "To store and transmit the genetic instructions used to build proteins." },
                { q: "What is an enzyme and what does it do?", a: "A biological catalyst (usually a protein) that speeds up reactions by lowering activation energy." }
            ]
        },
        medium: {
            mcq: [
                { q: "During glycolysis, the net ATP yield per glucose is typically:", o: ["A. 0", "B. 1", "C. 2", "D. 4"], a: "C. 2" },
                { q: "Which organelle is the primary site of cellular respiration (Krebs & ETC)?", o: ["A. Chloroplast", "B. Mitochondrion", "C. Golgi", "D. Nucleus"], a: "B. Mitochondrion" },
                { q: "Photosynthesis produces O2 from splitting which molecule?", o: ["A. CO2", "B. Glucose", "C. H2O", "D. ATP"], a: "C. H2O" },
                { q: "DNA replication is semiconservative because:", o: ["A. Both strands are destroyed", "B. Each daughter duplex has one parental strand", "C. RNA primes both ends only", "D. Telomeres prevent replication"], a: "B. Each daughter duplex has one parental strand" },
                { q: "Which change most directly increases genetic variation in meiosis?", o: ["A. Mitosis", "B. Crossing over", "C. Binary fission", "D. Photosynthesis"], a: "B. Crossing over" }
            ],
            sa: [
                { q: "Compare aerobic respiration and fermentation for {focus} in terms of NAD+ recycling.", a: "Aerobic uses ETC/O2 to regenerate NAD+; fermentation regenerates NAD+ without O2 by reducing pyruvate to lactate or ethanol+CO2." },
                { q: "Explain negative feedback in a homeostatic pathway relevant to {focus}.", a: "Sensor detects deviation, control center responds, effector reduces deviation; give one concrete example." },
                { q: "Describe how enzyme activity could be regulated for a pathway connected to {focus}.", a: "Competitive vs noncompetitive inhibition; allosteric regulation; environmental factors (pH/temperature)." },
                { q: "Outline how natural selection could act on a trait you studied in {focus}.", a: "Variation, heritability, differential survival/reproduction, change in allele frequencies." },
                { q: "Contrast DNA vs RNA structure/function for information flow relevant to {focus}.", a: "DNA double-stranded genetic storage; RNA single-stranded roles (mRNA/tRNA/rRNA); mention transcription." }
            ]
        },
        challenge: {
            mcq: [
                { q: "A recessive allele's frequency drops over generations under selection. The best explanation is:", o: ["A. Genetic drift only", "B. Recessive homozygotes have lower fitness while heterozygotes are unaffected", "C. The mutation rate increased", "D. Gene flow stopped"], a: "B. Recessive homozygotes have lower fitness while heterozygotes are unaffected" },
                { q: "Two genes show a 12% recombination frequency. This indicates they are:", o: ["A. On different chromosomes", "B. Linked, about 12 map units apart", "C. The same gene", "D. Unlinked and assorting independently"], a: "B. Linked, about 12 map units apart" },
                { q: "In an enzyme experiment where temperature is the independent variable, a proper control holds constant:", o: ["A. Temperature", "B. pH, substrate concentration, and enzyme concentration", "C. Reaction rate", "D. Time only"], a: "B. pH, substrate concentration, and enzyme concentration" },
                { q: "End-product inhibition of a metabolic pathway is an example of:", o: ["A. Positive feedback", "B. Negative feedback via allosteric regulation", "C. Competitive substrate binding only", "D. Denaturation"], a: "B. Negative feedback via allosteric regulation" }
            ],
            sa: [
                { q: "Explain how natural selection could act on a trait you studied in {focus}, from variation to allele-frequency change.", a: "Heritable variation exists; differential survival/reproduction favors some variants; over generations the advantageous allele's frequency rises." },
                { q: "Contrast DNA and RNA structure and function in the flow of genetic information for {focus}.", a: "DNA is double-stranded long-term storage; RNA is single-stranded; mRNA carries the code, tRNA brings amino acids, rRNA builds ribosomes; transcription then translation." },
                { q: "Design an experiment to test how an environmental factor affects enzyme reaction rate for a pathway related to {focus}.", a: "State a hypothesis, vary one factor (e.g., pH), control the others, measure rate (product per time), include replicates and a control, then analyze the trend." },
                { q: "Explain how a beneficial mutation could spread through a population connected to {focus}.", a: "A mutation creates a new allele; if it raises fitness, carriers reproduce more; the allele's frequency increases over generations and may approach fixation." }
            ]
        }
    }
};
