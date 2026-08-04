"""✅ Homework 01 checker. Run me:  uv run pytest python_course/module_01_hello_python -v -m homework"""

import homework_01
import pytest


@pytest.mark.homework
def test_greet_the_class():
    assert homework_01.greet_the_class() == "Hello, Year 12 Business!", (
        "💡 Hint: return (don't print!) the exact text — capitals and the '!' matter."
    )


@pytest.mark.homework
def test_school_motto():
    assert homework_01.school_motto() == "Learn together, grow together", (
        "💡 Hint: check the spelling and the comma. Strings must match EXACTLY."
    )


@pytest.mark.homework
def test_fixed_price_label():
    assert homework_01.fixed_price_label() == "Price: £9.99", (
        "💡 Hint: there is a space after the colon, and the £ sign comes before the number."
    )
