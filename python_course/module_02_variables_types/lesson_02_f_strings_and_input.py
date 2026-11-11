"""
🎓 LESSON 2.2 — f-strings and input()
====================================

WHAT YOU WILL LEARN
-------------------
- How to build text from variables with f-strings
- How to control decimal places inside an f-string (:.1f)
- How to ask the user to type something with input()
- Why input() always hands you back a str — and how to convert it

RESOURCES (open these!)
-----------------------
📖 Docs   : https://docs.python.org/3/tutorial/introduction.html#strings
🎬 Video  : https://www.youtube.com/watch?v=k9TUPpGqYTo
🖼 Visual : see INDEX.md concept map

HOW TO RUN ME
-------------
    uv run python python_course/module_02_variables_types/lesson_02_f_strings_and_input.py
"""

# ── 1. f-strings — WEAVING VARIABLES INTO TEXT ──────────────────
# An f-string is a normal string with an f right before the opening
# quote. Anywhere you write {a_variable} inside it, Python swaps in
# that variable's value. It's like a mail-merge template for a report
# card: the sentence stays fixed, but the name and mark change per
# student, filled in automatically instead of retyped by hand.
student_name = "Belle"
score = 21
print(f"{student_name} scored {score}")

# 🧪 TRY IT: change student_name and score to a different student and
# mark, then re-run this file — watch the sentence update itself.

# ── 2. EXPRESSIONS INSIDE {} — NOT JUST VARIABLES ───────────────
# You're not limited to plain variable names inside the braces —
# any calculation can go there too, exactly like typing a formula
# straight into a spreadsheet cell instead of a separate helper cell.
# total_marks is deliberately awkward (23, not 20) so the division
# below produces a long, messy decimal — the perfect case for step 3.
total_marks = 23
print(f"{student_name} scored {score}/{total_marks} ({score / total_marks * 100}%)")

# ── 3. :.1f — CONTROLLING DECIMAL PLACES ─────────────────────────
# Raw division often produces long, messy decimals (see the ugly
# result above). Adding :.1f straight after an expression tells
# Python "format this as a float, one decimal place", the same way
# you'd round a percentage on a report card to one decimal instead of
# printing every digit a calculator gives you.
print(f"{student_name} scored {score}/{total_marks} ({score / total_marks * 100:.2f}%)")

# 🧪 TRY IT: change :.1f to :.2f (two decimal places) or :.0f (whole
# number) and re-run — see how the same calculation gets reformatted.

# ── 4. input() — ASKING THE USER A QUESTION ─────────────────────
# input() pauses the program, shows your prompt text, and waits for
# the person running it to type something and press Enter. It's the
# code equivalent of asking the class a question out loud and waiting
# for a hand to go up before continuing the lesson. We give it a
# fixed answer here (instead of pausing this file forever) so the
# lesson still runs top-to-bottom on its own — try the live version
# in the TRY IT below.
# entered_name = input("What is your name? ")   # ← the real, interactive version
entered_name = "Nadia"  # ✅ stand-in for the typed answer, so this file runs unattended
print("Hello,", entered_name)

# ── 5. input() ALWAYS RETURNS A str — CONVERT WHEN YOU NEED NUMBERS ─
# Whatever the user types, Python hands it back as text (str), even
# if they typed digits — like a student writing "17" on a slip of
# paper: it's still handwriting until YOU decide to treat it as a
# number. Use int() or float() to convert it before doing arithmetic,
# or Python will try to "add" text and complain.
entered_score_text = "18"  # ✅ stand-in for input("Score out of 20? ")
entered_score = int(entered_score_text)  # convert str → int before doing maths
print(f"{entered_name} scored {entered_score}/20 ({entered_score / 20 * 100:.1f}%)")

# 🧪 TRY IT: uncomment the real `input()` line above, comment out the
# stand-in line below it, and run this file from a terminal (not just
# read it) to answer the prompt live.

print("✅ Lesson 2.2 complete — you can now build sentences from variables and read user input!")
