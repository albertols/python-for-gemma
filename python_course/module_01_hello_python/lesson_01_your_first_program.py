"""
🎓 LESSON 1.1 — Your First Program
=================================

WHAT YOU WILL LEARN
-------------------
- How to make Python show text on screen with print()
- Why text in Python lives inside quotes ("like this")
- How to leave notes for humans (comments) that Python ignores
- Why comments matter especially for a teacher-turned-coder like you

RESOURCES (open these!)
-----------------------
📖 Docs   : https://docs.python.org/3/tutorial/introduction.html
🎬 Video  : https://www.youtube.com/watch?v=_uQrJ0TkZlc
🖼 Visual : see INDEX.md concept map

HOW TO RUN ME
-------------
    uv run python python_course/module_01_hello_python/lesson_01_your_first_program.py
"""

# ── 1. PRINT() — SPEAKING OUT LOUD ──────────────────────────────
# print() is Python's equivalent of writing on the whiteboard: whatever
# you put inside the brackets gets displayed for everyone to see. Think
# of it as the class register call — you say a name, the class hears it.
print("Good morning, Year 11 Business!")

# 🧪 TRY IT: change "Year 12 Business" to your actual class name and
# re-run this file (uv run python python_course/module_01_hello_python/lesson_01_your_first_program.py).

# ── 2. STRINGS — TEXT ALWAYS TRAVELS IN QUOTES ──────────────────
# Any piece of text in Python is called a "string", and it must be
# wrapped in quotes — single 'like this' or double "like this" both
# work, just be consistent. It's like writing a student's name on a
# name badge: the quotes are the badge, the text inside is the name.
teacher_name = "Gemma"
subject = "Business"
# Commas hand print() several things to say — it joins them into one line,
# with a space between each, automatically. No manual gluing needed.
print("Today's teacher is", teacher_name, "and the subject is", subject)

# ── 3. COMMENTS — NOTES ONLY HUMANS READ ────────────────────────
# Anything after a # is a comment. Python skips it completely when it
# runs the file — comments exist purely for humans. Imagine annotating
# a lesson plan with sticky notes for your future self ("remember: this
# class struggles with elasticity") — Python code needs the same care,
# because you (or a colleague) will re-read it later and need to
# understand WHY a line exists, not just WHAT it does.
# Below, the comment explains WHY the price is written as text, not a
# number — we haven't met numbers yet, and a price label like "£4.50"
# is really just a string, same as a name or a subject.
exam_paper_cost = "£4.50"  # a string, even though it looks like a number
print("Exam paper cost:", exam_paper_cost)

# 🧪 TRY IT: print a 3-line class register — one print() per student —
# using three different string variables, e.g. student_1, student_2,
# student_3, each holding a name, then print() each on its own line.

# ── 4. PUTTING IT TOGETHER — A MINI REGISTER ────────────────────
# Real teaching often means listing several things one after another.
# Here we print three lines to build a tiny attendance register —
# notice each print() call is a separate line, just like calling out
# names one at a time rather than all at once.
print("--- Register: Year 12 Business ---")
print("1. Aisha")
print("2. Ben")
print("3. Chidi")

print("✅ Lesson 1.1 complete — you just ran your first Python program!")
