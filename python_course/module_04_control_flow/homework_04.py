"""
📝 HOMEWORK 04 — Control Flow
Complete each function where you see TODO.
Check your work:   uv run pytest python_course/module_04_control_flow -v -m homework
Stuck? Ask the homework-checker agent (see INDEX.md) — it hints, never spoils.
"""


def grade_from_score(score: int) -> str:
    """Return the letter grade for a score, using the school's boundaries.

    Example:
        >>> grade_from_score(82)
        'A'
    """
    # TODO: chain if/elif/else, checking the HIGHEST boundary first:
    # A* >= 90, A >= 80, B >= 70, C >= 60, otherwise U.
    return ...


def attendance_rate(present: int, total: int) -> float:
    """Return attendance as a percentage.

    Example:
        >>> attendance_rate(19, 20)
        95.0
    """
    # TODO: return present / total * 100.
    return ...


def count_passes(scores: list, pass_mark: int) -> int:
    """Return how many scores are at or above the pass mark.

    Example:
        >>> count_passes([35, 62, 41, 78, 39], 40)
        3
    """
    # TODO: loop over scores with a for loop, counting the ones that
    # are >= pass_mark. Start a counter at 0 and add 1 on each match.
    return ...
