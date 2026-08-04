# 🎒 Edexcel IGCSE Business — Style Guide

This is **data**, not prose to skim once: the practice-set generator agent
(`prompts/generate_practice_set.md`) reads this file to decide how an
Edexcel IGCSE Business case study and its questions should look, and it's
written so Gemma can also hand a printed copy straight to a student as an
exam-technique crib sheet.

Anything below marked **⚠️ verify with Gemma (C-questions)** is a detail
this scaffold deliberately hasn't guessed at — see
[`QUESTIONS_FOR_GEMMA.md`](../../../QUESTIONS_FOR_GEMMA.md), section C. Do
not silently invent a number where you see that flag; ask instead.

## 1. Paper structure

⚠️ There is more than one Pearson International GCSE Business
specification in circulation, so the exact paper count and structure
below is a general starting point, not a confirmed fact — flag raised
pending **C1**/**C2**.

| Paper | What it's built around |
|---|---|
| **Paper 1** | Several shorter business contexts/case studies (rather than one long one), each followed by a run of rising-tariff structured questions |
| **Paper 2** | Same style as Paper 1 — more, shorter contexts rather than one extended case |

This is the one board of the three where a practice set may sensibly
contain **more than one short case study** rather than a single extended
one — see §4.

## 2. Command-word ladder

Edexcel's command words build in demand from bottom to top. A generated
question's marks should match the command word's position on this ladder
— don't pair "State" with a 9-mark tariff, or "Evaluate" with a 2-mark
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

## 3. Mark sizes and timing rule-of-thumb

IGCSE questions top out lower than IB or Edexcel IAL — there is no
20-mark essay tier here (that belongs to AS/A-level and IB content); the
highest tariff on a typical IGCSE Business paper is an Assess/Evaluate
question worth around 8–12 marks.

| Marks | Typical role |
|---|---|
| **2** | Define / State — knowledge only |
| **4** | Short Explain |
| **6** | Analyse |
| **8–9** | Discuss / Assess |
| **12** | Evaluate — top tariff on this paper, ⚠️ confirm exact ceiling against Gemma's specific paper (pending **C2**) |

**Timing rule of thumb:** roughly one minute per mark, plus a minute or
two of planning before starting any 6-mark-or-higher response — sketching
a BLT paragraph plan first saves more time than it costs.

## 4. Case-study conventions

- A **named fictional business** per context — never a real company, so
  each case study can be tuned exactly to the marks and topics being
  practised. Because IGCSE papers commonly use several shorter contexts
  rather than one long one (see §1), a single `PracticeSet.case_study`
  generated for this board may need to read as 2–3 short vignettes rather
  than one extended narrative — ⚠️ confirm which shape matches Gemma's
  actual papers (pending **C2**/**C3**).
- **Quantitative data**: revenue, costs, and market share figures a
  student can quote and manipulate (e.g. "revenue rose from £120,000 to
  £150,000") — numbers should be usable as evidence, not decoration.
- **A decision or tension** the business is facing — an expansion
  choice, a pricing dilemma, a stakeholder conflict — something the
  higher-tariff questions can be built around, scaled to IGCSE's simpler
  business contexts (smaller, often single-owner or partnership
  businesses, rather than large multinationals).
- **Register**: Edexcel IGCSE is aimed at international candidates;
  conventionally uses UK-style business framing (£ currency, UK company
  naming conventions like "Ltd") but the setting itself can be UK or
  international — ⚠️ confirm which fits Gemma's cohort (pending **C2**).

## 5. BLT expectations at each level

Students answer extended questions in **BLT**: **P**oint, **B**ecause
(the full explanation), **L**eads to (the analysis / knock-on effect),
**T**herefore (the final impact, stated as short- or long-term) —
stronger students add a **Moreover** sentence bringing in a second,
linked point.

Application matters as much as structure: generic answers fail even with
a technically correct BLT shape. References to the named business are
required throughout — weaker answers get this only in the **Because**
sentence, while strong Assess/Evaluate answers weave the business's
actual numbers and situation through every BLT element, including
inferences that go a step beyond what's written (e.g. reading "revenue
rose but profit fell" as a signal of rising costs, even though the case
study never says "costs" outright). At IGCSE level, the BLT chain is
typically shorter and simpler than IAL or IB — one clear strand, well
applied, rather than the Moreover-extended chains expected at the top of
IAL/IB.

| Level | Application expectation |
|---|---|
| State / Define | None required — knowledge or a case-study fact stated plainly |
| Explain / Analyse | Application required in the Because sentence, minimum |
| Discuss / Assess / Evaluate | Application required throughout every BLT element |

## 6. Unit-4-style real-world-example rule

**Does not apply to IGCSE.** Edexcel IGCSE Business questions are
answered entirely from the given case study — there is no IGCSE
equivalent of Edexcel IAL Unit 4's requirement to bring in real-world
examples. See `styles/edexcel_ial_business.md` §6 for the one paper
across these three boards where that rule *does* apply.
