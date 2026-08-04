"""Data models for the AI Teacher Planner.

Remember `Student`, `Exam`, and `Rubric` from python_course module 07 —
tiny classes, one noun each, bundling data and behaviour together? These
are their grown-up cousins. Where module 07 modelled a student sitting an
exam, this module models a school YEAR: a `Term` (like "Autumn Term") and
a `CalendarWeek` (like one row of the staff calendar — "w/c 1 Sept,
Teaching"). Same idea, just aimed at planning a scheme of work instead of
marking a script.

Both classes below are `frozen` dataclasses rather than hand-written
`__init__` methods, for the same reason a mark scheme is fixed once
published: a calendar week's date and label shouldn't be able to drift
after it's been read from the source file. `@dataclass(frozen=True)` asks
Python to write the boring `__init__`/`__repr__`/`__eq__` code for us AND
enforce that once-set values can't change — a small step up from module
07's plain classes, worth knowing as your programs grow.
"""

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class Term:
    """One school term, e.g. Term("Autumn", date(2025, 9, 1), date(2025, 12, 19))."""

    name: str
    start: date
    end: date


@dataclass(frozen=True)
class CalendarWeek:
    """One row of the staff calendar: a Monday, its label, and whether it's a teaching week.

    `is_teaching` is a convenience flag derived from `label` — True only
    when `label == "Teaching"` — so downstream code (the scheme-of-work
    builder, the weekly planner) can skip holidays and Mock Week without
    re-checking the raw string everywhere.
    """

    week_start: date
    label: str
    is_teaching: bool
