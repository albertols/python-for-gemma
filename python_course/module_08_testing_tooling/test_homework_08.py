"""✅ Homework 08 checker. Run me:  uv run pytest python_course/module_08_testing_tooling -v -m homework"""

import homework_08
import pytest


@pytest.mark.homework
def test_gradebook_capstone():
    gb = homework_08.Gradebook()
    gb.add_student("Ana", [15, 18])
    gb.add_student("Ben", [12, 14])
    assert gb.class_average() == 14.75, "💡 Hint: average of ALL scores from ALL students."
    assert gb.top_student() == "Ana", "💡 Hint: the student whose personal average is highest."
