"""✅ Homework 02 checker. Run me:  uv run pytest python_course/module_02_variables_types -v -m homework"""

import homework_02
import pytest


@pytest.mark.homework
def test_full_mark_message():
    assert homework_02.full_mark_message("Amelia", 17, 20) == "Amelia scored 17/20 (85.0%)", (
        "💡 Hint: use an f-string; percentage = score / total * 100, shown with one decimal via :.1f."
    )


@pytest.mark.homework
def test_price_with_vat():
    assert homework_02.price_with_vat(100.0) == 120.0, "💡 Hint: UK VAT is 20% — multiply by 1.2."


@pytest.mark.homework
def test_is_pass():
    assert homework_02.is_pass(45) is True and homework_02.is_pass(39) is False, (
        "💡 Hint: pass mark is 40. Return the comparison itself — no if needed!"
    )
