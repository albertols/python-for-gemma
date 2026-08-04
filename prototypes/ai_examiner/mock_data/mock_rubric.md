# Mock rubric — 12-mark "Assess" question

⚠️ **This is illustrative, not a real mark scheme.** It's built from
general knowledge of how Edexcel/IB-style level-descriptor mark schemes
are typically structured (see `styles/edexcel_ial_business.md` §2–3 in
the `ai_homework_companion` prototype for the command-word ladder this
follows), not copied or adapted from an official published mark scheme.
It exists so `MarkScheme` and the marking pipeline have something real
to load and test against before a genuine one arrives. Treat every
number and phrase below as a placeholder until **B3** in
[`QUESTIONS_FOR_GEMMA.md`](../../../QUESTIONS_FOR_GEMMA.md) tells us
where Gemma's real mark schemes live (Examwizard or otherwise), and swap
this file for the real thing at that point — do not mark a real
student's real answer against this file.

## Question (illustrative)

> **Assess** whether Green Grocers Ltd should expand its online delivery
> service. (12 marks)

Command word: **Assess** — per the command-word ladder, this expects a
full, single-strand BLT chain (Point, Because, Leads to, Therefore) with
application woven throughout, and a supported final judgement. See the
BLT module docstring in `src/ai_examiner/models.py` for what each BLT
element means.

## Level descriptors

| Level | Marks | BLT expectation | Application expectation |
|---|---|---|---|
| **Level 1** | 1–3 | Point(s) made with little or no development — Because, if present, is thin or generic; no Leads to or Therefore | Little or no reference to Green Grocers specifically; answer could apply to almost any business |
| **Level 2** | 4–6 | One BLT strand attempted but incomplete — typically Point + Because present, Leads to underdeveloped, Therefore missing or asserted without support | Application only in the Because sentence, and only lightly (e.g. names the business but doesn't use its figures or situation) |
| **Level 3** | 7–9 | One complete BLT strand — Point, Because, Leads to, and Therefore all present and logically connected | Application runs through most of the BLT chain, referencing Green Grocers' actual numbers or context, though not always in every element |
| **Level 4** | 10–12 | One complete, well-developed BLT strand, ideally extended with a **Moreover** second linked point; final judgement (Therefore) is clearly framed as short-term vs. long-term impact | Application woven through every BLT element, including at least one inference that goes a step beyond what the case study states directly (e.g. reading "revenue rose but profit fell" as a sign of rising costs, even though the case study never says "costs" outright) |

Marks within a level are typically awarded on a best-fit basis — the
level descriptor doesn't have to be met perfectly in every sentence, but
the answer should sit closer to that level's description than either
neighbour's before being placed within its mark range.

## How this maps onto `MarkScheme`

```python
from ai_examiner.models import MarkScheme

mock_scheme = MarkScheme(
    levels={
        1: "Point(s) with little or no development; little or no application.",
        2: "One incomplete BLT strand; only light application.",
        3: "One complete BLT strand; application through most of the chain.",
        4: "One complete strand (+ Moreover ideally); application throughout, "
           "including at least one inference beyond the case study.",
    },
    max_marks=12,
)
```

Once B1 (real anonymised sample scans) and B3 (where real mark schemes
live) are both answered, this file — and the `mock_scheme` shape above —
should be replaced with the genuine mark scheme for whichever paper is
marked first.
