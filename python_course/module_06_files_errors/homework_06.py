"""
📝 HOMEWORK 06 — Files and Exceptions
Complete each function where you see TODO.
Check your work:   uv run pytest python_course/module_06_files_errors -v -m homework
Stuck? Ask the homework-checker agent (see INDEX.md) — it hints, never spoils.
"""

from pathlib import Path


def read_register(path: Path) -> list:
    """Read a register file (one name per line) and return the names as a list.

    Example:
        >>> read_register(Path("register.txt"))
        ['Ana', 'Ben', 'Cai']
    """
    # TODO: read_text() then .splitlines() — watch out for the empty
    # last line if you split on '\n' instead.
    contents = path.read_text()
    names = contents.splitlines()
    return names


def save_marks(path: Path, marks: dict) -> None:
    """Write marks to a CSV file, one 'name,mark' line per entry.

    Example:
        >>> save_marks(Path("marks.csv"), {"Ana": 17, "Ben": 14})
        >>> Path("marks.csv").read_text()
        'Ana,17\\nBen,14\\n'
    """
    # TODO: build one "name,mark" line per entry in marks, join them
    # with a newline, and don't forget the newline after the LAST line too.

    lines = []

    for name, mark in marks.items():
        lines.append(f"{name},{mark}")

    path.write_text("\n".join(lines) + "\n")


def safe_average(scores: list) -> float:
    """Return the average of scores, or 0.0 if scores is empty.

    Example:
        >>> safe_average([10, 20])
        15.0
        >>> safe_average([])
        0.0
    """
    # TODO: try summing and dividing; catch ZeroDivisionError (an empty
    # list makes len(scores) == 0) and return 0.0 instead of crashing.

    try:
        average = sum(scores) / len(scores)
        return average

    except ZeroDivisionError:
        return 0.0
