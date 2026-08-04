"""
🎓 LESSON 7.2 — Classes Working Together
=======================================

WHAT YOU WILL LEARN
-------------------
- How several small classes can each model ONE school noun cleanly
- How one object can hold or use another object (composition)
- Why splitting Student, Exam, and Rubric apart beats one giant class
- That these tiny classes are baby versions of the AI Examiner's brain

RESOURCES (open these!)
-----------------------
📖 Docs   : https://docs.python.org/3/tutorial/classes.html#class-and-instance-variables
🎬 Video  : https://www.youtube.com/watch?v=ZDa-Z5JzLYM
🖼 Visual : see INDEX.md concept map

HOW TO RUN ME
-------------
    uv run python python_course/module_07_oop/lesson_02_classes_working_together.py
"""


# ── 1. ONE NOUN, ONE CLASS ────────────────────────────────────────
# A real school has more nouns than just "student": an EXAM has a
# subject and a total mark; a RUBRIC has criteria and marks per
# criterion. Lesson 7.1's Student class shouldn't grow to know about
# exams and rubrics too — that would be like asking one exercise book
# to also BE the exam paper AND the mark scheme. Instead, each noun
# gets its OWN small class, exactly like a filing cabinet with one
# labelled folder per kind of document.
class Exam:
    def __init__(self, subject, total_marks):
        self.subject = subject
        self.total_marks = total_marks

    def percentage(self, raw):
        return raw / self.total_marks * 100


class Rubric:
    def __init__(self, criteria):
        self.criteria = criteria  # dict: {"knowledge": 4, "application": 6, ...}

    def max_marks(self):
        return sum(self.criteria.values())


# ── 2. USING ONE CLASS AT A TIME ──────────────────────────────────
# Each class answers ONE question well. Exam turns a raw mark into a
# percentage; Rubric adds up the maximum marks a mark scheme allows for.
business_exam = Exam("Business", 90)
print("Business exam, 63/90 raw ->", business_exam.percentage(63), "%")

essay_rubric = Rubric({"knowledge": 4, "application": 6, "evaluation": 10})
print("Essay rubric max marks ->", essay_rubric.max_marks())

# 🧪 TRY IT: create a second Exam, economics_exam = Exam("Economics", 100),
# and print() economics_exam.percentage(85) — confirm it's independent
# of business_exam, just like Student objects were independent in 7.1.


# ── 3. COMPOSITION — ONE OBJECT HOLDING ANOTHER ───────────────────
# Real marking combines nouns: a Student SITS an Exam and is marked
# AGAINST a Rubric. "Composition" means one object simply HOLDS
# another as an attribute — like a school file that contains both the
# exam paper AND the mark scheme clipped together, rather than one
# document trying to be both. (This is the same Student blueprint from
# Lesson 7.1, written again here so this file still runs standalone.)
class Student:
    def __init__(self, name, scores):
        self.name = name
        self.scores = scores


ana = Student("Ana", [63])
report = {
    "student": ana,
    "exam": business_exam,
    "rubric": essay_rubric,
}
print(
    f"{report['student'].name} scored {report['exam'].percentage(report['student'].scores[0])}%"
    f" on {report['exam'].subject}, marked out of {report['rubric'].max_marks()}."
)

# 🧪 TRY IT: build your own report dict for a different student/exam
# pair and print() a similar sentence — notice each object still only
# knows how to do ITS OWN job (Student doesn't know about percentages,
# Exam doesn't know about names).

# ── 4. BABY VERSIONS OF THE AI EXAMINER'S BRAIN ───────────────────
# Student, Exam, and Rubric are deliberately small — but this is
# EXACTLY the shape of thinking the AI Examiner prototype (see
# prototypes/ai_examiner/) will need at full scale: a Student sits an
# Exam, gets marked against a Rubric, per criterion, automatically.
# You've just built the baby version of that brain, by hand, in about
# thirty lines of Python.
print("These three tiny classes are baby versions of the AI Examiner's brain.")

print("✅ Lesson 7.2 complete — you can now build small classes and combine them through composition!")
