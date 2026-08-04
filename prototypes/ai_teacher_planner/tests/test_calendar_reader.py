from pathlib import Path

from ai_teacher_planner.calendar_reader import read_calendar

MOCK = Path(__file__).parent.parent / "mock_data" / "secondary_calendar.xlsx"


def test_reads_mock_calendar():
    weeks = read_calendar(MOCK)
    assert len(weeks) == 6
    assert weeks[0].label == "Teaching"
    assert weeks[0].is_teaching is True
    half_term = [w for w in weeks if w.label == "Half Term"]
    assert len(half_term) == 1 and half_term[0].is_teaching is False
    mock_week = [w for w in weeks if w.label == "Mock Week"]
    assert len(mock_week) == 1 and mock_week[0].is_teaching is False
