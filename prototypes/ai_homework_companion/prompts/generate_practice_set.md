# Prompt: Generate a practice set

This is the prompt template a Claude agent runs to turn a request like
"give me a 10-mark IB set on marketing" into an exam-style practice paper.
It is filled in — the `{{placeholders}}` replaced with real values — then
run as an agent turn; it isn't executable Python.

## Inputs

| Placeholder | Meaning | Example |
|---|---|---|
| `{{board}}` | Which exam board/qualification | `Edexcel IAL Business` |
| `{{unit_or_topic}}` | The unit (Edexcel IAL) or topic/syllabus section (IB, IGCSE) to practise | `Unit 4: Global Business` |
| `{{question_sizes}}` | Which mark tariffs to include | `2, 8, 20` |
| `{{case_study_length}}` | Roughly how long the case study should be | `250 words, one business` |

## Prompt

```
You are generating an exam-style practice set for {{board}}, covering
{{unit_or_topic}}.

1. Read the matching style guide before writing anything (paths below are
   relative to the `ai_homework_companion` prototype root, i.e.
   `prototypes/ai_homework_companion/`):
   - IB Business → `prototypes/ai_homework_companion/styles/ib_business.md`
   - Edexcel IAL Business → `prototypes/ai_homework_companion/styles/edexcel_ial_business.md`
   - Edexcel IGCSE Business → `prototypes/ai_homework_companion/styles/edexcel_igcse_business.md`
   Everything below defers to that file — its command-word ladder, mark
   sizes, case-study conventions, and BLT expectations are the source of
   truth, not general exam knowledge. If the style guide flags a detail
   "⚠️ verify with Gemma", do not invent a number to fill the gap — pick
   the most defensible convention and say in your output that it's
   unconfirmed, rather than presenting a guess as settled fact.

2. Write ONE case study that:
   - Centres on a single named fictional business (or, for Edexcel
     IGCSE, follows that board's convention of several short contexts —
     check the style guide).
   - Includes quantitative data (revenue, costs, market share, or
     similar) a student can actually quote and manipulate in an answer.
   - Presents a clear decision or tension the business is facing.
   - Matches the style guide's register (currency, company-naming
     convention, UK vs. international setting) and is roughly
     {{case_study_length}}.
   - If {{board}} is Edexcel IAL Business and {{unit_or_topic}} is Unit 4
     (Global Business): also make sure at least one question invites a
     real-world example beyond the case study, per that style guide's
     §6. For every other board/unit, do NOT invite outside examples —
     those papers are marked on case-study application alone.

3. Write questions that:
   - Use command words drawn only from {{board}}'s ladder in the style
     guide (never mix boards' command words).
   - Match the requested {{question_sizes}} to the style guide's mark
     table — pick command words whose typical demand fits each size.
   - Reference the named business explicitly in the question text
     itself, not just implicitly.
   - Together cover {{unit_or_topic}} in a way a teacher would recognise
     as fair practice, not a random grab-bag.

4. Output the result as PracticeSet-shaped markdown, in this exact shape:

   # {{title of the business/paper}}

   ## Case study

   {{the case study text}}

   ## Questions

   1. **{{command word}}** ({{marks}} marks) {{question text}}
   2. **{{command word}}** ({{marks}} marks) {{question text}}
      ...

   **Total: {{sum of all marks}} marks**

   This maps directly onto `ai_homework_companion.models.PracticeSet` —
   `title`, `case_study`, and an ordered list of `PracticeQuestion(command_word, marks, text)`
   — so a later step can parse this markdown straight into that shape.

5. Finish with this exact note, unedited, so nobody mistakes a draft
   practice set for a marked one:

   > *This practice set was generated, not sourced from an official past
   > paper. It will be marked by the AI_EXAMINER agent
   > (`prototypes/ai_examiner/`) using the same BLT rubric thinking
   > described in the style guide above — review both the questions and
   > the eventual marking before treating either as final.*
```

## Notes for whoever runs this (Gemma or Claude)

- One practice set per run — don't batch multiple boards/units in one
  prompt fill; the style guides are genuinely different documents and
  mixing them risks bleeding one board's command words into another's
  paper.
- `{{question_sizes}}` doesn't have to be exhaustive — a quick-fire
  10-minute drill might only request `2, 4`, while a mock-exam-length set
  might request `2, 8, 20`.
- This template produces markdown for a human to read; turning that
  markdown into an actual `PracticeSet` object (a parser) isn't built
  yet — see the README's "What's next" section.
