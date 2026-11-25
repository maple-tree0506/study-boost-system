"""Tests for the built-in (no-AI) calculus variant generator."""

import random

import pytest

import mathcheck as mc
import variant_templates as vt


def balanced(text):
    return text.count("$") % 2 == 0


@pytest.mark.parametrize("skill", sorted(vt.SKILLS))
@pytest.mark.parametrize("level", vt.LEVELS)
def test_every_generated_item_is_verified_and_renderable(skill, level):
    rng = random.Random(1000 + hash((skill, level)) % 1000)
    keys = set()
    for _ in range(40):
        item = vt.generate(skill, level, rng)
        assert item is not None, "generator gave up"
        spec = item["verification"]
        check = mc.check_spec(spec)
        assert check["status"] == "verified", (item["question"], check)
        assert check["correct_index"] == item["correct_index"] == 0
        assert len(item["options_ascii"]) == 4
        assert len(item["option_notes"]) == 4
        assert all(n.strip() for n in item["option_notes"])
        latex = [mc.to_latex(mc.parse(o, variable=None if spec["kind"] in ("definite_integral", "limit") else "x",
                                      allow_c=True)) for o in item["options_ascii"]]
        assert len(set(latex)) == 4, latex
        assert balanced(item["question"]) and balanced(item["explanation"])
        assert all(balanced(n) for n in item["option_notes"])
        assert item["difficulty"] == level
        keys.add(item["key"])
    assert len(keys) >= 10, "too little variety across draws"


def test_avoid_keys_prevents_repeats():
    rng = random.Random(3)
    first = vt.generate("chain-rule", "basic", rng)
    seen = {first["key"]}
    for _ in range(15):
        nxt = vt.generate("chain-rule", "basic", rng, avoid_keys=seen)
        assert nxt["key"] not in seen
        seen.add(nxt["key"])


def test_generation_is_reproducible_for_a_seed():
    a = vt.generate("product-rule", "medium", random.Random(42))
    b = vt.generate("product-rule", "medium", random.Random(42))
    assert a == b


def test_unknown_skill_returns_none():
    assert vt.generate("photosynthesis", "basic", random.Random(1)) is None


def test_unknown_level_falls_back_to_medium():
    item = vt.generate("power-rule", "impossible", random.Random(1))
    assert item["difficulty"] == "medium"


# --- classification ------------------------------------------------------------------
# Question/explanation pairs taken from the offline bank (js/question-bank.js).

CALC = "AP Calculus AB"


@pytest.mark.parametrize("question, explanation, expected", [
    ("The derivative of $\\ln(5x^2 + 1)$ is:",
     "Chain rule: d/dx ln(u) = u'/u with u = 5x²+1 and u' = 10x, giving 10x/(5x²+1).", "chain-rule"),
    ("If $y = (3x + 1)^4$, then $\\frac{dy}{dx}$ is:",
     "Chain rule: 4(3x+1)³ times the inner derivative 3 = 12(3x+1)³.", "chain-rule"),
    ("The derivative of $x^2 e^x$ is:",
     "Product rule: (uv)' = u'v + uv' = 2x·eˣ + x²·eˣ.", "product-rule"),
    ("The derivative of $x^5$ is:",
     "By the power rule d/dx(xⁿ) = n·xⁿ⁻¹, so d/dx(x⁵) = 5x⁴.", "power-rule"),
    ("Evaluate $\\int 2x\\,dx$.",
     "The antiderivative of 2x is x² (since d/dx(x²) = 2x), plus the constant C.", "antiderivative-power"),
    ("$\\int_0^2 3x^2\\,dx$ equals:",
     "The antiderivative of 3x² is x³, so the integral is 2³ − 0³ = 8.", "definite-integral"),
    ("$\\lim_{x \\to 0} \\frac{\\sin x}{x}$ equals:",
     "This standard limit equals 1 (it underlies the derivative of sine).", "trig-limit"),
    # FTC part 1 (accumulation function) is a different skill: no template.
    ("If $F(x) = \\int_0^x f(t)\\,dt$ and f is continuous, then $F'(x)$ equals:",
     "By the Fundamental Theorem of Calculus, differentiating an accumulation function returns the integrand.",
     None),
    # Interpreting signed area is conceptual, not an evaluation drill.
    ("If $\\int_a^b f(x)\\,dx = -3$, the best interpretation on $[a,b]$ is that:",
     "A negative definite integral means the net signed area is negative.", None),
    ("If a function f has $f'(x) > 0$ on an interval, then on that interval f is:",
     "A positive first derivative means f is increasing there.", None),
    # A rule mentioned only in passing, late in the explanation, is not the skill.
    ("A particle moves with velocity $v(t) = 3t^2 - 12t$. On $[0,4]$, its acceleration is zero at:",
     "Acceleration is v'(t) = 6t − 12, which is zero at t = 2. You could also use the power rule.", None),
])
def test_classify_bank_items(question, explanation, expected):
    assert vt.classify(CALC, "", question, explanation) == expected


def test_classify_requires_a_calculus_course():
    assert vt.classify("AP Physics C: Mechanics", "chain rule", "", "Chain rule: ...") is None
    assert vt.classify("AP Biology", "", "", "") is None


def test_topic_and_ai_hint_outrank_the_explanation():
    expl = "Product rule: (uv)' = u'v + uv'."
    assert vt.classify(CALC, "Chain rule", "", expl) == "chain-rule"
    assert vt.classify(CALC, "", "", expl, hint="quotient rule") == "quotient-rule"
    assert vt.classify(CALC, "", "", expl) == "product-rule"


def test_skill_info():
    info = vt.skill_info("chain-rule")
    assert info["key"] == "chain-rule" and info["concept"] == "Chain rule"
    assert vt.skill_info("nope") is None
