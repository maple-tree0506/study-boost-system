"""Tests for the similar-question engine: validation, quality gates, repair, fallbacks."""

import copy
import json
import random
import time

import pytest

import variant_engine as ve

MISTAKE_RAW = {
    "id": "err-1",
    "subject": "AP Calculus AB",
    "topic": "Chain rule",
    "question": "If $y = (3x + 1)^4$, then $\\frac{dy}{dx}$ is:",
    "options": ["A. $12(3x+1)^3$", "B. $4(3x+1)^3$", "C. $(3x+1)^3$", "D. $12(3x+1)^4$"],
    "answer": "A. $12(3x+1)^3$",
    "userAnswer": "B. $4(3x+1)^3$",
    "explanation": ("Chain rule: 4(3x+1)³ times the inner derivative 3 = 12(3x+1)³. "
                    "'4(3x+1)³' is the trap of forgetting to multiply by the derivative of the inside (3)."),
    "difficulty": "medium",
}

BIO_RAW = {
    "id": "err-2",
    "subject": "AP Biology",
    "topic": "Enzymes",
    "question": "An enzyme is heated to 90 C and stops working. What most likely happened?",
    "options": ["A. It denatured", "B. Substrate ran out", "C. It replicated", "D. pH rose"],
    "answer": "A. It denatured",
    "userAnswer": "B. Substrate ran out",
    "explanation": "High heat breaks the bonds that hold the enzyme's shape.",
    "difficulty": "basic",
}

ANALYSIS = {
    "core_concept": "Chain rule for composite functions",
    "concept_key": "chain-rule",
    "concept_terms": ["chain rule", "inner function"],
    "solution_method": "Differentiate the outer power, keep the inner function, and multiply by the inner derivative 3.",
    "difficulty": "medium",
    "error_diagnosis": {"status": "diagnosed",
                        "likely_error": "Forgot to multiply by the derivative of the inner function (3).",
                        "evidence": "4(3x+1)^3", "confidence": "high"},
}


def v_sin(**over):
    v = {
        "question": "Find $\\frac{d}{dx}\\left[{{expr}}\\right]$.",
        "options": ["$6x\\cos(3x^2)$", "$\\cos(3x^2)$", "$-6x\\sin(3x^2)$", "$6x\\sin(3x^2)$"],
        "correct_option": 0,
        "explanation": ("By the chain rule, the outer sine becomes cosine of the same inner function, "
                        "then we multiply by the inner derivative 6x. So the derivative is 6x cos(3x^2)."),
        "option_notes": ["correct", "Forgot the inner derivative.", "Used the derivative of cosine.",
                         "Kept sine instead of differentiating it."],
        "concept_key": "chain-rule",
        "difficulty": "medium",
        "changes": ["outer function is sine", "new inner function"],
        "verification": {"kind": "derivative", "variable": "x", "expression": "sin(3x^2)",
                         "lower": None, "upper": None, "point": None,
                         "options": ["6x*cos(3x^2)", "cos(3x^2)", "-6x*sin(3x^2)", "6x*sin(3x^2)"]},
    }
    v.update(over)
    return v


def v_exp(**over):
    v = {
        "question": "If $f(x) = {{expr}}$, which expression equals $f'(x)$?",
        "options": ["$8xe^{4x^2}$", "$e^{4x^2}$", "$4x^2e^{4x^2-1}$", "$8xe^{8x}$"],
        "correct_option": 0,
        "explanation": ("Chain rule: the exponential keeps its form and is multiplied by the derivative of the "
                        "inner function 4x^2, which is 8x."),
        "option_notes": ["correct", "Forgot the inner derivative.", "Power rule misapplied.", "Replaced the exponent."],
        "concept_key": "chain-rule",
        "difficulty": "medium",
        "changes": ["exponential outer function"],
        "verification": {"kind": "derivative", "variable": "x", "expression": "e^(4x^2)",
                         "options": ["8x*e^(4x^2)", "e^(4x^2)", "4x^2*e^(4x^2-1)", "8x*e^(8x)"]},
    }
    v.update(over)
    return v


class FakeLLM:
    """Returns scripted responses in order; an Exception instance is raised instead."""

    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = []

    def __call__(self, messages, max_tokens, temperature):
        self.calls.append({"messages": messages, "max_tokens": max_tokens, "temperature": temperature})
        r = self.responses.pop(0)
        if isinstance(r, Exception):
            raise r
        content = r if isinstance(r, str) else json.dumps(r)
        return content, {"prompt_tokens": 900, "completion_tokens": 700}


def run(raw=None, llm=None, body=None, seed=0, deadline=None):
    m = ve.normalize_mistake(copy.deepcopy(raw or MISTAKE_RAW))
    req = ve.normalize_request(body or {"count": 2}, m)
    return ve.generate_variants(m, req, llm=llm, rng=random.Random(seed), deadline=deadline)


# --- input normalization ------------------------------------------------------------------

def test_normalize_mistake_requires_question_and_answer():
    with pytest.raises(ve.InputError):
        ve.normalize_mistake({"answer": "x"})
    with pytest.raises(ve.InputError):
        ve.normalize_mistake({"question": "q"})
    with pytest.raises(ve.InputError):
        ve.normalize_mistake("not an object")
    with pytest.raises(ve.InputError):
        ve.normalize_mistake({"question": "q", "answer": "a", "options": "A, B"})
    with pytest.raises(ve.InputError):
        ve.normalize_mistake({"question": 5, "answer": "a"})


def test_normalize_mistake_bounds_and_defaults():
    m = ve.normalize_mistake({"question": "q" * 5000, "answer": "a", "options": ["only one"],
                              "difficulty": "impossible", "userAnswer": None})
    assert len(m["question"]) == 2000
    assert m["type"] == "Short Answer" and m["options"] == []
    assert m["difficulty"] is None and m["subject"] == "Uncategorized" and m["userAnswer"] == ""


def test_normalize_request_clamps_everything():
    m = ve.normalize_mistake(MISTAKE_RAW)
    r = ve.normalize_request({"count": 50, "level": "x", "avoid": ["a" * 900] * 30, "model": "bad model!"}, m)
    assert r["count"] == 3 and r["level"] == "medium" and r["relation"] == "same"
    assert len(r["avoid"]) == 12 and all(len(a) == 300 for a in r["avoid"])
    assert r["model"] is None
    r = ve.normalize_request({"count": True, "level": "basic", "model": "llama-3.3-70b-versatile"}, m)
    assert r["count"] == ve.DEFAULT_COUNT and r["relation"] == "easier" and r["model"] == "llama-3.3-70b-versatile"
    assert ve.normalize_request({"count": 0, "level": "challenge"}, m)["relation"] == "harder"


# --- the AI path ---------------------------------------------------------------------------

def test_ai_happy_path_produces_checked_variants():
    llm = FakeLLM({"analysis": ANALYSIS, "variants": [v_sin(), v_exp()]})
    out = run(llm=llm)
    assert out["generator"] == "ai" and out["notice"] is None
    assert len(out["variants"]) == 2 and len(llm.calls) == 1
    v = out["variants"][0]
    assert "{{expr}}" not in v["question"] and "\\sin(3x^{2})" in v["question"]
    assert [o[:3] for o in v["options"]] == ["A. ", "B. ", "C. ", "D. "]
    assert v["answer"] in v["options"]
    assert v["answer"].endswith("$6x\\cos(3x^{2})$")      # re-typeset from the checked expression
    assert v["verification"]["status"] == "verified"
    assert v["conceptKey"] == "chain-rule" and v["relation"] == "same" and v["difficulty"] == "medium"
    assert len(v["optionNotes"]) == 4 and v["id"].startswith("var-")
    a = out["analysis"]
    assert a["source"] == "ai" and a["coreConcept"] == "Chain rule for composite functions"
    assert a["diagnosis"]["status"] == "diagnosed" and a["diagnosis"]["grounded"] is True
    assert a["diagnosis"]["confidence"] == "high"
    assert out["meta"]["outcome"] == "ok"
    assert out["meta"]["promptTokens"] == 900 and out["meta"]["completionTokens"] == 700


def test_options_are_shuffled_but_the_key_follows():
    letters = set()
    for seed in range(12):
        out = run(llm=FakeLLM({"analysis": ANALYSIS, "variants": [v_sin(), v_exp()]}), seed=seed)
        v = out["variants"][0]
        letters.add(v["answer"][0])
        assert v["answer"].endswith("$6x\\cos(3x^{2})$")
        notes_by_option = dict(zip(v["options"], v["optionNotes"]))
        assert notes_by_option[v["answer"]] == "correct"
    assert len(letters) >= 3


def test_wrong_answer_key_is_rejected_and_repaired():
    bad = v_sin(correct_option=1)          # says cos(3x^2) is right; the math says option 0
    llm = FakeLLM({"analysis": ANALYSIS, "variants": [bad, v_exp()]},
                  {"variants": [v_sin(question="Differentiate $y = {{expr}}$ with respect to $x$.")]})
    out = run(llm=llm)
    assert len(llm.calls) == 2
    repair_prompt = llm.calls[1]["messages"][1]["content"]
    assert "answer key is wrong" in repair_prompt
    assert '{"variants": [...]}' in repair_prompt         # analysis already known: variants only
    assert out["meta"]["outcome"] == "repaired" and len(out["variants"]) == 2
    assert out["meta"]["rejectionReasons"]


@pytest.mark.parametrize("variant, problem", [
    (v_sin(verification={"kind": "derivative", "expression": "x^3",
                         "options": ["3x^2", "3*x*x", "x^2", "3x^3"]}), "answer check failed"),
    (v_sin(question="Find the derivative of $\\cos(5x)$.", verification={
        "kind": "derivative", "expression": "sin(3x^2)",
        "options": ["6x*cos(3x^2)", "cos(3x^2)", "-6x*sin(3x^2)", "6x*sin(3x^2)"]}), "does not show the function"),
    (v_sin(concept_key="product-rule"), "differs from the analysed concept"),
    (v_sin(explanation="Differentiate the outer layer and multiply by what is inside, giving the answer shown."),
     "never uses the concept"),
    (v_sin(verification={"kind": "derivative", "expression": "x^3",
                         "options": ["3x^2", "x^2", "3x^3", "x^4/4"]}, question="Find $\\frac{d}{dx}{{expr}}$."),
     "does not require the chain rule"),
    (v_sin(options=["$6x\\cos(3x^2)$", "None of the above", "$-6x\\sin(3x^2)$", "$6x\\sin(3x^2)$"]),
     "all/none of the above"),
    (v_sin(explanation="Option A is right because the chain rule multiplies by the inner function's derivative 6x."),
     "refers to an option by letter"),
    (v_sin(difficulty="challenge"), "was requested"),
    (v_sin(verification={"kind": "derivative", "expression": "sin(3x^2", "options": ["1", "2", "3", "4"]}),
     "cannot be checked"),
    (v_sin(options=["$6x$", "$6x$", "$x$", "$x^2$"], verification={"kind": "none"}), "identical"),
    (v_sin(question="Find $\\frac{d}{dx} \\sin(3x^2) please.", verification={"kind": "none"}), "unbalanced"),
])
def test_quality_gates_reject_bad_variants(variant, problem):
    m = ve.normalize_mistake(MISTAKE_RAW)
    analysis, errs = ve.analysis_from_ai(ANALYSIS, m)
    assert not errs
    v, problems = ve.validate_variant(variant, analysis, m, "medium")
    assert v is None
    assert any(problem in p for p in problems), problems


def test_copies_are_rejected():
    original = v_sin(question=MISTAKE_RAW["question"], verification={"kind": "none"})
    llm = FakeLLM({"analysis": ANALYSIS, "variants": [original, v_exp(), v_exp()]},
                  {"variants": []})
    out = run(llm=llm)
    assert len(out["variants"]) == 1
    reasons = " ".join(llm.calls[1]["messages"][1]["content"].split("\n"))
    assert "too close to the original" in reasons and "same question" in reasons


def test_avoid_list_blocks_repeats():
    m = ve.normalize_mistake(MISTAKE_RAW)
    seen = ve.substitute_placeholder(v_sin()["question"], ve.mc.parse("sin(3x^2)"))
    llm = FakeLLM({"analysis": ANALYSIS, "variants": [v_sin(), v_exp()]}, {"variants": []})
    out = run(llm=llm, body={"count": 2, "avoid": [seen]})
    assert len(out["variants"]) == 1
    assert "already practiced" in llm.calls[1]["messages"][1]["content"]
    assert ve.is_near_copy(seen, seen) and not ve.is_near_copy(seen, "Find the derivative of $\\cos(7x^3)$.")


def test_known_analysis_skips_reanalysis_and_saves_tokens():
    m = ve.normalize_mistake(MISTAKE_RAW)
    first = run(llm=FakeLLM({"analysis": ANALYSIS, "variants": [v_sin(), v_exp()]}))
    llm = FakeLLM({"variants": [v_exp(question="Differentiate $y = {{expr}}$ with respect to $x$.")]})
    out = run(llm=llm, body={"count": 1, "analysis": first["analysis"]})
    prompt = llm.calls[0]["messages"][1]["content"]
    assert "already known" in prompt
    assert llm.calls[0]["max_tokens"] < ve.max_tokens_for(1, True)
    assert out["analysis"]["conceptKey"] == "chain-rule" and len(out["variants"]) == 1
    assert out["analysis"]["diagnosis"]["status"] == "diagnosed"


def test_invalid_json_then_valid_repair():
    llm = FakeLLM("Sure! Here are your questions: [oops", {"analysis": ANALYSIS, "variants": [v_sin(), v_exp()]})
    out = run(llm=llm)
    assert len(llm.calls) == 2 and out["meta"]["outcome"] == "repaired"
    assert "not a JSON object" in llm.calls[1]["messages"][1]["content"]
    assert "the full JSON object" in llm.calls[1]["messages"][1]["content"]


def test_json_inside_prose_is_still_parsed():
    content = "Here you go:\n" + json.dumps({"analysis": ANALYSIS, "variants": [v_sin(), v_exp()]}) + "\nThanks"
    out = run(llm=FakeLLM(content))
    assert out["meta"]["outcome"] == "ok"


def test_repair_is_skipped_when_out_of_time():
    llm = FakeLLM({"analysis": ANALYSIS, "variants": [v_sin(correct_option=2), v_exp()]})
    out = run(llm=llm, deadline=time.monotonic() + 1)
    assert len(llm.calls) == 1
    assert out["meta"]["outcome"] == "partial" and len(out["variants"]) == 1


# --- evaluate-kind (word problems) and non-math subjects ----------------------------------------

PHYS_RAW = dict(MISTAKE_RAW, subject="AP Physics 1", topic="Kinetic energy",
                question="A 4 kg box moves at 2 m/s. What is its kinetic energy?",
                options=["A. 8 J", "B. 16 J", "C. 4 J", "D. 2 J"], answer="A. 8 J", userAnswer="B. 16 J",
                explanation="KE = 1/2 m v^2 = 0.5 x 4 x 4 = 8 J.")
KE_ANALYSIS = dict(ANALYSIS, core_concept="Kinetic energy", concept_key="kinetic-energy",
                   concept_terms=["kinetic energy", "1/2 m v^2"],
                   error_diagnosis={"status": "diagnosed", "likely_error": "Left out the factor 1/2 in KE = 1/2 mv^2.",
                                    "evidence": "16 J", "confidence": "medium"})


def ke_variant(**over):
    v = {
        "question": "A 2 kg cart moves at 3 m/s. What is its kinetic energy?",
        "options": ["9 J", "18 J", "6 J", "3 J"],
        "correct_option": 0,
        "explanation": "Kinetic energy is 1/2 m v^2 = 0.5 x 2 x 9 = 9 J; the velocity is squared and halved.",
        "concept_key": "kinetic-energy",
        "difficulty": "medium",
        "verification": {"kind": "evaluate", "expression": "0.5*2*3^2", "options": ["9", "18", "6", "3"]},
    }
    v.update(over)
    return v


def test_evaluate_kind_checks_the_displayed_numbers():
    out = run(PHYS_RAW, llm=FakeLLM({"analysis": KE_ANALYSIS, "variants": [ke_variant()]}), body={"count": 1})
    v = out["variants"][0]
    assert v["verification"]["status"] == "verified"
    assert sorted(o[3:] for o in v["options"]) == ["18 J", "3 J", "6 J", "9 J"]   # units kept
    m = ve.normalize_mistake(PHYS_RAW)
    analysis, _ = ve.analysis_from_ai(KE_ANALYSIS, m)
    swapped = ke_variant(options=["18 J", "9 J", "6 J", "3 J"])
    v, problems = ve.validate_variant(swapped, analysis, m, "medium")
    assert v is None and any("different value" in p for p in problems)


def test_non_math_subject_is_not_applicable_and_quant_without_check_is_unverified():
    bio_analysis = dict(ANALYSIS, core_concept="Enzyme denaturation", concept_key="enzyme-denaturation",
                        concept_terms=["denature", "active site"])
    bio_variant = {
        "question": "A protease from a hot-spring bacterium is placed in a cold lab freezer overnight. Which describes its shape afterwards?",
        "options": ["It is intact; cold slows enzymes without denaturing them", "It is permanently denatured",
                    "Its active site now fits every substrate", "It has been digested by its own substrate"],
        "correct_option": 0,
        "explanation": "Cold lowers kinetic energy and slows catalysis but does not break the bonds that hold the active site shape; heat is what makes enzymes denature.",
        "concept_key": "enzyme-denaturation", "difficulty": "basic",
        "verification": {"kind": "none"},
    }
    out = run(BIO_RAW, llm=FakeLLM({"analysis": bio_analysis, "variants": [bio_variant]}), body={"count": 1})
    assert out["variants"][0]["verification"]["status"] == "not_applicable"
    calc_conceptual = v_sin(question="The derivative of $\\sin(2x)$ at $x = 0$ tells us what?",
                            options=["the slope 2", "the value 0", "the area 1", "the limit 3"],
                            explanation="By the chain rule the derivative is 2cos(2x), which equals 2 at x = 0: that slope is the rate of change.",
                            verification={"kind": "none"})
    out = run(llm=FakeLLM({"analysis": ANALYSIS, "variants": [calc_conceptual]}), body={"count": 1})
    assert out["variants"][0]["verification"]["status"] == "unverified"


# --- diagnosis is never invented ---------------------------------------------------------------

def test_no_recorded_answer_forces_insufficient_information():
    raw = dict(MISTAKE_RAW, userAnswer="")
    out = run(raw, llm=FakeLLM({"analysis": ANALYSIS, "variants": [v_sin(), v_exp()]}))
    d = out["analysis"]["diagnosis"]
    assert d["status"] == "insufficient_information" and d["likelyError"] is None
    assert "No answer was recorded" in d["reason"]


def test_ungrounded_evidence_is_downgraded():
    analysis = dict(ANALYSIS, error_diagnosis={"status": "diagnosed", "likely_error": "Used the product rule by mistake.",
                                               "evidence": "x^2 sin(x)", "confidence": "high"})
    out = run(llm=FakeLLM({"analysis": analysis, "variants": [v_sin(), v_exp()]}))
    d = out["analysis"]["diagnosis"]
    assert d["status"] == "diagnosed" and d["grounded"] is False and d["confidence"] == "low"


def test_model_saying_insufficient_is_respected():
    analysis = dict(ANALYSIS, error_diagnosis={"status": "insufficient_information", "likely_error": None,
                                               "evidence": None, "confidence": None})
    out = run(llm=FakeLLM({"analysis": analysis, "variants": [v_sin(), v_exp()]}))
    assert out["analysis"]["diagnosis"]["status"] == "insufficient_information"


def test_offline_diagnosis_uses_the_authored_trap():
    d = ve.diagnose_offline(ve.normalize_mistake(MISTAKE_RAW))
    assert d["status"] == "diagnosed" and d["source"] == "explanation" and d["grounded"] is True
    assert "forgetting to multiply by the derivative of the inside" in d["likelyError"]
    other = ve.diagnose_offline(ve.normalize_mistake(dict(MISTAKE_RAW, userAnswer="C. $(3x+1)^3$")))
    assert other["status"] == "insufficient_information"
    sa = ve.diagnose_offline(ve.normalize_mistake(dict(MISTAKE_RAW, options=[], userAnswer="I think 4(3x+1)^3")))
    assert sa["status"] == "insufficient_information"


# --- failures and fallbacks -------------------------------------------------------------------

def test_rate_limit_falls_back_to_templates_for_calculus():
    llm = FakeLLM(ve.LLMError("rate_limited", "429", retry_after=20))
    out = run(llm=llm)
    assert out["generator"] == "template" and len(out["variants"]) == 2
    assert "rate-limiting" in out["notice"]
    assert out["analysis"]["source"] == "template" and out["analysis"]["conceptKey"] == "chain-rule"
    assert out["meta"]["outcome"] == "fallback"
    for v in out["variants"]:
        assert v["verification"]["status"] == "verified" and v["generator"] == "template"


def test_rate_limit_without_a_template_reports_retry_after():
    with pytest.raises(ve.VariantError) as exc:
        run(BIO_RAW, llm=FakeLLM(ve.LLMError("rate_limited", "429", retry_after=20)))
    assert exc.value.code == "rate_limited" and exc.value.retry_after == 20
    assert exc.value.analysis is not None and exc.value.analysis["source"] == "offline"


def test_timeout_is_reported_with_its_code():
    with pytest.raises(ve.VariantError) as exc:
        run(BIO_RAW, llm=FakeLLM(ve.LLMError("timeout")))
    assert exc.value.code == "timeout"


def test_repair_call_failure_keeps_the_first_round():
    llm = FakeLLM({"analysis": ANALYSIS, "variants": [v_sin(), v_exp(correct_option=3)]},
                  ve.LLMError("rate_limited", retry_after=5))
    out = run(llm=llm)
    assert out["generator"] == "ai" and len(out["variants"]) == 1 and out["meta"]["outcome"] == "partial"


def test_all_invalid_without_template_is_an_honest_error():
    bad_bio = {"question": "Q?", "options": ["a", "b", "c", "d"], "correct_option": 0, "explanation": "short"}
    analysis = dict(ANALYSIS, core_concept="Enzyme denaturation", concept_key="enzyme-denaturation",
                    concept_terms=["denature"])
    llm = FakeLLM({"analysis": analysis, "variants": [bad_bio]}, {"variants": [bad_bio]})
    with pytest.raises(ve.VariantError) as exc:
        run(BIO_RAW, llm=llm)
    assert exc.value.code == "invalid_output" and len(llm.calls) == 2


def test_all_invalid_for_calculus_uses_templates_with_a_notice():
    bad = v_sin(correct_option=3)
    llm = FakeLLM({"analysis": ANALYSIS, "variants": [bad]}, {"variants": [bad]})
    out = run(llm=llm, body={"count": 1})
    assert out["generator"] == "template" and "quality checks" in out["notice"]


def test_template_fallback_refuses_a_different_ai_concept():
    related_rates = dict(ANALYSIS, core_concept="Related rates", concept_key="related-rates",
                         concept_terms=["related rates", "implicit differentiation"])
    bad = v_sin(concept_key="related-rates", correct_option=3)
    llm = FakeLLM({"analysis": related_rates, "variants": [bad]}, {"variants": [bad]})
    with pytest.raises(ve.VariantError) as exc:
        run(llm=llm, body={"count": 1})
    assert exc.value.code == "invalid_output"


def test_no_key_calculus_uses_templates_with_grounded_offline_diagnosis():
    out = run(llm=None, body={"count": 2, "level": "basic"})
    assert out["generator"] == "template" and out["notice"] is None and len(out["variants"]) == 2
    assert out["analysis"]["diagnosis"]["source"] == "explanation"
    assert out["variants"][0]["relation"] == "easier" and out["variants"][0]["difficulty"] == "basic"


def test_no_key_non_calculus_is_honest():
    with pytest.raises(ve.VariantError) as exc:
        run(BIO_RAW, llm=None)
    assert exc.value.code == "no_generator"
    assert exc.value.analysis["coreConcept"] == "Enzymes"


def test_client_analysis_is_revalidated():
    m = ve.normalize_mistake(MISTAKE_RAW)
    assert ve.client_analysis({"coreConcept": "x"}, m) is None
    assert ve.client_analysis("nope", m) is None
    forged = ve.client_analysis({"coreConcept": "Chain rule", "conceptKey": "Chain Rule!!", "conceptTerms": ["chain rule", 5],
                                 "solutionMethod": "m", "difficulty": "hard",
                                 "diagnosis": {"status": "diagnosed", "likelyError": "x", "confidence": "certain"}}, m)
    assert forged["conceptKey"] == "chain-rule" and forged["conceptTerms"] == ["chain rule"]
    assert forged["difficulty"] == "medium" and forged["diagnosis"]["confidence"] == "low"
    no_answer = ve.normalize_mistake(dict(MISTAKE_RAW, userAnswer=""))
    assert ve.client_analysis({"coreConcept": "Chain rule", "conceptKey": "chain-rule",
                               "diagnosis": {"status": "diagnosed", "likelyError": "x"}}, no_answer)["diagnosis"]["status"] \
        == "insufficient_information"


def test_every_problem_message_maps_to_a_fixed_code():
    # Codes reach the database; messages (which can quote model output) must not.
    m = ve.normalize_mistake(MISTAKE_RAW)
    analysis, _ = ve.analysis_from_ai(ANALYSIS, m)
    samples = [
        v_sin(correct_option=1), v_sin(concept_key="product-rule"), v_sin(difficulty="challenge"),
        v_sin(options=["$1$", "$1$", "$2$", "None of the above"]), v_sin(verification={"kind": "integral"}),
        v_sin(explanation="Option A is right because the chain rule multiplies by the inner derivative."),
        v_sin(question="Find $\\frac{d}{dx}\\cos(5x)$ now.", verification={
            "kind": "derivative", "expression": "sin(3x^2)",
            "options": ["6x*cos(3x^2)", "cos(3x^2)", "-6x*sin(3x^2)", "6x*sin(3x^2)"]}),
    ]
    for raw in samples:
        _, problems = ve.validate_variant(raw, analysis, m, "medium")
        assert problems
        for p in problems:
            assert ve.problem_code(p) != "other", p
    assert ve.problem_code("verification kind must be one of derivative") == "unknown_check_kind"
    assert ve.problem_code("something unexpected") == "other"


def test_unknown_check_kind_is_sent_back_for_repair():
    m = ve.normalize_mistake(MISTAKE_RAW)
    analysis, _ = ve.analysis_from_ai(ANALYSIS, m)
    v, problems = ve.validate_variant(v_sin(verification={"kind": "integral", "expression": "x"}), analysis, m, "medium")
    assert v is None and any("verification kind must be" in p for p in problems)


def test_numeric_options_are_accepted():
    m = ve.normalize_mistake(MISTAKE_RAW)
    analysis, _ = ve.analysis_from_ai(dict(ANALYSIS, core_concept="Definite integrals", concept_key="definite-integral",
                                           concept_terms=["antiderivative", "fundamental theorem"]), m)
    raw = {"question": "Evaluate $\\int_{1}^{3} {{expr}}\\,dx$.", "options": [26 / 3, 8, 9, 6], "correct_option": 0,
           "explanation": "Find an antiderivative x^3/3 and apply the fundamental theorem: 27/3 - 1/3 = 26/3.",
           "concept_key": "definite-integral", "difficulty": "medium",
           "verification": {"kind": "definite_integral", "expression": "x^2", "lower": 1, "upper": 3,
                            "options": [26 / 3, 8, 9, 6]}}
    v, problems = ve.validate_variant(raw, analysis, m, "medium")
    assert problems == [] and v["verification"]["status"] == "verified"


def test_client_grounded_flag_is_recomputed():
    m = ve.normalize_mistake(MISTAKE_RAW)
    forged = ve.client_analysis({"coreConcept": "Chain rule", "conceptKey": "chain-rule",
                                 "diagnosis": {"status": "diagnosed", "likelyError": "Guess.", "evidence": "nowhere in it",
                                               "grounded": True}}, m)
    assert forged["diagnosis"]["grounded"] is False
    real = ve.client_analysis({"coreConcept": "Chain rule", "conceptKey": "chain-rule",
                               "diagnosis": {"status": "diagnosed", "likelyError": "Forgot u'.", "evidence": "4(3x+1)^3"}}, m)
    assert real["diagnosis"]["grounded"] is True


# --- helpers -----------------------------------------------------------------------------------

@pytest.mark.parametrize("text, value", [
    ("$9.9$ m/s", 9.9), ("45%", 0.45), ("$3.2 \\times 10^{-4}$ M", 3.2e-4), ("$\\frac{3}{4}$", 0.75),
    ("−2.5 N", -2.5), ("1.5e3 J", 1500.0), ("no number", None),
])
def test_display_number(text, value):
    got = ve.display_number(text)
    assert got == (pytest.approx(value) if value is not None else None)


def test_substitute_placeholder_wraps_and_delimits():
    node = ve.mc.parse("3x^2 + 1")
    assert ve.substitute_placeholder("Find $\\int {{expr}}\\,dx$.", node) == "Find $\\int \\left(3x^{2} + 1\\right)\\,dx$."
    assert ve.substitute_placeholder("If $f(x) = {{expr}}$, find f'(x).", node) == "If $f(x) = 3x^{2} + 1$, find f'(x)."
    assert ve.substitute_placeholder("Differentiate {{ expr }}.", node) == "Differentiate $3x^{2} + 1$."


def test_prompt_is_bounded_and_honest_about_missing_answers():
    m = ve.normalize_mistake(dict(MISTAKE_RAW, userAnswer="", question="Q " * 1500, explanation="E " * 1500))
    req = ve.normalize_request({"count": 2, "avoid": ["seen before"]}, m)
    prompt = ve.build_user_prompt(m, req, None, 2)
    assert "Student's answer: (not recorded)" in prompt
    assert "- seen before" in prompt
    assert len(prompt) < 3500
