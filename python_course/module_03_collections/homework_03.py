"""
📝 HOMEWORK 03 — Collections
Complete each function where you see TODO.
Check your work:   uv run pytest python_course/module_03_collections -v -m homework
Stuck? Ask the homework-checker agent (see INDEX.md) — it hints, never spoils.
"""


def first_three(students: list) -> list:
    """Return only the first three names from a register list.

    Example:
        >>> first_three(["Ana", "Ben", "Cai", "Dev"])
        ['Ana', 'Ben', 'Cai']
    """
    # TODO: slice the list — students[start:stop]. Remember stop is
    # NOT included, so you need the index just past the third name.
    return (students[0:3])


def top_student(grades: dict) -> str:
    """Return the name of the student with the highest grade.

    Example:
        >>> top_student({"Ana": 61, "Ben": 74, "Cai": 68})
        'Ben'
    """
    # TODO: use max() on the dictionary, with key=grades.get so it
    # compares by MARK instead of comparing the names alphabetically.
    return max (grades, key=grades.get)

# DIFFICULT to remember --- Key (name), Value (mark), Item (pair)**

def unique_subjects(subjects: list) -> set:
    """Return the set of subjects with duplicates removed.

    Example:
        >>> unique_subjects(["Business", "Econ", "Business"])
        {'Business', 'Econ'}
    """
    # TODO: wrap the list in set() to keep only one of each subject.
    unique_subjects = set(subjects)
    return set(unique_subjects)
