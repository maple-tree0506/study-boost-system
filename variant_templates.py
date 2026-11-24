"""
Built-in generator for similar calculus questions. No AI call and no API key.

The public demo runs without a key, so similar-question practice would otherwise
be unavailable there. For a small set of AP Calculus skills, a question can be
generated exactly: pick fresh parameters, compute the answer by the rule itself,
and write three distractors that each encode one named misconception (forgetting
the inner derivative, multiplying the derivatives in a product, and so on).

Nothing is taken on faith: every item is re-checked by mathcheck.check_spec
before it leaves this module, and variant_engine runs the same quality gates on
it as on AI output. Skills outside this list get no template, and the app says so
instead of serving an unrelated calculus question.
"""

from __future__ import annotations

import random
import re
from fractions import Fraction
from typing import Callable, Optional

import mathcheck as mc

LEVELS = ("basic", "medium", "challenge")

SKILLS: dict[str, dict] = {
    "power-rule": {
        "concept": "Power rule for derivatives",
        "terms": ["power rule", "exponent"],
        "method": "Bring each exponent down as a coefficient and lower the exponent by one; "
                  "a constant term differentiates to 0.",
    },
    "chain-rule": {
        "concept": "Chain rule",
        "terms": ["chain rule", "inner function", "outer function"],
        "method": "Differentiate the outer function with the inner function left inside it, "
                  "then multiply by the derivative of the inner function.",
    },
    "product-rule": {
        "concept": "Product rule",
        "terms": ["product rule"],
        "method": "Differentiate one factor at a time and add the results: (uv)' = u'v + uv'.",
    },
    "quotient-rule": {
        "concept": "Quotient rule",
        "terms": ["quotient rule", "denominator"],
        "method": "(u/v)' = (u'v - uv') / v^2: keep the order in the numerator and square the denominator.",
    },
    "antiderivative-power": {
        "concept": "Antiderivatives by the reverse power rule",
        "terms": ["antiderivative", "reverse power rule"],
        "method": "Raise each exponent by one and divide by the new exponent (and by the slope of a "
                  "linear inner function), then add C.",
    },
    "definite-integral": {
        "concept": "Definite integrals with the Fundamental Theorem of Calculus",
        "terms": ["antiderivative", "fundamental theorem"],
        "method": "Find an antiderivative F of the integrand, then compute F(upper) - F(lower).",
    },
    "trig-limit": {
        "concept": "Trigonometric limits at 0",
        "terms": ["limit", "sin"],
        "method": "Rewrite the expression so it uses sin(u)/u -> 1 as u -> 0 "
                  "(or 1 - cos u ~ u^2/2), then simplify the constant factors.",
    },
}


# --- ASCII building helpers ------------------------------------------------------------

def num(v) -> str:
    """Exact ASCII for a rational: 3, (5/2), (-3), (-5/2)."""
    v = Fraction(v)
    body = str(abs(v.numerator)) if v.denominator == 1 else "%d/%d" % (abs(v.numerator), v.denominator)
    if v < 0:
        return "(-" + body + ")"
    return body if v.denominator == 1 else "(" + body + ")"


def xpow(p: int, var: str = "x") -> str:
    if p == 0:
        return ""
    if p == 1:
        return var
    return "%s^%d" % (var, p) if p > 0 else "%s^(%d)" % (var, p)


def signed_sum(parts: list[tuple[str, str]]) -> str:
    """[("+", "3*x^2"), ("-", "5*x")] -> "3*x^2 - 5*x"."""
    parts = [p for p in parts if p[1]]
    if not parts:
        return "0"
    out = ("-" if parts[0][0] == "-" else "") + parts[0][1]
    for sign, body in parts[1:]:
        out += " %s %s" % (sign, body)
    return out


def term(coef, *factors: str) -> tuple[str, str]:
    """A signed product: term(-6, "x", "sin(x)") -> ("-", "6*x*sin(x)")."""
    c = Fraction(coef)
    facs = [f for f in factors if f]
    mag = abs(c)
    if not facs:
        body = num(mag)
    elif mag == 1:
        body = "*".join(facs)
    else:
        body = "*".join([num(mag)] + facs)
    return ("-" if c < 0 else "+", body)


def expr(*terms_: tuple[str, str]) -> str:
    return signed_sum(list(terms_))


def poly(terms: list[tuple[Fraction, int]], var: str = "x") -> str:
    return signed_sum([term(c, xpow(p, var)) for c, p in terms if Fraction(c) != 0])


def latex(ascii_expr: str) -> str:
    return mc.to_latex(mc.parse(ascii_expr, allow_c=True))


def _sign(rng: random.Random) -> int:
    return rng.choice((-1, 1))


# --- Skills ----------------------------------------------------------------------------
# Each builder returns (kind, expression, [correct, d1, d2, d3], [notes], explanation,
# stem, extra) with the correct option first. The engine shuffles and letters them.

_DERIV_STEMS = (
    "Find $\\frac{d}{dx}\\left[{f}\\right]$.",
    "If $f(x) = {f}$, which expression equals $f'(x)$?",
    "Differentiate $y = {f}$ with respect to $x$.",
    "Let $g(x) = {f}$. What is $g'(x)$?",
)
_ANTI_STEMS = (
    "Find $\\int {f}\\,dx$.",
    "Which function is an antiderivative of $f(x) = {f}$?",
    "Evaluate the indefinite integral $\\int {f}\\,dx$.",
)


def _stem(rng, stems, f_ascii: str) -> str:
    stem = rng.choice(stems)
    body = latex(f_ascii)
    if "\\int" in stem and mc.parse(f_ascii)[0] in ("+", "-"):
        body = "\\left(" + body + "\\right)"  # \int (3x^2 + 1)\,dx, not \int 3x^2 + 1\,dx
    return stem.replace("{f}", body)


def _power_rule(rng: random.Random, level: str):
    if level == "basic":
        a, n = rng.randint(2, 9), rng.randint(3, 7)
        f = poly([(a, n)])
        correct = poly([(a * n, n - 1)])
        d1 = poly([(a * n, n)])
        d2 = poly([(a, n - 1)])
        d3 = poly([(Fraction(a, n + 1), n + 1)])
        note3 = "Raised the exponent and divided: that is the antiderivative, not the derivative."
        detail = "$\\frac{d}{dx}\\left[%s\\right] = %d \\cdot %d x^{%d} = %s$." % (latex(f), n, a, n - 1, latex(correct))
    elif level == "medium":
        a, n = rng.randint(2, 8), rng.randint(3, 6)
        b, m = _sign(rng) * rng.randint(2, 9), rng.randint(1, n - 1)
        c = _sign(rng) * rng.randint(1, 9)
        f = poly([(a, n), (b, m), (c, 0)])
        correct = poly([(a * n, n - 1), (b * m, m - 1)])
        d1 = poly([(a * n, n), (b * m, m)])
        d2 = poly([(a, n - 1), (b, m - 1)])
        d3 = poly([(a * n, n - 1), (b * m, m - 1), (c, 0)])
        note3 = "Kept the constant term. The derivative of a constant is 0."
        detail = "Term by term: $%s$; the constant $%s$ contributes 0." % (latex(correct), num(c).strip("()"))
    else:
        a, n = rng.randint(2, 6), rng.randint(2, 5)
        b, k = rng.randint(2, 9), rng.randint(1, 3)
        f = expr(term(a, xpow(n)), ("+", "%d/%s" % (b, xpow(k))))
        correct = expr(term(a * n, xpow(n - 1)), ("-", "%d/%s" % (b * k, xpow(k + 1))))
        d1 = expr(term(a * n, xpow(n - 1)), ("+", "%d/%s" % (b * k, xpow(k + 1))))
        d2 = expr(term(a * n, xpow(n - 1)),
                  ("-", "%d/%s" % (b * k, xpow(k - 1))) if k > 1 else term(-b * k))
        d3 = expr(term(a * n, xpow(n)), ("-", "%d/%s" % (b * k, xpow(k))))
        note3 = "Brought the exponents down but did not lower them by one."
        detail = ("Rewrite $\\frac{%d}{%s} = %dx^{-%d}$, then apply the power rule to each term: $%s$."
                  % (b, latex(xpow(k)), b, k, latex(correct)))
        return ("derivative", f, [correct, d1, d2, d3], [
            "Correct: each term follows the power rule, including the negative power.",
            "Sign slip on the negative power: $\\frac{d}{dx}x^{-k} = -kx^{-k-1}$, so that term is negative.",
            "Lowered the negative exponent in the wrong direction: $-k - 1$, not $-k + 1$.",
            note3,
        ], "Power rule: $\\frac{d}{dx}x^{n} = nx^{n-1}$, which also holds for negative exponents. " + detail,
            _stem(rng, _DERIV_STEMS, f), {})
    return ("derivative", f, [correct, d1, d2, d3], [
        "Correct: bring each exponent down as a factor and lower it by one.",
        "Brought the exponent down but did not lower it by one.",
        "Lowered the exponent but forgot to multiply by it.",
        note3,
    ], "Power rule: $\\frac{d}{dx}x^{n} = nx^{n-1}$. " + detail, _stem(rng, _DERIV_STEMS, f), {})


def _inner(rng: random.Random, level: str, outer: str):
    """Inner function u as polynomial terms, and its derivative as (coef, power of x)."""
    if level == "basic":
        a, b = rng.randint(2, 7), _sign(rng) * rng.randint(1, 9)
        if outer in ("ln", "sqrt"):
            b = abs(b)
        return [(a, 1), (b, 0)], (a, 0)
    k = 2 if outer in ("ln", "sqrt") else rng.choice((2, 3))
    a, b = rng.randint(2, 6), rng.randint(1, 9) * (1 if outer in ("ln", "sqrt") else _sign(rng))
    return [(a, k), (b, 0)], (a * k, k - 1)


def _chain_rule(rng: random.Random, level: str):
    if level == "challenge":
        return _chain_rule_nested(rng)
    outers = ["pow", "sin", "cos", "exp"] + (["ln", "sqrt"] if level == "medium" else [])
    outer = rng.choice(outers)
    u_terms, (dc, dp) = _inner(rng, level, outer)
    u = poly(u_terms)
    du = poly([(dc, dp)])
    U = "(" + u + ")"
    lead = ("Chain rule: the outer function is %s and the inner function is $u = %s$, so $u' = %s$. "
            % ("{outer}", latex(u), latex(du)))
    if outer == "pow":
        n = rng.randint(3, 6)
        f = "%s^%d" % (U, n)
        correct = expr(term(n * dc, xpow(dp), "%s^%d" % (U, n - 1)))
        opts = [correct,
                expr(term(n, "%s^%d" % (U, n - 1))),
                expr(term(n * dc, xpow(dp), "%s^%d" % (U, n))),
                expr(term(dc, xpow(dp), "%s^%d" % (U, n - 1)))]
        notes = ["Correct: power rule on the outside, times the inner derivative.",
                 "Forgot to multiply by the derivative of the inner function.",
                 "Multiplied by the inner derivative but did not lower the exponent.",
                 "Dropped the exponent %d that the power rule brings down." % n]
        outer_s = "$u^{%d}$" % n
        step = "$f' = %d u^{%d} \\cdot u' = %s$." % (n, n - 1, latex(correct))
    elif outer == "sin":
        f = "sin" + U
        correct = expr(term(dc, xpow(dp), "cos" + U))
        opts = [correct, "cos" + U, expr(term(-dc, xpow(dp), "cos" + U)), expr(term(dc, xpow(dp), "sin" + U))]
        notes = ["Correct: cosine of the same inner function, times the inner derivative.",
                 "Forgot to multiply by the derivative of the inner function.",
                 "Sign slip: the derivative of sine is +cosine; it is cosine whose derivative is negative.",
                 "Multiplied by the inner derivative but never differentiated the sine."]
        outer_s = "$\\sin(u)$"
        step = "$f' = \\cos(u) \\cdot u' = %s$." % latex(correct)
    elif outer == "cos":
        f = "cos" + U
        correct = expr(term(-dc, xpow(dp), "sin" + U))
        opts = [correct, "-sin" + U, expr(term(dc, xpow(dp), "sin" + U)), expr(term(-dc, xpow(dp), "cos" + U))]
        notes = ["Correct: negative sine of the same inner function, times the inner derivative.",
                 "Forgot to multiply by the derivative of the inner function.",
                 "Lost the minus sign: the derivative of cosine is negative sine.",
                 "Multiplied by the inner derivative but never differentiated the cosine."]
        outer_s = "$\\cos(u)$"
        step = "$f' = -\\sin(u) \\cdot u' = %s$." % latex(correct)
    elif outer == "exp":
        f = "e^" + U
        correct = expr(term(dc, xpow(dp), "e^" + U))
        u_minus_1 = poly([(c, p) for c, p in u_terms if p > 0] + [(sum(c for c, p in u_terms if p == 0) - 1, 0)])
        opts = [correct, "e^" + U, "%s*e^(%s)" % (U, u_minus_1), "%s*e^%s" % (U, U)]
        notes = ["Correct: the exponential is unchanged, times the derivative of the exponent.",
                 "Forgot to multiply by the derivative of the exponent.",
                 "Used the power rule on an exponential; the variable is in the exponent, not the base.",
                 "Multiplied by the inner function itself instead of its derivative."]
        outer_s = "$e^{u}$"
        step = "$f' = e^{u} \\cdot u' = %s$." % latex(correct)
    elif outer == "ln":
        f = "ln" + U
        correct = "%s/%s" % (du, U)
        opts = [correct, "1/" + U, expr(term(dc, xpow(dp), "ln" + U)), "1/(%s)" % du]
        notes = ["Correct: derivative of the inside over the inside.",
                 "Forgot to multiply by the derivative of the inner function.",
                 "Multiplied by the inner derivative but never differentiated the logarithm.",
                 "Took the reciprocal of the inner derivative instead of the inner function."]
        outer_s = "$\\ln(u)$"
        step = "$f' = \\frac{1}{u} \\cdot u' = %s$." % latex(correct)
    else:  # sqrt
        f = "sqrt" + U
        # Simplify the 1/2 into the coefficient when it divides evenly.
        correct = ("%s/sqrt%s" % (poly([(Fraction(dc, 2), dp)]), U) if dc % 2 == 0
                   else "%s/(2*sqrt%s)" % (du, U))
        opts = [correct, "1/(2*sqrt%s)" % U, "%s/sqrt%s" % (du, U),
                expr(term(Fraction(dc, 2), xpow(dp), "sqrt" + U))]
        notes = ["Correct: one half times the inner function to the minus one half, times the inner derivative.",
                 "Forgot to multiply by the derivative of the inner function.",
                 "Dropped the factor 1/2 from the power rule.",
                 "Kept the exponent at 1/2 instead of lowering it to -1/2."]
        outer_s = "$\\sqrt{u}$"
        step = "$f' = \\frac{1}{2\\sqrt{u}} \\cdot u' = %s$." % latex(correct)
    explanation = lead.replace("{outer}", outer_s) + "Then " + step
    return ("derivative", f, opts, notes, explanation, _stem(rng, _DERIV_STEMS, f), {})


def _chain_rule_nested(rng: random.Random):
    form = rng.choice(("trig-power", "exp-trig", "poly-power"))
    a = rng.randint(2, 6)
    if form == "trig-power":
        n = rng.randint(2, 5)
        fn = rng.choice(("sin", "cos"))
        inner = "%s(%d*x)" % (fn, a)
        f = "%s^%d" % (inner, n)
        dfn = "cos" if fn == "sin" else "sin"
        sgn = 1 if fn == "sin" else -1
        correct = expr(term(sgn * n * a, "%s^%d" % (inner, n - 1), "%s(%d*x)" % (dfn, a)))
        opts = [correct,
                expr(term(sgn * n, "%s^%d" % (inner, n - 1), "%s(%d*x)" % (dfn, a))),
                expr(term(n * a, "%s^%d" % (inner, n - 1))),
                expr(term(sgn * n * a, "%s(%d*x)^%d" % (dfn, a, n - 1)))]
        notes = ["Correct: power rule, then the derivative of %s, then the inner derivative %d." % (fn, a),
                 "Stopped one layer early: forgot the derivative %d of the innermost function." % a,
                 "Applied the power rule but never differentiated the %s." % fn,
                 "Differentiated the base in place instead of multiplying by its derivative."]
        explanation = ("Chain rule, applied twice: $f = u^{%d}$ with $u = %s$, and $u' = %s$ needs the chain "
                       "rule again because of the inner function $%dx$. So $f' = %d u^{%d} \\cdot u' = %s$."
                       % (n, latex(inner), latex(expr(term(sgn * a, "%s(%d*x)" % (dfn, a)))), a, n, n - 1,
                          latex(correct)))
    elif form == "exp-trig":
        fn = rng.choice(("sin", "cos"))
        inner = "%s(%d*x)" % (fn, a)
        f = "e^(%s)" % inner
        dfn = "cos" if fn == "sin" else "sin"
        sgn = 1 if fn == "sin" else -1
        correct = expr(term(sgn * a, "%s(%d*x)" % (dfn, a), "e^(%s)" % inner))
        opts = [correct,
                expr(term(sgn, "%s(%d*x)" % (dfn, a), "e^(%s)" % inner)),
                "e^(%s)" % inner,
                expr(term(sgn * a, "%s(%d*x)" % (dfn, a), "e^(%s(%d*x))" % (dfn, a)))]
        notes = ["Correct: the exponential is unchanged, times the derivative of its exponent.",
                 "Forgot the derivative %d of the innermost function." % a,
                 "Forgot to multiply by the derivative of the exponent at all.",
                 "Replaced the exponent by its derivative instead of multiplying by it."]
        explanation = ("Chain rule, applied twice: $f = e^{u}$ with $u = %s$, so $f' = e^{u} \\cdot u'$, and "
                       "$u' = %s$ by the chain rule again. Altogether $f' = %s$."
                       % (latex(inner), latex(expr(term(sgn * a, "%s(%d*x)" % (dfn, a)))), latex(correct)))
    else:
        n = rng.randint(3, 5)
        b = rng.randint(1, 7)
        u = poly([(a, 2), (b, 1)])
        du = poly([(2 * a, 1), (b, 0)])
        f = "(%s)^%d" % (u, n)
        correct = "%d*(%s)*(%s)^%d" % (n, du, u, n - 1)
        opts = [correct,
                "%d*(%s)^%d" % (n, u, n - 1),
                "%d*(%s)*(%s)^%d" % (n, du, u, n),
                "%d*(%s)^%d" % (n, du, n - 1)]
        notes = ["Correct: power rule on the outside, times the derivative of the quadratic inside.",
                 "Forgot to multiply by the derivative of the inner function.",
                 "Multiplied by the inner derivative but did not lower the exponent.",
                 "Applied the power to the inner derivative instead of to the inner function."]
        explanation = ("Chain rule: $f = u^{%d}$ with $u = %s$ and $u' = %s$. So $f' = %d u^{%d} \\cdot u' = %s$."
                       % (n, latex(u), latex(du), n, n - 1, latex(correct)))
    return ("derivative", f, opts, notes, explanation, _stem(rng, _DERIV_STEMS, f), {})


def _product_rule(rng: random.Random, level: str):
    n = rng.randint(2, 4)
    a = rng.choice((1, 1, 2, 3)) if level == "basic" else rng.randint(2, 5)
    u = expr(term(a, xpow(n)))
    du = expr(term(a * n, xpow(n - 1)))
    if level == "challenge":
        b = rng.randint(2, 5)
        g = rng.choice(("exp", "sin"))
        if g == "exp":
            v, dv_terms = "e^(%d*x)" % b, [(b, "e^(%d*x)" % b)]
        else:
            v, dv_terms = "sin(%d*x)" % b, [(b, "cos(%d*x)" % b)]
    else:
        g = rng.choice(("exp", "sin", "cos") + (("ln",) if level == "medium" else ()))
        v = {"exp": "e^x", "sin": "sin(x)", "cos": "cos(x)", "ln": "ln(x)"}[g]
        dv_terms = {"exp": [(1, "e^x")], "sin": [(1, "cos(x)")], "cos": [(-1, "sin(x)")], "ln": [(1, "1/x")]}[g]
    dvc, dvb = dv_terms[0]
    first = term(a * n, xpow(n - 1), v)                         # u'v
    if dvb == "1/x":
        second = term(a * dvc, xpow(n - 1))                     # u * (1/x) = a x^(n-1)
        uv_prime_minus = term(-a * dvc, xpow(n - 1))
        prod_of_derivs = poly([(a * n, n - 2)])
    else:
        second = term(a * dvc, xpow(n), dvb)                    # u v'
        uv_prime_minus = term(-a * dvc, xpow(n), dvb)
        prod_of_derivs = expr(term(a * n * dvc, xpow(n - 1), dvb))
    correct = expr(first, second)
    minus = expr(first, uv_prime_minus)
    only_first = expr(first)
    only_second = expr(second)
    f = expr(term(a, xpow(n), v))
    if g == "exp" and level != "challenge":
        third, third_note = only_second, "Differentiated only the second factor and kept the first as it was."
    else:
        third, third_note = prod_of_derivs, "Multiplied the two derivatives; the product rule is not u'v'."
    opts = [correct, minus, only_first, third]
    notes = ["Correct: u'v + uv', one factor differentiated at a time.",
             "Subtracted the two products; the minus sign belongs to the quotient rule.",
             "Differentiated only the first factor and forgot the uv' term.",
             third_note]
    dv_latex = latex(expr(*[term(c, body) for c, body in dv_terms]))
    explanation = ("Product rule: with $u = %s$ and $v = %s$, $u' = %s$ and $v' = %s$, so "
                   "$(uv)' = u'v + uv' = %s$." % (latex(u), latex(v), latex(du), dv_latex, latex(correct)))
    return ("derivative", f, opts, notes, explanation, _stem(rng, _DERIV_STEMS, f), {})


def _quotient_rule(rng: random.Random, level: str):
    if level == "basic":
        while True:
            a, b = rng.randint(1, 6), _sign(rng) * rng.randint(1, 9)
            c, d = rng.randint(1, 6), _sign(rng) * rng.randint(1, 9)
            if a * d - b * c != 0 and Fraction(a, c) != Fraction(b, d):
                break
        top, bot = poly([(a, 1), (b, 0)]), poly([(c, 1), (d, 0)])
        k = a * d - b * c
        correct = "%s/(%s)^2" % (num(k), bot)
        opts = [correct, "%s/(%s)^2" % (num(-k), bot), "%s/(%s)" % (num(k), bot), num(Fraction(a, c))]
        work = "$\\frac{%d(%s) - %d(%s)}{(%s)^{2}} = %s$" % (a, latex(bot), c, latex(top), latex(bot), latex(correct))
        ratio_note = "Divided the derivatives of the top and the bottom; the quotient rule is not u'/v'."
    elif level == "medium":
        a, b = rng.randint(2, 6), rng.randint(1, 9)
        top, bot = "x^2", poly([(a, 1), (b, 0)])
        numer = poly([(a, 2), (2 * b, 1)])
        correct = "(%s)/(%s)^2" % (numer, bot)
        opts = [correct, "-(%s)/(%s)^2" % (numer, bot), "(%s)/(%s)" % (numer, bot), "2*x/%d" % a]
        work = ("$\\frac{2x(%s) - %d x^{2}}{(%s)^{2}} = %s$" % (latex(bot), a, latex(bot), latex(correct)))
        ratio_note = "Divided the derivatives of the top and the bottom; the quotient rule is not u'/v'."
    else:
        form = rng.choice(("exp", "exp", "sin", "ln"))
        if form == "exp":
            c, k = rng.randint(1, 6), rng.choice((1, 2))
            e = "e^x" if k == 1 else "e^(%d*x)" % k
            top, bot = e, "x^2 + %d" % c
            numer = poly([(k, 2), (-2, 1), (k * c, 0)])          # k(x^2 + c) - 2x
            correct = "%s*(%s)/(%s)^2" % (e, numer, bot)
            opts = [correct, "-%s*(%s)/(%s)^2" % (e, numer, bot), "%s*(%s)/(%s)" % (e, numer, bot),
                    "%s/(2*x)" % (e if k == 1 else "%d*%s" % (k, e))]
            work = ("$\\frac{%s(x^{2} + %d) - %s \\cdot 2x}{(x^{2} + %d)^{2}} = %s$"
                    % (latex(expr(term(k, e))), c, latex(e), c, latex(correct)))
        elif form == "sin":
            n = rng.randint(2, 4)
            top, bot = "sin(x)", xpow(n)
            correct = "(x*cos(x) - %d*sin(x))/x^%d" % (n, n + 1)
            opts = [correct, "(%d*sin(x) - x*cos(x))/x^%d" % (n, n + 1),
                    "(x*cos(x) - %d*sin(x))/x" % n, "cos(x)/(%d*%s)" % (n, xpow(n - 1))]
            work = ("$\\frac{\\cos(x) \\cdot x^{%d} - \\sin(x) \\cdot %dx^{%d}}{x^{%d}} = %s$"
                    % (n, n, n - 1, 2 * n, latex(correct)))
        else:
            n = rng.randint(2, 4)
            top, bot = "ln(x)", xpow(n)
            correct = "(1 - %d*ln(x))/x^%d" % (n, n + 1)
            opts = [correct, "(%d*ln(x) - 1)/x^%d" % (n, n + 1), "(1 - %d*ln(x))/x" % n, "1/(%d*x^%d)" % (n, n)]
            work = ("$\\frac{\\frac{1}{x} \\cdot x^{%d} - \\ln(x) \\cdot %dx^{%d}}{x^{%d}} = %s$"
                    % (n, n, n - 1, 2 * n, latex(correct)))
        ratio_note = "Divided the derivatives of the top and the bottom; the quotient rule is not u'/v'."
    f = "(%s)/(%s)" % (top, bot)
    notes = ["Correct: (u'v - uv') / v^2 in that order, with the denominator squared.",
             "Reversed the numerator to uv' - u'v, which flips the sign.",
             "Forgot to square the denominator.",
             ratio_note]
    explanation = ("Quotient rule: $\\left(\\frac{u}{v}\\right)' = \\frac{u'v - uv'}{v^{2}}$ with $u = %s$ and $v = %s$: %s."
                   % (latex(top), latex(bot), work))
    return ("derivative", f, opts, notes, explanation, _stem(rng, _DERIV_STEMS, f), {})


def _antiderivative(rng: random.Random, level: str):
    if level == "challenge":
        a, b, n = rng.randint(2, 6), _sign(rng) * rng.randint(1, 9), rng.randint(2, 5)
        U = "(" + poly([(a, 1), (b, 0)]) + ")"
        f = "%s^%d" % (U, n)
        correct = "%s^%d/%d + C" % (U, n + 1, a * (n + 1))
        opts = [correct, "%s^%d/%d + C" % (U, n + 1, n + 1), "%d*%s^%d/%d + C" % (a, U, n + 1, n + 1),
                "%d*%s^%d + C" % (n * a, U, n - 1)]
        notes = ["Correct: raise the power, divide by the new power, and divide by the slope %d." % a,
                 "Forgot to divide by the slope %d of the inner linear function." % a,
                 "Multiplied by the slope instead of dividing by it.",
                 "Differentiated instead of finding an antiderivative."]
        explanation = ("Reverse power rule with a linear inner function: $\\int (ax+b)^{n}\\,dx = "
                       "\\frac{(ax+b)^{n+1}}{a(n+1)} + C$. Here $a = %d$ and $n = %d$, giving $%s$. "
                       "Check by differentiating: the chain rule brings back the factor %d."
                       % (a, n, latex(correct), a))
        return ("antiderivative", f, opts, notes, explanation, _stem(rng, _ANTI_STEMS, f), {})
    if level == "basic":
        a, n = rng.randint(2, 9), rng.randint(2, 6)
        terms = [(a, n)]
    else:
        a, n = rng.randint(2, 9), rng.randint(2, 5)
        b, m = _sign(rng) * rng.randint(2, 9), rng.randint(1, n - 1)
        terms = [(a, n), (b, m), (_sign(rng) * rng.randint(2, 9), 0)]
    f = poly(terms)
    anti = [(Fraction(c, p + 1), p + 1) for c, p in terms]
    correct = poly(anti) + " + C"
    nodiv = poly([(c, p + 1) for c, p in terms]) + " + C"
    deriv = poly([(c * p, p - 1) for c, p in terms if p > 0]) + " + C"
    if level == "basic":
        third = poly([(Fraction(a, n), n + 1)]) + " + C"
        third_note = "Divided by the old exponent instead of the new one."
    else:
        third = poly([(Fraction(c, p + 1), p + 1) for c, p in terms if p > 0]) + " + C"
        third_note = "Dropped the constant term; the antiderivative of a constant k is kx."
    opts = [correct, nodiv, deriv, third]
    notes = ["Correct: raise each exponent by one and divide by the new exponent.",
             "Raised the exponents but forgot to divide by the new exponent.",
             "Differentiated instead of finding an antiderivative.",
             third_note]
    explanation = ("Reverse power rule: $\\int x^{n}\\,dx = \\frac{x^{n+1}}{n+1} + C$, term by term: $%s$. "
                   "Differentiating the answer gives back $%s$." % (latex(correct), latex(f)))
    return ("antiderivative", f, opts, notes, explanation, _stem(rng, _ANTI_STEMS, f), {})


def _definite_integral(rng: random.Random, level: str):
    if level == "basic":
        a, n, hi = rng.randint(1, 6), rng.randint(1, 3), rng.randint(2, 4)
        lo = 0
        terms = [(a, n)]
    elif level == "medium":
        lo = rng.randint(1, 2)
        hi = lo + rng.randint(1, 2)
        terms = [(rng.randint(1, 6), 2), (_sign(rng) * rng.randint(1, 9), 0)]
    else:
        lo, hi = -rng.randint(1, 2), rng.randint(1, 3)
        terms = [(rng.randint(1, 4), 2), (_sign(rng) * rng.randint(1, 6), 1), (_sign(rng) * rng.randint(1, 5), 0)]

    def F(x):
        return sum(Fraction(c, p + 1) * Fraction(x) ** (p + 1) for c, p in terms)

    def f_at(x):
        return sum(Fraction(c) * Fraction(x) ** p for c, p in terms)

    truth = F(hi) - F(lo)
    f = poly(terms)
    if lo == 0:
        opts = [num(truth), num(f_at(hi)), num(sum(Fraction(c) * Fraction(hi) ** (p + 1) for c, p in terms)),
                num(sum(Fraction(c * p) * Fraction(hi) ** (p - 1) for c, p in terms if p > 0))]
        notes = ["Correct: antiderivative evaluated at the bounds.",
                 "Evaluated the integrand at the upper bound instead of integrating.",
                 "Raised the exponent but forgot to divide by the new exponent.",
                 "Differentiated the integrand instead of finding an antiderivative."]
    else:
        opts = [num(truth), num(F(hi)), num(f_at(hi) - f_at(lo)), num(F(hi) + F(lo))]
        notes = ["Correct: F(upper) - F(lower).",
                 "Evaluated the antiderivative at the upper bound only and forgot to subtract F(lower).",
                 "Subtracted values of the integrand instead of values of its antiderivative.",
                 "Added F(lower) instead of subtracting it."]
    anti = poly([(Fraction(c, p + 1), p + 1) for c, p in terms])
    explanation = ("Fundamental Theorem of Calculus: with antiderivative $F(x) = %s$, the integral is "
                   "$F(%d) - F(%d) = %s - %s = %s$."
                   % (latex(anti), hi, lo, latex(num(F(hi))),
                      ("(%s)" if F(lo) < 0 else "%s") % latex(num(F(lo))), latex(num(truth))))
    body = latex(f) if len(terms) == 1 else "\\left(%s\\right)" % latex(f)
    stem = "Evaluate $\\int_{%d}^{%d} %s\\,dx$." % (lo, hi, body)
    return ("definite_integral", f, opts, notes, explanation, stem, {"lower": lo, "upper": hi})


def _trig_limit(rng: random.Random, level: str):
    a, b = rng.sample(range(2, 10), 2)
    if level == "challenge":
        a = rng.randint(2, 6)
        f = "(1 - cos(%d*x))/(%d*x^2)" % (a, b)
        truth = Fraction(a * a, 2 * b)
        opts = [num(truth), "0", num(Fraction(a * a, b)), num(Fraction(a, 2 * b))]
        notes = ["Correct: 1 - cos(u) behaves like u^2/2 near 0.",
                 "Substituted x = 0 into the top only; the expression is 0/0, which is not 0.",
                 "Forgot the factor 1/2 in 1 - cos(u) ~ u^2/2.",
                 "Did not square the coefficient %d." % a]
        explanation = ("Near 0, $1 - \\cos(u) \\approx \\frac{u^{2}}{2}$ (equivalently multiply by the conjugate "
                       "and use $\\frac{\\sin u}{u} \\to 1$). With $u = %dx$: $\\frac{(%dx)^{2}/2}{%dx^{2}} = %s$."
                       % (a, a, b, latex(num(truth))))
    else:
        top = "sin" if level == "basic" else rng.choice(("sin", "tan"))
        bottom = "%d*x" % b if level == "basic" else rng.choice(("%d*x" % b, "sin(%d*x)" % b))
        f = "%s(%d*x)/(%s)" % (top, a, bottom)
        truth = Fraction(a, b)
        opts = [num(truth), "1", num(Fraction(b, a)), "0"]
        notes = ["Correct: rewrite to use sin(u)/u -> 1, leaving the ratio of the coefficients.",
                 "Used sin(x)/x -> 1 without adjusting for the coefficients %d and %d." % (a, b),
                 "Inverted the ratio of the coefficients.",
                 "Substituted x = 0 directly; 0/0 is indeterminate, not 0."]
        factors = ["\\frac{\\%s(%dx)}{%dx}" % (top, a, a)]
        if bottom.startswith("sin"):
            factors.append("\\frac{%dx}{\\sin(%dx)}" % (b, b))
        explanation = ("Use $\\lim_{u \\to 0} \\frac{\\sin u}{u} = 1$ (and $\\frac{\\tan u}{u} \\to 1$). Rewrite "
                       "$%s = \\frac{%d}{%d} \\cdot %s$; every fraction after $\\frac{%d}{%d}$ tends to 1, "
                       "so the limit is $%s$." % (latex(f), a, b, " \\cdot ".join(factors), a, b, latex(num(truth))))
    stem = "Evaluate $\\lim_{x \\to 0} %s$." % latex(f)
    return ("limit", f, opts, notes, explanation, stem, {"point": 0})


_BUILDERS: dict[str, Callable[[random.Random, str], tuple]] = {
    "power-rule": _power_rule,
    "chain-rule": _chain_rule,
    "product-rule": _product_rule,
    "quotient-rule": _quotient_rule,
    "antiderivative-power": _antiderivative,
    "definite-integral": _definite_integral,
    "trig-limit": _trig_limit,
}


def expression_key(kind: str, expression: str, extra: dict) -> str:
    """Canonical identity of a generated question, used to avoid repeats."""
    node = mc.parse(expression)
    return "%s|%s|%s|%s" % (kind, mc.to_ascii(node), extra.get("lower"), extra.get("upper"))


def generate(skill: str, level: str, rng: random.Random, avoid_keys: Optional[set] = None,
             attempts: int = 25) -> Optional[dict]:
    """One verified question for the skill, or None if no fresh one could be made."""
    builder = _BUILDERS.get(skill)
    if builder is None:
        return None
    level = level if level in LEVELS else "medium"
    avoid_keys = avoid_keys or set()
    for _ in range(attempts):
        kind, f, opts, notes, explanation, stem, extra = builder(rng, level)
        key = expression_key(kind, f, extra)
        if key in avoid_keys:
            continue
        spec = {"kind": kind, "variable": "x", "expression": f, "options": opts}
        spec.update(extra)
        check = mc.check_spec(spec)
        if check["status"] != "verified" or check["correct_index"] != 0:
            continue  # a parameter choice made two options coincide: draw again
        return {
            "skill": skill,
            "key": key,
            "question": stem,
            "options_ascii": opts,
            "correct_index": 0,
            "option_notes": notes,
            "explanation": explanation,
            "difficulty": level,
            "verification": spec,
        }
    return None


# --- Choosing a skill for a mistake -----------------------------------------------------

_RULE_PATTERNS = (
    ("chain-rule", r"\bchain[\s-]rule\b|\binner (?:function|derivative)\b|\bouter function\b|\bcomposite function\b"),
    ("product-rule", r"\bproduct[\s-]rule\b"),
    ("quotient-rule", r"\bquotient[\s-]rule\b"),
    ("definite-integral", r"\bdefinite integral\b"),
    ("antiderivative-power", r"\breverse power rule\b|\bindefinite integral\b|\bantiderivative\b"),
    ("trig-limit", r"\btrig(?:onometric)? limit\b|\bsin\s*\(?\s*x\s*\)?\s*/\s*x\b"),
    ("power-rule", r"\bpower[\s-]rule\b"),
)


def _first_rule(text: str, allowed: Optional[tuple] = None) -> Optional[str]:
    """The rule mentioned EARLIEST in the text (an explanation leads with its rule)."""
    if not text:
        return None
    best = None
    for skill, pattern in _RULE_PATTERNS:
        if allowed is not None and skill not in allowed:
            continue
        m = re.search(pattern, text, re.IGNORECASE)
        if m and (best is None or m.start() < best[0]):
            best = (m.start(), skill)
    return best[1] if best else None


_EXPLANATION_SKILLS = ("chain-rule", "product-rule", "quotient-rule", "power-rule")


def is_calculus(subject: str) -> bool:
    return "calculus" in (subject or "").lower()


def classify(subject: str, topic: str = "", question: str = "", explanation: str = "",
             hint: str = "") -> Optional[str]:
    """The template skill a mistake practices, or None when no template fits.

    Order of trust: what the student typed as the topic, then the AI's named
    concept, then the integral/limit structure of the question itself, then the
    rule the stored explanation leads with. Non-calculus courses never match: a
    physics mistake about velocity must not turn into a pure calculus drill.
    """
    if not is_calculus(subject):
        return None
    for text in (topic, hint):
        skill = _first_rule(text)
        if skill:
            return skill
    q = question or ""
    if re.search(r"\\int_\s*\{?[^}$]*\}?\s*\^\s*\{?\s*[a-z]\b", q):
        return None  # accumulation function (FTC part 1): no template practices that
    if re.search(r"\\int_\s*\{?\s*-?\d", q):
        return "definite-integral"
    if "\\int" in q and "\\int_" not in q:
        return "antiderivative-power"
    if "\\lim" in q and re.search(r"\\(?:sin|tan|cos)", q) and re.search(r"\\to\s*0\b", q):
        return "trig-limit"
    # Only a derivative rule the explanation LEADS with: "Chain rule: ...", "By the power rule ...".
    first_sentence = re.split(r"(?<=[.!?])\s", (explanation or "").strip(), maxsplit=1)[0][:200]
    return _first_rule(first_sentence, allowed=_EXPLANATION_SKILLS)


def rule_in_text(text: str) -> Optional[str]:
    """The skill a free-text concept name refers to ("Chain rule for composites" -> chain-rule)."""
    return _first_rule(text)


def skill_info(skill: str) -> Optional[dict]:
    info = SKILLS.get(skill)
    if info is None:
        return None
    return dict(info, key=skill)
