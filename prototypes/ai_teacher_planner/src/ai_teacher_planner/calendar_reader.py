"""Read the school staff calendar into `CalendarWeek` objects.

This is module 06's file-reading habit (open a file, walk its rows,
build objects) meeting module 07's classes — except the "file" is an
Excel workbook instead of a CSV, read with `openpyxl` instead of the
built-in `csv` module. The real target (once Gemma answers
`QUESTIONS_FOR_GEMMA.md` A1/A2) is her school's actual staff calendar,
"Hastings Secondary Staff (Teams)/Tab 2025-26-Secondary Calendar ALL
STAFF.xlsx"; for now `read_calendar` is proven against the mock copy in
`mock_data/secondary_calendar.xlsx`, built by `build_mock_calendar.py`.
"""

from datetime import datetime
from pathlib import Path

from openpyxl import load_workbook

from ai_teacher_planner.models import CalendarWeek


def read_calendar(path: Path) -> list[CalendarWeek]:
    """Read the "Calendar" sheet at `path` into a list of `CalendarWeek`.

    Expects column A to hold each week's Monday date and column B to
    hold its label ("Teaching", "Half Term", "Mock Week", ...), with a
    header row in row 1 that gets skipped. A week counts as a teaching
    week only when its label is exactly "Teaching".
    """
    workbook = load_workbook(path)
    sheet = workbook["Calendar"]

    weeks = []
    for week_start, label in sheet.iter_rows(min_row=2, max_col=2, values_only=True):
        if week_start is None:
            continue
        if isinstance(week_start, datetime):
            week_start = week_start.date()
        weeks.append(CalendarWeek(week_start=week_start, label=label, is_teaching=label == "Teaching"))
    return weeks
