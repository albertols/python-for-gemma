from datetime import date
from pathlib import Path

from ai_examiner.models import BLTParagraph, ExamSubmission


def test_blt_completeness():
    full = BLTParagraph("Point", "Because...", "Leads to...", "Therefore...")
    assert full.completeness() == 1.0
    weak = BLTParagraph("Point", "Because...", "", "")
    assert weak.completeness() == 0.5


def test_submission_from_filename():
    sub = ExamSubmission.from_filename(Path("student1_2026_03_01_BUSINESS.png"))
    assert sub.student_id == "student1"
    assert sub.exam_date == date(2026, 3, 1)
    assert sub.subject == "BUSINESS"
