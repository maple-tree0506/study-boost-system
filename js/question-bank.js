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
    },

    calc_bc: {
        basic: {
            mcq: [
                { q: "The sum of the geometric series 1 + 1/2 + 1/4 + 1/8 + ... is:", o: ["A. 1", "B. 3/2", "C. 2", "D. infinite"], a: "C. 2" },
                { q: "What is the derivative of e^(2x)?", o: ["A. e^(2x)", "B. 2e^(2x)", "C. 2x e^(2x)", "D. e^(2x)/2"], a: "B. 2e^(2x)" },
                { q: "A geometric series with common ratio r converges when:", o: ["A. |r| > 1", "B. |r| < 1", "C. r = 1", "D. r > 0"], a: "B. |r| < 1" },
                { q: "The integration-by-parts formula is the integral of u dv =", o: ["A. uv - integral of v du", "B. uv + integral of v du", "C. u/v - integral of v du", "D. integral of u du - v"], a: "A. uv - integral of v du" }
            ],
            sa: [
                { q: "State the formula for the sum of a convergent geometric series with first term a and ratio r.", a: "S = a / (1 - r), valid for |r| < 1." },
                { q: "Write the general term of the Taylor series of f about x = a.", a: "f^(n)(a)/n! times (x - a)^n, summed for n from 0 to infinity." },
                { q: "What does the ratio test determine?", a: "Whether a series converges absolutely, using the limit of |a_(n+1)/a_n|: <1 converges, >1 diverges, =1 inconclusive." },
                { q: "Define an improper integral.", a: "An integral with an infinite limit or an infinite discontinuity in the integrand, evaluated as a limit." }
            ]
        },
        medium: {
            mcq: [
                { q: "The Maclaurin series for e^x is:", o: ["A. sum of x^n", "B. sum of x^n / n!", "C. sum of (-1)^n x^n", "D. sum of n! x^n"], a: "B. sum of x^n / n!" },
                { q: "Which test best shows that the sum of 1/n^2 converges?", o: ["A. nth-term test", "B. p-series test (p = 2 > 1)", "C. ratio test", "D. it diverges"], a: "B. p-series test (p = 2 > 1)" },
                { q: "The arc length of a parametric curve uses the integral of:", o: ["A. sqrt((dx/dt)^2 + (dy/dt)^2) dt", "B. (dx/dt)(dy/dt) dt", "C. sqrt(dx^2 - dy^2)", "D. (dy/dx) dt"], a: "A. sqrt((dx/dt)^2 + (dy/dt)^2) dt" },
                { q: "Evaluate the improper integral from 1 to infinity of 1/x^2 dx.", o: ["A. diverges", "B. 1", "C. 2", "D. 0"], a: "B. 1" },
                { q: "For the logistic model dP/dt = kP(1 - P/M), the population grows fastest when P =", o: ["A. 0", "B. M", "C. M/2", "D. 2M"], a: "C. M/2" }
            ],
            sa: [
                { q: "Determine whether a series related to {focus} converges, and name the test you would use.", a: "Choose a test (ratio, comparison, integral, p-series, alternating) from the term's form; state the condition and conclude." },
                { q: "Set up the arc length integral for a parametric curve connected to {focus} (do not evaluate).", a: "L = integral of sqrt((dx/dt)^2 + (dy/dt)^2) dt over the parameter interval." },
                { q: "Explain how a Taylor polynomial approximates a function from {focus} and what controls the error.", a: "It matches derivatives at the center; the Lagrange remainder bounds the error using the next derivative." },
                { q: "For an improper integral arising in {focus}, describe how you evaluate it.", a: "Replace the infinite/undefined bound with a limit variable, integrate, then take the limit; it converges if that limit is finite." },
                { q: "Describe the behavior of a logistic growth model relevant to {focus}.", a: "Near-exponential growth at low P, an inflection at P = M/2, then leveling off toward the carrying capacity M." }
            ]
        },
        challenge: {
            mcq: [
                { q: "The interval of convergence of the sum of x^n / n is:", o: ["A. (-1, 1)", "B. [-1, 1)", "C. (-1, 1]", "D. [-1, 1]"], a: "B. [-1, 1)" },
                { q: "By the integral test, the sum of 1/(n ln n) for n >= 2:", o: ["A. converges", "B. diverges", "C. equals e", "D. equals ln 2"], a: "B. diverges" },
                { q: "The Taylor (Lagrange) remainder bounds the error using:", o: ["A. the (n+1)th derivative on the interval", "B. the first derivative only", "C. the function value at 0", "D. the ratio test"], a: "A. the (n+1)th derivative on the interval" },
                { q: "For the cardioid r = 1 + cos(theta), the enclosed area is:", o: ["A. integral of (1+cos theta) d theta", "B. (1/2) integral of (1+cos theta)^2 d theta", "C. integral of (1+cos theta)^2 d theta", "D. (1/2) integral of (1+cos theta) d theta"], a: "B. (1/2) integral of (1+cos theta)^2 d theta" }
            ],
            sa: [
                { q: "Find and justify the interval of convergence for a power series tied to {focus}.", a: "Use the ratio test for the radius, then test each endpoint separately with an appropriate convergence test." },
                { q: "Set up the polar area integral for a curve from {focus}.", a: "A = (1/2) times the integral of r(theta)^2 d theta over the interval where the curve is traced." },
                { q: "Explain how Euler's method approximates a solution to a differential equation in {focus}, and its error behavior.", a: "Step forward with y_(n+1) = y_n + h f(x_n, y_n); local error is about h^2 and accumulates about h, so smaller h improves accuracy." },
                { q: "Use a Taylor series to approximate a quantity from {focus} and bound the error.", a: "Expand about a convenient center, truncate, and bound with the Lagrange remainder using a maximum of the next derivative." }
            ]
        }
    },

    stats: {
        basic: {
            mcq: [
                { q: "Which measure of center is most resistant to outliers?", o: ["A. Mean", "B. Median", "C. Range", "D. Standard deviation"], a: "B. Median" },
                { q: "A probability must be a number between:", o: ["A. -1 and 1", "B. 0 and 1", "C. 0 and 100", "D. 1 and 10"], a: "B. 0 and 1" },
                { q: "In a normal distribution, about what percent of data lies within 1 standard deviation of the mean?", o: ["A. 50%", "B. 68%", "C. 95%", "D. 99.7%"], a: "B. 68%" },
                { q: "A categorical variable is best displayed with a:", o: ["A. Histogram", "B. Bar chart", "C. Boxplot", "D. Scatterplot"], a: "B. Bar chart" }
            ],
            sa: [
                { q: "Define the mean and the median.", a: "Mean = sum of values divided by the count; median = the middle value when data are ordered." },
                { q: "What is the difference between a population and a sample?", a: "A population is the entire group of interest; a sample is a subset actually measured." },
                { q: "State the empirical (68-95-99.7) rule.", a: "In a normal distribution, about 68%, 95%, and 99.7% of data fall within 1, 2, and 3 standard deviations of the mean." },
                { q: "What does the standard deviation measure?", a: "The typical distance of values from the mean, i.e., the spread of the data." }
            ]
        },
        medium: {
            mcq: [
                { q: "Which method gives every individual an equal chance of selection?", o: ["A. Convenience sample", "B. Voluntary response", "C. Simple random sample", "D. Quota sample"], a: "C. Simple random sample" },
                { q: "A 95% confidence interval means:", o: ["A. 95% of the data is in the interval", "B. there is a 95% chance the parameter equals the sample mean", "C. 95% of such intervals capture the true parameter", "D. the sample is 95% accurate"], a: "C. 95% of such intervals capture the true parameter" },
                { q: "Increasing the sample size n affects the margin of error by:", o: ["A. increasing it", "B. decreasing it", "C. no effect", "D. doubling it"], a: "B. decreasing it" },
                { q: "A correlation of r = -0.9 indicates:", o: ["A. weak positive association", "B. strong negative linear association", "C. no association", "D. causation"], a: "B. strong negative linear association" },
                { q: "A Type I error is:", o: ["A. failing to reject a true null", "B. rejecting a true null hypothesis", "C. correctly accepting the alternative", "D. a data-entry error"], a: "B. rejecting a true null hypothesis" }
            ],
            sa: [
                { q: "Describe an appropriate sampling design for a study about {focus} and one source of bias to avoid.", a: "Select randomly from the population (SRS or stratified); avoid voluntary-response/convenience bias and undercoverage." },
                { q: "Interpret a 95% confidence interval in the context of {focus}.", a: "We are 95% confident the true parameter lies in the interval; over repeated sampling, 95% of such intervals capture it." },
                { q: "State the null and alternative hypotheses for a test related to {focus}.", a: "H0: no effect/difference (parameter equals a value); Ha: an effect/difference (not equal, greater, or less)." },
                { q: "Explain what a p-value tells you in a study of {focus}.", a: "Assuming H0 is true, the probability of results at least as extreme as observed; small p-values are evidence against H0." },
                { q: "Distinguish correlation and causation for variables in {focus}.", a: "Correlation is association; causation requires a randomized, controlled experiment to rule out confounding." }
            ]
        },
        challenge: {
            mcq: [
                { q: "Which conditions are required for a two-sample t-test?", o: ["A. Random samples, independence, approximately normal or large n", "B. Only equal sample sizes", "C. Known population standard deviation", "D. p < 0.05"], a: "A. Random samples, independence, approximately normal or large n" },
                { q: "If you decrease the significance level alpha, the probability of a Type II error:", o: ["A. decreases", "B. increases", "C. is unchanged", "D. becomes zero"], a: "B. increases" },
                { q: "A chi-square test of independence compares:", o: ["A. two means", "B. observed versus expected counts across categories", "C. regression slopes", "D. variances only"], a: "B. observed versus expected counts across categories" },
                { q: "In linear regression, a residual equals:", o: ["A. predicted minus observed", "B. observed minus predicted", "C. slope times x", "D. the correlation"], a: "B. observed minus predicted" }
            ],
            sa: [
                { q: "Design a randomized experiment to test a claim about {focus}, naming treatment, control, and randomization.", a: "Randomly assign subjects to treatment vs control, control confounders, replicate, and compare outcomes; randomization balances lurking variables." },
                { q: "Carry out the logic of a significance test for {focus} (hypotheses, conditions, conclusion).", a: "State H0/Ha, check random/independent/normal conditions, compute a test statistic and p-value, then reject or fail to reject H0 in context." },
                { q: "Interpret the slope and r^2 for a regression model in {focus}.", a: "Slope = predicted change in y per unit increase in x; r^2 = the fraction of variation in y explained by the linear model." },
                { q: "Explain Type I versus Type II error and their consequences for a decision about {focus}.", a: "Type I = rejecting a true H0 (false alarm); Type II = failing to reject a false H0 (missed effect); alpha controls Type I, power controls Type II." }
            ]
        }
    },

    chem: {
        basic: {
            mcq: [
                { q: "The number of protons in an atom is its:", o: ["A. mass number", "B. atomic number", "C. neutron count", "D. charge"], a: "B. atomic number" },
                { q: "Avogadro's number is approximately:", o: ["A. 3.14e10", "B. 6.022e23", "C. 1.6e-19", "D. 9.8"], a: "B. 6.022e23" },
                { q: "In the Bronsted-Lowry sense, an acid is a substance that:", o: ["A. accepts a proton", "B. donates a proton", "C. donates electrons", "D. always has pH 7"], a: "B. donates a proton" },
                { q: "Which is the correct chemical formula for water?", o: ["A. HO", "B. H2O", "C. H2O2", "D. OH"], a: "B. H2O" }
            ],
            sa: [
                { q: "Define the mole.", a: "The amount of substance that contains Avogadro's number (6.022e23) of particles." },
                { q: "What distinguishes an element from a compound?", a: "An element has one type of atom; a compound has two or more elements chemically bonded in fixed ratios." },
                { q: "State the difference between an ionic and a covalent bond.", a: "Ionic bonds transfer electrons (metal + nonmetal); covalent bonds share electrons (nonmetal + nonmetal)." },
                { q: "What does pH measure?", a: "The acidity of a solution; pH = -log[H+], where a lower pH is more acidic." }
            ]
        },
        medium: {
            mcq: [
                { q: "How many moles are in 36 g of water (molar mass about 18 g/mol)?", o: ["A. 1", "B. 2", "C. 18", "D. 36"], a: "B. 2" },
                { q: "In 2H2 + O2 -> 2H2O, the limiting reactant idea means the reaction stops when:", o: ["A. water runs out", "B. one reactant is fully consumed", "C. temperature drops", "D. pressure rises"], a: "B. one reactant is fully consumed" },
                { q: "By PV = nRT, at constant T and n, increasing P will:", o: ["A. increase V", "B. decrease V", "C. not change V", "D. increase n"], a: "B. decrease V" },
                { q: "A solution with pH = 3 has [H+] equal to:", o: ["A. 3 M", "B. 1e-3 M", "C. 1e-11 M", "D. 10 M"], a: "B. 1e-3 M" },
                { q: "AgNO3 + NaCl -> AgCl + NaNO3 is best classified as:", o: ["A. Combustion", "B. Precipitation (double replacement)", "C. Single replacement", "D. Decomposition"], a: "B. Precipitation (double replacement)" }
            ],
            sa: [
                { q: "Outline the steps to find the limiting reactant for a reaction in {focus}.", a: "Convert masses to moles, divide by coefficients; the smallest ratio is limiting; use it to find theoretical yield." },
                { q: "Explain how Le Chatelier's principle applies to an equilibrium related to {focus}.", a: "A stress (concentration, pressure, or temperature) shifts the equilibrium to partially counteract it; predict the direction." },
                { q: "Describe the relationship between [H+], [OH-], and pH for a solution in {focus}.", a: "pH = -log[H+]; [H+][OH-] = 1e-14 at 25 C; pH + pOH = 14." },
                { q: "Use the ideal gas law to relate variables for a gas problem in {focus}.", a: "PV = nRT; solve for the unknown holding the others constant, with consistent units and R = 0.0821 L atm/mol K." },
                { q: "Explain how bond type affects the properties of a substance in {focus}.", a: "Ionic solids are high-melting and conduct when molten/dissolved; molecular covalent substances melt lower; metals conduct and are malleable." }
            ]
        },
        challenge: {
            mcq: [
                { q: "For an endothermic reaction at equilibrium, increasing temperature:", o: ["A. shifts it left", "B. shifts it right toward products", "C. causes no shift", "D. stops the reaction"], a: "B. shifts it right toward products" },
                { q: "A buffer resists pH change because it contains:", o: ["A. a strong acid and strong base", "B. a weak acid and its conjugate base", "C. only water", "D. a salt of a strong acid"], a: "B. a weak acid and its conjugate base" },
                { q: "Which sample has the greatest entropy?", o: ["A. ice", "B. liquid water", "C. water vapor", "D. all equal"], a: "C. water vapor" },
                { q: "A reaction is spontaneous when:", o: ["A. delta G > 0", "B. delta G < 0", "C. delta H < 0 only", "D. delta S < 0 only"], a: "B. delta G < 0" }
            ],
            sa: [
                { q: "Describe how to find delta H for a reaction in {focus} using Hess's law or bond energies.", a: "Add the enthalpies of steps (Hess's law) or compute (bonds broken minus bonds formed), tracking signs carefully." },
                { q: "Explain how a buffer related to {focus} maintains pH, using equilibrium.", a: "The weak acid neutralizes added base and its conjugate base neutralizes added acid; pH = pKa + log([A-]/[HA])." },
                { q: "Relate delta G, delta H, delta S, and temperature for a process in {focus}.", a: "delta G = delta H - T delta S; the signs and temperature decide spontaneity; identify the temperature where it becomes spontaneous." },
                { q: "Interpret a reaction-rate experiment for {focus} using collision theory.", a: "Rate rises with concentration, temperature, and catalysts because the number of effective collisions (right orientation and enough energy) increases." }
            ]
        }
    },

    phys1: {
        basic: {
            mcq: [
                { q: "What is the SI unit of force?", o: ["A. Joule", "B. Newton", "C. Watt", "D. Pascal"], a: "B. Newton" },
                { q: "An object's acceleration is zero. This means:", o: ["A. it must be at rest", "B. its velocity is constant", "C. no forces act on it", "D. it is speeding up"], a: "B. its velocity is constant" },
                { q: "Newton's second law is written as:", o: ["A. F = ma", "B. F = mv", "C. F = m/a", "D. a = Fm"], a: "A. F = ma" },
                { q: "Which of these quantities is a vector?", o: ["A. Speed", "B. Mass", "C. Velocity", "D. Time"], a: "C. Velocity" }
            ],
            sa: [
                { q: "State Newton's first law.", a: "An object at rest stays at rest, and an object in motion keeps constant velocity, unless acted on by a net external force." },
                { q: "Define acceleration.", a: "The rate of change of velocity with time (a = change in v divided by change in t)." },
                { q: "What is the difference between mass and weight?", a: "Mass is the amount of matter (kg); weight is the gravitational force on it (W = mg, in newtons)." },
                { q: "Write the kinematic equation relating displacement, initial velocity, time, and acceleration.", a: "x = v0 t + (1/2) a t^2." }
            ]
        },
        medium: {
            mcq: [
                { q: "A 2 kg cart experiences a net force of 10 N. Its acceleration is:", o: ["A. 2 m/s^2", "B. 5 m/s^2", "C. 10 m/s^2", "D. 20 m/s^2"], a: "B. 5 m/s^2" },
                { q: "An object in free fall near Earth's surface has an acceleration of about:", o: ["A. 0", "B. 9.8 m/s^2 downward", "C. 9.8 m/s^2 upward", "D. a value that depends on its mass"], a: "B. 9.8 m/s^2 downward" },
                { q: "The momentum of a 3 kg object moving at 4 m/s is:", o: ["A. 0.75 kg m/s", "B. 7 kg m/s", "C. 12 kg m/s", "D. 12 N"], a: "C. 12 kg m/s" },
                { q: "The work done by a force is zero when:", o: ["A. the force is large", "B. the displacement is perpendicular to the force", "C. the object accelerates", "D. the force is constant"], a: "B. the displacement is perpendicular to the force" },
                { q: "In a collision within an isolated system, total momentum is:", o: ["A. always zero", "B. conserved", "C. doubled", "D. fully converted to heat"], a: "B. conserved" }
            ],
            sa: [
                { q: "Draw and describe a free-body diagram for an object in {focus}.", a: "Show every force as an arrow from the object (gravity, normal, friction, tension, applied), labeled with direction; the net force gives the acceleration." },
                { q: "Apply Newton's second law to a problem related to {focus}.", a: "Sum the forces in each direction, set net F = ma, and solve for the unknown force, mass, or acceleration." },
                { q: "Use conservation of energy to analyze a situation in {focus}.", a: "Set initial KE + PE equal to final KE + PE (plus losses if any); KE = (1/2)mv^2, gravitational PE = mgh." },
                { q: "Explain how momentum conservation applies to a collision in {focus}.", a: "For an isolated system, total momentum before equals after: m1v1 + m2v2 = m1v1' + m2v2'." },
                { q: "Describe the forces and acceleration for uniform circular motion in {focus}.", a: "The net (centripetal) force points toward the center; a = v^2/r, supplied by tension, gravity, friction, or the normal force." }
            ]
        },
        challenge: {
            mcq: [
                { q: "A ball is thrown straight up. At its highest point, its velocity and acceleration are:", o: ["A. both zero", "B. velocity zero, acceleration 9.8 m/s^2 downward", "C. both 9.8 m/s^2", "D. velocity maximum, acceleration zero"], a: "B. velocity zero, acceleration 9.8 m/s^2 downward" },
                { q: "Two carts collide and stick together (perfectly inelastic). Which is conserved?", o: ["A. kinetic energy only", "B. momentum only", "C. both momentum and kinetic energy", "D. neither"], a: "B. momentum only" },
                { q: "A box slides at constant velocity across a rough floor. The net force on it is:", o: ["A. equal to friction", "B. zero", "C. equal to its weight", "D. twice the applied force"], a: "B. zero" },
                { q: "For uniform circular motion, the centripetal acceleration is:", o: ["A. v/r", "B. v^2/r directed toward the center", "C. v^2 r", "D. zero"], a: "B. v^2/r directed toward the center" }
            ],
            sa: [
                { q: "Analyze an inclined-plane problem from {focus} using components of gravity.", a: "Resolve weight into mg sin(theta) along and mg cos(theta) perpendicular; normal = mg cos(theta); net along incline = mg sin(theta) - friction = ma." },
                { q: "Use the work-energy theorem to solve a problem in {focus}.", a: "Net work equals the change in kinetic energy: W_net = (1/2)m v_f^2 - (1/2)m v_i^2; solve for the unknown." },
                { q: "Compare elastic and inelastic collisions for a scenario in {focus}.", a: "Both conserve momentum; elastic also conserves kinetic energy while inelastic does not (some KE becomes heat/deformation); perfectly inelastic objects stick together." },
                { q: "Explain how a free-body diagram leads to the equations of motion for {focus}.", a: "Identify all forces, choose axes, sum forces along each axis, set each sum equal to ma, and solve the system for the accelerations or forces." }
            ]
        }
    },

    phys_c_mech: {
        basic: {
            mcq: [
                { q: "In calculus terms, velocity is:", o: ["A. the integral of position", "B. the derivative of position with respect to time", "C. mass times acceleration", "D. the derivative of force"], a: "B. the derivative of position with respect to time" },
                { q: "Acceleration is the time derivative of:", o: ["A. position", "B. velocity", "C. force", "D. momentum"], a: "B. velocity" },
                { q: "The work done by a variable force is:", o: ["A. F times d in all cases", "B. the integral of F dot dx", "C. mass times velocity", "D. F divided by d"], a: "B. the integral of F dot dx" },
                { q: "Impulse equals:", o: ["A. the integral of force over time", "B. force times distance", "C. mass divided by acceleration", "D. the derivative of position"], a: "A. the integral of force over time" }
            ],
            sa: [
                { q: "Express velocity and acceleration as derivatives of position x(t).", a: "v = dx/dt; a = dv/dt = d^2x/dt^2." },
                { q: "Write work as an integral for a variable force.", a: "W = the integral of F(x) dx over the displacement." },
                { q: "State the impulse-momentum theorem.", a: "Impulse = the integral of F dt = the change in momentum (J = delta p)." },
                { q: "Define the center of mass for a system of particles.", a: "x_cm = (the sum of m_i x_i) divided by (the sum of m_i)." }
            ]
        },
        medium: {
            mcq: [
                { q: "If x(t) = 3t^2 (meters), the acceleration is:", o: ["A. 3", "B. 6t", "C. 6", "D. 3t"], a: "C. 6" },
                { q: "A net torque on a rigid body produces:", o: ["A. linear acceleration only", "B. angular acceleration (tau = I alpha)", "C. constant angular velocity", "D. zero rotation"], a: "B. angular acceleration (tau = I alpha)" },
                { q: "The rotational kinetic energy of a spinning body is:", o: ["A. (1/2) m v^2", "B. (1/2) I omega^2", "C. I omega", "D. m g h"], a: "B. (1/2) I omega^2" },
                { q: "For a conservative force, F relates to potential energy U by:", o: ["A. F = dU/dx", "B. F = -dU/dx", "C. F = the integral of U", "D. F = U/x"], a: "B. F = -dU/dx" },
                { q: "The angular momentum of a particle is:", o: ["A. I divided by omega", "B. r cross p", "C. m v only", "D. tau times t^2"], a: "B. r cross p" }
            ],
            sa: [
                { q: "Use integration to find velocity and position from an acceleration function in {focus}.", a: "Integrate a(t) to get v(t) (plus v0), then integrate v(t) to get x(t) (plus x0), using the initial conditions." },
                { q: "Apply the work-energy theorem with a variable force for a problem in {focus}.", a: "W_net = the integral of F dx = the change in KE; evaluate the integral and solve." },
                { q: "Relate torque, moment of inertia, and angular acceleration for {focus}.", a: "Net torque = I alpha; find I for the body, sum the torques, and solve for alpha or the unknown." },
                { q: "Explain conservation of angular momentum in a scenario from {focus}.", a: "With no net external torque, L = I omega stays constant; if I decreases, omega increases (e.g., a spinning skater pulling arms in)." },
                { q: "Derive potential energy from a conservative force in {focus}.", a: "U(x) = - the integral of F dx; for example a spring gives U = (1/2)k x^2 and gravity gives U = mgh." }
            ]
        },
        challenge: {
            mcq: [
                { q: "A solid disk and a hoop of equal mass and radius roll without slipping down the same incline. Which reaches the bottom first?", o: ["A. the hoop", "B. the disk", "C. they tie", "D. it depends on the mass"], a: "B. the disk" },
                { q: "For simple harmonic motion x(t) = A cos(omega t), the maximum speed is:", o: ["A. A", "B. omega A", "C. omega^2 A", "D. A divided by omega"], a: "B. omega A" },
                { q: "The moment of inertia of a solid cylinder about its central axis is:", o: ["A. m r^2", "B. (1/2) m r^2", "C. (2/5) m r^2", "D. (1/12) m L^2"], a: "B. (1/2) m r^2" },
                { q: "With no external torque, if a rotating object's moment of inertia decreases, its angular velocity:", o: ["A. decreases", "B. increases", "C. stays the same", "D. becomes zero"], a: "B. increases" }
            ],
            sa: [
                { q: "Set up the integral for the moment of inertia of a continuous body relevant to {focus}.", a: "I = the integral of r^2 dm, expressing dm through a linear, area, or volume density and integrating over the geometry." },
                { q: "Analyze simple harmonic motion for a system in {focus} and derive omega.", a: "Show the net force is -kx (or torque -k theta); then omega = sqrt(k/m) and the period T = 2 pi sqrt(m/k)." },
                { q: "Use energy methods (translational plus rotational) for a rolling-body problem in {focus}.", a: "Set mgh = (1/2)m v^2 + (1/2) I omega^2 with v = omega r, then solve for the speed at the bottom." },
                { q: "Apply conservation of angular momentum to an interaction in {focus}.", a: "With no external torque, L_initial = L_final; sum r cross p (or I omega) before and after and solve." }
            ]
        }
    },

    envsci: {
        basic: {
            mcq: [
                { q: "Which of these is a renewable energy source?", o: ["A. Coal", "B. Natural gas", "C. Solar", "D. Oil"], a: "C. Solar" },
                { q: "The main greenhouse gas released by human activity is:", o: ["A. Oxygen", "B. Carbon dioxide", "C. Nitrogen", "D. Argon"], a: "B. Carbon dioxide" },
                { q: "Biodiversity refers to:", o: ["A. the number of people", "B. the variety of life in an ecosystem", "C. the amount of rainfall", "D. the depth of soil"], a: "B. the variety of life in an ecosystem" },
                { q: "Which trophic level has the most available energy?", o: ["A. Producers", "B. Primary consumers", "C. Secondary consumers", "D. Top predators"], a: "A. Producers" }
            ],
            sa: [
                { q: "Define an ecosystem.", a: "A community of living organisms interacting with one another and with their nonliving (abiotic) environment." },
                { q: "What is the difference between renewable and nonrenewable resources?", a: "Renewable resources replenish on a human timescale (sun, wind); nonrenewable resources do not (fossil fuels, minerals)." },
                { q: "State one cause and one effect of climate change.", a: "Cause: greenhouse-gas emissions from burning fossil fuels; effect: rising global temperatures, sea-level rise, or more extreme weather." },
                { q: "What does the 10% rule describe in energy flow?", a: "Only about 10% of energy passes from one trophic level to the next; the rest is lost mostly as heat." }
            ]
        },
        medium: {
            mcq: [
                { q: "Eutrophication is most directly caused by:", o: ["A. excess nutrients (nitrogen and phosphorus) in water", "B. acid rain", "C. ozone depletion", "D. desertification"], a: "A. excess nutrients (nitrogen and phosphorus) in water" },
                { q: "Thinning of the stratospheric ozone layer is primarily caused by:", o: ["A. carbon dioxide", "B. CFCs", "C. methane", "D. sulfur dioxide"], a: "B. CFCs" },
                { q: "Carrying capacity is best described as:", o: ["A. the maximum population an environment can sustain", "B. the total land area", "C. the birth rate", "D. the number of species"], a: "A. the maximum population an environment can sustain" },
                { q: "Primary succession begins on:", o: ["A. an abandoned farm field", "B. bare rock with no soil", "C. a forest after a fire", "D. a flooded wetland"], a: "B. bare rock with no soil" },
                { q: "Acid rain is produced mainly by emissions of:", o: ["A. CO2 and O2", "B. SO2 and NOx", "C. CFCs", "D. methane"], a: "B. SO2 and NOx" }
            ],
            sa: [
                { q: "Explain how human activity affects a biogeochemical cycle related to {focus}.", a: "Name the cycle (carbon, nitrogen, phosphorus), the human input (combustion, fertilizer), and its consequence (warming, eutrophication)." },
                { q: "Describe a cause, an effect, and a solution for an environmental problem in {focus}.", a: "State the driver (e.g., emissions), the impact (e.g., warming or pollution), and a mitigation (regulation, renewables, conservation)." },
                { q: "Explain ecological succession in the context of {focus}.", a: "Pioneer species colonize, alter conditions, and are replaced by later species until a relatively stable climax community forms." },
                { q: "Discuss how population growth pressures resources in {focus}.", a: "Growth increases demand for food, water, energy, and land, risking overshoot of carrying capacity and resource depletion." },
                { q: "Compare two energy sources relevant to {focus} by sustainability and impact.", a: "Weigh renewability, emissions, land and water use, and reliability (e.g., solar/wind: low emissions but intermittent; fossil fuels: reliable but high emissions)." }
            ]
        },
        challenge: {
            mcq: [
                { q: "A keystone species is one that:", o: ["A. is the most abundant", "B. has a disproportionately large effect on its ecosystem", "C. is always a top predator", "D. is always invasive"], a: "B. has a disproportionately large effect on its ecosystem" },
                { q: "Which choice most reduces a community's per-capita ecological footprint?", o: ["A. increased fossil-fuel use", "B. energy efficiency and renewables", "C. more landfills", "D. higher meat consumption"], a: "B. energy efficiency and renewables" },
                { q: "Ocean acidification results primarily from:", o: ["A. plastic waste", "B. dissolved atmospheric CO2 forming carbonic acid", "C. oil spills", "D. thermal pollution"], a: "B. dissolved atmospheric CO2 forming carbonic acid" },
                { q: "In a logistic growth model, population growth slows as the population approaches:", o: ["A. zero", "B. the carrying capacity", "C. the biotic potential", "D. half the birth rate"], a: "B. the carrying capacity" }
            ],
            sa: [
                { q: "Evaluate the trade-offs of a proposed solution to an environmental issue in {focus}.", a: "Weigh environmental benefit against economic cost, feasibility, and unintended effects, then support a recommendation with reasoning." },
                { q: "Interpret a data trend related to {focus}.", a: "Describe the trend, identify the likely cause, and project the consequences, referencing units and the rate of change." },
                { q: "Analyze how a feedback loop amplifies or dampens a change in {focus}.", a: "Positive feedback amplifies (e.g., ice-albedo: melting lowers reflectivity, causing more warming); negative feedback stabilizes the system." },
                { q: "Design a management plan to protect biodiversity in {focus}.", a: "Combine habitat protection, reduction of pollution and invasive species, sustainable use, and monitoring, justified with ecological principles." }
            ]
        }
    },

    psych: {
        basic: {
            mcq: [
                { q: "The part of a neuron that receives signals from other neurons is the:", o: ["A. axon", "B. dendrite", "C. myelin sheath", "D. synapse"], a: "B. dendrite" },
                { q: "Which part of the brain regulates balance and coordinated movement?", o: ["A. Cerebellum", "B. Hippocampus", "C. Amygdala", "D. Hypothalamus"], a: "A. Cerebellum" },
                { q: "Classical conditioning was first described by:", o: ["A. B.F. Skinner", "B. Sigmund Freud", "C. Ivan Pavlov", "D. Jean Piaget"], a: "C. Ivan Pavlov" },
                { q: "The tendency to best recall the first and last items in a list is the:", o: ["A. serial position effect", "B. framing effect", "C. placebo effect", "D. halo effect"], a: "A. serial position effect" }
            ],
            sa: [
                { q: "Define a neuron.", a: "A nerve cell that transmits electrical and chemical signals throughout the nervous system." },
                { q: "What is the difference between sensation and perception?", a: "Sensation is detecting stimuli with sense organs; perception is the brain's organization and interpretation of that input." },
                { q: "State the difference between classical and operant conditioning.", a: "Classical conditioning associates two stimuli (involuntary responses); operant conditioning links behavior to consequences (reinforcement or punishment)." },
                { q: "Name the four lobes of the cerebral cortex.", a: "Frontal, parietal, temporal, and occipital lobes." }
            ]
        },
        medium: {
            mcq: [
                { q: "In Pavlov's experiment, the food is the:", o: ["A. conditioned stimulus", "B. unconditioned stimulus", "C. conditioned response", "D. neutral stimulus"], a: "B. unconditioned stimulus" },
                { q: "Positive reinforcement involves:", o: ["A. removing a pleasant stimulus", "B. adding a pleasant stimulus to increase a behavior", "C. adding an unpleasant stimulus", "D. ignoring a behavior"], a: "B. adding a pleasant stimulus to increase a behavior" },
                { q: "Which neurotransmitter is most associated with reward and movement?", o: ["A. Dopamine", "B. Insulin", "C. Melatonin", "D. Cortisol"], a: "A. Dopamine" },
                { q: "The independent variable in an experiment is:", o: ["A. the measured outcome", "B. the factor the researcher manipulates", "C. a confounding variable", "D. the control group"], a: "B. the factor the researcher manipulates" },
                { q: "According to Piaget, object permanence develops during the:", o: ["A. sensorimotor stage", "B. preoperational stage", "C. concrete operational stage", "D. formal operational stage"], a: "A. sensorimotor stage" }
            ],
            sa: [
                { q: "Explain how operant conditioning could shape a behavior related to {focus}.", a: "Reinforce desired responses (add a reward or remove an aversive) and/or punish undesired ones; use shaping through successive approximations." },
                { q: "Distinguish the roles of two brain regions relevant to {focus}.", a: "Name two regions (e.g., amygdala for emotion, hippocampus for memory) and contrast how each contributes to the behavior." },
                { q: "Describe how a researcher would design an experiment to study {focus}.", a: "State a hypothesis, identify the independent and dependent variables, randomly assign to experimental vs control groups, control confounds, and measure the outcome." },
                { q: "Explain a memory process (encoding, storage, retrieval) as it applies to {focus}.", a: "Encoding brings information in (e.g., elaborative rehearsal), storage maintains it, and retrieval brings it back via cues; relate each to the behavior." },
                { q: "Apply a major psychological perspective (e.g., cognitive, behavioral) to {focus}.", a: "State the perspective's core idea and use it to explain the behavior (behavioral: learned via conditioning; cognitive: based on mental processing)." }
            ]
        },
        challenge: {
            mcq: [
                { q: "A study finds a correlation of +0.8 between two variables. This means:", o: ["A. one causes the other", "B. they have a strong positive association", "C. there is no relationship", "D. the study is an experiment"], a: "B. they have a strong positive association" },
                { q: "Which research method best establishes cause and effect?", o: ["A. case study", "B. naturalistic observation", "C. randomized experiment", "D. survey"], a: "C. randomized experiment" },
                { q: "The misinformation effect is most relevant to:", o: ["A. sensory adaptation", "B. the reconstructive nature of memory", "C. operant conditioning", "D. color vision"], a: "B. the reconstructive nature of memory" },
                { q: "A double-blind procedure controls for:", o: ["A. the placebo effect and experimenter bias", "B. random sampling", "C. confounding genes", "D. the dependent variable"], a: "A. the placebo effect and experimenter bias" }
            ],
            sa: [
                { q: "Evaluate the ethics of a study investigating {focus}, naming two safeguards.", a: "Address informed consent, protection from harm, confidentiality, debriefing, and the right to withdraw." },
                { q: "Compare two theories that explain {focus} and cite supporting evidence.", a: "State each theory's mechanism, contrast their predictions, and reference research that supports or challenges each." },
                { q: "Explain how biological, cognitive, and social factors interact in {focus}.", a: "Describe a biological contributor, a cognitive/learning contributor, and a social/cultural contributor, and how they combine (biopsychosocial)." },
                { q: "Interpret experimental results about {focus}, addressing validity and reliability.", a: "Discuss whether the independent variable caused the change (internal validity), how far results generalize (external validity), and consistency (reliability)." }
            ]
        }
    },

    ush: {
        basic: {
            mcq: [
                { q: "The Declaration of Independence was adopted in:", o: ["A. 1607", "B. 1776", "C. 1812", "D. 1865"], a: "B. 1776" },
                { q: "The U.S. Civil War was fought primarily over:", o: ["A. the taxation of tea", "B. slavery and states' rights", "C. westward railroads", "D. the Cold War"], a: "B. slavery and states' rights" },
                { q: "The system of checks and balances divides power among:", o: ["A. three branches of government", "B. the states only", "C. political parties", "D. the military"], a: "A. three branches of government" },
                { q: "The New Deal was a response to:", o: ["A. World War I", "B. the Great Depression", "C. the Cold War", "D. the Vietnam War"], a: "B. the Great Depression" }
            ],
            sa: [
                { q: "What was the main purpose of the Declaration of Independence?", a: "To announce and justify the colonies' separation from Britain, asserting natural rights and government by the consent of the governed." },
                { q: "Name two causes of the American Revolution.", a: "Examples: taxation without representation, restrictions on colonial self-government, the Coercive (Intolerable) Acts, and Enlightenment ideas." },
                { q: "What did the Emancipation Proclamation do?", a: "It declared enslaved people in the Confederate states to be free (1863), reframing the Civil War around ending slavery." },
                { q: "Define federalism.", a: "A system that divides power between a national government and state governments." }
            ]
        },
        medium: {
            mcq: [
                { q: "The Louisiana Purchase (1803) under Jefferson:", o: ["A. ended slavery", "B. roughly doubled the size of the United States", "C. started the Civil War", "D. created the Federal Reserve"], a: "B. roughly doubled the size of the United States" },
                { q: "Reconstruction (1865-1877) primarily addressed:", o: ["A. rebuilding the South and the rights of formerly enslaved people", "B. the Cold War", "C. westward railroads only", "D. women's suffrage"], a: "A. rebuilding the South and the rights of formerly enslaved people" },
                { q: "The Progressive Era is best known for:", o: ["A. laissez-faire with no reform", "B. reforms against corruption, monopolies, and poor working conditions", "C. starting World War II", "D. the Louisiana Purchase"], a: "B. reforms against corruption, monopolies, and poor working conditions" },
                { q: "The Monroe Doctrine (1823) warned:", o: ["A. European powers against further colonization in the Americas", "B. against any income tax", "C. the South against secession", "D. Japan against attacking Pearl Harbor"], a: "A. European powers against further colonization in the Americas" },
                { q: "Manifest Destiny was the belief that:", o: ["A. the U.S. should avoid expansion", "B. the U.S. was destined to expand across the continent", "C. slavery should end immediately", "D. states could nullify federal laws"], a: "B. the U.S. was destined to expand across the continent" }
            ],
            sa: [
                { q: "Identify a major cause and effect of an event connected to {focus}.", a: "State a clear cause, link it to a specific consequence, and explain the connection with evidence." },
                { q: "Explain how an idea or document shaped developments related to {focus}.", a: "Name the idea or document, describe its principles, and trace its influence on later events or policy." },
                { q: "Describe a continuity and a change over time relating to {focus}.", a: "Identify something that persisted and something that changed across the period, each with a specific example." },
                { q: "Analyze the role of a key group or individual in {focus}.", a: "Explain who they were, what they did, and how it affected the broader historical development." },
                { q: "Compare two perspectives on an issue tied to {focus}.", a: "Present each side's reasoning and interests, then explain where and why they conflicted." }
            ]
        },
        challenge: {
            mcq: [
                { q: "The Federalist Papers were written to:", o: ["A. oppose the Constitution", "B. argue for ratification of the Constitution", "C. declare independence", "D. begin Reconstruction"], a: "B. argue for ratification of the Constitution" },
                { q: "The Compromise of 1850 attempted to:", o: ["A. end the Revolution", "B. balance free and slave state interests, including a stronger Fugitive Slave Act", "C. create the New Deal", "D. purchase Alaska"], a: "B. balance free and slave state interests, including a stronger Fugitive Slave Act" },
                { q: "A major long-term effect of the Cold War on U.S. society was:", o: ["A. isolation from world affairs", "B. military buildup, the containment policy, and domestic anticommunism", "C. the Louisiana Purchase", "D. the end of federalism"], a: "B. military buildup, the containment policy, and domestic anticommunism" },
                { q: "The 14th Amendment is significant because it:", o: ["A. abolished slavery", "B. granted citizenship and equal protection under the law", "C. gave women the vote", "D. created the income tax"], a: "B. granted citizenship and equal protection under the law" }
            ],
            sa: [
                { q: "Construct an argument with evidence about a historical question related to {focus}.", a: "State a clear thesis, support it with at least two specific pieces of evidence, and explain how they prove the claim." },
                { q: "Evaluate the most important cause of a development in {focus} and defend your choice.", a: "Rank the causes, argue why one is most significant, and address a reasonable counterargument." },
                { q: "Analyze change and continuity over time for {focus}, including a turning point.", a: "Identify what changed and what stayed the same, name a turning point, and explain its significance." },
                { q: "Assess the effects of a policy or movement in {focus} on different groups.", a: "Explain the impact on at least two groups (e.g., by region, race, or class), supported by specific evidence." }
            ]
        }
    },

    world: {
        basic: {
            mcq: [
                { q: "The Silk Road primarily facilitated:", o: ["A. trade and cultural exchange across Eurasia", "B. naval warfare", "C. the Industrial Revolution", "D. the Cold War"], a: "A. trade and cultural exchange across Eurasia" },
                { q: "Which river was central to ancient Egyptian civilization?", o: ["A. Amazon", "B. Nile", "C. Mississippi", "D. Thames"], a: "B. Nile" },
                { q: "The Columbian Exchange refers to:", o: ["A. the transfer of plants, animals, and diseases between the Old and New Worlds", "B. a Cold War treaty", "C. a Chinese dynasty", "D. a Greek philosophy"], a: "A. the transfer of plants, animals, and diseases between the Old and New Worlds" },
                { q: "Monotheism is the belief in:", o: ["A. many gods", "B. one god", "C. no gods", "D. nature spirits"], a: "B. one god" }
            ],
            sa: [
                { q: "What was the significance of the Silk Road?", a: "It connected Asia, the Middle East, and Europe, enabling trade in goods and the spread of ideas, religions, and technologies." },
                { q: "Define empire.", a: "A large political unit that controls diverse peoples and territories under a single ruling authority." },
                { q: "Name one effect of the Columbian Exchange.", a: "Examples: new crops (potatoes, maize) reshaped diets and populations; diseases devastated Indigenous Americans; animals and silver were transferred." },
                { q: "What is the difference between a nomadic and a settled (agrarian) society?", a: "Nomadic peoples move with herds and resources; agrarian societies farm fixed land, which enables cities and complex states." }
            ]
        },
        medium: {
            mcq: [
                { q: "The Mongol Empire is best known for:", o: ["A. building the pyramids", "B. creating the largest contiguous land empire and promoting Eurasian trade", "C. starting the Renaissance", "D. colonizing the Americas"], a: "B. creating the largest contiguous land empire and promoting Eurasian trade" },
                { q: "The Renaissance was characterized by:", o: ["A. a revival of classical learning, art, and humanism", "B. the fall of Rome", "C. the Cold War", "D. the Bronze Age"], a: "A. a revival of classical learning, art, and humanism" },
                { q: "A major effect of the Industrial Revolution was:", o: ["A. de-urbanization", "B. factory production, urbanization, and new social classes", "C. the end of all trade", "D. the Silk Road"], a: "B. factory production, urbanization, and new social classes" },
                { q: "The spread of Islam after the 7th century occurred largely through:", o: ["A. trade, conquest, and missionary activity", "B. the printing press", "C. the Columbian Exchange", "D. the Cold War"], a: "A. trade, conquest, and missionary activity" },
                { q: "Mercantilism held that a nation's power depended on:", o: ["A. free trade with no tariffs", "B. accumulating wealth (e.g., gold and silver) and a favorable balance of trade", "C. abolishing colonies", "D. communism"], a: "B. accumulating wealth (e.g., gold and silver) and a favorable balance of trade" }
            ],
            sa: [
                { q: "Explain how trade networks connected regions in relation to {focus}.", a: "Name the network, the goods and ideas exchanged, and the regions linked, with one specific effect." },
                { q: "Describe a cause and an effect of an event tied to {focus}.", a: "State a cause, connect it to a specific consequence, and explain the link with evidence." },
                { q: "Analyze how a belief system or ideology spread in {focus}.", a: "Name the mechanism (trade, conquest, migration, missionaries) and the cultural changes that resulted." },
                { q: "Compare two societies or empires related to {focus}.", a: "Contrast political, economic, or social features, noting at least one similarity and one difference." },
                { q: "Explain a continuity and a change over time for {focus}.", a: "Identify what persisted and what changed across the period, each with a specific example." }
            ]
        },
        challenge: {
            mcq: [
                { q: "A major consequence of European maritime empires (1450-1750) was:", o: ["A. global exchange of goods, people (including enslaved Africans), and silver", "B. the fall of Rome", "C. the Neolithic Revolution", "D. the Cold War"], a: "A. global exchange of goods, people (including enslaved Africans), and silver" },
                { q: "The 18th-century revolutions (e.g., French) were strongly influenced by:", o: ["A. Enlightenment ideas about rights and government", "B. the Bronze Age", "C. the Silk Road", "D. feudal manorialism"], a: "A. Enlightenment ideas about rights and government" },
                { q: "Decolonization after World War II led to:", o: ["A. the creation of many new independent nations in Asia and Africa", "B. the rise of the Roman Empire", "C. the Columbian Exchange", "D. the Industrial Revolution"], a: "A. the creation of many new independent nations in Asia and Africa" },
                { q: "A key economic effect of the Atlantic slave trade was:", o: ["A. no impact on the Americas", "B. plantation economies built on forced labor that generated colonial wealth", "C. the end of mercantilism", "D. the start of the Renaissance"], a: "B. plantation economies built on forced labor that generated colonial wealth" }
            ],
            sa: [
                { q: "Construct a thesis-driven argument about a global historical question on {focus}.", a: "State a clear thesis and defend it with at least two specific cross-regional examples." },
                { q: "Analyze the multiple causes of a major development in {focus}.", a: "Identify several causes, weigh their relative importance, and explain how they interconnect." },
                { q: "Compare developments in two regions for {focus}, explaining similarities and differences.", a: "Use specific evidence from each region and explain why the patterns were alike or different." },
                { q: "Evaluate continuity and change over time across {focus}, including turning points.", a: "Identify persistent patterns and key changes, naming a turning point and explaining its significance." }
            ]
        }
    }
};
