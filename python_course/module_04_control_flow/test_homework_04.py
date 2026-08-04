"""✅ Homework 04 checker. Run me:  uv run pytest python_course/module_04_control_flow -v -m homework"""

import homework_04
import pytest


@pytest.mark.homework
def test_grade_from_score():
    cases = {95: "A*", 82: "A", 74: "B", 65: "C", 40: "U"}
    for score, grade in cases.items():
        assert homework_04.grade_from_score(score) == grade, (
            f"💡 Hint: boundaries — A*≥90, A≥80, B≥70, C≥60, else U. Check score {score}."
        )


@pytest.mark.homework
def test_attendance_rate():
    assert homework_04.attendance_rate(19, 20) == 95.0, "💡 Hint: present / total * 100."


@pytest.mark.homework
def test_count_passes():
    assert homework_04.count_passes([35, 62, 41, 78, 39], 40) == 3, (
        "💡 Hint: loop over scores, count the ones >= pass_mark."
    )
