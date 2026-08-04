"""Build the mock staff calendar `read_calendar()` is tested against.

Gemma's real calendar lives in Teams — "Hastings Secondary Staff (Teams)/
Tab 2025-26-Secondary Calendar ALL STAFF.xlsx" — and never enters this
repo (see `prototypes/ai_teacher_planner/real_data/`, which stays out of
git). Until she shares its actual shape (QUESTIONS_FOR_GEMMA A1/A2),
`calendar_reader.read_calendar()` is proven against this small, plausible
stand-in: a "Calendar" sheet, a header row, and six Monday-starting weeks
mixing ordinary teaching weeks with a holiday and a mock-exam week — the
same three week types the real calendar will need to distinguish.

Run me directly to (re)generate `secondary_calendar.xlsx` next to this
script:

    uv run python prototypes/ai_teacher_planner/mock_data/build_mock_calendar.py
"""

from datetime import date, timedelta
from pathlib import Path

from openpyxl import Workbook

OUTPUT_PATH = Path(__file__).parent / "secondary_calendar.xlsx"

# First Monday of the mock school year, and the label for each of the
# six weeks that follow it — four ordinary teaching weeks bracketing one
# Half Term and one Mock Week, exactly like a real half-term block.
FIRST_MONDAY = date(2025, 9, 1)
WEEK_LABELS = ["Teaching", "Teaching", "Half Term", "Teaching", "Teaching", "Mock Week"]


def build_mock_calendar() -> Path:
    """Write the mock "Calendar" sheet to `OUTPUT_PATH` and return it."""
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Calendar"
    sheet.append(["Week Start", "Label"])

    for offset, label in enumerate(WEEK_LABELS):
        week_start = FIRST_MONDAY + timedelta(weeks=offset)
        sheet.append([week_start, label])

    workbook.save(OUTPUT_PATH)
    return OUTPUT_PATH


if __name__ == "__main__":
    path = build_mock_calendar()
    print(f"Mock calendar written to {path}")
