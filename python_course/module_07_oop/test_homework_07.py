"""✅ Homework 07 checker. Run me:  uv run pytest python_course/module_07_oop -v -m homework"""

import homework_07
import pytest


@pytest.mark.homework
def test_student_average():
    s = homework_07.Student("Ana", [15, 18, 12])
    assert s.name == "Ana"
    assert s.average() == 15.0, "💡 Hint: sum(self.scores) / len(self.scores)."


@pytest.mark.homework
def test_student_best_score():
    assert homework_07.Student("Ben", [15, 18, 12]).best_score() == 18, "💡 Hint: max()."


@pytest.mark.homework
def test_exam_percentage():
    exam = homework_07.Exam("Business", 90)
    assert exam.percentage(63) == 70.0, "💡 Hint: raw / self.total_marks * 100."


@pytest.mark.homework
def test_rubric_max_marks():
    r = homework_07.Rubric({"knowledge": 4, "application": 6, "evaluation": 10})
    assert r.max_marks() == 20, "💡 Hint: sum(self.criteria.values())."
