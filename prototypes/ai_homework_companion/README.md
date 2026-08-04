# 📝 AI Homework Companion

This is one of your four end-of-course prototypes — see
[`docs/adr/001-prototype-build-order.md`](../../docs/adr/001-prototype-build-order.md)
for why it's built third, after the two calendar-and-automation
prototypes. It's the prototype where the domain modelling gets real:
BLT rubric thinking (**P**oint, **B**ecause, **L**eads to, **T**herefore)
gets exercised here first, then reused by `ai_examiner` — see
[`prototypes/ai_examiner/`](../ai_examiner/) — which marks whatever this
prototype generates.

## 🎯 What this will do for you

Once fully built, this prototype generates exam-style practice — a case
study plus a set of questions — that mirrors the real thing for three of
your specifications:

- **IB Business Management**
- **Edexcel International A Level (IAL) Business**
- **Edexcel IGCSE Business**

Ask for practice on a unit or topic, with the mark tariffs you want your
students drilling, and a Claude agent reads that board's style guide and
writes a fresh case study and question set to match — right command
words, right mark sizes, right register, application demands that mirror
how each board's mark schemes actually reward BLT paragraphs. Nothing
here is a real past paper, and every set it produces says so — see
`prompts/generate_practice_set.md`'s closing note.

The pairing with `ai_examiner` is the whole point: this prototype
produces practice, `ai_examiner` marks what a student writes for it,
using the *same* BLT rubric thinking encoded in the style guides here —
one shared mental model, not two disconnected tools.

## ✅ What exists today

- **`src/ai_homework_companion/models.py`** — `PracticeQuestion` and
  `PracticeSet`, two small dataclasses. If `Student`, `Exam`, and
  `Rubric` from python_course module 07 rang a bell reading this file,
  that's the point: same "one noun, one class" thinking, just aimed at
  practice papers instead of students and marks. `PracticeSet.total_marks()`
  adds up its questions' marks live, rather than trusting a stored total
  that could drift.
- **`styles/ib_business.md`, `styles/edexcel_ial_business.md`,
  `styles/edexcel_igcse_business.md`** — one style guide per board:
  paper structure, command-word ladder (what each word demands and what
  BLT depth it expects), mark sizes with a timing rule-of-thumb,
  case-study conventions, and BLT expectations at each level. Edexcel
  IAL's guide alone carries the Unit 4 (Global Business) rule: it's the
  *only* paper across all three boards where students are expected to
  bring in real-world examples beyond the case study — every other paper
  is marked on case-study application alone. These are teacher-language
  documents on purpose — print one and hand it to a student as an
  exam-technique crib sheet, or read it as an agent's instructions; it
  works as both.
- **`prompts/generate_practice_set.md`** — the prompt template a Claude
  agent fills in and runs to actually generate a set: `{{board}}`,
  `{{unit_or_topic}}`, `{{question_sizes}}`, and `{{case_study_length}}`
  as placeholders, instructions to read the matching style guide rather
  than freelancing exam knowledge, and an output shape that maps
  directly onto `PracticeSet`.
- **`tests/test_companion_models.py`** — one passing test, building a two-question
  `PracticeSet` and checking `total_marks()` sums correctly.

Try it yourself:

```bash
uv run pytest prototypes/ai_homework_companion -v
```

## 🚧 What's next

Nothing here has generated a real practice set yet — the prompt template
exists, but running it end-to-end and parsing its markdown output back
into an actual `PracticeSet` object is still ahead. In order:

1. A small parser that turns the prompt template's markdown output into
   a real `PracticeSet` (title / case study / questions), so a generated
   set can be validated (`total_marks()`, right command words for the
   board) before it reaches a student.
2. A first real run of `prompts/generate_practice_set.md`, once **C1–C3**
   are answered, so the first practice set is built around topics your
   students actually struggle with, not a placeholder topic.
3. Wiring the output to `ai_examiner`, so a student's answer to a
   generated set can be marked end-to-end.

## ❓ What's blocking full build-out

This scaffold works from generic style-guide knowledge on purpose (see
[ADR-004](../../docs/adr/004-first-pass-scope.md)) — nothing here should
guess at facts only you know. Three questions in
[`QUESTIONS_FOR_GEMMA.md`](../../QUESTIONS_FOR_GEMMA.md) unblock the real
build:

| Question | Unblocks |
|---|---|
| **C1** — which units/topics do your students struggle with most? | Choosing the first real `{{unit_or_topic}}` to generate |
| **C2** — which question sizes matter most (4, 8, 10, 12, 20)? | Tuning `{{question_sizes}}` to what Gemma actually wants drilled (the style guides' mark-size tables themselves still need checking against a real mark scheme — see each guide's own ⚠️ flags and **B3**) |
| **C3** — how long should a case study be? | Setting `{{case_study_length}}` accurately |

Each style guide also flags its own **⚠️ verify with Gemma** details
inline — mostly exact paper structure and timing — rather than presenting
a guess as settled fact.

## 🗺️ Roadmap

```mermaid
flowchart LR
    A["📐 Models + style guides"]:::concept --> B["❓ C1–C3 answered"]:::win
    B --> C["📝 First real practice set"]:::ai
    C --> D["✅ Marked by ai_examiner"]:::ai

    classDef concept fill:#4F86C6,color:#fff,stroke:#2B4C7E
    classDef win fill:#59A96A,color:#fff,stroke:#2E5E3A
    classDef ai fill:#8E6BAF,color:#fff,stroke:#5D3F7A
```

Blue = built today. Green = the next unlock, once **C1–C3** are answered.
Purple = the stage where a Claude Code agent starts doing the generation
and marking work, not just Python modelling a paper's shape.
