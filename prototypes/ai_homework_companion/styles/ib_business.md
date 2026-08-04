# 🌍 IB Business Management — Style Guide

This is **data**, not prose to skim once: the practice-set generator agent
(`prompts/generate_practice_set.md`) reads this file to decide how an IB
Business Management case study and its questions should look, and it's
written so Gemma can also hand a printed copy straight to a student as an
exam-technique crib sheet.

Anything below marked **⚠️ verify with Gemma (C-questions)** is a detail
this scaffold deliberately hasn't guessed at — see
[`QUESTIONS_FOR_GEMMA.md`](../../../QUESTIONS_FOR_GEMMA.md), section C. Do
not silently invent a number where you see that flag; ask instead.

## 1. Paper structure

| Paper | What it's built around | Notes |
|---|---|---|
| **Paper 1** | A case study / business scenario, with structured short- and extended-response questions, often split into an (a)/(b) pair under one numbered question | SL and HL both sit this |
| **Paper 2** | Unseen stimulus material (shorter data/case extracts than Paper 1), including the extended "To what extent" essay | SL and HL both sit this |
| **Paper 3** | ⚠️ verify with Gemma (C-questions) — HL sits an additional paper; exact format and whether it's part of this generator's first-pass scope needs confirming | HL only |
| Internal Assessment | A written commentary, not an exam-style paper | Out of scope for this generator — it produces exam-style practice, not IA drafts |

⚠️ Exact current-syllabus paper count, timing, and whether Paper 1's case
study is pre-released or unseen should be confirmed against the official
IB subject guide (or with Gemma) before generating a live set — flag
raised pending **C1**/**C2**.

## 2. Command-word ladder

IB's command terms build in demand from bottom to top. A generated
question's marks should match the command word's position on this ladder
— don't pair "Define" with a 12-mark tariff, or "Evaluate" with a 2-mark
one.

| Command word | What it demands | Typical BLT depth |
|---|---|---|
| **Define** | State the precise meaning of a business term — no explanation, no case-study context needed | Knowledge only — no BLT |
| **Describe** | Give a detailed, accurate account of a feature, trend, or process drawn from the case study | Point + light Because |
| **Explain** | Give a reason *and* develop it — say why something happens or matters, tied to this business | Point + Because |
| **Analyse** | Break an issue into causes and effects, building a chain of reasoning to a likely knock-on effect, without yet passing judgement | Point + Because + Leads To |
| **Examine** | Investigate an issue or argument closely, surfacing the reasoning or assumptions behind it — similar depth to Analyse, more critical in tone | Point + Because + Leads To |
| **Discuss** | Set out reasoned points on more than one side of an issue, applied to the business | Two BLT strands, lighter final judgement than Evaluate |
| **Evaluate** | Weigh competing arguments and reach a final, justified judgement on overall impact — including whether it's short- or long-term | Full BLT, ideally + Moreover |
| **"To what extent…"** | Build a balanced argument for and against a given statement, concluding with a considered, supported judgement on how far you agree | Full BLT + Moreover, essay length |

## 3. Mark sizes and timing rule-of-thumb

| Marks | Typical role |
|---|---|
| **2** | Define — knowledge only |
| **4–6** | Describe / Explain — short application |
| **10** | (a)/(b) split question — e.g. an Explain/Analyse (a) worth fewer marks, feeding a Discuss/Evaluate (b) worth more |
| **20** | Extended-response essay — Evaluate / "To what extent", Paper 2 |

**Timing rule of thumb:** roughly one minute per mark, plus a few
minutes of planning before starting any 8-mark-or-higher response —
sketching a BLT paragraph plan first saves more time than it costs.

## 4. Case-study conventions

- A **named fictional business** — never a real company, so the case
  study can be tuned exactly to the marks and topics being practised.
- **Quantitative data**: revenue, costs, and market share figures a
  student can quote and manipulate (e.g. "revenue rose from $2.1m to
  $2.6m") — numbers should be usable as evidence, not decoration.
- **A decision or tension** the business is facing — an expansion
  choice, a pricing dilemma, a stakeholder conflict — something the
  extended-response questions can be built around.
- **International context**, reflecting IB's global candidate base — the
  business can be based in any country, and may operate across more than
  one; don't default to a UK setting the way an Edexcel case study might.

## 5. BLT expectations at each level

Students answer extended questions in **BLT**: **P**oint, **B**ecause
(the full explanation), **L**eads to (the analysis / knock-on effect),
**T**herefore (the final impact, stated as short- or long-term) —
stronger students add a **Moreover** sentence bringing in a second,
linked point.

Application matters as much as structure: generic essays fail even with
a technically correct BLT shape. References to the named business are
required throughout — weaker answers get this only in the **Because**
sentence, while strong Evaluate/"To what extent" answers weave the
business's actual numbers and situation through every BLT element,
including inferences that go a step beyond what's written (e.g. reading
"revenue rose but profit fell" as a signal of rising costs, even though
the case study never says "costs" outright).

| Level | Application expectation |
|---|---|
| Define / Describe | None required — knowledge or a case-study fact stated plainly |
| Explain / Analyse / Examine | Application required in the Because sentence, minimum |
| Discuss / Evaluate / "To what extent" | Application required throughout every BLT element, plus at least one inference beyond what's directly stated |

## 6. Unit-4-style real-world-example rule

**Does not apply to IB.** IB Business Management questions are answered
entirely from the given case study and stimulus material — there is no
IB equivalent of Edexcel IAL Unit 4's requirement to bring in real-world
examples. See `styles/edexcel_ial_business.md` §6 for the one paper
across these three boards where that rule *does* apply.
