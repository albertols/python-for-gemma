# 🇬🇧 Edexcel International A Level (IAL) Business — Style Guide

This is **data**, not prose to skim once: the practice-set generator agent
(`prompts/generate_practice_set.md`) reads this file to decide how an
Edexcel IAL Business case study and its questions should look, and it's
written so Gemma can also hand a printed copy straight to a student as an
exam-technique crib sheet.

Anything below marked **⚠️ verify with Gemma (C-questions)** is a detail
this scaffold deliberately hasn't guessed at — see
[`QUESTIONS_FOR_GEMMA.md`](../../../QUESTIONS_FOR_GEMMA.md), section C. Do
not silently invent a number where you see that flag; ask instead.

## 1. Paper structure

Four units, sat as separate papers:

| Unit | Title | Level |
|---|---|---|
| **Unit 1** | Marketing and People | AS |
| **Unit 2** | Managing Business Activities | AS |
| **Unit 3** | Business Decisions and Strategy | A2 |
| **Unit 4** | Global Business | A2 |

Each unit's paper is built around one or more case studies / data-response
extracts, moving from short knowledge questions up to one extended-response
or essay question. ⚠️ Unit numbers/titles above match the specification
this guide was written against; specifications get revised, so confirm
they (plus exact question count, total marks, and timing per unit)
against the specific papers Gemma teaches — flag raised pending
**C1**/**C2**.

## 2. Command-word ladder

Edexcel's command words build in demand from bottom to top. A generated
question's marks should match the command word's position on this ladder
— don't pair "State" with a 12-mark tariff, or "Evaluate" with a 2-mark
one.

| Command word | What it demands | Typical BLT depth |
|---|---|---|
| **State** | Give a short, undeveloped answer — a fact, a name, an example. No explanation required | Knowledge only — no BLT |
| **Define** | State the precise meaning of a business term — no explanation, no case-study context needed | Knowledge only — no BLT |
| **Explain** | Give a reason *and* develop it — say why something happens or matters, tied to this business | Point + Because |
| **Analyse** | Break an issue into causes and effects, building a chain of reasoning to a likely knock-on effect, without yet passing judgement | Point + Because + Leads To |
| **Discuss** | Set out reasoned points on more than one side of an issue, applied to the business | Two BLT strands, lighter final judgement than Evaluate |
| **Assess** | Weigh up the importance, success, or extent of something and reach a supported judgement | Full BLT, one strand |
| **Evaluate** | Weigh competing arguments and reach a final, justified judgement on overall impact — including whether it's short- or long-term | Full BLT, ideally + Moreover |

⚠️ **Assess** vs **Evaluate**: some Edexcel mark schemes band Assess a
notch below Evaluate (fewer marks reserved for the very top judgement
band); the exact banding is unit- and paper-specific — confirm against the
published mark scheme (Examwizard or similar) before treating them as
interchangeable. See **B3** in `QUESTIONS_FOR_GEMMA.md` for where Gemma's
mark schemes live.

## 3. Mark sizes and timing rule-of-thumb

| Marks | Typical role |
|---|---|
| **2** | Define / State — knowledge only |
| **4** | Short Explain or State-and-develop |
| **8** | Analyse |
| **10** | Discuss / Assess |
| **12** | Assess / Evaluate, case-study based |
| **20** | Evaluate essay — the paper's top-tariff extended response, typically on Units 3–4 |

**Timing rule of thumb:** roughly one minute per mark, plus a few minutes
of planning before starting any 8-mark-or-higher response — sketching a
BLT paragraph plan first saves more time than it costs.

## 4. Case-study conventions

- A **named fictional business** — never a real company, so the case
  study can be tuned exactly to the marks and topics being practised.
- **Quantitative data**: revenue, costs, and market share figures a
  student can quote and manipulate (e.g. "revenue rose from £2.1m to
  £2.6m") — numbers should be usable as evidence, not decoration.
- **A decision or tension** the business is facing — an expansion
  choice, a pricing dilemma, a stakeholder conflict — something the
  extended-response questions can be built around.
- **UK-style register**: Edexcel IAL is aimed at international candidates
  but conventionally uses UK-style business framing (£ currency, UK
  company naming conventions like "Ltd") even where the business itself
  operates internationally, which is especially common on Unit 4. ⚠️
  Confirm this matches what Gemma's actual papers look like — flag raised
  pending **C2**/**C3**.

## 5. BLT expectations at each level

Students answer extended questions in **BLT**: **P**oint, **B**ecause
(the full explanation), **L**eads to (the analysis / knock-on effect),
**T**herefore (the final impact, stated as short- or long-term) —
stronger students add a **Moreover** sentence bringing in a second,
linked point.

Application matters as much as structure: generic essays fail even with
a technically correct BLT shape. References to the named business are
required throughout — weaker answers get this only in the **Because**
sentence, while strong Assess/Evaluate answers weave the business's
actual numbers and situation through every BLT element, including
inferences that go a step beyond what's written (e.g. reading "revenue
rose but profit fell" as a signal of rising costs, even though the case
study never says "costs" outright).

| Level | Application expectation |
|---|---|
| State / Define | None required — knowledge or a case-study fact stated plainly |
| Explain / Analyse | Application required in the Because sentence, minimum |
| Discuss / Assess / Evaluate | Application required throughout every BLT element, plus at least one inference beyond what's directly stated |

## 6. Unit-4-only real-world-example rule

**This is the one paper across all three boards where this rule
applies.** Every other paper this generator produces — IB Papers 1–3,
Edexcel IAL Units 1–3, Edexcel IGCSE Papers 1–2 — rewards students for
staying entirely within the given case study; bringing in an outside
example there doesn't earn extra marks and costs time better spent on
application.

**Unit 4 (Global Business) is the exception.** Students are expected to
bring in **real-world business examples beyond the case study** — a named
real company illustrating a concept such as foreign direct investment,
exchange-rate risk, protectionism, or a trading bloc — to support their
Analyse/Discuss/Evaluate answers. When generating a Unit 4 practice set:

- Note this requirement explicitly in the question text or an
  accompanying instruction (e.g. "support your answer with an example of
  a real multinational business"), so students practise the habit, not
  just the theory.
- Do not add this instruction to Units 1–3 questions, or to any IB or
  IGCSE question — doing so would misrepresent how those papers are
  actually marked.
