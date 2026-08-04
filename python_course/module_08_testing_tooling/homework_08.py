"""
📝 HOMEWORK 08 — Capstone: The Gradebook
Complete each method where you see TODO.
Check your work:   uv run pytest python_course/module_08_testing_tooling -v -m homework
Stuck? Ask the homework-checker agent (see INDEX.md) — it hints, never spoils.
"""


class Gradebook:
    """A whole class's worth of students and scores — the capstone object.

    This brings together Module 07 (classes) and Module 08 (TDD): the
    test for this class was written FIRST, in test_homework_08.py. Run
    it now, before writing a single line below, and read the 🔴 RED
    failures — that's Lesson 8.1's story happening to you for real.
    """

    def __init__(self):
        self.students = {}

    def add_student(self, name: str, scores: list) -> None:
        """Add a student and their scores to the gradebook.

        Example:
            >>> gb = Gradebook()
            >>> gb.add_student("Ana", [15, 18])
        """
        # TODO: store scores in self.students, keyed by name —
        # e.g. self.students[name] = scores
        return ...

    def class_average(self) -> float:
        """Return the average of ALL scores from ALL students combined.

        Example:
            >>> gb = Gradebook()
            >>> gb.add_student("Ana", [15, 18])
            >>> gb.add_student("Ben", [12, 14])
            >>> gb.class_average()
            14.75
        """
        # TODO: gather every score from every student's list into ONE
        # flat list, then return sum(that list) / len(that list).
        return ...

    def top_student(self) -> str:
        """Return the name of the student with the highest PERSONAL average.

        Example:
            >>> gb = Gradebook()
            >>> gb.add_student("Ana", [15, 18])
            >>> gb.add_student("Ben", [12, 14])
            >>> gb.top_student()
            'Ana'
        """
        # TODO: work out each student's own average (sum/len of THEIR
        # scores), then return the name attached to the highest one.
        # max(self.students, key=...) can compare names by a computed value.
        return ...
