/*
 * Offline question bank for StudyBoost AI.
 *
 * Shape:  OFFLINE_BANK[subjectId][tier] = { mcq: [...], sa: [...] }
 *   - subjectId matches the ids in AP_SUBJECTS (app.js)
 *   - tier is "basic" | "medium" | "challenge"
 *   - mcq item: { q, o: [4 options "A. .."], a: "full correct option string", e? }
 *   - sa  item: { q, a, e? }   ('q' may contain the token {focus}, replaced at render time)
 *   - e: OPTIONAL explanation. Why the correct answer is correct and (for MCQ) why each
 *        distractor is wrong. Do NOT just restate the answer. Omit it rather than pad.
 *        (No items carry `e` yet — first batch should prioritize MCQ medium/challenge.)
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
                { q: "What is the derivative of $x^5$?", o: ["A. $5x^4$", "B. $x^4$", "C. $5x^5$", "D. $4x^5$"], a: "A. $5x^4$" },
                { q: "Evaluate the indefinite integral $\\int 2x\\,dx$.", o: ["A. $x^2 + C$", "B. $2 + C$", "C. $2x^2 + C$", "D. $x + C$"], a: "A. $x^2 + C$" },
                { q: "What is $\\lim_{x \\to 0} \\frac{\\sin x}{x}$?", o: ["A. $0$", "B. $1$", "C. $\\infty$", "D. undefined"], a: "B. $1$" },
                { q: "The derivative of the constant function $f(x) = 7$ is:", o: ["A. $7$", "B. $1$", "C. $0$", "D. $x$"], a: "C. $0$" }
            ],
            sa: [
                { q: "State the power rule for derivatives and give one example.", a: "$\\frac{d}{dx}[x^n] = n x^{n-1}$; e.g. $\\frac{d}{dx}[x^3] = 3x^2$." },
                { q: "Define what a definite integral represents geometrically.", a: "The signed area between the curve and the x-axis over the interval $[a, b]$." },
                { q: "What is the derivative of any constant, and why?", a: "It is $0$, because a constant never changes, so its rate of change is zero." },
                { q: "Write the limit definition of the derivative of $f$ at $x$.", a: "$f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}$." }
            ]
        },
        medium: {
            mcq: [
                { q: "A particle moves along the x-axis with velocity $v(t) = 3t^2 - 12t$. At which $t$ in $[0,4]$ is the acceleration zero?", o: ["A. $t = 0$", "B. $t = 1$", "C. $t = 2$", "D. $t = 4$"], a: "C. $t = 2$" },
                { q: "Which expression gives the derivative of $\\ln(5x^2 + 1)$?", o: ["A. $\\frac{1}{5x^2+1}$", "B. $\\frac{10x}{5x^2+1}$", "C. $\\frac{5}{5x^2+1}$", "D. $2x\\ln(5x^2+1)$"], a: "B. $\\frac{10x}{5x^2+1}$" },
                { q: "$\\int_1^e \\frac{1}{x}\\,dx$ equals", o: ["A. $0$", "B. $1$", "C. $e$", "D. $e - 1$"], a: "B. $1$" },
                { q: "For $f(x) = x^3 - 3x$, which statement about local extrema on the real line is correct?", o: ["A. Local max at $x=1$ only", "B. Local min at $x=-1$, local max at $x=1$", "C. No critical points", "D. Local max at $x=-1$ only"], a: "B. Local min at $x=-1$, local max at $x=1$" },
                { q: "If $\\int_a^b f(x)\\,dx = -3$, what is a reasonable interpretation?", o: ["A. $f$ is always negative", "B. area below the axis dominates", "C. $f$ has no zeros", "D. the integral is always positive"], a: "B. area below the axis dominates" }
            ],
            sa: [
                { q: "Explain the relationship between position, velocity, and acceleration for {focus} using one sentence each.", a: "Velocity is the derivative of position; acceleration is the derivative of velocity (the second derivative of position). Connect to your topic by naming what is changing and at what rate." },
                { q: "Set up (do not evaluate) the integral for the volume of revolution for a representative problem related to {focus}.", a: "State disk/washer or shell, show the radius/height in terms of the variable, and give the correct bounds." },
                { q: "For a related rates problem about {focus}, what quantities are typically held constant vs changing?", a: "State the geometric relation linking the variables, differentiate with respect to time, and substitute the known rates." },
                { q: "Describe how you would justify a local minimum using calculus tests for a function tied to {focus}.", a: "Find critical points where $f'(x) = 0$, apply the first or second derivative test, and conclude with function values." },
                { q: "Compare Riemann sum estimates vs the exact integral for a concept from {focus}.", a: "Explain rectangles/trapezoids vs the limit of sums; mention refinement as $n$ increases." }
            ]
        },
        challenge: {
            mcq: [
                { q: "For $f(x) = x^3 - 3x$, identify the local extrema on the real line.", o: ["A. Local max at $x = 1$ only", "B. Local min at $x = -1$ and local max at $x = 1$", "C. No critical points", "D. Local max at $x = -1$ and local min at $x = 1$"], a: "B. Local min at $x = -1$ and local max at $x = 1$" },
                { q: "If $\\int_a^b f(x)\\,dx = -3$, which interpretation is best?", o: ["A. $f$ is always negative", "B. Net signed area is negative; area below the axis dominates", "C. $f$ has no zeros on $[a, b]$", "D. The integral must be positive"], a: "B. Net signed area is negative; area below the axis dominates" },
                { q: "By the Mean Value Theorem, for $f$ continuous on $[a, b]$ and differentiable on $(a, b)$, there exists $c$ such that:", o: ["A. $f(c) = 0$", "B. $f'(c) = \\frac{f(b) - f(a)}{b - a}$", "C. $f'(c) = 0$ always", "D. $f(c) = f(a) + f(b)$"], a: "B. $f'(c) = \\frac{f(b) - f(a)}{b - a}$" },
                { q: "Let $g(x) = \\int_0^x f(t)\\,dt$. If $f$ is positive and increasing, then $g$ is:", o: ["A. Decreasing and concave down", "B. Increasing and concave up", "C. Constant", "D. Increasing and concave down"], a: "B. Increasing and concave up" }
            ],
            sa: [
                { q: "Justify the existence of a local minimum for a function tied to {focus} using both the first and second derivative tests.", a: "Find critical points where $f'(x) = 0$; first-derivative test: a sign change from $-$ to $+$ implies a min; second-derivative test: $f''(x) > 0$ implies a min; confirm with function values." },
                { q: "Given the graph of $f'$, describe the concavity and locate inflection points for a problem connected to {focus}.", a: "$f$ is concave up where $f'$ is increasing ($f'' > 0$) and concave down where $f'$ is decreasing; inflection points occur where $f''$ changes sign." },
                { q: "Use the Fundamental Theorem of Calculus to explain how an accumulation function relates to {focus}.", a: "If $F(x) = \\int_a^x f(t)\\,dt$, then $F'(x) = f(x)$; the accumulation's rate of change equals the integrand." },
                { q: "Set up and justify (do not evaluate) a definite integral modeling total change for {focus}.", a: "Identify the rate function, integrate the rate over the interval, and interpret the result as the net accumulated change with correct units." }
            ]
        }
    },

    bio: {
        basic: {
            mcq: [
                { q: "Enzymes increase the rate of a reaction primarily by:", o: ["A. Lowering the activation energy of the reaction", "B. Adding heat to the reaction mixture", "C. Changing the reaction's overall free-energy change", "D. Being permanently consumed as a reactant"], a: "A. Lowering the activation energy of the reaction", e: "Enzymes speed reactions by lowering activation energy so more collisions are productive. Changing the overall free-energy change is tempting, but enzymes never alter a reaction's net energy or equilibrium, only how fast it is reached." },
                { q: "Water rises in a plant's xylem partly because water molecules are attracted to one another. This property is called:", o: ["A. Cohesion", "B. Adhesion", "C. Hydrolysis", "D. Denaturation"], a: "A. Cohesion", e: "Cohesion is the hydrogen-bond attraction between like water molecules, holding the water column together in xylem. Adhesion is tempting and also occurs, but it is water sticking to other surfaces such as vessel walls, not to itself." },
                { q: "A cell that secretes large amounts of protein is expected to contain especially abundant:", o: ["A. Rough endoplasmic reticulum", "B. Smooth endoplasmic reticulum", "C. Lysosomes", "D. Peroxisomes"], a: "A. Rough endoplasmic reticulum", e: "Rough ER carries ribosomes that synthesize and process proteins for secretion, so secretory cells are rich in it. Smooth ER is tempting because it is also ER, but it specializes in lipid synthesis and lacks ribosomes." },
                { q: "Which substance crosses the hydrophobic interior of a plasma membrane most readily without a transport protein?", o: ["A. A small nonpolar molecule such as O2", "B. A charged sodium ion such as Na+", "C. A polar glucose molecule", "D. A large folded protein"], a: "A. A small nonpolar molecule such as O2", e: "Small nonpolar molecules dissolve in the lipid bilayer and pass through freely. The sodium ion is tempting because it is small, but its charge makes the hydrophobic core a barrier, so it requires a channel or transporter." },
                { q: "In aerobic cellular respiration, the final electron acceptor of the electron transport chain is:", o: ["A. Oxygen", "B. Carbon dioxide", "C. Glucose", "D. NAD+"], a: "A. Oxygen", e: "Oxygen accepts electrons at the end of the chain and is reduced to water, keeping the chain running. NAD+ is tempting because it carries electrons, but it delivers them to the chain rather than serving as the final acceptor." },
                { q: "The Calvin cycle of photosynthesis directly uses which products of the light reactions?", o: ["A. ATP and NADPH", "B. Oxygen and water", "C. Carbon dioxide and glucose", "D. ADP and NADP+"], a: "A. ATP and NADPH", e: "The light reactions supply ATP and NADPH, which the Calvin cycle spends to fix carbon dioxide into sugar. ADP and NADP+ is tempting, but those are the spent forms sent back to the light reactions, not the energy carriers consumed." },
                { q: "Two organisms heterozygous for a simple dominant trait (Aa x Aa) are crossed. What fraction of offspring are expected to show the recessive phenotype?", o: ["A. 1/4", "B. 3/4", "C. 1/2", "D. None"], a: "A. 1/4", e: "An Aa x Aa cross gives 1 AA : 2 Aa : 1 aa, so only the 1/4 that are aa show the recessive phenotype. 3/4 is tempting, but that is the dominant fraction (AA and Aa combined), not the recessive one." },
                { q: "Roughly how much of the energy at one trophic level is typically available to the next higher level?", o: ["A. About 10 percent", "B. About 50 percent", "C. About 90 percent", "D. About 100 percent"], a: "A. About 10 percent", e: "Only about 10 percent of energy passes up a level; the rest is lost mainly as metabolic heat and in undigested material. 'About 90 percent' is tempting if you confuse the small amount transferred with the large amount lost." }
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
                { q: "A drug blocks the final step of the mitochondrial electron transport chain. The most direct result is that:", o: ["A. ATP output from oxidative phosphorylation falls", "B. Glycolysis in the cytoplasm stops at once", "C. The cell starts to release oxygen gas", "D. The Krebs cycle accelerates to compensate"], a: "A. ATP output from oxidative phosphorylation falls", e: "Blocking the chain collapses the proton gradient that drives ATP synthase, so oxidative phosphorylation and most ATP production fall. 'Glycolysis stops at once' is tempting, but glycolysis is cytoplasmic and runs without the chain, though it slows later as NADH builds up." },
                { q: "An enzyme's reaction rate rises as temperature increases from 10 to 37 degrees C, then drops sharply by 50 degrees C. The drop above 37 degrees is best explained by:", o: ["A. Denaturation changing the enzyme's active-site shape", "B. The enzyme being used up as a reactant", "C. A permanent increase in the activation energy", "D. Substrate molecules moving too slowly to react"], a: "A. Denaturation changing the enzyme's active-site shape", e: "High temperature disrupts the bonds holding the enzyme's three-dimensional shape, so the active site no longer fits substrate and rate falls. 'Substrates moving too slowly' is tempting, but that describes low temperature; at 50 degrees molecules move faster, not slower." },
                { q: "A plant cell is placed in a solution with a much higher solute concentration than the cell's interior. The cell will most likely:", o: ["A. Lose water and become plasmolyzed", "B. Gain water and swell or burst", "C. Stay exactly the same size", "D. Actively pump in solutes to expand"], a: "A. Lose water and become plasmolyzed", e: "Water moves osmotically toward the higher solute concentration, so it leaves the cell and the membrane pulls away from the wall (plasmolysis). 'Gain water and swell' is tempting, but that happens in a hypotonic (low-solute) solution, the opposite case." },
                { q: "A hormone binds a receptor on the cell surface and triggers a cascade of events inside the cell. This relay of the signal within the cell is called:", o: ["A. Signal transduction", "B. Simple diffusion of the hormone", "C. Negative feedback inhibition", "D. Transcription of the gene"], a: "A. Signal transduction", e: "Signal transduction converts an extracellular signal into a series of intracellular responses. 'Simple diffusion of the hormone' is tempting, but a surface receptor is used precisely because the hormone does not cross the membrane itself." },
                { q: "Cells with a mutation that disables the G1 checkpoint are most likely to:", o: ["A. Divide even when their DNA is damaged", "B. Permanently stop dividing", "C. Skip DNA replication entirely", "D. Produce only haploid daughter cells"], a: "A. Divide even when their DNA is damaged", e: "The G1 checkpoint normally halts the cycle so damage can be repaired; without it, damaged cells proceed to divide, a hallmark of cancer. 'Permanently stop dividing' is tempting, but that is what an intact checkpoint causes, the opposite of a disabled one." },
                { q: "A single base substitution changes a codon for leucine to a different codon that also specifies leucine. This mutation is best described as:", o: ["A. A silent mutation", "B. A nonsense mutation", "C. A frameshift mutation", "D. A chromosomal deletion"], a: "A. A silent mutation", e: "Because the genetic code is redundant, the new codon still specifies leucine, so the protein is unchanged, making it silent. 'Nonsense' is tempting, but that would change a codon into a stop signal and truncate the protein." },
                { q: "A man with blood type AB and a woman with blood type O have children. Which blood types are possible among their children?", o: ["A. Type A or type B", "B. Type AB or type O", "C. Type A, B, AB, or O", "D. Only type AB"], a: "A. Type A or type B", e: "AB (alleles A and B) crossed with O (alleles i and i) gives each child A or B from the father plus i from the mother, producing type A or type B. 'AB or O' is tempting, but AB needs both A and B alleles and O needs two i alleles, neither possible here." },
                { q: "After a population of bacteria is treated with an antibiotic, the few survivors reproduce and the population becomes largely resistant. This is best explained by:", o: ["A. Selection acting on pre-existing variation in the population", "B. The antibiotic causing bacteria to develop resistance on demand", "C. Individual bacteria evolving during their own lifetimes", "D. Random genetic drift within a very large population"], a: "A. Selection acting on pre-existing variation in the population", e: "Resistant variants existed by chance before treatment; the antibiotic removes susceptible cells, so resistant ones reproduce, which is natural selection. 'Resistance on demand' is tempting, but it reflects the misconception that organisms change to meet needs rather than selection sorting existing variation." },
                { q: "A student tests whether fertilizer concentration affects plant growth by giving five groups different amounts and measuring height after three weeks. The dependent variable is:", o: ["A. Plant height after three weeks", "B. The fertilizer concentration given", "C. The three-week time period", "D. The species of plant used"], a: "A. Plant height after three weeks", e: "The dependent variable is the measured outcome that may respond to the treatment, here plant height. 'Fertilizer concentration' is tempting, but that is the independent variable the student deliberately changes." }
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
                { q: "In a population in Hardy-Weinberg equilibrium, 16 percent of individuals show a recessive phenotype. What fraction is expected to be heterozygous carriers?", o: ["A. 0.48", "B. 0.16", "C. 0.36", "D. 0.04"], a: "A. 0.48", e: "If q-squared = 0.16 then q = 0.4 and p = 0.6, so heterozygotes = 2pq = 2(0.6)(0.4) = 0.48. '0.36' is tempting because it equals p-squared, the homozygous-dominant frequency, not the carriers." },
                { q: "A geneticist predicts a 3:1 ratio and runs a chi-square test, obtaining 5.2 with 1 degree of freedom (critical value 3.84 at p = 0.05). The correct conclusion is:", o: ["A. Reject the null; the ratio differs significantly from 3:1", "B. Fail to reject the null; the data adequately fit 3:1", "C. The data perfectly match the predicted 3:1 ratio", "D. Chi-square cannot be applied to genetic ratios"], a: "A. Reject the null; the ratio differs significantly from 3:1", e: "Because 5.2 exceeds the critical value 3.84, the deviation from 3:1 is statistically significant and the null is rejected. 'Fail to reject' is tempting if you reverse the rule, but that conclusion applies only when the statistic is below the critical value." },
                { q: "To test whether light intensity affects photosynthetic rate (measured as oxygen bubbles from a water plant), which choice most improves the validity of the conclusion?", o: ["A. Hold temperature and carbon dioxide constant across all light levels", "B. Use a different plant species at each light level", "C. Vary light intensity and temperature at the same time", "D. Measure each light intensity only a single time"], a: "A. Hold temperature and carbon dioxide constant across all light levels", e: "Controlling temperature and carbon dioxide isolates light as the only variable, so changes in oxygen output can be attributed to light. 'Vary light and temperature together' is tempting as more realistic, but confounding two variables makes the cause impossible to identify." },
                { q: "In the lac operon of E. coli, lactose is present and glucose is absent, so transcription of the lac genes is high because:", o: ["A. The repressor is off and cAMP-CAP enhances RNA polymerase binding", "B. The repressor stays bound to the operator and blocks transcription", "C. Glucose must be present to switch the operon on", "D. The lac genes are transcribed constantly under all conditions"], a: "A. The repressor is off and cAMP-CAP enhances RNA polymerase binding", e: "Lactose inactivates the repressor while low glucose raises cAMP, so CAP boosts polymerase binding and transcription is high. 'Glucose must be present' is tempting but reversed: low glucose, not high, promotes lac expression." },
                { q: "End-product inhibition, in which a pathway's final product binds and slows an early enzyme, is an example of:", o: ["A. Negative feedback through allosteric regulation", "B. Positive feedback amplifying the pathway", "C. Competitive inhibition at the active site only", "D. Irreversible denaturation of the enzyme"], a: "A. Negative feedback through allosteric regulation", e: "The product slows an upstream enzyme, reducing its own production, which is negative feedback, usually via an allosteric site. 'Competitive inhibition at the active site' is tempting, but end-product inhibitors typically bind a separate allosteric site, not the active site." },
                { q: "A food chain transfers about 10 percent of energy between levels. If producers capture 10,000 kcal, approximately how much energy reaches the secondary consumers?", o: ["A. 100 kcal", "B. 1,000 kcal", "C. 10 kcal", "D. 9,000 kcal"], a: "A. 100 kcal", e: "Producers to primary consumers gives about 1,000 kcal, then primary to secondary gives about 10 percent again, near 100 kcal. '1,000 kcal' is tempting if you apply the 10 percent rule only once instead of across both transfers." },
                { q: "A large population shows allele frequencies that stay constant across many generations. For this gene, the best conclusion is that the population is:", o: ["A. Not measurably evolving at this locus", "B. Experiencing strong natural selection", "C. Undergoing rapid genetic drift", "D. Receiving heavy gene flow from neighbors"], a: "A. Not measurably evolving at this locus", e: "Constant allele frequencies match Hardy-Weinberg equilibrium, indicating no net change at that locus. 'Strong natural selection' is tempting, but selection would shift allele frequencies over time rather than hold them constant." },
                { q: "As a spherical cell grows larger, its ability to exchange materials with the environment becomes limited mainly because:", o: ["A. Volume rises faster than surface area, so the surface-to-volume ratio falls", "B. Surface area rises faster than volume as the cell grows", "C. The membrane loses its selective permeability when large", "D. Diffusion becomes faster as the cell gets bigger"], a: "A. Volume rises faster than surface area, so the surface-to-volume ratio falls", e: "Volume scales with the cube of radius while surface area scales with the square, so larger cells have less membrane per unit volume for exchange. 'Surface area rises faster' is tempting but reversed; that would make exchange easier, not harder." },
                { q: "Two treatment groups have mean values whose error bars (plus or minus two standard errors) overlap substantially. The most appropriate conclusion is:", o: ["A. The difference between groups may not be statistically significant", "B. The two group means must be exactly equal", "C. The treatment certainly caused a large effect", "D. The sample size was clearly far too large"], a: "A. The difference between groups may not be statistically significant", e: "Substantial overlap of plus or minus two standard error bars suggests the means may not differ significantly, so more analysis is needed before claiming an effect. 'Must be exactly equal' is tempting, but overlap shows uncertainty, not proof of equality." }
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
                { q: "The sum of the geometric series $1 + \\frac{1}{2} + \\frac{1}{4} + \\frac{1}{8} + \\cdots$ is:", o: ["A. $1$", "B. $\\frac{3}{2}$", "C. $2$", "D. infinite"], a: "C. $2$" },
                { q: "What is the derivative of $e^{2x}$?", o: ["A. $e^{2x}$", "B. $2e^{2x}$", "C. $2x e^{2x}$", "D. $\\frac{e^{2x}}{2}$"], a: "B. $2e^{2x}$" },
                { q: "A geometric series with common ratio $r$ converges when:", o: ["A. $|r| > 1$", "B. $|r| < 1$", "C. $r = 1$", "D. $r > 0$"], a: "B. $|r| < 1$" },
                { q: "The integration-by-parts formula is $\\int u\\,dv =$", o: ["A. $uv - \\int v\\,du$", "B. $uv + \\int v\\,du$", "C. $\\frac{u}{v} - \\int v\\,du$", "D. $\\int u\\,du - v$"], a: "A. $uv - \\int v\\,du$" }
            ],
            sa: [
                { q: "State the formula for the sum of a convergent geometric series with first term $a$ and ratio $r$.", a: "$S = \\frac{a}{1 - r}$, valid for $|r| < 1$." },
                { q: "Write the general term of the Taylor series of $f$ about $x = a$.", a: "$\\frac{f^{(n)}(a)}{n!}(x - a)^n$, summed for $n$ from $0$ to $\\infty$." },
                { q: "What does the ratio test determine?", a: "Whether a series converges absolutely, using $\\lim |a_{n+1}/a_n|$: $<1$ converges, $>1$ diverges, $=1$ inconclusive." },
                { q: "Define an improper integral.", a: "An integral with an infinite limit or an infinite discontinuity in the integrand, evaluated as a limit." }
            ]
        },
        medium: {
            mcq: [
                { q: "The Maclaurin series for $e^x$ is:", o: ["A. $\\sum x^n$", "B. $\\sum \\frac{x^n}{n!}$", "C. $\\sum (-1)^n x^n$", "D. $\\sum n! x^n$"], a: "B. $\\sum \\frac{x^n}{n!}$" },
                { q: "Which test best shows that $\\sum \\frac{1}{n^2}$ converges?", o: ["A. nth-term test", "B. p-series test ($p = 2 > 1$)", "C. ratio test", "D. it diverges"], a: "B. p-series test ($p = 2 > 1$)" },
                { q: "The arc length of a parametric curve uses the integral of:", o: ["A. $\\sqrt{(dx/dt)^2 + (dy/dt)^2}\\,dt$", "B. $(dx/dt)(dy/dt)\\,dt$", "C. $\\sqrt{dx^2 - dy^2}$", "D. $(dy/dx)\\,dt$"], a: "A. $\\sqrt{(dx/dt)^2 + (dy/dt)^2}\\,dt$" },
                { q: "Evaluate $\\int_1^{\\infty} \\frac{1}{x^2}\\,dx$.", o: ["A. diverges", "B. $1$", "C. $2$", "D. $0$"], a: "B. $1$" },
                { q: "For the logistic model $\\frac{dP}{dt} = kP(1 - P/M)$, the population grows fastest when $P =$", o: ["A. $0$", "B. $M$", "C. $\\frac{M}{2}$", "D. $2M$"], a: "C. $\\frac{M}{2}$" }
            ],
            sa: [
                { q: "Determine whether a series related to {focus} converges, and name the test you would use.", a: "Choose a test (ratio, comparison, integral, p-series, alternating) from the term's form; state the condition and conclude." },
                { q: "Set up the arc length integral for a parametric curve connected to {focus} (do not evaluate).", a: "$L = \\int \\sqrt{(dx/dt)^2 + (dy/dt)^2}\\,dt$ over the parameter interval." },
                { q: "Explain how a Taylor polynomial approximates a function from {focus} and what controls the error.", a: "It matches derivatives at the center; the Lagrange remainder bounds the error using the next derivative." },
                { q: "For an improper integral arising in {focus}, describe how you evaluate it.", a: "Replace the infinite/undefined bound with a limit variable, integrate, then take the limit; it converges if that limit is finite." },
                { q: "Describe the behavior of a logistic growth model relevant to {focus}.", a: "Near-exponential growth at low $P$, an inflection at $P = M/2$, then leveling off toward the carrying capacity $M$." }
            ]
        },
        challenge: {
            mcq: [
                { q: "The interval of convergence of $\\sum \\frac{x^n}{n}$ is:", o: ["A. $(-1, 1)$", "B. $[-1, 1)$", "C. $(-1, 1]$", "D. $[-1, 1]$"], a: "B. $[-1, 1)$" },
                { q: "By the integral test, $\\sum_{n \\ge 2} \\frac{1}{n \\ln n}$:", o: ["A. converges", "B. diverges", "C. equals $e$", "D. equals $\\ln 2$"], a: "B. diverges" },
                { q: "The Taylor (Lagrange) remainder bounds the error using:", o: ["A. the $(n+1)$th derivative on the interval", "B. the first derivative only", "C. the function value at $0$", "D. the ratio test"], a: "A. the $(n+1)$th derivative on the interval" },
                { q: "For the cardioid $r = 1 + \\cos\\theta$, the enclosed area is:", o: ["A. $\\int (1+\\cos\\theta)\\,d\\theta$", "B. $\\frac{1}{2}\\int (1+\\cos\\theta)^2\\,d\\theta$", "C. $\\int (1+\\cos\\theta)^2\\,d\\theta$", "D. $\\frac{1}{2}\\int (1+\\cos\\theta)\\,d\\theta$"], a: "B. $\\frac{1}{2}\\int (1+\\cos\\theta)^2\\,d\\theta$" }
            ],
            sa: [
                { q: "Find and justify the interval of convergence for a power series tied to {focus}.", a: "Use the ratio test for the radius, then test each endpoint separately with an appropriate convergence test." },
                { q: "Set up the polar area integral for a curve from {focus}.", a: "$A = \\frac{1}{2}\\int r(\\theta)^2\\,d\\theta$ over the interval where the curve is traced." },
                { q: "Explain how Euler's method approximates a solution to a differential equation in {focus}, and its error behavior.", a: "Step forward with $y_{n+1} = y_n + h f(x_n, y_n)$; local error is about $h^2$ and accumulates about $h$, so smaller $h$ improves accuracy." },
                { q: "Use a Taylor series to approximate a quantity from {focus} and bound the error.", a: "Expand about a convenient center, truncate, and bound with the Lagrange remainder using a maximum of the next derivative." }
            ]
        }
    },

    stats: {
        basic: {
            mcq: [
                { q: "Which measure of center is most resistant to outliers?", o: ["A. Mean", "B. Median", "C. Range", "D. Standard deviation"], a: "B. Median" },
                { q: "A probability must be a number between:", o: ["A. $-1$ and $1$", "B. $0$ and $1$", "C. $0$ and $100$", "D. $1$ and $10$"], a: "B. $0$ and $1$" },
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
                { q: "A correlation of $r = -0.9$ indicates:", o: ["A. weak positive association", "B. strong negative linear association", "C. no association", "D. causation"], a: "B. strong negative linear association" },
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
                { q: "Which conditions are required for a two-sample t-test?", o: ["A. Random samples, independence, approximately normal or large $n$", "B. Only equal sample sizes", "C. Known population standard deviation", "D. $p < 0.05$"], a: "A. Random samples, independence, approximately normal or large $n$" },
                { q: "If you decrease the significance level alpha, the probability of a Type II error:", o: ["A. decreases", "B. increases", "C. is unchanged", "D. becomes zero"], a: "B. increases" },
                { q: "A chi-square test of independence compares:", o: ["A. two means", "B. observed versus expected counts across categories", "C. regression slopes", "D. variances only"], a: "B. observed versus expected counts across categories" },
                { q: "In linear regression, a residual equals:", o: ["A. predicted minus observed", "B. observed minus predicted", "C. slope times x", "D. the correlation"], a: "B. observed minus predicted" }
            ],
            sa: [
                { q: "Design a randomized experiment to test a claim about {focus}, naming treatment, control, and randomization.", a: "Randomly assign subjects to treatment vs control, control confounders, replicate, and compare outcomes; randomization balances lurking variables." },
                { q: "Carry out the logic of a significance test for {focus} (hypotheses, conditions, conclusion).", a: "State H0/Ha, check random/independent/normal conditions, compute a test statistic and p-value, then reject or fail to reject H0 in context." },
                { q: "Interpret the slope and $r^2$ for a regression model in {focus}.", a: "Slope = predicted change in $y$ per unit increase in $x$; $r^2$ = the fraction of variation in $y$ explained by the linear model." },
                { q: "Explain Type I versus Type II error and their consequences for a decision about {focus}.", a: "Type I = rejecting a true H0 (false alarm); Type II = failing to reject a false H0 (missed effect); alpha controls Type I, power controls Type II." }
            ]
        }
    },

    chem: {
        basic: {
            mcq: [
                { q: "Moving across a period from left to right, atomic radius generally:", o: ["A. decreases as the growing nuclear charge pulls electrons inward", "B. increases as additional electron shells are added", "C. stays essentially constant", "D. roughly doubles at each element"], a: "A. decreases as the growing nuclear charge pulls electrons inward", e: "Across a period, protons increase while electrons fill the same shell, so the stronger pull shrinks the atom. 'Increases as shells are added' is tempting but describes moving down a group, not across a period." },
                { q: "A bond formed by transferring electrons from a metal to a nonmetal is best described as:", o: ["A. an ionic bond", "B. a polar covalent bond", "C. a nonpolar covalent bond", "D. a hydrogen bond"], a: "A. an ionic bond", e: "Electron transfer between a metal and a nonmetal makes oppositely charged ions held by an ionic bond. 'Polar covalent' is tempting because it also has unequal electron sharing, but covalent bonds share electrons rather than transfer them." },
                { q: "When ice melts into liquid water, which attraction is overcome?", o: ["A. Hydrogen bonds between separate water molecules", "B. Covalent bonds within each water molecule", "C. Ionic bonds in a crystal lattice", "D. Metallic bonds between atoms"], a: "A. Hydrogen bonds between separate water molecules", e: "Melting pulls molecules apart, overcoming intermolecular hydrogen bonds, not the bonds inside a molecule. 'Covalent bonds within each molecule' is the classic trap: those O-H bonds stay intact during a phase change." },
                { q: "An atom contains 11 protons, 12 neutrons, and 11 electrons. Its mass number is:", o: ["A. 23", "B. 11", "C. 12", "D. 22"], a: "A. 23", e: "Mass number is protons plus neutrons: 11 + 12 = 23. '11' is tempting because that is the atomic number (protons only), which names the element but is not the mass number." },
                { q: "The reaction $\\text{CH}_4 + 2\\,\\text{O}_2 \\to \\text{CO}_2 + 2\\,\\text{H}_2\\text{O}$ is best classified as:", o: ["A. Combustion", "B. Precipitation", "C. Acid-base neutralization", "D. Single replacement"], a: "A. Combustion", e: "A hydrocarbon burning in oxygen to give carbon dioxide and water is combustion. 'Single replacement' is tempting if you look for one element displacing another, but no element is displaced here." },
                { q: "Among these 0.1 M solutions, which is the most acidic (lowest pH)?", o: ["A. Hydrochloric acid (HCl), a strong acid", "B. Acetic acid, a weak acid", "C. Sodium chloride (NaCl), a neutral salt", "D. Sodium hydroxide (NaOH), a strong base"], a: "A. Hydrochloric acid (HCl), a strong acid", e: "A strong acid dissociates completely, giving the highest hydrogen-ion concentration and lowest pH at equal concentration. 'Acetic acid' is tempting since it is acidic too, but a weak acid only partly dissociates, so its pH is higher." },
                { q: "An exothermic reaction is one that:", o: ["A. releases energy to the surroundings", "B. absorbs energy from the surroundings", "C. has no net energy change", "D. always cools the surroundings down"], a: "A. releases energy to the surroundings", e: "Exothermic reactions release energy and warm the surroundings, with a negative enthalpy change. 'Absorbs energy' is the definition of endothermic, the opposite, which is the most common mix-up." },
                { q: "Adding a catalyst increases the rate of a reaction by:", o: ["A. providing a pathway with lower activation energy", "B. increasing the activation energy", "C. raising the energy of the products", "D. shifting the equilibrium toward products"], a: "A. providing a pathway with lower activation energy", e: "A catalyst offers a lower-activation-energy route, so more collisions succeed and the rate rises. 'Shifting the equilibrium toward products' is tempting, but a catalyst speeds both directions equally and does not move the equilibrium." }
            ],
            sa: [
                { q: "Define the mole.", a: "The amount of substance that contains Avogadro's number ($6.022\\times10^{23}$) of particles." },
                { q: "What distinguishes an element from a compound?", a: "An element has one type of atom; a compound has two or more elements chemically bonded in fixed ratios." },
                { q: "State the difference between an ionic and a covalent bond.", a: "Ionic bonds transfer electrons (metal + nonmetal); covalent bonds share electrons (nonmetal + nonmetal)." },
                { q: "What does pH measure?", a: "The acidity of a solution; $\\text{pH} = -\\log[\\text{H}^+]$, where a lower pH is more acidic." }
            ]
        },
        medium: {
            mcq: [
                { q: "How many moles of $\\text{O}_2$ are required to completely burn 2 mol of $\\text{CH}_4$ in $\\text{CH}_4 + 2\\,\\text{O}_2 \\to \\text{CO}_2 + 2\\,\\text{H}_2\\text{O}$?", o: ["A. 4 mol", "B. 2 mol", "C. 1 mol", "D. 8 mol"], a: "A. 4 mol", e: "The equation needs 2 mol O2 per mol CH4, so 2 mol CH4 requires 2 x 2 = 4 mol O2. '2 mol' is tempting if you read the coefficient alone and forget to scale by the amount of methane." },
                { q: "For $\\text{N}_2(g) + 3\\,\\text{H}_2(g) \\rightleftharpoons 2\\,\\text{NH}_3(g)$, raising the pressure by reducing the volume shifts the equilibrium:", o: ["A. toward NH3, the side with fewer gas moles", "B. toward the reactants, the side with more gas moles", "C. not at all, since pressure has no effect", "D. toward whichever side is exothermic"], a: "A. toward NH3, the side with fewer gas moles", e: "Higher pressure favors the side with fewer gas molecules; the product side has 2 moles versus 4 on the left, so it shifts toward NH3. 'Not at all' is the trap of forgetting that unequal gas-mole counts make pressure matter." },
                { q: "A strong monoprotic acid solution has $[\\text{H}^+] = 1\\times10^{-4}\\,\\text{M}$. Its pH is:", o: ["A. 4", "B. 10", "C. 0.0001", "D. -4"], a: "A. 4", e: "pH = -log[H+] = -log(10^-4) = 4. '10' is tempting if you compute pOH (which is 10 here) instead of pH and confuse the two." },
                { q: "Initial-rate data for A + B -> products: Trial 1 [A]=0.10 M, [B]=0.10 M, rate=0.20 M/s; Trial 2 [A]=0.20 M, [B]=0.10 M, rate=0.40 M/s; Trial 3 [A]=0.10 M, [B]=0.20 M, rate=0.20 M/s. The rate law is:", o: ["A. rate = k[A]", "B. rate = k[A][B]", "C. rate = k[A] squared", "D. rate = k[B]"], a: "A. rate = k[A]", e: "Trials 1 to 2 show that doubling [A] doubles the rate (first order in A); trials 1 to 3 show that doubling [B] leaves the rate unchanged (zero order in B), so rate = k[A]. 'k[A][B]' wrongly assumes every reactant must affect the rate." },
                { q: "A reaction has $\\Delta H = -90\\,\\text{kJ/mol}$. This tells you the reaction:", o: ["A. releases 90 kJ per mole and is exothermic", "B. absorbs 90 kJ per mole and is endothermic", "C. is currently at equilibrium", "D. cannot proceed at all"], a: "A. releases 90 kJ per mole and is exothermic", e: "A negative enthalpy change means heat is released, so the reaction is exothermic. 'Absorbs 90 kJ' is the sign-error trap, since a negative sign indicates release, not absorption." },
                { q: "The molecule $\\text{CO}_2$ has two double bonds and no lone pairs on the central carbon. Its molecular geometry is:", o: ["A. Linear", "B. Bent", "C. Trigonal planar", "D. Tetrahedral"], a: "A. Linear", e: "Two electron domains and no lone pairs point directly opposite, giving a linear 180-degree shape. 'Bent' is tempting if you picture water, but water's central atom has lone pairs that CO2's carbon does not." },
                { q: "Of these molecules of similar size, which is expected to have the highest boiling point?", o: ["A. Water, which forms hydrogen bonds", "B. Methane, with dispersion forces only", "C. Oxygen, with dispersion forces only", "D. Carbon dioxide, with dispersion forces only"], a: "A. Water, which forms hydrogen bonds", e: "Hydrogen bonding is far stronger than the dispersion forces in the nonpolar molecules, so water boils highest. 'Carbon dioxide' is tempting because it is heavier, but lacking hydrogen bonds its weak dispersion forces give a much lower boiling point." },
                { q: "A reaction at equilibrium has extra product suddenly added. Immediately afterward, the reaction quotient Q relative to K is:", o: ["A. Q > K, so the system shifts toward reactants", "B. Q < K, so the system shifts toward products", "C. Q = K, so nothing changes", "D. Q becomes undefined"], a: "A. Q > K, so the system shifts toward reactants", e: "Adding product raises Q above K, so the reaction shifts left toward reactants to restore balance. 'Q < K shifts toward products' is the reversed-direction trap, which applies when product is removed instead." },
                { q: "In $2\\,\\text{H}_2 + \\text{O}_2 \\to 2\\,\\text{H}_2\\text{O}$, a flask holds 3 mol $\\text{H}_2$ and 3 mol $\\text{O}_2$. The limiting reactant is:", o: ["A. H2, because it needs a 2:1 ratio with O2", "B. O2, because it has the same number of moles", "C. Neither, because the moles are equal", "D. Both run out at exactly the same time"], a: "A. H2, because it needs a 2:1 ratio with O2", e: "The 2:1 ratio means 3 mol H2 needs only 1.5 mol O2, so H2 is consumed first while O2 is in excess. 'Neither, the moles are equal' is tempting, but the unequal coefficients make H2 limiting." }
            ],
            sa: [
                { q: "Outline the steps to find the limiting reactant for a reaction in {focus}.", a: "Convert masses to moles, divide by coefficients; the smallest ratio is limiting; use it to find theoretical yield." },
                { q: "Explain how Le Chatelier's principle applies to an equilibrium related to {focus}.", a: "A stress (concentration, pressure, or temperature) shifts the equilibrium to partially counteract it; predict the direction." },
                { q: "Describe the relationship between $[\\text{H}^+]$, $[\\text{OH}^-]$, and pH for a solution in {focus}.", a: "$\\text{pH} = -\\log[\\text{H}^+]$; $[\\text{H}^+][\\text{OH}^-] = 10^{-14}$ at $25^\\circ\\text{C}$; $\\text{pH} + \\text{pOH} = 14$." },
                { q: "Use the ideal gas law to relate variables for a gas problem in {focus}.", a: "$PV = nRT$; solve for the unknown holding the others constant, with consistent units and $R = 0.0821\\,\\text{L·atm/mol·K}$." },
                { q: "Explain how bond type affects the properties of a substance in {focus}.", a: "Ionic solids are high-melting and conduct when molten/dissolved; molecular covalent substances melt lower; metals conduct and are malleable." }
            ]
        },
        challenge: {
            mcq: [
                { q: "For $\\text{H}_2(g) + \\text{I}_2(g) \\rightleftharpoons 2\\,\\text{HI}(g)$, a 1.0 L flask starts with 1.0 mol $\\text{H}_2$ and 1.0 mol $\\text{I}_2$; at equilibrium 1.6 mol HI is present. The value of $K_c$ is:", o: ["A. 64", "B. 8", "C. 40", "D. 1.6"], a: "A. 64", e: "ICE gives H2 = I2 = 1.0 - 0.8 = 0.2 M and HI = 1.6 M, so Kc = (1.6)^2 / ((0.2)(0.2)) = 2.56 / 0.04 = 64. '8' is the trap of forgetting to square [HI] and instead taking 1.6/0.2." },
                { q: "A buffer contains 0.10 mol acetic acid (pKa = 4.74) and 0.10 mol acetate ion in 1.0 L. Its pH is approximately:", o: ["A. 4.74", "B. 7.00", "C. 2.87", "D. 9.26"], a: "A. 4.74", e: "By pH = pKa + log([A-]/[HA]) with equal amounts, log(1) = 0, so pH = pKa = 4.74. '7.00' is the trap of assuming every buffer is neutral; a buffer centers on its pKa, not 7." },
                { q: "A reaction has $\\Delta H = +50\\,\\text{kJ/mol}$ and $\\Delta S = +150\\,\\text{J/(mol·K)}$. Using $\\Delta G = \\Delta H - T\\Delta S$, it becomes spontaneous:", o: ["A. at high temperatures, above about 333 K", "B. at every temperature", "C. at no temperature at all", "D. only at low temperatures"], a: "A. at high temperatures, above about 333 K", e: "With positive H and positive S, G turns negative only when T exceeds H divided by S = 50000/150 about 333 K, so it is spontaneous at high T. 'At every temperature' ignores the temperature dependence of the entropy term." },
                { q: "Liquids X (polar, hydrogen-bonding) and Y (nonpolar) have similar molar masses. Which statement is best supported?", o: ["A. X boils higher because its intermolecular forces are stronger", "B. Y boils higher because nonpolar molecules pack more tightly", "C. They boil at the same temperature because masses are similar", "D. X has weaker forces because hydrogen bonds are intramolecular"], a: "A. X boils higher because its intermolecular forces are stronger", e: "At similar mass, X's hydrogen bonding makes its intermolecular forces stronger than Y's dispersion forces, raising its boiling point. 'Same temperature because masses are similar' ignores that force type, not mass alone, sets the boiling point here." },
                { q: "Raising the temperature speeds up a reaction mainly because:", o: ["A. a larger fraction of collisions exceed the activation energy", "B. the activation energy itself decreases with temperature", "C. the enthalpy of the reaction decreases", "D. the equilibrium constant must increase"], a: "A. a larger fraction of collisions exceed the activation energy", e: "Higher temperature widens the molecular-energy distribution so more collisions clear the activation-energy barrier, raising the rate. 'Activation energy decreases' is the trap; only a catalyst lowers it, not temperature." },
                { q: "A titration neutralizes 25.0 mL of HCl with 0.100 M NaOH. The buret reads 1.00 mL initially and 26.00 mL at the endpoint. The concentration of the HCl is:", o: ["A. 0.100 M", "B. 0.050 M", "C. 0.200 M", "D. 0.025 M"], a: "A. 0.100 M", e: "NaOH used = 26.00 - 1.00 = 25.00 mL; moles = 0.100 x 0.02500 = 0.00250 mol; for a 1:1 reaction, [HCl] = 0.00250 / 0.02500 = 0.100 M. '0.050 M' is the trap of mismatching the 1:1 stoichiometry or doubling a volume." },
                { q: "A galvanic (voltaic) cell has a positive standard cell potential. The overall reaction is therefore:", o: ["A. spontaneous, with a negative $\\Delta G^\\circ$", "B. nonspontaneous, with a positive $\\Delta G^\\circ$", "C. exactly at equilibrium", "D. thermodynamically impossible"], a: "A. spontaneous, with a negative $\\Delta G^\\circ$", e: "A positive cell potential gives a negative free-energy change because free energy equals minus n F E, so the reaction is spontaneous. The opposite choice reverses the relationship between cell potential and free energy." },
                { q: "Which best explains why the first ionization energy of sodium is much lower than that of neon?", o: ["A. Sodium's outer electron sits in a new, farther, well-shielded shell", "B. Sodium has more protons pulling on its electrons", "C. Neon is a metal that loses electrons easily", "D. Sodium already has a full outer shell"], a: "A. Sodium's outer electron sits in a new, farther, well-shielded shell", e: "Sodium's lone 3s electron is shielded by inner shells and far from the nucleus, so it leaves easily, while neon holds its 2p electrons tightly in a full shell. 'Neon is a metal' is false; neon is a noble gas with very high ionization energy." },
                { q: "Given step 1 with $\\Delta H = -110\\,\\text{kJ}$ and step 2 with $\\Delta H = -283\\,\\text{kJ}$, if the target reaction equals step 1 plus step 2, its $\\Delta H$ is:", o: ["A. -393 kJ", "B. +393 kJ", "C. -173 kJ", "D. +173 kJ"], a: "A. -393 kJ", e: "By Hess's law, adding the steps adds their enthalpies: -110 + (-283) = -393 kJ. '-173 kJ' is the trap of subtracting the values instead of adding them." }
            ],
            sa: [
                { q: "Describe how to find $\\Delta H$ for a reaction in {focus} using Hess's law or bond energies.", a: "Add the enthalpies of steps (Hess's law) or compute (bonds broken $-$ bonds formed), tracking signs carefully." },
                { q: "Explain how a buffer related to {focus} maintains pH, using equilibrium.", a: "The weak acid neutralizes added base and its conjugate base neutralizes added acid; $\\text{pH} = \\text{p}K_a + \\log\\frac{[\\text{A}^-]}{[\\text{HA}]}$." },
                { q: "Relate $\\Delta G$, $\\Delta H$, $\\Delta S$, and temperature for a process in {focus}.", a: "$\\Delta G = \\Delta H - T\\Delta S$; the signs and temperature decide spontaneity; identify the temperature where it becomes spontaneous." },
                { q: "Interpret a reaction-rate experiment for {focus} using collision theory.", a: "Rate rises with concentration, temperature, and catalysts because the number of effective collisions (right orientation and enough energy) increases." }
            ]
        }
    },

    phys1: {
        basic: {
            mcq: [
                { q: "A car speeds up from rest at a constant rate, reaching 20 m/s in 4 s. Its acceleration is:", o: ["A. 5 m/s²", "B. 80 m/s²", "C. 0.2 m/s²", "D. 24 m/s²"], a: "A. 5 m/s²", e: "Acceleration is change in velocity divided by time: (20 − 0)/4 = 5 m/s². '80 m/s²' is the trap of multiplying velocity by time instead of dividing." },
                { q: "A hockey puck slides across frictionless ice at constant velocity. The net force on it is:", o: ["A. zero", "B. in the direction of motion", "C. opposite to its motion", "D. increasing with its speed"], a: "A. zero", e: "Constant velocity means zero acceleration, so by Newton's second law the net force is zero. 'In the direction of motion' is the classic misconception that motion requires a continuous force." },
                { q: "A 2 kg object experiences a net force of 10 N. Using F = ma, its acceleration is:", o: ["A. 5 m/s²", "B. 20 m/s²", "C. 0.2 m/s²", "D. 12 m/s²"], a: "A. 5 m/s²", e: "From a = F/m = 10/2 = 5 m/s². '20 m/s²' is the trap of multiplying force by mass instead of dividing." },
                { q: "An object's speed doubles while its mass stays the same. Its kinetic energy becomes:", o: ["A. four times as large", "B. twice as large", "C. half as large", "D. unchanged"], a: "A. four times as large", e: "Kinetic energy is (1/2)mv², which depends on speed squared, so doubling the speed multiplies KE by 2² = 4. 'Twice as large' treats KE as proportional to speed rather than speed squared." },
                { q: "Momentum is defined as:", o: ["A. mass times velocity", "B. mass times acceleration", "C. force times distance", "D. mass times speed squared"], a: "A. mass times velocity", e: "Momentum p = mv, the product of mass and velocity. 'Mass times acceleration' is the trap of confusing momentum with force (F = ma)." },
                { q: "A ball on a string is whirled in a horizontal circle at constant speed. The net force on the ball points:", o: ["A. toward the center of the circle", "B. outward, away from the center", "C. forward along the direction of motion", "D. nowhere, since the net force is zero"], a: "A. toward the center of the circle", e: "Circular motion needs a center-pointing (centripetal) net force to change the velocity's direction. 'Outward' is the common centrifugal misconception; the outward feeling is not a real force on the ball." },
                { q: "Ignoring air resistance, a heavy ball and a light ball are dropped from the same height. They:", o: ["A. hit the ground at the same time", "B. land with the heavy ball first", "C. land with the light ball first", "D. cannot fall at all without air"], a: "A. hit the ground at the same time", e: "Without air resistance every object falls with the same acceleration g, so they land together. 'Heavy ball first' is the ancient misconception that heavier objects fall faster." },
                { q: "The gravitational potential energy of an object near Earth's surface depends on:", o: ["A. its mass and its height", "B. its speed only", "C. its acceleration only", "D. how long it has been falling"], a: "A. its mass and its height", e: "Gravitational PE = mgh, so it depends on mass and height (g is constant). 'Its speed only' confuses potential energy with kinetic energy." }
            ],
            sa: [
                { q: "State Newton's first law.", a: "An object at rest stays at rest, and an object in motion keeps constant velocity, unless acted on by a net external force." },
                { q: "Define acceleration.", a: "The rate of change of velocity with time ($a = \\Delta v / \\Delta t$)." },
                { q: "What is the difference between mass and weight?", a: "Mass is the amount of matter (kg); weight is the gravitational force on it ($W = mg$, in newtons)." },
                { q: "Write the kinematic equation relating displacement, initial velocity, time, and acceleration.", a: "$x = v_0 t + \\frac{1}{2} a t^2$." }
            ]
        },
        medium: {
            mcq: [
                { q: "An object is dropped from rest and falls for 3 s (take g = 10 m/s²). How far does it fall?", o: ["A. 45 m", "B. 30 m", "C. 90 m", "D. 15 m"], a: "A. 45 m", e: "Use d = (1/2)gt² = (1/2)(10)(3²) = 45 m. '30 m' is the trap of using d = gt = 10 × 3 and forgetting the (1/2)t² form." },
                { q: "A 5 kg box is pushed along a level floor by a 30 N horizontal force against 10 N of friction. Its acceleration is:", o: ["A. 4 m/s²", "B. 6 m/s²", "C. 8 m/s²", "D. 2 m/s²"], a: "A. 4 m/s²", e: "Net force = 30 − 10 = 20 N, so a = net force / mass = 20/5 = 4 m/s². '6 m/s²' is the trap of using the 30 N push without subtracting friction (30/5)." },
                { q: "A 2 kg ball is dropped from 5 m (take g = 10 m/s²). Using energy conservation, its speed just before landing is:", o: ["A. 10 m/s", "B. 5 m/s", "C. 100 m/s", "D. 50 m/s"], a: "A. 10 m/s", e: "Setting mgh = (1/2)mv² gives v = √(2gh) = √(2·10·5) = √100 = 10 m/s, and the mass cancels. '100 m/s' is the trap of forgetting the square root." },
                { q: "A 2 kg cart moving at 3 m/s collides and sticks to a 1 kg cart at rest. Their common speed afterward is:", o: ["A. 2 m/s", "B. 3 m/s", "C. 6 m/s", "D. 1.5 m/s"], a: "A. 2 m/s", e: "Momentum is conserved: (2)(3) = (2 + 1)v, so v = 6/3 = 2 m/s. '3 m/s' is the trap of assuming the speed is unchanged, ignoring the added mass." },
                { q: "A car rounds a flat, level curve at constant speed. What provides the centripetal force that keeps it turning?", o: ["A. Friction between the tires and the road", "B. The car's forward engine force", "C. An outward centrifugal force", "D. Gravity pulling the car downward"], a: "A. Friction between the tires and the road", e: "On a flat curve, static friction points toward the center and supplies the centripetal force. 'An outward centrifugal force' is the misconception; the net force must point inward." },
                { q: "A truck collides with a small car. The force the truck exerts on the car compared with the force the car exerts on the truck is:", o: ["A. equal in magnitude and opposite in direction", "B. larger, because the truck is more massive", "C. smaller, because the car decelerates more", "D. zero on the truck"], a: "A. equal in magnitude and opposite in direction", e: "By Newton's third law the interaction forces are equal and opposite, regardless of mass. 'Larger because the truck is more massive' is the misconception; the car accelerates more only because it has less mass, not a bigger force." },
                { q: "A 10 N force pushes a box 4 m in the direction of the force. The work done on the box is:", o: ["A. 40 J", "B. 2.5 J", "C. 14 J", "D. 0 J"], a: "A. 40 J", e: "Work = force × distance when they are aligned: 10 × 4 = 40 J. '0 J' is the trap of thinking no work is done, which is true only when the force is perpendicular to the motion." },
                { q: "For a mass oscillating on a spring in simple harmonic motion, increasing the mass while keeping the same spring will:", o: ["A. increase the period of oscillation", "B. decrease the period of oscillation", "C. leave the period unchanged", "D. stop the oscillation entirely"], a: "A. increase the period of oscillation", e: "Period T = 2π√(m/k) grows with mass, so a heavier mass oscillates more slowly. 'Decrease the period' inverts the relationship between mass and period." },
                { q: "On a velocity-versus-time graph, an object's line is flat (horizontal) at 8 m/s. This shows the object is:", o: ["A. moving at constant velocity with zero acceleration", "B. speeding up uniformly", "C. at rest the whole time", "D. accelerating at 8 m/s²"], a: "A. moving at constant velocity with zero acceleration", e: "A flat velocity-time line means the velocity is constant, so the acceleration (the slope) is zero. 'Speeding up uniformly' would require an upward-sloping line, not a flat one." }
            ],
            sa: [
                { q: "Draw and describe a free-body diagram for an object in {focus}.", a: "Show every force as an arrow from the object (gravity, normal, friction, tension, applied), labeled with direction; the net force gives the acceleration." },
                { q: "Apply Newton's second law to a problem related to {focus}.", a: "Sum the forces in each direction, set net $F = ma$, and solve for the unknown force, mass, or acceleration." },
                { q: "Use conservation of energy to analyze a situation in {focus}.", a: "Set initial KE + PE equal to final KE + PE (plus losses if any); $KE = \\frac{1}{2}mv^2$, gravitational $PE = mgh$." },
                { q: "Explain how momentum conservation applies to a collision in {focus}.", a: "For an isolated system, total momentum before equals after: $m_1 v_1 + m_2 v_2 = m_1 v_1' + m_2 v_2'$." },
                { q: "Describe the forces and acceleration for uniform circular motion in {focus}.", a: "The net (centripetal) force points toward the center; $a = v^2/r$, supplied by tension, gravity, friction, or the normal force." }
            ]
        },
        challenge: {
            mcq: [
                { q: "A 1 kg cart starts from rest at the top of a frictionless ramp 1.8 m high (g = 10 m/s²). Its speed at the bottom is:", o: ["A. 6 m/s", "B. 18 m/s", "C. 36 m/s", "D. 3.6 m/s"], a: "A. 6 m/s", e: "Energy conservation: mgh = (1/2)mv², so v = √(2gh) = √(2·10·1.8) = √36 = 6 m/s. '36 m/s' is the trap of stopping at 2gh and forgetting the square root." },
                { q: "A 0.5 kg ball moving at 4 m/s bounces straight back at 4 m/s. The magnitude of the impulse on the ball is:", o: ["A. 4 kg·m/s", "B. 0 kg·m/s", "C. 2 kg·m/s", "D. 8 kg·m/s"], a: "A. 4 kg·m/s", e: "Impulse equals the change in momentum: 0.5(−4 − 4) = −4, magnitude 4 kg·m/s. '0' is the trap of thinking the speed is unchanged, but the direction reversed so momentum did change." },
                { q: "A 60 kg person stands in an elevator accelerating upward at 2 m/s² (g = 10 m/s²). The normal force from the floor on the person is:", o: ["A. 720 N", "B. 600 N", "C. 480 N", "D. 120 N"], a: "A. 720 N", e: "Newton's second law upward: N − mg = ma, so N = m(g + a) = 60(10 + 2) = 720 N. '600 N' is the trap of using only the weight mg and ignoring the upward acceleration." },
                { q: "A 0.2 kg ball moves in a circle of radius 0.5 m at a constant 2 m/s. Using F = mv²/r, the centripetal force is:", o: ["A. 1.6 N", "B. 0.8 N", "C. 0.4 N", "D. 3.2 N"], a: "A. 1.6 N", e: "F = mv²/r = (0.2)(2²)/(0.5) = 0.8/0.5 = 1.6 N. '0.8 N' is the trap of computing mv² and forgetting to divide by the radius r." },
                { q: "A 3 N force is applied perpendicular to a wrench 0.4 m from the pivot. The torque about the pivot is:", o: ["A. 1.2 N·m", "B. 7.5 N·m", "C. 0.13 N·m", "D. 3.4 N·m"], a: "A. 1.2 N·m", e: "Torque = force × lever arm for a perpendicular force: 3 × 0.4 = 1.2 N·m. '7.5 N·m' is the trap of dividing force by distance (3/0.4) instead of multiplying." },
                { q: "A block slides along a level surface and gradually stops because of friction. Its lost kinetic energy is best described as:", o: ["A. transformed into thermal energy by friction", "B. destroyed, so it no longer exists", "C. converted into gravitational potential energy", "D. stored as the block's momentum"], a: "A. transformed into thermal energy by friction", e: "Energy is conserved overall; friction converts the kinetic energy into thermal energy (heat). 'Destroyed, so it no longer exists' is the misconception that energy can simply disappear." },
                { q: "If the distance between two masses is doubled, the gravitational force between them becomes:", o: ["A. one-fourth as large", "B. one-half as large", "C. twice as large", "D. four times as large"], a: "A. one-fourth as large", e: "Gravity follows an inverse-square law (force proportional to 1/r²), so doubling the distance gives 1/2² = 1/4 the force. 'One-half as large' treats it as inverse-linear (1/r) rather than inverse-square." },
                { q: "A mass on a spring oscillates horizontally with no friction. As it passes through the equilibrium position, its:", o: ["A. speed is maximum and spring potential energy is zero", "B. speed is zero and potential energy is maximum", "C. speed and potential energy are both maximum", "D. acceleration is maximum"], a: "A. speed is maximum and spring potential energy is zero", e: "At equilibrium the spring is unstretched, so its potential energy is zero and all the energy is kinetic, giving maximum speed. 'Speed zero and PE maximum' describes the end (turning) points, not the center." },
                { q: "A student tests how a pendulum's length affects its period, timing 10 swings at each of several lengths. For a valid conclusion, the student should mainly:", o: ["A. change only the length while keeping the mass and release angle the same", "B. change the length and the mass together each trial", "C. use a different release angle for every length", "D. time a single swing once per length"], a: "A. change only the length while keeping the mass and release angle the same", e: "Isolating length as the only variable (controlling mass and angle) lets period changes be attributed to length. 'Change length and mass together' confounds two variables, so neither effect can be identified." }
            ],
            sa: [
                { q: "Analyze an inclined-plane problem from {focus} using components of gravity.", a: "Resolve weight into $mg\\sin\\theta$ along and $mg\\cos\\theta$ perpendicular; normal $= mg\\cos\\theta$; net along the incline $= mg\\sin\\theta - \\text{friction} = ma$." },
                { q: "Use the work-energy theorem to solve a problem in {focus}.", a: "Net work equals the change in kinetic energy: $W_{net} = \\frac{1}{2}m v_f^2 - \\frac{1}{2}m v_i^2$; solve for the unknown." },
                { q: "Compare elastic and inelastic collisions for a scenario in {focus}.", a: "Both conserve momentum; elastic also conserves kinetic energy while inelastic does not (some KE becomes heat/deformation); perfectly inelastic objects stick together." },
                { q: "Explain how a free-body diagram leads to the equations of motion for {focus}.", a: "Identify all forces, choose axes, sum forces along each axis, set each sum equal to $ma$, and solve the system for the accelerations or forces." }
            ]
        }
    },

    phys_c_mech: {
        basic: {
            mcq: [
                { q: "In calculus terms, velocity is:", o: ["A. the integral of position", "B. the derivative of position with respect to time", "C. mass times acceleration", "D. the derivative of force"], a: "B. the derivative of position with respect to time" },
                { q: "Acceleration is the time derivative of:", o: ["A. position", "B. velocity", "C. force", "D. momentum"], a: "B. velocity" },
                { q: "The work done by a variable force is:", o: ["A. $F \\cdot d$ in all cases", "B. $\\int \\vec{F}\\cdot d\\vec{x}$", "C. mass times velocity", "D. $F/d$"], a: "B. $\\int \\vec{F}\\cdot d\\vec{x}$" },
                { q: "Impulse equals:", o: ["A. $\\int F\\,dt$", "B. force times distance", "C. mass divided by acceleration", "D. the derivative of position"], a: "A. $\\int F\\,dt$" }
            ],
            sa: [
                { q: "Express velocity and acceleration as derivatives of position $x(t)$.", a: "$v = \\frac{dx}{dt}$; $a = \\frac{dv}{dt} = \\frac{d^2x}{dt^2}$." },
                { q: "Write work as an integral for a variable force.", a: "$W = \\int F(x)\\,dx$ over the displacement." },
                { q: "State the impulse-momentum theorem.", a: "Impulse $= \\int F\\,dt = \\Delta p$ (the change in momentum)." },
                { q: "Define the center of mass for a system of particles.", a: "$x_{cm} = \\frac{\\sum m_i x_i}{\\sum m_i}$." }
            ]
        },
        medium: {
            mcq: [
                { q: "If $x(t) = 3t^2$ (meters), the acceleration is:", o: ["A. $3$", "B. $6t$", "C. $6$", "D. $3t$"], a: "C. $6$" },
                { q: "A net torque on a rigid body produces:", o: ["A. linear acceleration only", "B. angular acceleration ($\\tau = I\\alpha$)", "C. constant angular velocity", "D. zero rotation"], a: "B. angular acceleration ($\\tau = I\\alpha$)" },
                { q: "The rotational kinetic energy of a spinning body is:", o: ["A. $\\frac{1}{2} m v^2$", "B. $\\frac{1}{2} I \\omega^2$", "C. $I\\omega$", "D. $mgh$"], a: "B. $\\frac{1}{2} I \\omega^2$" },
                { q: "For a conservative force, $F$ relates to potential energy $U$ by:", o: ["A. $F = dU/dx$", "B. $F = -dU/dx$", "C. $F = \\int U$", "D. $F = U/x$"], a: "B. $F = -dU/dx$" },
                { q: "The angular momentum of a particle is:", o: ["A. $I/\\omega$", "B. $\\vec{r}\\times\\vec{p}$", "C. $mv$ only", "D. $\\tau t^2$"], a: "B. $\\vec{r}\\times\\vec{p}$" }
            ],
            sa: [
                { q: "Use integration to find velocity and position from an acceleration function in {focus}.", a: "Integrate $a(t)$ to get $v(t)$ (plus $v_0$), then integrate $v(t)$ to get $x(t)$ (plus $x_0$), using the initial conditions." },
                { q: "Apply the work-energy theorem with a variable force for a problem in {focus}.", a: "$W_{net} = \\int F\\,dx = \\Delta KE$; evaluate the integral and solve." },
                { q: "Relate torque, moment of inertia, and angular acceleration for {focus}.", a: "Net torque $= I\\alpha$; find $I$ for the body, sum the torques, and solve for $\\alpha$ or the unknown." },
                { q: "Explain conservation of angular momentum in a scenario from {focus}.", a: "With no net external torque, $L = I\\omega$ stays constant; if $I$ decreases, $\\omega$ increases (e.g., a spinning skater pulling their arms in)." },
                { q: "Derive potential energy from a conservative force in {focus}.", a: "$U(x) = -\\int F\\,dx$; for example a spring gives $U = \\frac{1}{2}k x^2$ and gravity gives $U = mgh$." }
            ]
        },
        challenge: {
            mcq: [
                { q: "A solid disk and a hoop of equal mass and radius roll without slipping down the same incline. Which reaches the bottom first?", o: ["A. the hoop", "B. the disk", "C. they tie", "D. it depends on the mass"], a: "B. the disk" },
                { q: "For simple harmonic motion $x(t) = A\\cos(\\omega t)$, the maximum speed is:", o: ["A. $A$", "B. $\\omega A$", "C. $\\omega^2 A$", "D. $A/\\omega$"], a: "B. $\\omega A$" },
                { q: "The moment of inertia of a solid cylinder about its central axis is:", o: ["A. $m r^2$", "B. $\\frac{1}{2} m r^2$", "C. $\\frac{2}{5} m r^2$", "D. $\\frac{1}{12} m L^2$"], a: "B. $\\frac{1}{2} m r^2$" },
                { q: "With no external torque, if a rotating object's moment of inertia decreases, its angular velocity:", o: ["A. decreases", "B. increases", "C. stays the same", "D. becomes zero"], a: "B. increases" }
            ],
            sa: [
                { q: "Set up the integral for the moment of inertia of a continuous body relevant to {focus}.", a: "$I = \\int r^2\\,dm$, expressing $dm$ through a linear, area, or volume density and integrating over the geometry." },
                { q: "Analyze simple harmonic motion for a system in {focus} and derive $\\omega$.", a: "Show the net force is $-kx$ (or torque $-k\\theta$); then $\\omega = \\sqrt{k/m}$ and the period $T = 2\\pi\\sqrt{m/k}$." },
                { q: "Use energy methods (translational plus rotational) for a rolling-body problem in {focus}.", a: "Set $mgh = \\frac{1}{2}m v^2 + \\frac{1}{2} I \\omega^2$ with $v = \\omega r$, then solve for the speed at the bottom." },
                { q: "Apply conservation of angular momentum to an interaction in {focus}.", a: "With no external torque, $L_{initial} = L_{final}$; sum $\\vec{r}\\times\\vec{p}$ (or $I\\omega$) before and after and solve." }
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
    },

    lang: {
        basic: {
            mcq: [
                { q: "In rhetoric, ethos appeals to:", o: ["A. emotion", "B. credibility and character", "C. logic and evidence", "D. timing"], a: "B. credibility and character" },
                { q: "Pathos is an appeal to:", o: ["A. logic", "B. emotion", "C. authority", "D. grammar"], a: "B. emotion" },
                { q: "A thesis statement primarily:", o: ["A. summarizes a story", "B. states the main argument or claim", "C. lists vocabulary", "D. cites sources"], a: "B. states the main argument or claim" },
                { q: "The intended audience of a text is:", o: ["A. the author", "B. the readers the writer aims to address", "C. the publisher", "D. the narrator"], a: "B. the readers the writer aims to address" }
            ],
            sa: [
                { q: "Define the three rhetorical appeals.", a: "Ethos (credibility/character), pathos (emotion), and logos (logic and evidence)." },
                { q: "What is a thesis statement?", a: "A sentence that states the central, arguable claim the writer will support." },
                { q: "What does 'tone' mean in writing?", a: "The writer's attitude toward the subject or audience, conveyed through word choice and style." },
                { q: "What is the purpose of a topic sentence?", a: "To state the main idea of a paragraph and connect it back to the thesis." }
            ]
        },
        medium: {
            mcq: [
                { q: "Logos is an appeal based on:", o: ["A. the speaker's character", "B. logic, reasoning, and evidence", "C. emotional language", "D. humor"], a: "B. logic, reasoning, and evidence" },
                { q: "In rhetorical analysis, 'diction' refers to:", o: ["A. sentence length", "B. word choice", "C. paragraph order", "D. the thesis"], a: "B. word choice" },
                { q: "A counterargument in an essay serves to:", o: ["A. weaken the thesis", "B. acknowledge and respond to opposing views, strengthening the argument", "C. summarize sources", "D. replace the conclusion"], a: "B. acknowledge and respond to opposing views, strengthening the argument" },
                { q: "Syntax refers to:", o: ["A. word meaning", "B. the arrangement of words and sentence structure", "C. spelling", "D. the author's credibility"], a: "B. the arrangement of words and sentence structure" },
                { q: "A rhetorical question is used to:", o: ["A. obtain factual information", "B. make a point or provoke thought rather than get an answer", "C. cite a source", "D. define a term"], a: "B. make a point or provoke thought rather than get an answer" }
            ],
            sa: [
                { q: "Identify a rhetorical strategy a writer might use in a text about {focus} and explain its effect.", a: "Name a device (e.g., an appeal, analogy, or repetition) and explain how it shapes the audience's response." },
                { q: "Write a defensible thesis for an argument about {focus}.", a: "State a clear, arguable claim that takes a position and could be supported with evidence." },
                { q: "Explain how a writer establishes credibility (ethos) on {focus}.", a: "Cite expertise, a fair tone, acknowledgment of other views, and accurate evidence." },
                { q: "Describe how diction and tone shape a passage about {focus}.", a: "Identify specific word choices and the attitude they convey, then connect them to the intended effect on readers." },
                { q: "Construct a topic sentence and one piece of supporting evidence for {focus}.", a: "Give a clear claim sentence, then provide a specific fact, example, or quotation that supports it." }
            ]
        },
        challenge: {
            mcq: [
                { q: "The most effective use of evidence in an argument is to:", o: ["A. list facts without comment", "B. select relevant evidence and explain how it supports the claim", "C. quote at length without analysis", "D. rely only on emotion"], a: "B. select relevant evidence and explain how it supports the claim" },
                { q: "A concession in an argument is when the writer:", o: ["A. abandons the thesis", "B. admits a valid point of the opposing side before refuting or qualifying it", "C. repeats the introduction", "D. avoids evidence"], a: "B. admits a valid point of the opposing side before refuting or qualifying it" },
                { q: "Juxtaposition is a rhetorical technique that:", o: ["A. places contrasting ideas close together for effect", "B. defines vocabulary", "C. cites sources", "D. summarizes a plot"], a: "A. places contrasting ideas close together for effect" },
                { q: "An effective synthesis essay primarily:", o: ["A. summarizes each source separately", "B. integrates multiple sources to support the writer's own argument", "C. ignores sources", "D. quotes only one source"], a: "B. integrates multiple sources to support the writer's own argument" }
            ],
            sa: [
                { q: "Write a thesis and outline a line of reasoning for an argument about {focus}.", a: "State an arguable thesis, then list two or three supporting claims that logically build the case." },
                { q: "Analyze how a writer uses rhetorical choices to achieve a purpose in a text on {focus}.", a: "Identify specific choices (appeals, diction, syntax, structure) and explain how each advances the purpose for the audience." },
                { q: "Develop a counterargument and rebuttal for a claim about {focus}.", a: "State the opposing view fairly, then refute or qualify it with reasoning and evidence." },
                { q: "Explain how to synthesize two differing sources on {focus} into one argument.", a: "State your position and use each source as support or as a view to address, citing them to advance your own claim rather than just summarizing." }
            ]
        }
    },

    csa: {
        basic: {
            mcq: [
                { q: "Which Java keyword declares a constant whose value cannot change?", o: ["A. const", "B. final", "C. static", "D. var"], a: "B. final" },
                { q: "What is the index of the first element in a Java array?", o: ["A. 1", "B. 0", "C. -1", "D. it varies"], a: "B. 0" },
                { q: "Which data type stores a whole number in Java?", o: ["A. int", "B. double", "C. boolean", "D. String"], a: "A. int" },
                { q: "A loop that repeats as long as a condition is true is a:", o: ["A. while loop", "B. class", "C. method", "D. constructor"], a: "A. while loop" }
            ],
            sa: [
                { q: "What is the difference between int and double in Java?", a: "int stores whole numbers; double stores floating-point (decimal) numbers." },
                { q: "What does a constructor do?", a: "It initializes a new object of a class, often setting its instance variables." },
                { q: "Define a method in Java.", a: "A named block of code that performs a task and can take parameters and return a value." },
                { q: "What does the boolean type represent?", a: "A value that is either true or false." }
            ]
        },
        medium: {
            mcq: [
                { q: "What does this loop print: for(int i=0; i<3; i++) System.out.print(i);", o: ["A. 123", "B. 012", "C. 0123", "D. 111"], a: "B. 012" },
                { q: "To compare two Strings by their contents in Java, you should use:", o: ["A. ==", "B. .equals()", "C. =", "D. >"], a: "B. .equals()" },
                { q: "Which is the correct way to access the 3rd element of array a?", o: ["A. a[3]", "B. a(2)", "C. a[2]", "D. a.get(3)"], a: "C. a[2]" },
                { q: "A method declared 'public int sum(int x, int y)' must:", o: ["A. return nothing", "B. return an int value", "C. only print a value", "D. be a constructor"], a: "B. return an int value" },
                { q: "What is the result of 7 / 2 in Java (integer division)?", o: ["A. 3.5", "B. 3", "C. 4", "D. 2"], a: "B. 3" }
            ],
            sa: [
                { q: "Describe how a for-loop would process a collection related to {focus}.", a: "Initialize an index, loop while it is less than the length, access each element, and update the index (or use an enhanced for-each loop)." },
                { q: "Explain the difference between == and .equals() when comparing objects in {focus}.", a: "== compares references (whether they are the same object in memory); .equals() compares contents/values as defined by the class." },
                { q: "Describe a method to solve a task in {focus}, including parameters and return type.", a: "Name the method, choose parameter types for the inputs, pick a return type for the output, and describe the steps and the value returned." },
                { q: "Explain how an if-else structure would handle a decision in {focus}.", a: "Test a boolean condition; run one block if true and another if false; chain else-if for multiple cases." },
                { q: "Describe an array or ArrayList you would use to store data for {focus}.", a: "Choose the element type; note that arrays are fixed-size while an ArrayList resizes; access elements by index starting at 0." }
            ]
        },
        challenge: {
            mcq: [
                { q: "What is the time complexity of a linear search through an array of n elements?", o: ["A. O(1)", "B. O(log n)", "C. O(n)", "D. O(n^2)"], a: "C. O(n)" },
                { q: "Which concept lets a subclass provide its own version of a parent method?", o: ["A. overloading", "B. overriding", "C. encapsulation", "D. casting"], a: "B. overriding" },
                { q: "What does a recursive method with no base case risk, e.g. int f(int n){ return f(n-1); }?", o: ["A. returning 0", "B. infinite recursion / a StackOverflowError", "C. compiling into a loop", "D. returning n"], a: "B. infinite recursion / a StackOverflowError" },
                { q: "Encapsulation in object-oriented programming is achieved mainly by:", o: ["A. making all fields public", "B. making fields private and using getters and setters", "C. avoiding classes", "D. using only static methods"], a: "B. making fields private and using getters and setters" }
            ],
            sa: [
                { q: "Describe an algorithm (with steps) to solve a problem in {focus} and give its time complexity.", a: "State the inputs and outputs, list the steps, and analyze how the number of operations grows with input size (e.g., O(n) or O(n^2))." },
                { q: "Explain how you would design a class for {focus}, listing fields and methods.", a: "Use private instance variables for state, a constructor to initialize them, and public methods (with parameters and return types) for behavior." },
                { q: "Trace how a nested loop processes data in {focus} and state its complexity.", a: "Describe the outer and inner loop ranges and what each iteration does, then note the combined complexity (often O(n^2))." },
                { q: "Explain how recursion could solve a task in {focus}, including the base case.", a: "Define the base case that stops the recursion and the recursive case that reduces the problem toward that base case." }
            ]
        }
    },

    other: {
        basic: {
            mcq: [
                { q: "A study technique that strengthens long-term memory is:", o: ["A. cramming the night before", "B. spaced repetition over several days", "C. rereading once", "D. only highlighting"], a: "B. spaced repetition over several days" },
                { q: "A primary source is:", o: ["A. a textbook summary", "B. an original, firsthand record or artifact", "C. an encyclopedia entry", "D. a review article"], a: "B. an original, firsthand record or artifact" },
                { q: "Active recall means:", o: ["A. rereading notes", "B. testing yourself to retrieve information from memory", "C. listening passively", "D. copying text"], a: "B. testing yourself to retrieve information from memory" },
                { q: "A reliable source is generally one that is:", o: ["A. anonymous", "B. credible, current, and supported by evidence", "C. the first search result", "D. purely opinion-based"], a: "B. credible, current, and supported by evidence" }
            ],
            sa: [
                { q: "What is active recall and why does it help learning?", a: "Retrieving information from memory (e.g., self-testing); it strengthens memory far more than passive review." },
                { q: "Explain the difference between a primary and a secondary source.", a: "A primary source is an original firsthand record; a secondary source analyzes or interprets primary sources." },
                { q: "Why is spaced practice more effective than cramming?", a: "Spreading study over time builds durable long-term retention, whereas crammed material fades quickly." },
                { q: "What makes a source credible?", a: "Author expertise, supporting evidence, currency, lack of bias, and a reputable publisher." }
            ]
        },
        medium: {
            mcq: [
                { q: "The main idea of a passage is best described as:", o: ["A. a minor detail", "B. the central point the author conveys", "C. always the first sentence", "D. a vocabulary word"], a: "B. the central point the author conveys" },
                { q: "An inference is:", o: ["A. a direct quotation", "B. a logical conclusion drawn from evidence", "C. a guess with no basis", "D. a definition"], a: "B. a logical conclusion drawn from evidence" },
                { q: "A correlation between two variables means:", o: ["A. one definitely causes the other", "B. they tend to change together, but not necessarily causally", "C. they are unrelated", "D. an experiment was performed"], a: "B. they tend to change together, but not necessarily causally" },
                { q: "A strong argument requires:", o: ["A. a claim with relevant supporting evidence and reasoning", "B. only opinions", "C. many quotations", "D. emotional appeals alone"], a: "A. a claim with relevant supporting evidence and reasoning" },
                { q: "To evaluate a website's reliability, you should check:", o: ["A. only how it looks", "B. the author, date, sources, and possible bias", "C. its color scheme", "D. its number of ads"], a: "B. the author, date, sources, and possible bias" }
            ],
            sa: [
                { q: "Summarize the key idea of a topic in {focus} in one or two sentences.", a: "State the central point clearly and concisely, leaving out minor details." },
                { q: "Write a question that would test deep understanding of {focus}.", a: "Pose an application or analysis question (why or how), not just a recall question." },
                { q: "Make an argument with a claim and evidence about {focus}.", a: "State a clear claim and back it with at least one specific, relevant piece of evidence plus reasoning." },
                { q: "Explain how you would break a complex problem in {focus} into smaller steps.", a: "Identify the goal, list ordered sub-steps, solve each, and combine the results." },
                { q: "Describe how to check whether a source on {focus} is trustworthy.", a: "Examine the author's expertise, evidence, date, possible bias, and whether other reliable sources agree." }
            ]
        },
        challenge: {
            mcq: [
                { q: "Which provides the strongest evidence for a cause-and-effect claim?", o: ["A. an anecdote", "B. a controlled, randomized experiment", "C. a single correlation", "D. popular opinion"], a: "B. a controlled, randomized experiment" },
                { q: "A logical fallacy is:", o: ["A. a valid argument", "B. a flaw in reasoning that weakens an argument", "C. a type of evidence", "D. a citation style"], a: "B. a flaw in reasoning that weakens an argument" },
                { q: "Synthesizing information means:", o: ["A. memorizing one source", "B. combining ideas from multiple sources into a coherent understanding", "C. ignoring sources", "D. copying a summary"], a: "B. combining ideas from multiple sources into a coherent understanding" },
                { q: "The best way to handle conflicting sources is to:", o: ["A. pick the first one", "B. evaluate the evidence and credibility of each before deciding", "C. ignore both", "D. average their conclusions"], a: "B. evaluate the evidence and credibility of each before deciding" }
            ],
            sa: [
                { q: "Build a short evidence-based argument about a question in {focus}, addressing a counterpoint.", a: "State a thesis, give supporting evidence with reasoning, then acknowledge and respond to one objection." },
                { q: "Evaluate two sources that disagree about {focus} and decide which is stronger.", a: "Compare their evidence, expertise, and bias, then justify which is more credible." },
                { q: "Design a study plan to master {focus} using active recall and spaced repetition.", a: "Break the topic into chunks, schedule self-testing across multiple days, and prioritize weak areas based on results." },
                { q: "Identify a possible logical fallacy in a claim about {focus} and explain why it is flawed.", a: "Name the fallacy (e.g., correlation-as-causation or hasty generalization) and explain how the reasoning breaks down." }
            ]
        }
    }
};
