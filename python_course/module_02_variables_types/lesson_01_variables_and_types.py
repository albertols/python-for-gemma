"""
🎓 LESSON 2.1 — Variables and Types
==================================

WHAT YOU WILL LEARN
-------------------
- How to store a value in a variable with =
- The four starter data types: str, int, float, bool
- How to check any value's type with type()
- How to name variables the way experienced Python teachers do
- The core arithmetic operators (+, -, *, /) on numbers

RESOURCES (open these!)
-----------------------
📖 Docs   : https://docs.python.org/3/tutorial/introduction.html#using-python-as-a-calculator
🎬 Video  : https://www.youtube.com/results?search_query=python+variables+and+data+types+for+beginners
🖼 Visual : see INDEX.md concept map

HOW TO RUN ME
-------------
    uv run python python_course/module_02_variables_types/lesson_01_variables_and_types.py
"""

# ── 1. VARIABLES — LABELLED BOXES FOR YOUR DATA ─────────────────
# A variable is a labelled box: the name on the box is on the left of
# the =, the thing you put inside is on the right. Just like writing a
# student's name on an exercise book so you always know whose work it
# is, a variable name lets you find the value again later by name
# instead of retyping it every time.
student_name = "Belle"
print("Student name:", student_name)

# 🧪 TRY IT: create a variable called `favourite_subject` holding your
# favourite subject to teach, then print() it.
favourite_subject = "Business"
print("Favourite subject:", favourite_subject)

# ── 2. FOUR STARTER TYPES — str, int, float, bool ───────────────
# Every value in Python has a TYPE — the kind of thing it is. The four
# you'll use constantly are: str (text, in quotes), int (whole
# numbers), float (numbers with a decimal point), and bool (True or
# False — a yes/no flag). Think of a class register row: a name (str),
# a mark out of 20 (int), an average percentage (float), and whether
# the student is present (bool) — four different kinds of data about
# the same student.
subject = "Economics"  # str — text always lives in quotes
mark_out_of_20 = 17  # int — a whole number, no decimal point
average_percentage = 85.5  # float — has a decimal point
is_present = True  # bool — exactly True or False, capitalised, no quotes
print(subject, mark_out_of_20, average_percentage, is_present)

# ── 3. type() — ASK PYTHON "WHAT KIND OF THING IS THIS?" ────────
# type() is like asking a colleague "is this a whole number or a
# percentage?" before you mark it. It's the fastest way to check your
# assumptions about a variable — especially useful once values start
# arriving from elsewhere (a spreadsheet, a form, a student's typed
# answer) rather than being typed by you directly.
print(type(subject))
print(type(mark_out_of_20))
print(type(average_percentage))
print(type(is_present))

# 🧪 TRY IT: run type("17") and compare it with type(17) — one is text
# that LOOKS like a number, the other is a real number. Predict the
# output before you check it.
print (type(17))

# ── 4. NAMING VARIABLES WELL — snake_case AND MEANING ───────────
# Python variable names conventionally use snake_case: lowercase
# words separated by underscores, e.g. exam_paper_cost, not
# ExamPaperCost or examPaperCost (those are conventions from other
# languages). Names are case-sensitive too — Mark and mark are two
# different variables to Python, just as "Y12" and "y12" would confuse
# a register if used inconsistently. Choose names that read like a
# lesson plan label, not a cryptic abbreviation: `average_percentage`
# tells the next reader (often future-you) exactly what's inside,
# where `avg_pct` makes them stop and guess.
class_average = 72.4  # clear, descriptive, snake_case
print("Class average:", class_average)

# ── 5. ARITHMETIC — PYTHON AS A CALCULATOR ──────────────────────
# Numbers support the operators you already use with a calculator:
# + add, - subtract, * multiply, / divide. This is exactly how you'd
# work out a percentage by hand for a mock exam — Python just does it
# instantly and never makes an arithmetic slip.
score = 17
total = 20
percentage = score / total * 100  # / always gives a float back
print("Percentage:", percentage)

# 🧪 TRY IT: add a new pair of score/total variables for a different
# student and print() their percentage too.
score = 12
total = 20
percentage = score / total * 100
print("Percentage:", percentage)

print("✅ Lesson 2.1 complete — you can now name, store, and check the type of a value!")
