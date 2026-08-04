"""
📝 HOMEWORK 07 — Object-Oriented Programming
Complete each method where you see TODO.
Check your work:   uv run pytest python_course/module_07_oop -v -m homework
Stuck? Ask the homework-checker agent (see INDEX.md) — it hints, never spoils.
"""


class Student:
    """One student: a name, plus every score they've been given so far."""

    def __init__(self, name: str, scores: list):
        self.name = name
        self.scores = scores

    def average(self) -> float:
        """Return this student's mean score.

        Example:
            >>> Student("Ana", [15, 18, 12]).average()
            15.0
        """
        # TODO: sum(self.scores) / len(self.scores)
        return ...

    def best_score(self) -> int:
        """Return this student's single highest score.

        Example:
            >>> Student("Ben", [15, 18, 12]).best_score()
            18
        """
        # TODO: max(self.scores)
        return ...


class Exam:
    """One exam paper: a subject name, plus how many marks it's out of."""

    def __init__(self, subject: str, total_marks: int):
        self.subject = subject
        self.total_marks = total_marks

    def percentage(self, raw: int) -> float:
        """Return a raw mark on this exam as a percentage.

        Example:
            >>> Exam("Business", 90).percentage(63)
            70.0
        """
        # TODO: raw / self.total_marks * 100
        return ...


class Rubric:
    """A mark scheme: named criteria, each worth some number of marks."""

    def __init__(self, criteria: dict):
        self.criteria = criteria

    def max_marks(self) -> int:
        """Return the total marks available across every criterion.

        Example:
            >>> Rubric({"knowledge": 4, "application": 6, "evaluation": 10}).max_marks()
            20
        """
        # TODO: sum(self.criteria.values())
        return ...
