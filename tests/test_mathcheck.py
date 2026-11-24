"""Tests for the safe math engine used to verify generated questions."""

import math

import pytest

import mathcheck as mc


def val(text, x=None, variable="x", allow_c=False):
    node = mc.parse(text, variable=variable, allow_c=allow_c)
    return mc.evaluate(node, {variable: x} if x is not None else {})


# --- parsing and precedence ---------------------------------------------------------

@pytest.mark.parametrize("text, x, expected", [
    ("2+3*4", None, 14),
    ("2^3^2", None, 512),          # right-associative
    ("-2^2", None, -4),            # unary minus binds looser than ^
    ("(−2)^2", None, 4),      # unicode minus sign
    ("2x", 3, 6),                  # implicit multiplication
    ("x(x+1)", 3, 12),
    ("(x+1)(x-1)", 3, 8),
    ("3sin(x)", 0.5, 3 * math.sin(0.5)),
    ("x^-2", 2, 0.25),
    ("2pi", None, 2 * math.pi),
    ("xsin(x)", 2, 2 * math.sin(2)),   # implicit product split from one identifier
    ("e^(2x)", 1, math.exp(2)),
    ("exp(x)", 1, math.e),
    ("ln(e)", None, 1),
    ("log(e^2)", None, 2),         # log is the natural log
    ("log10(1000)", None, 3),
    ("|x - 5|", 2, 3),
    ("x² + 1", 3, 10),        # unicode superscript
    ("2**3", None, 8),
    ("1/2x", 4, 2),                # read as (1/2)x
])
def test_parse_and_evaluate(text, x, expected):
    assert val(text, x) == pytest.approx(expected)


@pytest.mark.parametrize("text", [
    "y + 1",                        # only the declared variable is allowed
    "sinx",                         # functions need parentheses
    "__import__('os')",
    "os.system",
    "x; 1",
    "(x + 1",
    "x +",
    "",
    "   ",
    "2 = 2",
    "foo(x)",
    "C + x",                        # C only for antiderivative options
])
def test_rejects_unsupported_input(text):
    with pytest.raises(mc.ParseError):
        mc.parse(text)


def test_variable_must_be_a_single_safe_letter():
    with pytest.raises(mc.ParseError):
        mc.parse("x", variable="xy")
    with pytest.raises(mc.ParseError):
        mc.parse("e", variable="e")
    assert mc.evaluate(mc.parse("3t^2", variable="t"), {"t": 2}) == 12


def test_no_variable_mode_rejects_letters():
    assert mc.evaluate(mc.parse("26/3", variable=None)) == pytest.approx(26 / 3)
    with pytest.raises(mc.ParseError):
        mc.parse("x + 1", variable=None)


def test_input_limits():
    with pytest.raises(mc.ParseError):
        mc.parse("x+" * 200 + "x")                    # too long
    with pytest.raises(mc.ParseError):
        mc.parse("(" * 30 + "x" + ")" * 30)           # nested too deeply
    with pytest.raises(mc.ParseError):
        mc.parse("+".join(["x"] * 140))               # too many nodes
    with pytest.raises(mc.ParseError):
        mc.parse("1" * 400)                           # too long / out of range


def test_allow_c_for_antiderivatives():
    node = mc.parse("x^2/2 + C", allow_c=True)
    assert mc.evaluate(node, {"x": 2}) == pytest.approx(2)


@pytest.mark.parametrize("text, x", [
    ("ln(x)", -1),
    ("sqrt(x)", -4),
    ("1/x", 0),
    ("x^(1/3)", -8),              # no silent complex results
    ("exp(x)", 1000),             # overflow
    ("10^x", 400),
    ("asin(x)", 2),
    ("0^(-1)", None),
])
def test_evaluate_returns_none_outside_the_domain(text, x):
    assert val(text, x) is None


# --- LaTeX ------------------------------------------------------------------------

@pytest.mark.parametrize("text, latex", [
    ("3x^2 + 2x - 5", "3x^{2} + 2x - 5"),
    ("sin(3x^2)", "\\sin(3x^{2})"),
    ("6x*cos(3x^2)", "6x\\cos(3x^{2})"),
    ("e^(5x^3)", "e^{5x^{3}}"),
    ("exp(2x)", "e^{2x}"),
    ("(2x+1)/(x-3)", "\\frac{2x + 1}{x - 3}"),
    ("sqrt(x^2+1)", "\\sqrt{x^{2} + 1}"),
    ("sin(x)^2", "\\sin^{2}(x)"),
    ("pi x", "\\pi x"),
    ("3 - -x", "3 - (-x)"),
    ("-(x+1)", "-(x + 1)"),
    ("x*2", "x \\cdot 2"),
    ("1*x", "x"),
    ("ln(1/x)", "\\ln\\left(\\frac{1}{x}\\right)"),
    ("(1/x)^2", "\\left(\\frac{1}{x}\\right)^{2}"),
    ("|x|", "\\left|x\\right|"),
    ("4(3x+1)^3", "4(3x + 1)^{3}"),
])
def test_to_latex(text, latex):
    assert mc.to_latex(mc.parse(text)) == latex


@pytest.mark.parametrize("text", [
    "3x^2 + 2x - 5", "sin(3x^2)", "-(x+1)^2", "x^-2", "e^(-x)/x", "2^x^2", "3 - -x", "|x-1|",
])
def test_to_ascii_round_trips(text):
    node = mc.parse(text)
    again = mc.parse(mc.to_ascii(node))
    for x in (0.3, 1.7, -2.2):
        assert mc.evaluate(again, {"x": x}) == pytest.approx(mc.evaluate(node, {"x": x}))


# --- structure ---------------------------------------------------------------------

@pytest.mark.parametrize("text, comp, prod, quot, poly", [
    ("x^2", False, False, False, True),
    ("3x^2 + 2x", False, False, False, True),
    ("sin(3x)", True, False, False, False),
    ("(2x+1)^4", True, False, False, False),
    ("e^(x^2)", True, False, False, False),
    ("2^(3x)", True, False, False, False),
    ("e^x", False, False, False, False),
    ("x^2 e^x", False, True, False, False),
    ("(x+1)/(x-1)", False, False, True, False),
    ("1/x", False, False, False, False),
])
def test_structure_detectors(text, comp, prod, quot, poly):
    node = mc.parse(text)
    assert mc.has_composition(node) is comp
    assert mc.has_product(node) is prod
    assert mc.has_quotient(node) is quot
    assert mc.is_polynomial(node) is poly


def test_literals_and_functions():
    node = mc.parse("3sin(2x^2) + 0.5")
    assert mc.numeric_literals(node) == {"3", "2", "0.5"}
    assert mc.function_names(node) == {"sin"}


# --- check_spec -------------------------------------------------------------------

def spec(kind, expression, options, **kw):
    out = {"kind": kind, "variable": "x", "expression": expression, "options": options}
    out.update(kw)
    return out


def test_derivative_chain_rule_verified():
    res = mc.check_spec(spec("derivative", "sin(3x^2)",
                             ["cos(3x^2)", "6x cos(3x^2)", "-6x sin(3x^2)", "6x sin(3x^2)"]))
    assert res["status"] == "verified"
    assert res["correct_index"] == 1
    assert res["matches"] == [False, True, False, False]


def test_derivative_with_no_correct_option_fails():
    res = mc.check_spec(spec("derivative", "sin(3x^2)",
                             ["cos(3x^2)", "3x cos(3x^2)", "-6x sin(3x^2)", "6x sin(3x^2)"]))
    assert res["status"] == "failed"
    assert "no option" in res["reason"]


def test_two_equivalent_correct_options_fail():
    # The same answer written two ways means two "correct" choices.
    res = mc.check_spec(spec("derivative", "x^3",
                             ["3x^2", "3*x*x", "x^2", "3x^3"]))
    assert res["status"] == "failed"
    assert "more than one" in res["reason"]


def test_unparseable_option_fails_instead_of_passing():
    res = mc.check_spec(spec("derivative", "x^3", ["3x^2", "DNE", "x^2", "3x"]))
    assert res["status"] == "failed"


def test_antiderivative_ignores_the_constant():
    res = mc.check_spec(spec("antiderivative", "(2x+1)^3",
                             ["(2x+1)^4/8 + C", "(2x+1)^4/4 + C", "6(2x+1)^2 + C", "(2x+1)^4 + C"]))
    assert res["status"] == "verified"
    assert res["correct_index"] == 0


def test_definite_integral_exact_values():
    res = mc.check_spec(spec("definite_integral", "x^2", ["26/3", "8", "9", "6"], lower=1, upper=3))
    assert res["status"] == "verified"
    assert res["correct_index"] == 0


def test_definite_integral_needs_bounds():
    assert mc.check_spec(spec("definite_integral", "x^2", ["1", "2"]))["status"] == "invalid"


def test_limit_special_trig():
    res = mc.check_spec(spec("limit", "sin(3x)/(2x)", ["3/2", "1", "2/3", "0"], point=0))
    assert res["status"] == "verified"
    assert res["correct_index"] == 0


def test_limit_that_does_not_exist_is_invalid():
    res = mc.check_spec(spec("limit", "|x|/x", ["1", "-1", "0", "2"], point=0))
    assert res["status"] == "invalid"
    res = mc.check_spec(spec("limit", "1/x^2", ["1", "0", "2", "3"], point=0))
    assert res["status"] == "invalid"


def test_removable_discontinuity_limit():
    res = mc.check_spec(spec("limit", "(x^2-4)/(x-2)", ["4", "2", "0", "8"], point=2))
    assert res["status"] == "verified"


def test_derivative_at_a_point():
    res = mc.check_spec(spec("derivative", "x^3 - 2x", ["10", "6", "12", "4"], point=2))
    assert res["status"] == "verified"
    assert res["correct_index"] == 0


def test_evaluate_respects_rounding_in_options():
    # sqrt(2*9.8*5) = 9.899... ; "9.9" is a correct rounding
    res = mc.check_spec(spec("evaluate", "sqrt(2*9.8*5)", ["9.9", "49", "98", "4.9"]))
    assert res["status"] == "verified"
    assert res["correct_index"] == 0


def test_evaluate_flags_ambiguous_distractor():
    res = mc.check_spec(spec("evaluate", "sqrt(2*9.8*5)", ["9.9", "9.8", "98", "4.9"]))
    assert res["status"] == "failed"
    assert res["matches"][1] is None


def test_evaluate_rejects_a_variable():
    assert mc.check_spec(spec("evaluate", "2x", ["1", "2"]))["status"] == "invalid"


@pytest.mark.parametrize("bad", [
    None,
    {"kind": "integrate", "expression": "x", "options": ["1", "2"]},
    spec("derivative", "x +", ["1", "2"]),
    spec("derivative", "x^2", "2x"),
    spec("derivative", "5", ["0", "1"]),        # no variable to differentiate
])
def test_invalid_specs(bad):
    assert mc.check_spec(bad)["status"] == "invalid"


def test_domain_restricted_functions_still_verify():
    res = mc.check_spec(spec("derivative", "ln(x - 2)",
                             ["1/(x-2)", "1/x", "ln(x-2)/x", "x/(x-2)"]))
    assert res["status"] == "verified"
    assert res["correct_index"] == 0
