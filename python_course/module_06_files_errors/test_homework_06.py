"""✅ Homework 06 checker. Run me:  uv run pytest python_course/module_06_files_errors -v -m homework"""

import homework_06
import pytest


@pytest.mark.homework
def test_read_register(tmp_path):
    f = tmp_path / "register.txt"
    f.write_text("Ana\nBen\nCai\n")
    assert homework_06.read_register(f) == ["Ana", "Ben", "Cai"], (
        "💡 Hint: read_text() then .splitlines() — watch out for the empty last line if you split on '\\n'."
    )


@pytest.mark.homework
def test_save_marks(tmp_path):
    f = tmp_path / "marks.csv"
    homework_06.save_marks(f, {"Ana": 17, "Ben": 14})
    assert f.exists(), "💡 Hint: your function must CREATE the file — path.write_text(...) does that."
    assert f.read_text() == "Ana,17\nBen,14\n", "💡 Hint: one 'name,mark' line each, newline after every line."


@pytest.mark.homework
def test_safe_average():
    assert homework_06.safe_average([10, 20]) == 15.0
    assert homework_06.safe_average([]) == 0.0, (
        "💡 Hint: dividing by zero raises ZeroDivisionError — catch it with try/except and return 0.0."
    )
