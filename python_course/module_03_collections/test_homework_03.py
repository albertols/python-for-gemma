"""✅ Homework 03 checker. Run me:  uv run pytest python_course/module_03_collections -v -m homework"""

import homework_03
import pytest


@pytest.mark.homework
def test_first_three():
    assert homework_03.first_three(["Ana", "Ben", "Cai", "Dev"]) == ["Ana", "Ben", "Cai"], (
        "💡 Hint: slicing — list[start:stop], stop is NOT included."
    )


@pytest.mark.homework
def test_top_student():
    assert homework_03.top_student({"Ana": 61, "Ben": 74, "Cai": 68}) == "Ben", "💡 Hint: max() accepts key=grades.get."


@pytest.mark.homework
def test_unique_subjects():
    assert homework_03.unique_subjects(["Business", "Econ", "Business"]) == {"Business", "Econ"}, (
        "💡 Hint: a set() keeps one of each — perfect for de-duplicating."
    )
