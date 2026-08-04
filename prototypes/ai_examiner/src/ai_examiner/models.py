"""Data models for the AI Examiner — BLT rubric marking.

This module doubles as revision material, not just plumbing: read the
docstrings below and you've read a plain-English explanation of the BLT
paragraph structure Edexcel/IB extended-response answers are marked
against. If you're Gemma, or a student, or the `examiner` agent
(`.claude/agents/examiner.md`) reading this before marking something —
this is the shared mental model everyone works from.

**One noun, one class** — the same habit from
`python_course/module_07_oop`'s `Student`/`Exam`/`Rubric` trio (see
`lesson_02_classes_working_together.py`), aimed at marking instead of
just recording a score. `BLTParagraph` models one paragraph of a
student's extended-response answer. `ExamSubmission` models one scanned
answer script. `MarkScheme` models the rubric it gets marked against.
None of these classes do any marking themselves yet — the real marking
happens behind the `examiner` Claude agent, once the pipeline described
in `prototypes/ai_examiner/README.md` is built. This file only models
the *shape* of a submission and a mark scheme, the same way
`ai_homework_companion/models.py` only models the shape of a practice
paper.

## What is BLT?

BLT is the paragraph structure Edexcel and IB extended-response mark
schemes reward, in order:

- **P**oint — the argument being made, stated in one sentence.
- **B**ecause — the full explanation: *why* the point is true, in
  business/economic terms.
- **L**eads to — the analysis / knock-on effect: what happens next as a
  result of the point, one logical step further than "because".
- **T**herefore — the final impact, stated as short-term or long-term,
  tying the chain back to the actual question being asked.

Stronger students add a fifth sentence, **Moreover**, bringing in a
second, linked point — this is what separates a good answer from an
excellent one on the highest-tariff questions (typically Assess/Evaluate
at 10+ marks). See `prototypes/ai_homework_companion/styles/*.md` for
the board-specific command-word ladder that maps command words (State,
Explain, Analyse, Assess, Evaluate...) onto how much of this BLT chain a
mark scheme expects.

## Why application matters as much as structure

A technically perfect BLT paragraph that never mentions the case
study's actual business still fails to reach the top mark band on most
Edexcel/IB extended-response questions. Application — weaving the case
study's real numbers, decision, and context through the BLT chain,
rather than writing a generic essay that could apply to any business —
is what separates a mid-band answer from a high-band one. Edexcel IAL
Unit 4 (Global Business) carries one further, unique requirement: it is
the only paper across the three boards this course covers where
students are also expected to bring in a real-world example *beyond*
the case study (see `styles/edexcel_ial_business.md` in the
`ai_homework_companion` prototype for the full rule) — every other
paper is marked on case-study application alone.
"""

from dataclasses import dataclass
from datetime import date
from pathlib import Path


@dataclass
class BLTParagraph:
    """One extended-response paragraph, marked against the BLT structure.

    The four core elements — `point`, `because`, `leads_to`, `therefore`
    — are what every BLT paragraph needs to be complete. `moreover` is
    optional: only the strongest answers add it, bringing in a second,
    linked point (see the module docstring above for what each element
    means). Each field holds the actual sentence(s) a student wrote for
    that element, e.g.:

        BLTParagraph(
            point="Green Grocers should expand online.",
            because="This is because online sales would let it reach "
                    "customers beyond its current 5-mile delivery radius, "
                    "growing its addressable market.",
            leads_to="This would likely increase revenue, but also raise "
                     "costs, as Green Grocers would need to invest in a "
                     "website and delivery logistics.",
            therefore="Therefore, in the long term, online expansion "
                      "should increase Green Grocers' profit, provided "
                      "the extra delivery costs stay below the revenue "
                      "gained.",
        )
    """

    point: str
    because: str
    leads_to: str
    therefore: str
    moreover: str | None = None

    def completeness(self) -> float:
        """Fraction of the 4 core BLT elements that are non-empty.

        Only `point`, `because`, `leads_to`, and `therefore` count —
        `moreover` is a bonus element for the strongest answers, not one
        of the 4 core elements, so it never affects this score. An empty
        string counts as missing; `moreover` left absent (`None`, its
        default — the student simply didn't write one) is expected and
        not penalised here.

        A full paragraph (all 4 non-empty) scores 1.0; a Point-and-Because
        fragment with no analysis or impact scores 0.5 — this is a rough
        structural signal for triage, not a mark in itself. The real mark
        also depends on the *quality* of each element and how well it
        applies to the case study (see the module docstring), which this
        cheap structural check can't see.
        """
        core_elements = (self.point, self.because, self.leads_to, self.therefore)
        non_empty = sum(1 for element in core_elements if element)
        return non_empty / len(core_elements)


@dataclass
class ExamSubmission:
    """One scanned exam answer script, identified only by an anonymised label.

    `student_id` is never a real name — this repo's privacy rules (see
    `docs/security.md` and this prototype's README) require the
    anonymised `student1`-style label baked into the filename itself, so
    a submission can never be traced back to a real student from the
    filename alone. `exam_date` and `subject` come from the same
    filename. `image_path` points at the scanned `.png` on disk — for
    now that's always somewhere under `mock_data/`, never `real_data/`
    committed to git.
    """

    student_id: str
    exam_date: date
    subject: str
    image_path: Path

    @classmethod
    def from_filename(cls, path: Path) -> "ExamSubmission":
        """Parse an anonymised scan filename into an `ExamSubmission`.

        Expected shape: `student1_2026_03_01_BUSINESS.png` — that is,
        underscore-separated `{student_id}_{YYYY}_{MM}_{DD}_{SUBJECT}.png`.
        Splitting `path.stem` (the filename without its `.png` extension)
        on `_` should give exactly 5 tokens: the student label, a 4-digit
        year, a 2-digit month, a 2-digit day, and the subject code —
        matching the `student1_YYYY_MM_DD_SUBJECT.png` pattern this
        repo's privacy rules require for every anonymised scan (see
        `.claude/agents/examiner.md` and `docs/security.md`).

        Raises `ValueError`, with the filename and the expected pattern
        spelled out, if the stem doesn't split into exactly 5 tokens or
        if the year/month/day tokens aren't valid numbers — so a
        mis-named scan fails loudly here rather than being silently
        misfiled against the wrong date or subject.
        """
        tokens = path.stem.split("_")
        if len(tokens) != 5:
            raise ValueError(
                f"Filename {path.name!r} doesn't match the expected "
                "student1_YYYY_MM_DD_SUBJECT.png pattern "
                f"(expected 5 underscore-separated parts, got {len(tokens)})."
            )
        student_id, year, month, day, subject = tokens
        try:
            exam_date = date(int(year), int(month), int(day))
        except ValueError as exc:
            raise ValueError(
                f"Filename {path.name!r} doesn't match the expected "
                "student1_YYYY_MM_DD_SUBJECT.png pattern "
                f"(couldn't parse {year!r}-{month!r}-{day!r} as a date): {exc}"
            ) from exc
        return cls(student_id=student_id, exam_date=exam_date, subject=subject, image_path=path)


@dataclass
class MarkScheme:
    """A mark scheme's level descriptors for one extended-response question.

    `levels` maps a level number (1 being lowest) to that level's
    descriptor text — the prose a marker reads to decide which band an
    answer falls into, e.g. `{1: "Limited BLT structure, little or no "
    "application", 4: "Full BLT throughout, sustained application"}`.
    `max_marks` is the question's total tariff (e.g. 12 for a 12-mark
    Assess question). See `mock_data/mock_rubric.md` for a full worked
    example of what a `levels` dict's contents look like in practice,
    and `prototypes/ai_homework_companion/styles/*.md` for how command
    words map onto expected mark sizes and BLT depth.
    """

    levels: dict[int, str]
    max_marks: int
