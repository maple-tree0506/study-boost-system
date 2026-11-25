"""
Similar-question ("variant") practice: from one missed question to new, checked
practice on the same knowledge point.

    generate_variants(mistake, request, llm, deadline, rng) -> result dict

Pipeline
  1. normalize_mistake / normalize_request: the client payload is untrusted input,
     so every field is type-checked, bounded, and truncated.
  2. AI path (when an `llm` callable is given): one call returns the analysis and a
     small batch of multiple-choice variants as JSON. Each variant must pass
     schema validation and the quality gates below; rejected variants get ONE
     targeted repair call that lists the exact problems.
  3. Template path (no key, the AI failed, or it produced nothing usable): for the
     AP Calculus skills in variant_templates, exact questions are generated and
     run through the same gates.
  4. Honest failure: a VariantError with a code the UI can explain.

Quality gates (an AI response that parses is not assumed to be correct):
  * schema: types, lengths, enums, exactly 4 distinct options, one correct index
  * math: for computable questions the answer key is recomputed from the
    verification spec (mathcheck), every distractor must be clearly wrong, the
    shown options are re-typeset from the checked expressions, and the stem must
    contain the checked function
  * knowledge point: same concept_key as the analysis, the explanation must use
    the concept's terms, and for calculus rules the expression must actually
    require that rule (a chain-rule variant must contain a composition)
  * duplicates: near-copies of the original, of earlier variants, or of each
    other are rejected; "all/none of the above" is banned; KaTeX $ must balance
  * diagnosis: never invented. No recorded answer means "insufficient
    information"; a claimed error whose quoted evidence is not in the student's
    answer is downgraded and marked unconfirmed.

Nothing here stores question text. The server logs only counts and codes.
"""

from __future__ import annotations

import hashlib
import json
import math
import random
import re
import time
import unicodedata
from typing import Callable, Optional

import mathcheck as mc
import variant_templates as vt

LEVELS = ("basic", "medium", "challenge")
CONFIDENCE = ("high", "medium", "low")
MAX_COUNT = 3
DEFAULT_COUNT = 2
DEFAULT_MODEL = "llama-3.3-70b-versatile"
REPAIR_MIN_SECONDS = 8.0          # don't start a repair call with less time than this left
_MODEL_RE = re.compile(r"^[A-Za-z0-9._:/\-]{1,80}$")
_BANNED = (
    re.compile(r"\ball of the above\b", re.I),
    re.compile(r"\bnone of the above\b", re.I),
    re.compile(r"\bboth [a-d] and [a-d]\b", re.I),
)
# "Option A", "answer (B)", "choice C." The word is case-insensitive; the letter must be a
# capital A-D so "the answer a student gives" is not flagged.
_LETTER_REF = re.compile(r"\b(?i:option|choice|answer)s?\s+\(?[A-D]\)?(?![A-Za-z])")
_OPTION_PREFIX = re.compile(r"^\s*\(?([A-Da-d])[.)]\s+")
_PLACEHOLDER = re.compile(r"\{\{\s*expr\s*\}\}")
_QUANT_SUBJECT = re.compile(r"calculus|physics|chemistry|statistic", re.I)


class InputError(ValueError):
    """The request payload is malformed."""


class LLMError(Exception):
    """A failed call to the AI provider, with a code the UI can explain."""

    def __init__(self, code: str, message: str = "", retry_after: Optional[float] = None):
        super().__init__(message or code)
        self.code = code
        self.retry_after = retry_after


class VariantError(Exception):
    """No variants could be produced. `analysis` is returned when one exists."""

    def __init__(self, code: str, message: str, retry_after: Optional[float] = None,
                 analysis: Optional[dict] = None, meta: Optional[dict] = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.retry_after = retry_after
        self.analysis = analysis
        self.meta = meta or {}


# --- small text helpers ----------------------------------------------------------------

def _clip(text: str, limit: int) -> str:
    text = text or ""
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _str(value, limit: int) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        raise InputError("expected text")
    return value.strip()[:limit]


def balanced_dollars(text: str) -> bool:
    return (text or "").replace("\\$", "").count("$") % 2 == 0


def slug(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return s[:60]


_SUPERS = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹⁻", "0123456789-")
_SUBS = str.maketrans("₀₁₂₃₄₅₆₇₈₉", "0123456789")


def normalize_text(text: str) -> str:
    """Lowercase, LaTeX/markup-insensitive form used for comparisons."""
    t = unicodedata.normalize("NFKC", text or "")
    t = t.translate(_SUPERS).translate(_SUBS)
    t = re.sub(r"\\(?:left|right|displaystyle|mathrm|text|operatorname)\b", " ", t)
    t = re.sub(r"\\([A-Za-z]+)", r" \1 ", t)       # \sin -> sin, \frac -> frac
    t = t.lower()
    t = re.sub(r"[^a-z0-9.]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


_STRUCTURAL = re.compile(r"\\(?:d?frac|tfrac|left|right|cdot|times|displaystyle|text|mathrm|operatorname|quad|qquad)(?![A-Za-z])")


def _compact(text: str) -> str:
    """Letters and digits only. Layout commands vanish (\\frac{1}{x} -> 1x); function
    names stay (\\cos -> cos), so "$\\cos(3x^2)$" and "cos(3x²)" compare equal."""
    t = unicodedata.normalize("NFKC", text or "").translate(_SUPERS).translate(_SUBS)
    t = _STRUCTURAL.sub("", t)
    return re.sub(r"[^a-z0-9]", "", t.lower())


def option_key(text: str) -> str:
    """Identity of an answer option. Unlike normalize_text it keeps signs and operators:
    "-6x\\sin(3x^2)" and "6x\\sin(3x^2)" are different answers."""
    t = unicodedata.normalize("NFKC", text or "").replace("\u2212", "-")
    t = re.sub(r"\\(?:left|right)(?![A-Za-z])|\\[,;!]|\$|\s+", "", t)
    return t.lower()


def _tokens(text: str) -> list[str]:
    return [w for w in normalize_text(text).split(" ") if w]


def _numbers(text: str) -> list[str]:
    return sorted(re.findall(r"\d+(?:\.\d+)?", normalize_text(text)))


def similarity(a: str, b: str) -> float:
    """Jaccard similarity of normalized word sets (1.0 = same words)."""
    ta, tb = set(_tokens(a)), set(_tokens(b))
    if not ta and not tb:
        return 1.0
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def is_near_copy(a: str, b: str) -> bool:
    """A near-copy keeps the wording AND the numbers. Changing the numbers, the function,
    or the scenario is exactly what a variant should do, so that is not a copy."""
    if not a or not b:
        return False
    na, nb = normalize_text(a), normalize_text(b)
    if na == nb:
        return True
    return similarity(a, b) >= 0.85 and _numbers(a) == _numbers(b)


# --- input -------------------------------------------------------------------------------

def normalize_mistake(raw) -> dict:
    if not isinstance(raw, dict):
        raise InputError("mistake is required")
    question = _str(raw.get("question"), 2000)
    answer = _str(raw.get("answer"), 1500)
    if not question:
        raise InputError("mistake.question is required")
    if not answer:
        raise InputError("mistake.answer is required")
    options_raw = raw.get("options")
    options: list[str] = []
    if isinstance(options_raw, list):
        for o in options_raw[:6]:
            if isinstance(o, str) and o.strip():
                options.append(o.strip()[:400])
    elif options_raw not in (None, ""):
        raise InputError("mistake.options must be a list")
    difficulty = raw.get("difficulty")
    return {
        "id": _str(raw.get("id"), 64),
        "subject": _str(raw.get("subject"), 120) or "Uncategorized",
        "topic": _str(raw.get("topic"), 120),
        "type": "Multiple Choice" if len(options) >= 2 else "Short Answer",
        "question": question,
        "options": options if len(options) >= 2 else [],
        "answer": answer,
        "userAnswer": _str(raw.get("userAnswer"), 1500),
        "explanation": _str(raw.get("explanation"), 1500),
        "difficulty": difficulty if difficulty in LEVELS else None,
    }


def normalize_request(body: dict, mistake: dict) -> dict:
    count = body.get("count", DEFAULT_COUNT)
    if isinstance(count, bool) or not isinstance(count, (int, float)) or not math.isfinite(count):
        count = DEFAULT_COUNT
    count = max(1, min(MAX_COUNT, int(count)))
    level = body.get("level")
    if level not in LEVELS:
        level = mistake.get("difficulty") or "medium"
    avoid = []
    if isinstance(body.get("avoid"), list):
        for a in body["avoid"][:12]:
            if isinstance(a, str) and a.strip():
                avoid.append(a.strip()[:300])
    model = body.get("model")
    if not (isinstance(model, str) and _MODEL_RE.match(model.strip())):
        model = None
    return {
        "count": count,
        "level": level,
        "relation": relation(mistake.get("difficulty") or "medium", level),
        "avoid": avoid,
        "analysis": client_analysis(body.get("analysis"), mistake),
        "model": model.strip() if model else None,
    }


def relation(original: str, target: str) -> str:
    o = LEVELS.index(original) if original in LEVELS else 1
    t = LEVELS.index(target) if target in LEVELS else 1
    return "same" if o == t else ("easier" if t < o else "harder")


# --- analysis ------------------------------------------------------------------------------

_STOP = {"the", "and", "for", "with", "from", "into", "rule", "using", "of", "a", "an", "to", "in", "on"}


def _terms_from(text: str) -> list[str]:
    words = [w for w in re.findall(r"[a-z][a-z'-]{2,}", (text or "").lower()) if w not in _STOP]
    return words[:4]


def _insufficient(reason: str) -> dict:
    return {"status": "insufficient_information", "likelyError": None, "evidence": None,
            "confidence": None, "grounded": False, "source": "none", "reason": reason}


NO_ANSWER_REASON = "No answer was recorded for this mistake, so the specific error can't be diagnosed."


def _grounded(evidence: str, user_answer: str) -> bool:
    """The quoted evidence really appears in what the student wrote."""
    ev, ua = _compact(evidence), _compact(user_answer)
    if not ev or not ua:
        return False
    if ev in ua:
        return True
    words = set(_tokens(evidence))
    return len(words) >= 3 and len(words & set(_tokens(user_answer))) / len(words) >= 0.8


def diagnosis_from_ai(raw, mistake: dict) -> dict:
    if not mistake.get("userAnswer"):
        return _insufficient(NO_ANSWER_REASON)
    if not isinstance(raw, dict) or raw.get("status") != "diagnosed":
        return _insufficient("The answer on file doesn't show enough of the reasoning to tell what went wrong.")
    likely = raw.get("likely_error")
    if not isinstance(likely, str) or not (8 <= len(likely.strip()) <= 400):
        return _insufficient("The answer on file doesn't show enough of the reasoning to tell what went wrong.")
    confidence = raw.get("confidence") if raw.get("confidence") in CONFIDENCE else "low"
    evidence = raw.get("evidence") if isinstance(raw.get("evidence"), str) else ""
    grounded = _grounded(evidence, mistake["userAnswer"])
    if not grounded:
        # A diagnosis whose quote is not in the student's answer is a guess: say so.
        confidence = "low"
    return {"status": "diagnosed", "likelyError": likely.strip(), "evidence": _clip(evidence.strip(), 200) or None,
            "confidence": confidence, "grounded": grounded, "source": "ai", "reason": None}


def analysis_from_ai(raw, mistake: dict) -> tuple[Optional[dict], list[str]]:
    errors: list[str] = []
    if not isinstance(raw, dict):
        return None, ["analysis is missing or not an object"]
    core = raw.get("core_concept")
    if not isinstance(core, str) or not (3 <= len(core.strip()) <= 120):
        errors.append("analysis.core_concept must be a short phrase")
        core = ""
    key = slug(raw.get("concept_key") if isinstance(raw.get("concept_key"), str) else "") or slug(core)
    if len(key) < 2:
        errors.append("analysis.concept_key is missing")
    terms = raw.get("concept_terms")
    if isinstance(terms, list):
        terms = [t.strip() for t in terms if isinstance(t, str) and 2 <= len(t.strip()) <= 60][:6]
    else:
        terms = []
    if not terms:
        terms = _terms_from(core)
    method = raw.get("solution_method")
    if not isinstance(method, str) or not (10 <= len(method.strip()) <= 700):
        errors.append("analysis.solution_method must be 1-2 sentences")
        method = ""
    difficulty = raw.get("difficulty") if raw.get("difficulty") in LEVELS else (mistake.get("difficulty") or "medium")
    if errors:
        return None, errors
    return {
        "coreConcept": core.strip(),
        "conceptKey": key,
        "conceptTerms": terms,
        "solutionMethod": method.strip(),
        "difficulty": difficulty,
        "diagnosis": diagnosis_from_ai(raw.get("error_diagnosis"), mistake),
        "source": "ai",
    }, []


def client_analysis(raw, mistake: dict) -> Optional[dict]:
    """An analysis the client stored from an earlier round. Re-validated, never trusted."""
    if not isinstance(raw, dict):
        return None
    try:
        core = _str(raw.get("coreConcept"), 120)
        key = slug(_str(raw.get("conceptKey"), 60))
        method = _str(raw.get("solutionMethod"), 700)
    except InputError:
        return None
    terms = raw.get("conceptTerms")
    terms = [t.strip()[:60] for t in terms if isinstance(t, str) and t.strip()][:6] if isinstance(terms, list) else []
    if len(core) < 3 or len(key) < 2:
        return None
    diag = raw.get("diagnosis") if isinstance(raw.get("diagnosis"), dict) else {}
    if diag.get("status") == "diagnosed" and mistake.get("userAnswer") and isinstance(diag.get("likelyError"), str):
        diagnosis = {
            "status": "diagnosed",
            "likelyError": diag["likelyError"].strip()[:400],
            "evidence": diag["evidence"].strip()[:200] if isinstance(diag.get("evidence"), str) else None,
            "confidence": diag.get("confidence") if diag.get("confidence") in CONFIDENCE else "low",
            # recomputed, never taken from the browser
            "grounded": _grounded(diag["evidence"], mistake["userAnswer"]) if isinstance(diag.get("evidence"), str) else False,
            "source": diag.get("source") if diag.get("source") in ("ai", "explanation") else "ai",
            "reason": None,
        }
    else:
        diagnosis = _insufficient(NO_ANSWER_REASON if not mistake.get("userAnswer") else
                                  (diag.get("reason") if isinstance(diag.get("reason"), str) else
                                   "The answer on file doesn't show enough of the reasoning to tell what went wrong.")[:300])
    source = raw.get("source") if raw.get("source") in ("ai", "template", "offline") else "ai"
    return {
        "coreConcept": core,
        "conceptKey": key,
        "conceptTerms": terms or _terms_from(core),
        "solutionMethod": method,
        "difficulty": raw.get("difficulty") if raw.get("difficulty") in LEVELS else (mistake.get("difficulty") or "medium"),
        "diagnosis": diagnosis,
        "source": source,
    }


_QUOTE = re.compile(r"[\"'‘“]([^\"'’”]{1,80})[\"'’”]")


def diagnose_offline(mistake: dict) -> dict:
    """Ground a diagnosis in authored content, without AI.

    Bank explanations name the trap behind each tempting distractor ("'5x⁵' is the
    trap of ..."). When the student's pick is one of those quoted distractors, that
    authored sentence is real evidence about the likely error. Otherwise: say that
    there is not enough information.
    """
    user = mistake.get("userAnswer") or ""
    if not user:
        return _insufficient(NO_ANSWER_REASON)
    explanation = mistake.get("explanation") or ""
    if mistake.get("type") != "Multiple Choice" or not explanation:
        return _insufficient("Without the AI connection, only multiple-choice picks named in the "
                             "question's explanation can be diagnosed.")
    picked = _compact(_OPTION_PREFIX.sub("", user))
    if not picked:
        return _insufficient(NO_ANSWER_REASON)
    for sentence in re.split(r"(?<=[.!?])\s+", explanation):
        for m in _QUOTE.finditer(sentence):
            if _compact(m.group(1)) == picked:
                return {"status": "diagnosed", "likelyError": _clip(sentence.strip(), 300),
                        "evidence": _clip(_OPTION_PREFIX.sub("", user), 200), "confidence": "medium",
                        "grounded": True, "source": "explanation", "reason": None}
    return _insufficient("The question's explanation doesn't describe the option you picked, so the "
                         "specific error can't be confirmed.")


def offline_analysis(mistake: dict, skill: Optional[str]) -> dict:
    info = vt.skill_info(skill) if skill else None
    if info:
        core, key, terms, method = info["concept"], info["key"], list(info["terms"]), info["method"]
    elif mistake.get("topic"):
        core, key, terms, method = mistake["topic"], slug(mistake["topic"]), _terms_from(mistake["topic"]), ""
    else:
        core, key, terms, method = "", "", [], ""
    return {
        "coreConcept": core,
        "conceptKey": key,
        "conceptTerms": terms,
        "solutionMethod": method,
        "difficulty": mistake.get("difficulty") or "medium",
        "diagnosis": diagnose_offline(mistake),
        "source": "template" if info else "offline",
    }


# --- prompts --------------------------------------------------------------------------------

SYSTEM_PROMPT = """You write "similar question" practice for an AP student who answered a question incorrectly.
Return ONLY one JSON object, no markdown: {"analysis": {...}, "variants": [...]}
(If told the analysis is already known, return {"variants": [...]} only.)

analysis:
  core_concept     the one knowledge point the ORIGINAL question tests (max 8 words)
  concept_key      kebab-case id for it, e.g. "chain-rule"
  concept_terms    2-5 short terms a correct solution uses, e.g. ["chain rule", "inner function"]
  solution_method  1-2 sentences: how to solve the original question
  difficulty       "basic" | "medium" | "challenge"
  error_diagnosis  {"status": "diagnosed" | "insufficient_information", "likely_error": string or null,
                    "evidence": words copied exactly from the student's answer, or null,
                    "confidence": "high" | "medium" | "low" | null}
    Diagnose ONLY from the student's answer. If there is no answer, or it does not show the reasoning,
    use "insufficient_information" with nulls. Never invent a reason.

variants: multiple-choice questions on the SAME core concept at the requested difficulty. Change the numbers,
functions, context, or wording. Never copy the original or any question listed under "Avoid".
Each variant:
  question         the stem; math in LaTeX inside $...$
  options          4 answer texts WITHOUT letter labels; exactly one correct; each wrong option shows one real misconception
  correct_option   index 0-3 of the correct option
  explanation      2-4 sentences: why the correct option is right, showing the key step; never refer to options by letter
  option_notes     4 strings in option order: the misconception behind each wrong option, "correct" for the right one
  concept_key      same as analysis.concept_key
  difficulty       the requested level
  changes          1-3 short phrases: what differs from the original
  verification     lets a program check the answer:
    {"kind": "derivative" | "antiderivative" | "definite_integral" | "limit" | "evaluate", "variable": "x",
     "expression": ASCII math, "lower": number or null, "upper": number or null, "point": number or null,
     "options": the 4 options as ASCII math, same order}
    derivative: expression is f; options are f'(x), or numbers f'(point) when point is set
    antiderivative: expression is the integrand; options may end in "+ C"
    definite_integral: expression is the integrand; lower and upper are the bounds; options are numbers
    limit: expression is the function; point is where the variable approaches; options are numbers
    evaluate: expression is the arithmetic that gives the answer (no variable); options are plain numbers
    Use {"kind": "none"} only when the answer is not a computed quantity.
    ASCII math: + - * / ^ ( ), numbers, the variable, pi, e, sin cos tan sec csc cot asin acos atan
    sinh cosh tanh exp ln sqrt abs (ln is the natural log).
    For derivative, antiderivative, definite_integral and limit, write the function in the question as {{expr}}
    inside $...$, e.g. "Find $\\frac{d}{dx}\\left[{{expr}}\\right]$". It is typeset from verification.expression."""

RELATION_TEXT = {
    "same": "the same difficulty as the original",
    "easier": "one step EASIER than the original: fewer steps and simpler numbers, same concept",
    "harder": "one step HARDER than the original: one extra step or a less familiar setup, same concept",
}


def build_user_prompt(mistake: dict, req: dict, known: Optional[dict], count: int,
                      extra_avoid: Optional[list] = None) -> str:
    lines = [
        "Course: " + mistake["subject"],
        "Topic the student entered: " + (mistake["topic"] or "(none)"),
        "Original question: " + _clip(mistake["question"], 1500),
    ]
    if mistake["options"]:
        lines.append("Options: " + " | ".join(_clip(o, 200) for o in mistake["options"]))
    lines.append("Correct answer: " + _clip(mistake["answer"], 600))
    lines.append("Student's answer: " + (_clip(mistake["userAnswer"], 600) if mistake["userAnswer"] else "(not recorded)"))
    if mistake["explanation"]:
        lines.append("Explanation on file: " + _clip(mistake["explanation"], 700))
    lines.append("Original difficulty: " + (mistake["difficulty"] or "unknown"))
    if known:
        lines.append("The analysis is already known; return only variants. core_concept: %s; concept_key: %s; "
                     "concept_terms: %s" % (known["coreConcept"], known["conceptKey"], ", ".join(known["conceptTerms"])))
    lines.append('Write %d variant(s) at difficulty "%s" (%s).' % (count, req["level"], RELATION_TEXT[req["relation"]]))
    avoid = list(req["avoid"]) + list(extra_avoid or [])
    if avoid:
        lines.append("Avoid (already used):")
        lines.extend("- " + _clip(a, 200) for a in avoid[:10])
    return "\n".join(lines)


def max_tokens_for(count: int, with_analysis: bool) -> int:
    return min(2200, (420 if with_analysis else 80) + 520 * count)


def parse_json_object(content: str) -> Optional[dict]:
    if not isinstance(content, str):
        return None
    text = content.strip()
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else None
    except ValueError:
        pass
    a, b = text.find("{"), text.rfind("}")
    if a == -1 or b <= a:
        return None
    try:
        data = json.loads(text[a:b + 1])
        return data if isinstance(data, dict) else None
    except ValueError:
        return None


# --- variant validation ----------------------------------------------------------------------

def _as_strings(values) -> Optional[list]:
    """Option lists as strings. Models often write computed answers as bare numbers."""
    if not isinstance(values, list):
        return None
    out = []
    for v in values:
        if isinstance(v, str):
            out.append(v)
        elif isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v):
            out.append(mc.format_number(float(v)))
        else:
            return None
    return out


def _strip_prefix(option: str) -> str:
    return _OPTION_PREFIX.sub("", option, count=1).strip()


def _correct_index(raw: dict, options: list[str]) -> Optional[int]:
    as_index = "correct_option" in raw          # the schema's field is an index;
    val = raw.get("correct_option", raw.get("answer"))  # "answer" may hold the option text
    if isinstance(val, bool):
        return None
    if isinstance(val, (int, float)) and float(val).is_integer() and 0 <= int(val) < len(options):
        return int(val)
    if isinstance(val, str):
        v = val.strip()
        if as_index and re.fullmatch(r"[0-3]", v) and int(v) < len(options):
            return int(v)
        if re.fullmatch(r"[A-Da-d]", v):
            idx = "abcd".index(v.lower())
            return idx if idx < len(options) else None
        m = _OPTION_PREFIX.match(v)
        if m and len(_strip_prefix(v)) == 0:
            idx = "abcd".index(m.group(1).lower())
            return idx if idx < len(options) else None
        target = option_key(_strip_prefix(v))
        hits = [i for i, o in enumerate(options) if option_key(o) == target]
        if len(hits) == 1:
            return hits[0]
    return None


def _wrap_needed(before: str) -> bool:
    tail = before.rstrip()
    return not (tail.endswith(("[", "(", "=", "\\left[", "\\left(", "{")))


def substitute_placeholder(question: str, expr_node) -> str:
    """Put the checked expression into the stem where the model wrote {{expr}}."""
    latex = mc.to_latex(expr_node)

    def repl(m):
        before = question[: m.start()]
        inside_math = before.replace("\\$", "").count("$") % 2 == 1
        if not inside_math:
            return "$" + latex + "$"   # standalone: nothing around it to bind to
        if expr_node[0] in ("+", "-") and _wrap_needed(before):
            return "\\left(" + latex + "\\right)"
        return latex

    return _PLACEHOLDER.sub(repl, question)


_NUM_IN_DISPLAY = re.compile(r"-?\d+(?:\.\d+)?")


def display_number(text: str) -> Optional[float]:
    """The number an option shows ("$9.9$ m/s", "45%", "$3.2 \\times 10^{-4}$", "\\frac{3}{4}")."""
    t = (text or "").replace("$", " ").replace("\u2212", "-").replace("\\,", "").replace("\\!", "")
    t = t.replace("{,}", "").replace("\\%", "%")
    m = re.search(r"\\frac\{\s*(-?\d+(?:\.\d+)?)\s*\}\{\s*(-?\d+(?:\.\d+)?)\s*\}", t)
    if m:
        den = float(m.group(2))
        return float(m.group(1)) / den if den else None
    m = re.search(r"(-?\d+(?:\.\d+)?)\s*(?:\\times|\\cdot|×|\*|x)\s*10\s*\^\s*\{?\s*(-?\d+)\s*\}?", t)
    if m:
        return float(m.group(1)) * 10 ** int(m.group(2))
    m = re.search(r"(-?\d+(?:\.\d+)?)\s*[eE]\s*(-?\d+)\b", t)
    if m:
        return float(m.group(1)) * 10 ** int(m.group(2))
    m = re.search(r"(-?\d+(?:\.\d+)?)\s*%", t)
    if m:
        return float(m.group(1)) / 100.0
    m = _NUM_IN_DISPLAY.search(t)
    return float(m.group(0)) if m else None


def _stem_mentions(question: str, expr_node, spec: dict, share: float = 0.75) -> bool:
    """The stem shows the checked math: most of its numbers and all of its functions appear.
    Word problems (`share` 0.5) may leave formula constants such as 1/2 or g out of the stem."""
    q = normalize_text(question)
    q_numbers = set(re.findall(r"\d+(?:\.\d+)?", q))
    needed = {n for n in mc.numeric_literals(expr_node) if n not in ("0", "1")}
    for key in ("lower", "upper", "point"):
        v = spec.get(key)
        if isinstance(v, (int, float)) and not isinstance(v, bool) and v not in (0, 1):
            needed.add(mc.format_number(abs(float(v))))
    if needed and len(needed & q_numbers) < max(1, math.ceil(share * len(needed))):
        return False
    aliases = {"exp": ("e", "exp"), "log": ("ln", "log"), "sqrt": ("sqrt",), "abs": ("|", "abs")}
    for fn in mc.function_names(expr_node):
        names = aliases.get(fn, (fn,))
        if not any(n in question or n in q.split(" ") for n in names):
            return False
    return True


_STRUCTURE_CHECKS = {
    "chain-rule": (("derivative", "antiderivative", "definite_integral"), lambda n: mc.has_composition(n)),
    "product-rule": (("derivative",), lambda n: mc.has_product(n)),
    "quotient-rule": (("derivative",), lambda n: mc.has_quotient(n) or mc.has_product(n)),
    "power-rule": (("derivative",), lambda n: not mc.function_names(n) and not mc.has_composition(n)),
}
_KIND_FOR_SKILL = {
    "antiderivative-power": ("antiderivative",),
    "definite-integral": ("definite_integral",),
    "trig-limit": ("limit",),
}


def concept_family(analysis: dict) -> Optional[str]:
    text = " ".join([analysis.get("conceptKey", "").replace("-", " "), analysis.get("coreConcept", "")]
                    + list(analysis.get("conceptTerms") or []))
    return vt.rule_in_text(text)


def _concept_used(text: str, terms: list[str]) -> bool:
    norm = " " + normalize_text(text) + " "
    for term in terms:
        t = normalize_text(term)
        if t and (" " + t + " ") in norm:
            return True
        # also accept the term's main word ("chain" for "chain rule")
        words = [w for w in t.split(" ") if len(w) >= 4 and w not in _STOP]
        if words and all((" " + w) in norm for w in words[:1]):
            return True
    return False


def validate_variant(raw, analysis: dict, mistake: dict, level: str) -> tuple[Optional[dict], list[str]]:
    """Schema + quality gates for one AI variant. Returns (variant, []) or (None, problems)."""
    if not isinstance(raw, dict):
        return None, ["variant is not an object"]
    problems: list[str] = []

    question = raw.get("question")
    if not isinstance(question, str) or not (12 <= len(question.strip()) <= 1500):
        return None, ["question must be 12-1500 characters"]
    question = question.strip()

    options = _as_strings(raw.get("options"))
    if options is None or len(options) != 4:
        return None, ["options must be exactly 4 strings"]
    options = [_strip_prefix(o) for o in options]
    if any(not (1 <= len(o) <= 300) for o in options):
        return None, ["each option must be 1-300 characters"]
    if len({option_key(o) for o in options}) != 4:
        problems.append("two options are identical")
    if any(rx.search(o) for o in options for rx in _BANNED):
        problems.append('"all/none of the above" style options are not allowed')

    correct = _correct_index(raw, options)
    if correct is None:
        return None, ["correct_option must be an index 0-3 that points at one option"]

    explanation = raw.get("explanation")
    if not isinstance(explanation, str) or not (40 <= len(explanation.strip()) <= 1500):
        problems.append("explanation must be 2-4 sentences (40+ characters)")
        explanation = ""
    explanation = explanation.strip()
    if explanation and _compact(explanation) == _compact(options[correct]):
        problems.append("explanation only restates the answer")
    if explanation and _LETTER_REF.search(explanation):
        problems.append("explanation refers to an option by letter (options are shuffled)")

    notes = raw.get("option_notes")
    if isinstance(notes, list) and len(notes) == 4 and all(isinstance(n, str) for n in notes):
        notes = [_clip(n.strip(), 300) for n in notes]
    else:
        notes = None

    concept_key = raw.get("concept_key")
    if isinstance(concept_key, str) and concept_key.strip() and slug(concept_key) != analysis["conceptKey"]:
        problems.append('concept_key "%s" differs from the analysed concept "%s"' % (slug(concept_key), analysis["conceptKey"]))
    if raw.get("difficulty") in LEVELS and raw.get("difficulty") != level:
        problems.append('difficulty is "%s" but "%s" was requested' % (raw.get("difficulty"), level))
    if explanation and not _concept_used(question + " " + explanation, analysis["conceptTerms"] + [analysis["coreConcept"]]):
        problems.append("the explanation never uses the concept (%s)" % ", ".join(analysis["conceptTerms"][:3]))

    changes = raw.get("changes")
    changes = [_clip(c.strip(), 120) for c in changes if isinstance(c, str) and c.strip()][:3] if isinstance(changes, list) else []

    # --- math verification -----------------------------------------------------------
    verification = {"status": "not_applicable", "method": ""}
    ver = raw.get("verification")
    kind = ver.get("kind") if isinstance(ver, dict) else "none"
    if kind not in mc.VERIFY_KINDS and kind not in ("none", None, ""):
        # A check was attempted under a name we don't know: ask for a fix rather than
        # quietly accepting the variant as unchecked.
        problems.append("verification kind must be one of %s, or none" % ", ".join(mc.VERIFY_KINDS))
    family = concept_family(analysis)
    if kind in mc.VERIFY_KINDS:
        spec = {
            "kind": kind,
            "variable": ver.get("variable") if isinstance(ver.get("variable"), str) else "x",
            "expression": ver.get("expression") if isinstance(ver.get("expression"), str) else "",
            "lower": ver.get("lower"), "upper": ver.get("upper"), "point": ver.get("point"),
            "options": _as_strings(ver.get("options")),
        }
        check = mc.check_spec(spec)
        if check["status"] == "invalid":
            problems.append("verification spec cannot be checked: " + check["reason"])
        elif check["status"] == "failed":
            problems.append("answer check failed: " + check["reason"])
        elif check["correct_index"] != correct:
            problems.append("answer key is wrong: the math says option %d is correct, not option %d"
                            % (check["correct_index"], correct))
        else:
            expr_node = mc.parse(spec["expression"], variable=None if kind == "evaluate" else spec["variable"])
            if kind == "evaluate":
                for i, (shown, ascii_opt) in enumerate(zip(options, spec["options"])):
                    node = mc.try_parse(ascii_opt, variable=None)
                    want = mc.evaluate(node) if node else None
                    got = display_number(shown)
                    if want is None or got is None or abs(got - want) > max(
                            mc.value_tolerance(ascii_opt, want, kind), 0.006 * abs(want)):
                        problems.append("option %d shows a different value than its checked form" % i)
                        break
                if _PLACEHOLDER.search(question):
                    problems.append("{{expr}} belongs only in derivative, integral, and limit questions")
                elif not _stem_mentions(question, expr_node, spec, share=0.5):
                    problems.append("the question does not contain the numbers that the check uses")
            else:
                if _PLACEHOLDER.search(question):
                    question = substitute_placeholder(question, expr_node)
                elif not _stem_mentions(question, expr_node, spec):
                    problems.append("the question does not show the function that was checked")
                # Show exactly what was checked: options are typeset from the checked math.
                allow_c = kind == "antiderivative"
                var = None if (kind in ("definite_integral", "limit") or spec.get("point") is not None) else spec["variable"]
                options = ["$" + mc.to_latex(mc.parse(o, variable=var, allow_c=allow_c)) + "$" for o in spec["options"]]
            if family in _STRUCTURE_CHECKS:
                kinds, predicate = _STRUCTURE_CHECKS[family]
                if kind in kinds and not predicate(expr_node):
                    problems.append("the expression does not require the %s" % family.replace("-", " "))
            elif family in _KIND_FOR_SKILL and kind not in _KIND_FOR_SKILL[family]:
                problems.append("a %s question was expected" % family.replace("-", " "))
            verification = {"status": "verified", "method": check["method"]}
    else:
        if _PLACEHOLDER.search(question):
            problems.append("{{expr}} used without a verification expression")
        if _QUANT_SUBJECT.search(mistake["subject"]) and re.search(r"\d", question + " ".join(options)):
            verification = {"status": "unverified", "method": ""}

    if not balanced_dollars(question) or not all(balanced_dollars(o) for o in options) \
            or not balanced_dollars(explanation) or (notes and not all(balanced_dollars(n) for n in notes)):
        problems.append("unbalanced $ math delimiters")

    if problems:
        return None, problems
    return {
        "question": question,
        "options": options,
        "correct": correct,
        "explanation": explanation,
        "notes": notes,
        "changes": changes,
        "difficulty": level,
        "verification": verification,
    }, []


def finalize_variant(v: dict, analysis: dict, rel: str, generator: str, rng: random.Random) -> dict:
    """Shuffle (so the key's position carries no information), letter A-D, and build the client shape."""
    order = list(range(len(v["options"])))
    rng.shuffle(order)
    letters = "ABCD"
    options = ["%s. %s" % (letters[pos], v["options"][i]) for pos, i in enumerate(order)]
    notes = [v["notes"][i] for i in order] if v.get("notes") else None
    answer = options[order.index(v["correct"])]
    digest = hashlib.sha1((v["question"] + "|" + "|".join(sorted(v["options"]))).encode("utf-8")).hexdigest()[:12]
    return {
        "id": "var-" + digest,
        "question": v["question"],
        "options": options,
        "answer": answer,
        "explanation": v["explanation"],
        "optionNotes": notes,
        "conceptKey": analysis["conceptKey"],
        "concept": analysis["coreConcept"],
        "difficulty": v["difficulty"],
        "relation": rel,
        "changes": v.get("changes") or [],
        "verification": v["verification"],
        "generator": generator,
    }


def _dedupe(candidates: list[dict], mistake: dict, avoid: list[str], accepted: list[dict]) -> tuple[list, list]:
    keep, problems = [], []
    for v in candidates:
        if is_near_copy(v["question"], mistake["question"]):
            problems.append("too close to the original question: change the numbers, function, or context")
        elif any(is_near_copy(v["question"], a) for a in avoid):
            problems.append("repeats a question the student already practiced")
        elif any(is_near_copy(v["question"], k["question"]) for k in accepted + keep):
            problems.append("two variants in this batch are the same question")
        else:
            keep.append(v)
    return keep, problems


# Fixed reason codes for the metadata log. Problem messages can quote model output (a
# concept name, a level), so only these codes, never message text, reach the database.
_PROBLEM_CODES = (
    ("question_length", r"^question must"),
    ("options_shape", r"^(options must|each option must)"),
    ("duplicate_options", r"^two options are identical"),
    ("banned_option", r"all/none of the above"),
    ("answer_index", r"^correct_option"),
    ("explanation_length", r"^explanation must"),
    ("explanation_restates", r"^explanation only restates"),
    ("letter_reference", r"^explanation refers to an option"),
    ("concept_mismatch", r"^concept_key"),
    ("difficulty_mismatch", r"^difficulty is"),
    ("concept_not_used", r"^the explanation never uses the concept"),
    ("unknown_check_kind", r"^verification kind must"),
    ("spec_invalid", r"^verification spec cannot be checked"),
    ("check_failed", r"^answer check failed"),
    ("answer_key_wrong", r"^answer key is wrong"),
    ("display_mismatch", r"^option \d+ shows a different value"),
    ("placeholder_misuse", r"^\{\{expr\}\}"),
    ("stem_mismatch", r"^the question does not"),
    ("structure_mismatch", r"^the expression does not require"),
    ("kind_mismatch", r"question was expected$"),
    ("unbalanced_math", r"^unbalanced"),
    ("copy_of_original", r"^too close to the original"),
    ("repeat", r"^repeats a question"),
    ("duplicate_variant", r"^two variants in this batch"),
    ("analysis_invalid", r"^analysis"),
    ("not_json", r"^the response was not a JSON"),
    ("no_variants", r"^variants must be"),
)


def problem_code(problem: str) -> str:
    for code, pattern in _PROBLEM_CODES:
        if re.search(pattern, problem):
            return code
    return "other"


# --- template path ---------------------------------------------------------------------------

def template_variants(mistake: dict, req: dict, analysis: Optional[dict], rng: random.Random,
                      count: Optional[int] = None) -> tuple[Optional[str], list[dict], dict]:
    """(skill, raw validated variants, analysis) from the built-in generator.

    When an AI analysis exists, it names the knowledge point; templates are used only
    if that concept IS the template skill. Otherwise a chain-rule drill could end up
    labelled "Related rates", which is the mismatch this feature must not produce.
    """
    hint = ""
    if analysis:
        hint = " ".join([analysis.get("conceptKey", "").replace("-", " "), analysis.get("coreConcept", "")])
    skill = vt.classify(mistake["subject"], mistake["topic"], mistake["question"], mistake["explanation"], hint)
    if analysis is not None and analysis.get("source") == "ai":
        if not skill or concept_family(analysis) != skill:
            return None, [], analysis
    elif analysis is None or analysis.get("conceptKey") != skill or not skill:
        analysis = offline_analysis(mistake, skill)
    if not skill:
        return None, [], analysis
    out: list[dict] = []
    avoid = list(req["avoid"])
    keys: set = set()
    want = count or req["count"]
    tries = 0
    while len(out) < want and tries < want * 6:
        tries += 1
        item = vt.generate(skill, req["level"], rng, avoid_keys=keys)
        if item is None:
            break
        keys.add(item["key"])
        if is_near_copy(item["question"], mistake["question"]) or any(is_near_copy(item["question"], a) for a in avoid):
            continue
        kind = item["verification"]["kind"]
        var = None if kind in ("definite_integral", "limit") else "x"
        options = ["$" + mc.to_latex(mc.parse(o, variable=var, allow_c=True)) + "$" for o in item["options_ascii"]]
        out.append({
            "question": item["question"],
            "options": options,
            "correct": item["correct_index"],
            "explanation": item["explanation"],
            "notes": item["option_notes"],
            "changes": ["new function and numbers", "built-in generator"],
            "difficulty": item["difficulty"],
            "verification": {"status": "verified", "method": mc.check_spec(item["verification"])["method"]},
        })
        avoid.append(item["question"])
    return skill, out, analysis


# --- orchestration ----------------------------------------------------------------------------

_LLM_MESSAGES = {
    "rate_limited": "The AI provider is rate-limiting requests right now.",
    "timeout": "The AI took too long to respond.",
    "auth_error": "The AI provider rejected the server's API key.",
    "bad_request": "The AI provider rejected the request (check the model name in Setup).",
    "upstream_error": "The AI provider returned an error.",
    "bad_response": "The AI provider sent an unreadable response.",
    "not_configured": "No AI key is configured on the server.",
}


def generate_variants(mistake: dict, req: dict, llm: Optional[Callable] = None,
                      deadline: Optional[float] = None, rng: Optional[random.Random] = None,
                      model: str = DEFAULT_MODEL) -> dict:
    """Produce checked variants for one mistake. Raises VariantError when none can be made.

    llm(messages, max_tokens=..., temperature=...) -> (content, usage) or raises LLMError.
    """
    rng = rng or random.Random()
    deadline = deadline or (time.monotonic() + 40)
    meta = {"llmCalls": 0, "promptTokens": 0, "completionTokens": 0, "rejected": 0,
            "rejectionReasons": {}, "outcome": "failed", "model": None}
    known = req.get("analysis")
    analysis = known
    accepted: list[dict] = []
    llm_failure: Optional[LLMError] = None
    problems_last: list[str] = []

    def note_rejections(problems):
        for p in problems:
            code = problem_code(p)
            meta["rejectionReasons"][code] = meta["rejectionReasons"].get(code, 0) + 1

    def call(messages, max_tokens):
        meta["llmCalls"] += 1
        meta["model"] = model
        content, usage = llm(messages, max_tokens=max_tokens, temperature=0.6)
        if isinstance(usage, dict):
            meta["promptTokens"] += int(usage.get("prompt_tokens") or 0)
            meta["completionTokens"] += int(usage.get("completion_tokens") or 0)
        return parse_json_object(content)

    def take(data, current_analysis, need):
        """Validate a parsed response; returns (analysis, new variants, problems)."""
        problems: list[str] = []
        if data is None:
            note_rejections(["the response was not a JSON object"])
            return current_analysis, [], ["the response was not a JSON object"]
        a = current_analysis
        if a is None or a.get("source") != "ai":
            parsed, errs = analysis_from_ai(data.get("analysis"), mistake)
            if parsed is None:
                note_rejections(errs)
                return current_analysis, [], errs
            a = parsed
        raw_list = data.get("variants")
        if isinstance(raw_list, dict):
            raw_list = [raw_list]
        if not isinstance(raw_list, list) or not raw_list:
            note_rejections(["variants must be a non-empty list"])
            return a, [], ["variants must be a non-empty list"]
        good = []
        for i, raw in enumerate(raw_list[: need + 2]):
            v, errs = validate_variant(raw, a, mistake, req["level"])
            if v is None:
                meta["rejected"] += 1
                note_rejections(errs)
                problems.extend("variant %d: %s" % (i + 1, e) for e in errs[:4])
            else:
                good.append(v)
        good, dup_problems = _dedupe(good, mistake, req["avoid"], accepted)
        if dup_problems:
            meta["rejected"] += len(dup_problems)
            note_rejections(dup_problems)
            problems.extend(dup_problems)
        return a, good[:need], problems

    if llm is not None:
        need = req["count"]
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": build_user_prompt(mistake, req, known if known and known.get("source") == "ai" else None, need)},
        ]
        first_round_full = False
        try:
            data = call(messages, max_tokens_for(need, not (known and known.get("source") == "ai")))
            analysis, good, problems_last = take(data, known if known and known.get("source") == "ai" else None, need)
            accepted.extend(good)
            first_round_full = len(accepted) >= req["count"]
            if not first_round_full and time.monotonic() < deadline - REPAIR_MIN_SECONDS:
                need = req["count"] - len(accepted)
                have_analysis = analysis is not None and analysis.get("source") == "ai"
                repair = build_user_prompt(mistake, req, analysis if have_analysis else None, need,
                                           extra_avoid=[v["question"] for v in accepted])
                repair += "\n\nYour previous answer had these problems; fix them:\n" + \
                    "\n".join("- " + _clip(p, 200) for p in problems_last[:8])
                repair += '\nReturn %s with %d replacement variant(s).' % (
                    '{"variants": [...]}' if have_analysis else 'the full JSON object', need)
                data = call([messages[0], {"role": "user", "content": repair}], max_tokens_for(need, not have_analysis))
                analysis, good, problems_last = take(data, analysis if have_analysis else None, need)
                accepted.extend(good)
        except LLMError as e:
            llm_failure = e
        if accepted:
            meta["outcome"] = "ok" if first_round_full else ("repaired" if len(accepted) >= req["count"] else "partial")

    generator = "ai"
    notice = None
    if not accepted:
        skill, raw, analysis = template_variants(mistake, req, analysis, rng)
        if raw:
            accepted, generator = raw, "template"
            meta["outcome"] = "fallback" if llm is not None else "ok"
            if llm_failure is not None:
                notice = _LLM_MESSAGES.get(llm_failure.code, "The AI was unavailable.") + \
                    " These questions come from the built-in generator instead."
            elif llm is not None:
                notice = "The AI's questions did not pass the quality checks, so these come from the built-in generator."
        else:
            meta["outcome"] = "failed"
            if analysis is None:
                analysis = offline_analysis(mistake, None)
            if llm_failure is not None:
                raise VariantError(llm_failure.code, _LLM_MESSAGES.get(llm_failure.code, "The AI was unavailable."),
                                   retry_after=llm_failure.retry_after, analysis=analysis, meta=meta)
            if llm is not None:
                raise VariantError("invalid_output", "The AI's questions did not pass the quality checks "
                                   "(for example, the answer key did not match the math), so none were shown.",
                                   analysis=analysis, meta=meta)
            raise VariantError("no_generator", "Similar questions for this topic need the AI connection. "
                               "The built-in generator covers AP Calculus derivative, integral, and limit rules.",
                               analysis=analysis, meta=meta)

    variants = [finalize_variant(v, analysis, req["relation"], generator, rng) for v in accepted[: req["count"]]]
    return {"analysis": analysis, "variants": variants, "generator": generator, "notice": notice, "meta": meta}
