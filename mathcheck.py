"""
Safe math expressions for verifying generated questions.

AI output is untrusted, so nothing here ever calls eval/exec or sympify. A small
recursive-descent parser turns a plain-ASCII expression ("3*sin(2x)^2 + ln(x)")
into a tuple AST, which can then be

  * evaluated numerically (domain errors and overflow become None, never raise),
  * printed as LaTeX for KaTeX (so what is shown is exactly what was verified),
  * checked: derivative, antiderivative, definite integral, limit, or a plain value,
    by numeric sampling against each answer option.

AST nodes are tuples:
  ("num", value, text)   ("var", name)   ("const", "pi" | "e" | "C")
  ("neg", a)   ("+", a, b)   ("-", a, b)   ("*", a, b)   ("/", a, b)   ("^", a, b)
  ("call", fname, a)

Input is bounded (length, node count, nesting depth) so a hostile string cannot
exhaust the server.
"""

from __future__ import annotations

import math
import re
from typing import Callable, Optional

MAX_LEN = 300
MAX_NODES = 250
MAX_DEPTH = 40


class ParseError(ValueError):
    """The expression is not in the supported grammar."""


class _EvalError(Exception):
    """Internal: numeric evaluation left the real domain or overflowed."""


def _sec(v):
    return 1.0 / math.cos(v)


def _csc(v):
    return 1.0 / math.sin(v)


def _cot(v):
    return math.cos(v) / math.sin(v)


FUNCTIONS: dict[str, Callable[[float], float]] = {
    "sin": math.sin, "cos": math.cos, "tan": math.tan,
    "sec": _sec, "csc": _csc, "cot": _cot,
    "asin": math.asin, "acos": math.acos, "atan": math.atan,
    "sinh": math.sinh, "cosh": math.cosh, "tanh": math.tanh,
    "exp": math.exp, "ln": math.log, "log": math.log, "log10": math.log10,
    "sqrt": math.sqrt, "abs": abs,
}
# Common spellings mapped to the canonical name.
FUNCTION_ALIASES = {"arcsin": "asin", "arccos": "acos", "arctan": "atan"}
CONSTANTS = {"pi": math.pi, "e": math.e}

_NAMES_LONGEST_FIRST = sorted(
    list(FUNCTIONS) + list(FUNCTION_ALIASES) + list(CONSTANTS), key=len, reverse=True
)

_UNICODE = {
    "−": "-",  # minus sign
    "–": "-",  # en dash
    "·": "*",  # middle dot
    "×": "*",  # multiplication sign
    "⋅": "*",  # dot operator
    "÷": "/",
    "π": "pi",
    "√": "sqrt",
}
_SUPERSCRIPTS = {
    "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
    "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
    "⁻": "-",
}

_TOKEN_RE = re.compile(
    r"\s*(?:(?P<num>\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\.\d+)|(?P<name>[A-Za-z_][A-Za-z0-9_]*)|(?P<op>\*\*|[-+*/^(),|]))"
)


def _normalize(text: str) -> str:
    out = []
    i = 0
    while i < len(text):
        ch = text[i]
        if ch in _SUPERSCRIPTS:
            run = ""
            while i < len(text) and text[i] in _SUPERSCRIPTS:
                run += _SUPERSCRIPTS[text[i]]
                i += 1
            out.append("^(" + run + ")")
            continue
        out.append(_UNICODE.get(ch, ch))
        i += 1
    return "".join(out)


def _split_name(name: str, variable: Optional[str], allow_c: bool) -> list[tuple[str, str]]:
    """Resolve an identifier into ('func'|'const'|'var', canonical) tokens.

    Models often write implicit products without '*' ("xsin(x)", "2pix"), so an
    unknown identifier is split greedily into known names and the variable.
    Anything that cannot be split completely is rejected.
    """
    parts: list[tuple[str, str]] = []
    i = 0
    while i < len(name):
        rest = name[i:]
        matched = None
        for cand in _NAMES_LONGEST_FIRST:
            if rest.startswith(cand):
                matched = cand
                break
        if matched is not None:
            if matched in CONSTANTS:
                parts.append(("const", matched))
            else:
                parts.append(("func", FUNCTION_ALIASES.get(matched, matched)))
            i += len(matched)
            continue
        ch = rest[0]
        if variable is not None and ch == variable:
            parts.append(("var", ch))
        elif allow_c and ch == "C":
            parts.append(("const", "C"))
        else:
            raise ParseError("unknown name %r" % name)
        i += 1
    return parts


def _tokenize(text: str, variable: Optional[str], allow_c: bool) -> list[tuple[str, str]]:
    if not isinstance(text, str):
        raise ParseError("expression must be a string")
    if len(text) > MAX_LEN:
        raise ParseError("expression too long")
    src = _normalize(text).strip()
    if not src:
        raise ParseError("empty expression")
    tokens: list[tuple[str, str]] = []
    pos = 0
    while pos < len(src):
        m = _TOKEN_RE.match(src, pos)
        if not m or m.end() == pos:
            if src[pos:].strip() == "":
                break
            raise ParseError("unexpected character %r" % src[pos])
        pos = m.end()
        if m.group("num") is not None:
            tokens.append(("num", m.group("num")))
        elif m.group("name") is not None:
            tokens.extend(_split_name(m.group("name"), variable, allow_c))
        else:
            op = m.group("op")
            tokens.append(("op", "^" if op == "**" else op))
    return tokens


class _Parser:
    def __init__(self, tokens: list[tuple[str, str]]):
        self.tokens = tokens
        self.i = 0
        self.depth = 0
        self.nodes = 0

    def peek(self):
        return self.tokens[self.i] if self.i < len(self.tokens) else None

    def take(self):
        tok = self.peek()
        self.i += 1
        return tok

    def expect(self, op: str):
        tok = self.take()
        if tok != ("op", op):
            raise ParseError("expected %r" % op)

    def node(self, n):
        self.nodes += 1
        if self.nodes > MAX_NODES:
            raise ParseError("expression too large")
        return n

    def enter(self):
        self.depth += 1
        if self.depth > MAX_DEPTH:
            raise ParseError("expression nested too deeply")

    def leave(self):
        self.depth -= 1

    def parse(self):
        tree = self.expr()
        if self.peek() is not None:
            raise ParseError("unexpected %r" % (self.peek()[1],))
        return tree

    def expr(self):
        self.enter()
        left = self.term()
        while True:
            tok = self.peek()
            if tok in (("op", "+"), ("op", "-")):
                self.take()
                right = self.term()
                left = self.node((tok[1], left, right))
            else:
                break
        self.leave()
        return left

    def _starts_factor(self, tok) -> bool:
        if tok is None:
            return False
        kind, val = tok
        return kind in ("num", "var", "const", "func") or (kind == "op" and val == "(")

    def term(self):
        self.enter()
        left = self.unary()
        while True:
            tok = self.peek()
            if tok in (("op", "*"), ("op", "/")):
                self.take()
                right = self.unary()
                left = self.node((tok[1], left, right))
            elif self._starts_factor(tok):
                # implicit multiplication: 2x, 3sin(x), (x+1)(x-1), x pi
                right = self.power()
                left = self.node(("*", left, right))
            else:
                break
        self.leave()
        return left

    def unary(self):
        tok = self.peek()
        if tok == ("op", "-"):
            self.take()
            self.enter()
            inner = self.unary()
            self.leave()
            return self.node(("neg", inner))
        if tok == ("op", "+"):
            self.take()
            return self.unary()
        return self.power()

    def power(self):
        base = self.primary()
        if self.peek() == ("op", "^"):
            self.take()
            self.enter()
            exponent = self.unary()  # right-associative; allows x^-2
            self.leave()
            return self.node(("^", base, exponent))
        return base

    def primary(self):
        tok = self.take()
        if tok is None:
            raise ParseError("unexpected end of expression")
        kind, val = tok
        if kind == "num":
            value = float(val)
            if not math.isfinite(value):
                raise ParseError("number out of range")
            return self.node(("num", value, val))
        if kind == "var":
            return self.node(("var", val))
        if kind == "const":
            return self.node(("const", val))
        if kind == "func":
            if self.peek() != ("op", "("):
                raise ParseError("function %s needs parentheses" % val)
            self.take()
            arg = self.expr()
            self.expect(")")
            return self.node(("call", val, arg))
        if tok == ("op", "("):
            inner = self.expr()
            self.expect(")")
            return inner
        if tok == ("op", "|"):
            inner = self.expr()
            self.expect("|")
            return self.node(("call", "abs", inner))
        raise ParseError("unexpected %r" % val)


def _lift_neg(node):
    """Pull a leading minus out of products and quotients: (-2)*cos(u) -> -(2*cos(u)).

    Same value; it only makes the tree print the way people write it ("-2\\cos u",
    "a - 2\\cos u") instead of "(-2)\\cos u".
    """
    kind = node[0]
    if kind in ("num", "var", "const"):
        return node
    if kind == "neg":
        return ("neg", _lift_neg(node[1]))
    if kind == "call":
        return ("call", node[1], _lift_neg(node[2]))
    left, right = _lift_neg(node[1]), _lift_neg(node[2])
    if kind in ("*", "/") and left[0] == "neg":
        return ("neg", (kind, left[1], right))
    return (kind, left, right)


def parse(text: str, variable: Optional[str] = "x", allow_c: bool = False):
    """Parse ASCII math into an AST. Raises ParseError on anything unsupported.

    `variable` is the single free variable allowed (None = no variable at all).
    `allow_c` admits the arbitrary constant C (antiderivative options).
    """
    if variable is not None and (len(variable) != 1 or not variable.isalpha() or variable in ("e", "C")):
        raise ParseError("variable must be one letter (not e or C)")
    tokens = _tokenize(text, variable, allow_c)
    return _lift_neg(_Parser(tokens).parse())


def try_parse(text, variable: Optional[str] = "x", allow_c: bool = False):
    try:
        return parse(text, variable=variable, allow_c=allow_c)
    except ParseError:
        return None


# --- Evaluation ---------------------------------------------------------------

def _eval(node, env: dict[str, float]) -> float:
    kind = node[0]
    if kind == "num":
        return node[1]
    if kind == "var":
        if node[1] not in env:
            raise _EvalError("unbound variable")
        return env[node[1]]
    if kind == "const":
        if node[1] == "C":
            return env.get("C", 0.0)
        return CONSTANTS[node[1]]
    if kind == "neg":
        return -_eval(node[1], env)
    if kind == "call":
        arg = _eval(node[2], env)
        return FUNCTIONS[node[1]](arg)
    a = _eval(node[1], env)
    b = _eval(node[2], env)
    if kind == "+":
        return a + b
    if kind == "-":
        return a - b
    if kind == "*":
        return a * b
    if kind == "/":
        return a / b
    if kind == "^":
        # math.pow raises ValueError for a negative base with a fractional exponent
        # (no silent complex results) and for 0 to a negative power.
        return math.pow(a, b)
    raise _EvalError("unknown node")


def evaluate(node, env: Optional[dict[str, float]] = None) -> Optional[float]:
    """Numeric value, or None if undefined at this point (domain, /0, overflow)."""
    try:
        value = _eval(node, env or {})
    except (_EvalError, ValueError, ZeroDivisionError, OverflowError, TypeError):
        return None
    if isinstance(value, complex) or not math.isfinite(value):
        return None
    return float(value)


# --- Structure helpers ------------------------------------------------------------

def walk(node):
    """Yield every node in the tree (pre-order)."""
    stack = [node]
    while stack:
        n = stack.pop()
        yield n
        kind = n[0]
        if kind in ("num", "var", "const"):
            continue
        if kind == "neg":
            stack.append(n[1])
        elif kind == "call":
            stack.append(n[2])
        else:
            stack.append(n[2])
            stack.append(n[1])


def node_count(node) -> int:
    return sum(1 for _ in walk(node))


def contains_var(node, variable: str = "x") -> bool:
    return any(n[0] == "var" and n[1] == variable for n in walk(node))


def numeric_literals(node) -> set[str]:
    """Distinct numeric literals as written ("3", "0.5"), integers without a trailing .0."""
    out = set()
    for n in walk(node):
        if n[0] == "num":
            out.add(_fmt_number(n[1]))
    return out


def function_names(node) -> set[str]:
    return {n[1] for n in walk(node) if n[0] == "call"}


def _is_bare_var(node, variable):
    return node[0] == "var" and node[1] == variable


def has_composition(node, variable: str = "x") -> bool:
    """True when some function or power is applied to a non-trivial inner expression
    of the variable: sin(3x), (2x+1)^4, e^(x^2), sqrt(x^2+1). This is what makes the
    chain rule necessary."""
    for n in walk(node):
        if n[0] == "call" and contains_var(n[2], variable) and not _is_bare_var(n[2], variable):
            return True
        if n[0] == "^":
            base, exp = n[1], n[2]
            if not contains_var(base, variable) and contains_var(exp, variable) and not _is_bare_var(exp, variable):
                return True  # e^(2x), 3^(x^2)
            if contains_var(base, variable) and not _is_bare_var(base, variable) and not contains_var(exp, variable):
                # (inner)^n with a non-trivial inner: but a monomial like (3x)^2 still counts
                return True
    return False


def _factors(node):
    if node[0] == "*":
        return _factors(node[1]) + _factors(node[2])
    return [node]


def has_product(node, variable: str = "x") -> bool:
    """True when two different factors both depend on the variable (product rule)."""
    for n in walk(node):
        if n[0] == "*":
            varying = [f for f in _factors(n) if contains_var(f, variable)]
            if len(varying) >= 2:
                return True
    return False


def has_quotient(node, variable: str = "x") -> bool:
    for n in walk(node):
        if n[0] == "/" and contains_var(n[1], variable) and contains_var(n[2], variable):
            return True
    return False


def is_polynomial(node, variable: str = "x") -> bool:
    """Sums/products of constants and non-negative integer powers of the bare variable."""
    for n in walk(node):
        kind = n[0]
        if kind == "call":
            return False
        if kind == "/" and contains_var(n[2], variable):
            return False
        if kind == "^":
            if not _is_bare_var(n[1], variable) and contains_var(n[1], variable):
                return False
            if contains_var(n[2], variable):
                return False
            exp = evaluate(n[2])
            if exp is None or exp < 0 or exp != int(exp):
                return False
    return True


# --- LaTeX printing -------------------------------------------------------------------

_LATEX_FUNCS = {
    "sin": "\\sin", "cos": "\\cos", "tan": "\\tan", "sec": "\\sec", "csc": "\\csc", "cot": "\\cot",
    "asin": "\\arcsin", "acos": "\\arccos", "atan": "\\arctan",
    "sinh": "\\sinh", "cosh": "\\cosh", "tanh": "\\tanh",
    "ln": "\\ln", "log": "\\ln", "log10": "\\log_{10}",
}
_TRIG = {"sin", "cos", "tan", "sec", "csc", "cot"}

_PREC = {"+": 1, "-": 1, "*": 2, "/": 2, "neg": 3, "^": 4}


def format_number(value: float) -> str:
    """Public alias: a number as it is written in literals and LaTeX ("3", "0.5")."""
    return _fmt_number(value)


def _fmt_number(value: float) -> str:
    if value == int(value) and abs(value) < 1e15:
        return str(int(value))
    text = repr(float(value))
    return text


def _prec(node) -> int:
    kind = node[0]
    if kind in _PREC:
        return _PREC[kind]
    if kind == "num" and node[1] < 0:
        return 3
    return 5


def _is_tall(node) -> bool:
    return any(n[0] == "/" for n in walk(node))


def _paren(text: str, tall: bool = False) -> str:
    return ("\\left(" + text + "\\right)") if tall else ("(" + text + ")")


def _latex_factor(node) -> str:
    """A factor inside a product: sums and negatives get parentheses."""
    s = to_latex(node)
    if node[0] in ("+", "-", "neg") or (node[0] == "num" and node[1] < 0):
        return _paren(s, _is_tall(node))
    return s


def _starts_with_digit(text: str) -> bool:
    return bool(text) and (text[0].isdigit() or text[0] == ".")


def to_latex(node) -> str:
    """LaTeX for KaTeX, written the way a textbook would (3x^{2}, \\frac{1}{x})."""
    kind = node[0]
    if kind == "num":
        return _fmt_number(node[1]) if node[1] >= 0 else "-" + _fmt_number(-node[1])
    if kind == "var":
        return node[1]
    if kind == "const":
        return "\\pi" if node[1] == "pi" else node[1]
    if kind == "neg":
        inner = node[1]
        s = to_latex(inner)
        if inner[0] in ("+", "-"):
            return "-" + _paren(s, _is_tall(inner))
        return "-" + s
    if kind == "+":
        right = node[2]
        if right[0] == "neg":
            return to_latex(node[1]) + " - " + _sub_rhs(right[1])
        if right[0] == "num" and right[1] < 0:
            return to_latex(node[1]) + " - " + _fmt_number(-right[1])
        return to_latex(node[1]) + " + " + to_latex(right)
    if kind == "-":
        return to_latex(node[1]) + " - " + _sub_rhs(node[2])
    if kind == "/":
        return "\\frac{" + to_latex(node[1]) + "}{" + to_latex(node[2]) + "}"
    if kind == "*":
        factors = _factors(node)
        # A leading coefficient of exactly 1 adds nothing on screen.
        if len(factors) > 1 and factors[0][0] == "num" and factors[0][1] == 1:
            factors = factors[1:]
        out = _latex_factor(factors[0])
        for prev, f in zip(factors, factors[1:]):
            piece = _latex_factor(f)
            need_dot = (
                _starts_with_digit(piece)
                or prev[0] == "num" and f[0] == "num"
                or f[0] == "neg"
            )
            if need_dot:
                out += " \\cdot " + piece
            elif re.search(r"\\[A-Za-z]+$", out) and piece[:1].isalpha():
                out += " " + piece  # "\pi x", never the unknown command "\pix"
            else:
                out += piece
        return out
    if kind == "^":
        base, exp = node[1], node[2]
        exp_s = to_latex(exp)
        if base == ("const", "e"):
            return "e^{" + exp_s + "}"
        if base[0] == "call" and base[1] in _TRIG:
            return _LATEX_FUNCS[base[1]] + "^{" + exp_s + "}" + _paren(to_latex(base[2]), _is_tall(base[2]))
        base_s = to_latex(base)
        if _prec(base) < 5 or base[0] in ("call",):
            base_s = _paren(base_s, _is_tall(base))
        return base_s + "^{" + exp_s + "}"
    if kind == "call":
        name, arg = node[1], node[2]
        arg_s = to_latex(arg)
        if name == "sqrt":
            return "\\sqrt{" + arg_s + "}"
        if name == "exp":
            return "e^{" + arg_s + "}"
        if name == "abs":
            return "\\left|" + arg_s + "\\right|"
        return _LATEX_FUNCS[name] + _paren(arg_s, _is_tall(arg))
    raise ValueError("unknown node")


def _sub_rhs(node) -> str:
    s = to_latex(node)
    if node[0] in ("+", "-", "neg") or (node[0] == "num" and node[1] < 0):
        return _paren(s, _is_tall(node))
    return s


def to_ascii(node) -> str:
    """Canonical ASCII (fully parenthesized where it matters); re-parses to the same value."""
    kind = node[0]
    if kind == "num":
        return _fmt_number(node[1]) if node[1] >= 0 else "(-" + _fmt_number(-node[1]) + ")"
    if kind == "var":
        return node[1]
    if kind == "const":
        return node[1]
    if kind == "neg":
        return "(-" + to_ascii(node[1]) + ")"
    if kind == "call":
        return node[1] + "(" + to_ascii(node[2]) + ")"
    return "(" + to_ascii(node[1]) + node[0] + to_ascii(node[2]) + ")"


# --- Numeric checks ------------------------------------------------------------------

# Deliberately "unround" points so coincidences (sin(pi)=0, integer roots) are rare.
SAMPLE_POINTS = (
    0.13, 0.37, 0.61, 0.89, 1.13, 1.42, 1.77, 2.21, 2.63, 3.07, 3.61, 4.19, 4.83, 5.57,
    -0.17, -0.43, -0.79, -1.27, -1.91, -2.47, -3.33, -4.07,
)
MIN_POINTS = 4


def _f(node, variable):
    def fn(v):
        return evaluate(node, {variable: v})
    return fn


def numeric_derivative(fn, x: float) -> Optional[float]:
    """Central difference with one Richardson step (O(h^4))."""
    h = 1e-3 * max(1.0, abs(x))
    vals = []
    for step in (h, h / 2):
        a, b = fn(x + step), fn(x - step)
        if a is None or b is None:
            return None
        vals.append((a - b) / (2 * step))
    d = (4 * vals[1] - vals[0]) / 3
    return d if math.isfinite(d) else None


def simpson(fn, a: float, b: float, n: int = 2000) -> Optional[float]:
    if a == b:
        return 0.0
    if n % 2:
        n += 1
    h = (b - a) / n
    total = 0.0
    for i in range(n + 1):
        y = fn(a + i * h)
        if y is None:
            return None
        weight = 1 if i in (0, n) else (4 if i % 2 else 2)
        total += weight * y
    value = total * h / 3
    return value if math.isfinite(value) else None


def numeric_limit(fn, p: float) -> Optional[float]:
    """Two-sided limit at p, or None when it does not settle (jump, blow-up, undefined)."""
    def sym(h):
        a, b = fn(p + h), fn(p - h)
        if a is None or b is None:
            return None, None
        return (a + b) / 2, abs(a - b)

    coarse, _ = sym(1e-3)
    fine, gap = sym(1e-5)
    mid, _ = sym(1e-4)
    if coarse is None or fine is None or mid is None:
        return None
    scale = max(1.0, abs(mid))
    if gap > 1e-3 * scale:          # sides disagree: no two-sided limit
        return None
    if abs(coarse - mid) > 1e-3 * scale or abs(mid - fine) > 1e-4 * scale:
        return None                  # not converging
    return mid


def _close(a: float, b: float, rtol: float, atol: float) -> bool:
    return abs(a - b) <= atol + rtol * max(abs(a), abs(b))


def compare_functions(truth_fn, cand_fn, points=SAMPLE_POINTS) -> Optional[bool]:
    """True = equivalent, False = clearly different, None = inconclusive/ambiguous."""
    valid = 0
    different = False
    near_but_not_equal = False
    for x in points:
        t = truth_fn(x)
        c = cand_fn(x)
        if t is None or c is None:
            continue
        valid += 1
        if _close(t, c, rtol=2e-5, atol=1e-7):
            continue
        if _close(t, c, rtol=1e-3, atol=1e-5):
            near_but_not_equal = True
        else:
            different = True
    if different:
        return False
    if valid < MIN_POINTS or near_but_not_equal:
        return None
    return True


_DECIMAL_LITERAL = re.compile(r"^\s*-?\d+\.(\d+)\s*$")


def value_tolerance(option_text: str, truth: float, kind: str) -> float:
    tol = 1e-9 + 1e-6 * max(1.0, abs(truth))
    m = _DECIMAL_LITERAL.match(option_text or "")
    if m:
        tol = max(tol, 0.5 * 10 ** (-len(m.group(1))) * 1.0001)
    if kind == "evaluate":
        # Word problems are usually answered to about three significant figures.
        tol = max(tol, 0.006 * abs(truth))
    return tol


def compare_value(truth: float, option_text: str, value: Optional[float], kind: str) -> Optional[bool]:
    if value is None:
        return None
    tol = value_tolerance(option_text, truth, kind)
    diff = abs(value - truth)
    if diff <= tol:
        return True
    distinct = max(2.5 * tol, 1e-3 * max(1.0, abs(truth)))
    if kind == "evaluate":
        distinct = max(distinct, 0.015 * abs(truth))
    if diff > distinct:
        return False
    return None  # too close to call: an ambiguous distractor


VERIFY_KINDS = ("derivative", "antiderivative", "definite_integral", "limit", "evaluate")


def _num_field(spec, key):
    v = spec.get(key)
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)) and math.isfinite(v):
        return float(v)
    if isinstance(v, str) and v.strip():
        node = try_parse(v, variable=None)
        if node is not None:
            return evaluate(node)
    return None


def check_spec(spec: dict) -> dict:
    """Verify a question's answer options against its math.

    spec: {kind, variable, expression, lower, upper, point, options: [4 ASCII strings]}
    Returns {status: "verified"|"failed"|"invalid", correct_index, matches, reason, method}.
      verified: exactly one option is right and every other option is clearly wrong.
      failed:   the math works, but the options are not a valid single-answer set.
      invalid:  the spec itself cannot be checked (parse error, undefined values).
    """
    def result(status, reason, matches=None, correct=None, method=""):
        return {"status": status, "reason": reason, "matches": matches,
                "correct_index": correct, "method": method}

    if not isinstance(spec, dict):
        return result("invalid", "spec is not an object")
    kind = spec.get("kind")
    if kind not in VERIFY_KINDS:
        return result("invalid", "unsupported kind")
    variable = spec.get("variable") or "x"
    if not isinstance(variable, str):
        return result("invalid", "bad variable")
    options = spec.get("options")
    if not isinstance(options, list) or len(options) < 2 or not all(isinstance(o, str) for o in options):
        return result("invalid", "options must be a list of strings")

    try:
        expr = parse(spec.get("expression") or "", variable=None if kind == "evaluate" else variable)
    except ParseError as e:
        return result("invalid", "expression: %s" % e)

    matches: list[Optional[bool]] = []
    method = ""
    # How each option behaves, so options can also be compared with each other:
    # a function of the variable (derivative / antiderivative), or a number.
    option_fns: list = []
    option_vals: list = []

    if kind in ("derivative", "antiderivative") and spec.get("point") is None:
        if not contains_var(expr, variable):
            return result("invalid", "expression has no variable")
        f = _f(expr, variable)
        for opt in options:
            node = try_parse(opt, variable=variable, allow_c=(kind == "antiderivative"))
            if node is None:
                matches.append(None)
                option_fns.append(None)
                continue
            g = _f(node, variable)
            if kind == "derivative":
                matches.append(compare_functions(lambda x: numeric_derivative(f, x), g))
                option_fns.append(g)
                method = "numeric derivative at sample points"
            else:
                # Antiderivatives that differ by a constant are the same answer, so
                # options are compared through their derivatives.
                dg = (lambda gg: (lambda x: numeric_derivative(gg, x)))(g)
                matches.append(compare_functions(f, dg))
                option_fns.append(dg)
                method = "differentiate each option and compare with the integrand"
    else:
        truth: Optional[float]
        if kind == "derivative":
            point = _num_field(spec, "point")
            if point is None:
                return result("invalid", "point is required")
            truth = numeric_derivative(_f(expr, variable), point)
            method = "numeric derivative at the given point"
        elif kind == "definite_integral":
            lo, hi = _num_field(spec, "lower"), _num_field(spec, "upper")
            if lo is None or hi is None:
                return result("invalid", "bounds are required")
            truth = simpson(_f(expr, variable), lo, hi)
            method = "Simpson's rule, 2000 intervals"
        elif kind == "limit":
            point = _num_field(spec, "point")
            if point is None:
                return result("invalid", "point is required")
            truth = numeric_limit(_f(expr, variable), point)
            method = "two-sided numeric limit"
        elif kind == "antiderivative":
            return result("invalid", "antiderivative takes no point")
        else:  # evaluate
            truth = evaluate(expr)
            method = "direct evaluation"
        if truth is None:
            return result("invalid", "the expression has no finite value here", method=method)
        for opt in options:
            node = try_parse(opt, variable=None)
            value = evaluate(node) if node else None
            option_vals.append((opt, value))
            matches.append(compare_value(truth, opt, value, kind))

    if any(m is None for m in matches):
        idx = [i for i, m in enumerate(matches) if m is None]
        return result("failed", "option(s) %s could not be checked or are too close to the answer"
                      % ",".join(str(i) for i in idx), matches, method=method)
    correct = [i for i, m in enumerate(matches) if m]
    if not correct:
        return result("failed", "no option matches the computed answer", matches, method=method)
    if len(correct) > 1:
        return result("failed", "more than one option is correct", matches, method=method)
    duplicate = _duplicate_pair(option_fns, option_vals, truth if option_vals else None, kind)
    if duplicate:
        return result("failed", "options %d and %d are the same answer" % duplicate, matches, method=method)
    return result("verified", "", matches, correct[0], method)


def _duplicate_pair(option_fns, option_vals, truth, kind):
    """First pair of options that are not clearly different from each other, if any.
    Two identical distractors make a weak, confusing item even when the key is right."""
    if option_fns:
        for i in range(len(option_fns)):
            for j in range(i + 1, len(option_fns)):
                if compare_functions(option_fns[i], option_fns[j]) is not False:
                    return (i, j)
        return None
    for i in range(len(option_vals)):
        for j in range(i + 1, len(option_vals)):
            (ti, vi), (tj, vj) = option_vals[i], option_vals[j]
            tol = max(value_tolerance(ti, truth, kind), value_tolerance(tj, truth, kind))
            gap = max(2.5 * tol, 1e-3 * max(1.0, abs(truth)))
            if kind == "evaluate":
                gap = max(gap, 0.015 * abs(truth))
            if abs(vi - vj) <= gap:
                return (i, j)
    return None
