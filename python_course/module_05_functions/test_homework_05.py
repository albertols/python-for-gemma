"""✅ Homework 05 checker. Run me:  uv run pytest python_course/module_05_functions -v -m homework"""

import homework_05
import pytest


@pytest.mark.homework
def test_percentage():
    assert homework_05.percentage(15, 20) == 75.0, "💡 Hint: score / total * 100 — return a float."


@pytest.mark.homework
def test_apply_curve():
    assert homework_05.apply_curve([58, 63], 2) == [60, 65], (
        "💡 Hint: build a NEW list adding bonus to each score (a loop or list comprehension)."
    )


@pytest.mark.homework
def test_format_report():
    assert homework_05.format_report("Ana", [15, 18], 20) == "Ana: 15/20 (75.0%), 18/20 (90.0%)", (
        "💡 Hint: DRY — call your percentage() function inside, join pieces with ', '."
    )
