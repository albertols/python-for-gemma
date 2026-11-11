"""
📝 HOMEWORK 02 — Variables and Types
Complete each function where you see TODO.
Check your work:   uv run pytest python_course/module_02_variables_types -v -m homework
Stuck? Ask the homework-checker agent (see INDEX.md) — it hints, never spoils.
"""


def full_mark_message(name: str, score: int, total: int) -> str:
    """Return a report-card line: name, score, and percentage to one decimal.

    Example:
        >>> full_mark_message("Amelia", 17, 20)
        'Amelia scored 17/20 (85.0%)'
    """
    # TODO: build an f-string. Percentage = score / total * 100, shown
    # with one decimal place using the :.1f format spec.
    percentage = score / total * 100
    return f"{name} scored {score}/{total} ({percentage:.1f}%)"



def price_with_vat(price: float) -> float:
    """Return the price after adding UK VAT (20%).

    Example:
        >>> price_with_vat(100.0)
        120.0
    """
    # TODO: return price multiplied by 1.2.
    return price * 1.2


def is_pass(score: int) -> bool:
    """Return whether a score meets the pass mark of 40.

    Example:
        >>> is_pass(45)
        True
        >>> is_pass(39)
        False
    """
    # TODO: return the comparison score >= 40 directly — a comparison
    # already IS a bool, no if statement required.
    return score >= 40
