# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
VARAI — FootballCourt Intelligent Contract
==========================================

This is where the football verdict is ACTUALLY decided.

The backend does not judge anything. It stores cases and relays them here.
The decision, the confidence and the consensus all originate from GenLayer
validators executing this contract.

Consensus model
---------------
We use `gl.vm.run_nondet(leader_fn, validator_fn)` rather than
`gl.eq_principle.strict_eq`.

Why: strict_eq on raw LLM output is a linter error (GL-S03) and is wrong here.
Two honest referees will phrase reasoning differently while reaching the same
verdict. So the leader produces a full structured judgment, and each validator
independently re-judges the same case and AGREES only if the *operative parts*
match — the decision, and a confidence within tolerance. Prose is never compared.

That means the consensus reported by VARAI is a real count of independent
validator agreement, not a number we invented.
"""

from genlayer import *

import json
import typing


# ---------------------------------------------------------------------------
# Decision vocabulary — the contract will not return anything outside this set.
# ---------------------------------------------------------------------------
DECISIONS_BY_INCIDENT: dict[str, list[str]] = {
    "PENALTY_CLAIM":  ["PENALTY", "NO_PENALTY"],
    "FOUL_CLAIM":     ["FOUL", "NO_FOUL"],
    "CARD_DECISION":  ["RED_CARD", "YELLOW_CARD", "NO_CARD"],
    "HANDBALL_CLAIM": ["HANDBALL", "NO_HANDBALL"],
    "GOAL_CLAIM":     ["GOAL", "NO_GOAL"],
    "OFFSIDE_CLAIM":  ["OFFSIDE", "ONSIDE"],
}

# Always available — the contract must be allowed to decline to invent facts.
INSUFFICIENT = "INSUFFICIENT_EVIDENCE"

# Confidence tolerance when a validator compares its judgment to the leader's.
CONFIDENCE_TOLERANCE = 0.25


def _laws_for(incident_type: str) -> str:
    """Relevant Laws of the Game context supplied to the model as grounding."""
    laws = {
        "PENALTY_CLAIM": (
            "Law 12: A direct free kick (penalty inside the area) is awarded if a player commits "
            "a careless, reckless or excessive-force offence: charging, jumping at, kicking, pushing, "
            "striking, tackling or challenging, tripping. Contact alone is NOT an offence — minimal or "
            "incidental contact, or contact initiated by the attacker, is not a foul. If the defender "
            "plays the ball first and cleanly, subsequent contact is normally not an offence."
        ),
        "FOUL_CLAIM": (
            "Law 12: An offence requires a careless, reckless or excessive-force challenge. "
            "'Careless' = lacking attention/consideration. 'Reckless' = disregard for danger to an "
            "opponent (caution). 'Excessive force' = endangering safety (sending off). Fair shoulder-to-"
            "shoulder charge with the ball within playing distance is legal."
        ),
        "CARD_DECISION": (
            "Law 12: A caution (yellow) is for unsporting behaviour, reckless challenges, dissent, "
            "persistent offences, delaying the restart. A sending-off (red) is for serious foul play "
            "(excessive force / endangering safety), violent conduct, spitting, denying an obvious "
            "goalscoring opportunity (DOGSO), or two cautions. Consider intensity, point of contact, "
            "speed, and whether the ball was played."
        ),
        "HANDBALL_CLAIM": (
            "Law 12: It is an offence if a player deliberately touches the ball with hand/arm, or "
            "touches it with a hand/arm that has made their body unnaturally bigger, or scores directly "
            "with hand/arm. It is NOT an offence if the ball comes off the player's own body/another "
            "player nearby, or the arm is close to the body and not extended, or the player is falling "
            "and the arm supports the body without extending laterally/vertically."
        ),
        "GOAL_CLAIM": (
            "Law 10: A goal is scored when the whole of the ball passes over the goal line, between the "
            "posts and under the crossbar, provided no offence was committed by the scoring team first."
        ),
        "OFFSIDE_CLAIM": (
            "Law 11: A player is offside if any part of the head, body or feet with which they can score "
            "is nearer the opponents' goal line than both the ball and the second-last opponent AT THE "
            "MOMENT THE BALL IS PLAYED by a team-mate, and they then become involved in active play. "
            "Level is onside. A player cannot be offside from a throw-in, corner or goal kick."
        ),
    }
    return laws.get(incident_type, "Law 12 (fouls and misconduct) and general principles of the Laws of the Game.")


class FootballCourt(gl.Contract):
    """On-chain registry of football cases and the verdicts GenLayer reached."""

    # case_id -> JSON string of the submitted case
    cases: TreeMap[str, str]
    # case_id -> JSON string of the verdict produced by validator consensus
    verdicts: TreeMap[str, str]
    case_count: u256

    def __init__(self) -> None:
        self.case_count = u256(0)

    # -----------------------------------------------------------------------
    # 1. OPEN A CASE — pure storage, deterministic, no AI involved.
    # -----------------------------------------------------------------------
    @gl.public.write
    def open_case(self, case_id: str, payload: str) -> str:
        assert len(case_id) > 0, "case_id required"
        assert len(case_id) <= 64, "case_id too long"
        assert len(payload) <= 20000, "payload too large"
        assert case_id not in self.cases, "case already exists"

        data = json.loads(payload)

        incident_type = data.get("incidentType", "")
        assert incident_type in DECISIONS_BY_INCIDENT, f"unsupported incidentType: {incident_type}"
        assert len(data.get("description", "")) >= 20, "description too short to judge"

        self.cases[case_id] = payload
        self.case_count = u256(self.case_count + 1)
        return case_id

    # -----------------------------------------------------------------------
    # 2. JUDGE THE CASE — the actual decentralized AI referee decision.
    # -----------------------------------------------------------------------
    @gl.public.write
    def judge_case(self, case_id: str) -> str:
        assert case_id in self.cases, "unknown case"
        assert case_id not in self.verdicts, "case already judged"

        # Read contract state into locals: `self` is not usable inside a
        # non-deterministic block.
        payload = self.cases[case_id]
        data = json.loads(payload)

        incident_type = data.get("incidentType", "")
        options = DECISIONS_BY_INCIDENT[incident_type] + [INSUFFICIENT]
        law_context = _laws_for(incident_type)

        competition = str(data.get("competition", "Unknown competition"))
        home_team = str(data.get("homeTeam", "Home"))
        away_team = str(data.get("awayTeam", "Away"))
        minute = str(data.get("minute", "?"))
        description = str(data.get("description", ""))
        referee_call = str(data.get("refereeCall", "not stated"))

        # Evidence is passed as supplied. The contract is told explicitly that a
        # URL is only a reference — it must not claim to have watched it.
        evidence_items = data.get("evidence", [])
        if evidence_items:
            evidence_block = "\n".join(
                f"  - [{e.get('kind', 'TEXT')}] {e.get('value', '')}"
                for e in evidence_items
            )
        else:
            evidence_block = "  (no evidence supplied)"

        prompt = f"""You are an experienced football referee sitting on a video review panel.
Judge ONE incident using only the information supplied below.

=================== CASE ===================
Competition : {competition}
Match       : {home_team} vs {away_team}
Minute      : {minute}
Incident    : {incident_type}
On-field call: {referee_call}

Description as submitted:
\"\"\"{description}\"\"\"

Evidence references supplied:
{evidence_block}

=================== APPLICABLE LAW ===================
{law_context}

=================== HOW YOU MUST REASON ===================
Work through these stages in order. Do not skip to the verdict.

1. CASE FACTS   — List ONLY facts explicitly established by the description or evidence.
2. EVIDENCE     — State which supplied item supports each fact.
3. RULE         — State which principle of the Laws of the Game governs this incident.
4. ANALYSIS     — Apply the rule to the established facts.
5. ALTERNATIVES — State the strongest competing interpretation and why it is weaker.
6. VERDICT      — Choose the strongest supported conclusion.
7. CONFIDENCE   — How strongly the established facts support that verdict.

=================== CRITICAL HONESTY RULES ===================
- You have NOT watched any video and have NOT opened any URL. Evidence URLs are
  references only. Never describe footage you were not given in text.
- Do NOT invent facts (speed, body part, intent, distance) that were not supplied.
- If the supplied facts cannot support any verdict, you MUST return "{INSUFFICIENT}".
  Returning that is a correct and valued outcome, not a failure.
- For each criterion, use "confirmed" only for something explicitly stated;
  "unclear" when not established; "not_applicable" when irrelevant.

=================== OUTPUT ===================
Respond with ONLY this JSON object and nothing else:
{{
  "decision": one of {json.dumps(options)},
  "confidence": a number between 0.0 and 1.0,
  "reasoning": "3-6 sentences walking through facts, rule, analysis and the alternative you rejected",
  "criteria": {{
    "location": "penalty_area" | "outside_area" | "unclear",
    "playerContact": "confirmed" | "unclear" | "none" | "not_applicable",
    "ballContact": "confirmed" | "unclear" | "none" | "not_applicable",
    "challengeIntensity": "low" | "medium" | "high" | "unclear",
    "natureOfChallenge": "short phrase, or unclear",
    "evidenceSufficiency": "sufficient" | "partial" | "insufficient"
  }},
  "alternativeInterpretation": "the competing reading you rejected, one sentence"
}}"""

        # -------------------------------------------------------------------
        # Leader: produce the full structured judgment.
        # -------------------------------------------------------------------
        def leader_fn() -> str:
            raw = gl.nondet.exec_prompt(prompt)
            cleaned = raw.replace("```json", "").replace("```", "").strip()
            parsed = json.loads(cleaned)

            decision = str(parsed.get("decision", "")).upper().strip()
            if decision not in options:
                decision = INSUFFICIENT

            try:
                confidence = float(parsed.get("confidence", 0.0))
            except (TypeError, ValueError):
                confidence = 0.0
            confidence = max(0.0, min(1.0, confidence))

            # A verdict of INSUFFICIENT_EVIDENCE must not carry a high score.
            if decision == INSUFFICIENT:
                confidence = min(confidence, 0.5)

            criteria = parsed.get("criteria", {})
            if not isinstance(criteria, dict):
                criteria = {}

            normalized = {
                "decision": decision,
                "confidence": round(confidence, 2),
                "reasoning": str(parsed.get("reasoning", ""))[:2000],
                "criteria": {
                    "location": str(criteria.get("location", "unclear")),
                    "playerContact": str(criteria.get("playerContact", "unclear")),
                    "ballContact": str(criteria.get("ballContact", "unclear")),
                    "challengeIntensity": str(criteria.get("challengeIntensity", "unclear")),
                    "natureOfChallenge": str(criteria.get("natureOfChallenge", "unclear"))[:200],
                    "evidenceSufficiency": str(criteria.get("evidenceSufficiency", "partial")),
                },
                "alternativeInterpretation": str(parsed.get("alternativeInterpretation", ""))[:600],
            }
            return json.dumps(normalized, sort_keys=True)

        # -------------------------------------------------------------------
        # Validator: independently re-judge, then agree only on the operative
        # parts. Reasoning prose is deliberately NOT compared.
        # -------------------------------------------------------------------
        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                # Leader errored or rolled back — do not rubber-stamp it.
                return False

            leader_raw = leader_result.calldata
            if not isinstance(leader_raw, str):
                return False

            try:
                leader_view = json.loads(leader_raw)
                my_view = json.loads(leader_fn())
            except Exception:
                return False

            # 1. The decision itself must match.
            if leader_view.get("decision") != my_view.get("decision"):
                return False

            # 2. Confidence must be in the same neighbourhood.
            try:
                delta = abs(float(leader_view.get("confidence", 0)) - float(my_view.get("confidence", 0)))
            except (TypeError, ValueError):
                return False
            if delta > CONFIDENCE_TOLERANCE:
                return False

            # 3. The evidence-sufficiency read must agree — this is what stops
            #    one validator inventing facts another did not see.
            lc = leader_view.get("criteria", {})
            mc = my_view.get("criteria", {})
            if lc.get("evidenceSufficiency") != mc.get("evidenceSufficiency"):
                return False

            return True

        # This call is the consensus event. Validators vote; GenLayer records it.
        verdict_json = gl.vm.run_nondet(leader_fn, validator_fn)

        self.verdicts[case_id] = verdict_json
        # Return the JSON STRING, not a parsed dict. The GenVM calldata encoder
        # cannot serialise arbitrary Python dicts as a return value, and doing
        # so aborts the transaction after the validators have already agreed.
        # Callers parse this string; get_verdict() returns the same shape.
        return verdict_json

    # -----------------------------------------------------------------------
    # Read methods
    # -----------------------------------------------------------------------
    @gl.public.view
    def get_verdict(self, case_id: str) -> str:
        if case_id not in self.verdicts:
            return ""
        return self.verdicts[case_id]

    @gl.public.view
    def get_case(self, case_id: str) -> str:
        if case_id not in self.cases:
            return ""
        return self.cases[case_id]

    @gl.public.view
    def has_verdict(self, case_id: str) -> bool:
        return case_id in self.verdicts

    @gl.public.view
    def get_case_count(self) -> int:
        return int(self.case_count)
