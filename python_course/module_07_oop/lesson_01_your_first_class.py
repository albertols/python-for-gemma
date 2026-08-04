"""
🎓 LESSON 7.1 — Your First Class
===============================

WHAT YOU WILL LEARN
-------------------
- Why bundling data AND behaviour together beats separate loose variables
- How class creates a blueprint, and __init__ fills in one instance from it
- What self means — "this particular student", not students in general
- How a method is just a function that lives inside a class and reads self

RESOURCES (open these!)
-----------------------
📖 Docs   : https://docs.python.org/3/tutorial/classes.html#a-first-look-at-classes
🎬 Video  : https://www.youtube.com/watch?v=ZDa-Z5JzLYM
🖼 Visual : see INDEX.md concept map

HOW TO RUN ME
-------------
    uv run python python_course/module_07_oop/lesson_01_your_first_class.py
"""

# ── 1. THE PROBLEM — LOOSE VARIABLES DON'T SCALE ─────────────────
# Module 06 tracked a student with separate variables: a name here, a
# list of scores there. That's fine for ONE student, but the moment you
# have a class of thirty, you'd need ana_name, ana_scores, ben_name,
# ben_scores... thirty pairs of loose variables with no way to say
# "these two belong together" — like keeping every student's exercise
# book in one giant unsorted pile instead of one named folder each.
ana_name = "Ana"
ana_scores = [15, 18, 12]
print(ana_name, "has scores", ana_scores, "— but nothing LINKS these two variables.")

# 🧪 TRY IT: imagine writing this out for 30 students by hand — count
# how many separate variable names you'd need (hint: it's 60).


# ── 2. class — A BLUEPRINT FOR "ONE STUDENT" ──────────────────────
# class defines a BLUEPRINT: a template describing what every student
# has (a name, some scores) and what every student can DO (work out an
# average). It's exactly like designing ONE mark-scheme template that
# then gets filled in fresh for each individual student, rather than
# inventing a new format every time. Nothing exists yet — class just
# describes the shape.
class Student:
    # __init__ is a special method Python calls automatically the
    # moment you create a new student — like the first thing you write
    # on a fresh exercise book: the student's name on the cover. "self"
    # means "the exercise book currently being written on" — it's how
    # Python tells one student's data apart from another's.
    def __init__(self, name, scores):
        self.name = name  # ── ATTRIBUTE: data that belongs to THIS student
        self.scores = scores  # ── ATTRIBUTE: this student's own list of scores

    # A METHOD is a function that lives inside the class and can read
    # self — so it automatically knows WHICH student's scores to use,
    # without you passing them in again by hand.
    def average(self):
        return sum(self.scores) / len(self.scores)


# ── 3. INSTANTIATION — TURNING THE BLUEPRINT INTO A REAL STUDENT ──
# Calling Student("Ana", [...]) runs __init__ and hands back a real
# OBJECT — an actual filled-in exercise book, not just the blank
# template. This one object carries both the name AND the scores
# together, permanently linked, exactly what loose variables couldn't do.
ana = Student("Ana", [15, 18, 12])
print("ana.name  ->", ana.name)
print("ana.scores ->", ana.scores)

# 🧪 TRY IT: create a second student, ben = Student("Ben", [10, 14, 16]),
# and print() ben.name and ben.scores — confirm ana and ben don't clash.

# ── 4. CALLING A METHOD — self IS FILLED IN AUTOMATICALLY ─────────
# ana.average() calls the average() method ON ana specifically — Python
# quietly passes ana in as self, so sum(self.scores) means "sum of
# ANA's scores", not anyone else's. Same method, different data per
# student, exactly like one mark scheme applied fairly to every script.
print("ana.average() ->", ana.average())
ben = Student("Ben", [10, 14, 16])
print("ben.average() ->", ben.average())

# 🧪 TRY IT: change one of ana_scores' numbers above (the loose
# variable from step 1) — confirm ana.average() is unaffected, because
# ana.scores lives INSIDE the ana object, completely separate.

# ── 5. MANY STUDENTS — A LIST OF OBJECTS ──────────────────────────
# Now that name+scores travel together as ONE object, a whole class is
# simply a list of students — the digital version of a stack of
# exercise books, each one self-contained.
register = [ana, ben, Student("Cai", [20, 19, 18])]
for student in register:
    print(f"{student.name}: average {student.average()}")

print("✅ Lesson 7.1 complete — you can now define a class, create instances, and call methods on them!")
