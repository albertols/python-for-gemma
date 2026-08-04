"""
📝 HOMEWORK 05 — Functions and DRY
Complete each function where you see TODO.
Check your work:   uv run pytest python_course/module_05_functions -v -m homework
Stuck? Ask the homework-checker agent (see INDEX.md) — it hints, never spoils.
"""


def percentage(score: int, total: int) -> float:
    """Return score as a percentage of total.

    Example:
        >>> percentage(15, 20)
        75.0
    """
    # TODO: return score / total * 100 as a float.
    return ...


def apply_curve(scores: list, bonus: int) -> list:
    """Return a NEW list with bonus added to every score.

    Example:
        >>> apply_curve([58, 63], 2)
        [60, 65]
    """
    # TODO: build and return a NEW list — loop over scores, appending
    # score + bonus to the new list. Don't change the original list.
    return ...


def format_report(name: str, scores: list, total: int) -> str:
    """Return a one-line report of a student's scores as percentages.

    Example:
        >>> format_report("Ana", [15, 18], 20)
        'Ana: 15/20 (75.0%), 18/20 (90.0%)'
    """
    # TODO: DRY — call your percentage() function for each score (don't
    # recalculate the formula here). Build a "score/total (pct%)" piece
    # per score, then join the pieces with ", " and prefix "name: ".
    return ...
