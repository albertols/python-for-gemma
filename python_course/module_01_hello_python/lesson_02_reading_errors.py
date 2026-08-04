"""
🎓 LESSON 1.2 — Reading Errors
===============================

WHAT YOU WILL LEARN
--------------------
- That red error text is FEEDBACK, not failure — every programmer sees it daily
- How to read a Python traceback from the BOTTOM up
- The three things every traceback tells you: error type, message, line number
- How to turn a broken line back into a working one

RESOURCES (open these!)
------------------------
📖 Docs   : https://docs.python.org/3/tutorial/errors.html
🎬 Video  : https://www.youtube.com/results?search_query=python+how+to+read+error+messages
🖼 Visual : see INDEX.md concept map

HOW TO RUN ME
--------------
    uv run python python_course/module_01_hello_python/lesson_02_reading_errors.py
"""

# ── 1. RED TEXT IS FEEDBACK, NOT FAILURE ────────────────────────
# Think back to marking a mock exam: a red pen mark isn't a verdict on
# the student as a person — it's precise feedback pointing at exactly
# where to look next. Python's red error text works the same way. Every
# working programmer — beginner or expert — sees errors constantly.
# Growth mindset applies to code exactly as it does to your classroom:
# the error is the lesson, not the grade.
print("Errors are feedback, not failure. Let's learn to read one.")

# 🧪 TRY IT: read the block comment below OUT LOUD before scrolling on —
# predict which line will break it, before you check the answer beneath.

# ── 2. ANATOMY OF A TRACEBACK — READ BOTTOM UP ──────────────────
# When Python hits a problem, it prints a "traceback". It looks scary
# because it's long, but you only need to read THREE things, and you
# read them from the BOTTOM of the message UPWARDS:
#
#   1. Error type   (bottom line, before the colon)   — WHAT went wrong
#   2. Error message (bottom line, after the colon)   — more detail
#   3. Line number   (a few lines up, "line NN")       — WHERE it happened
#
# Example traceback a student might see (kept here as a comment so this
# file still runs cleanly top-to-bottom — nothing is actually broken):
#
#   Traceback (most recent call last):
#     File "lesson_02_reading_errors.py", line 42, in <module>
#       print(student_nam)
#             ^^^^^^^^^^^
#   NameError: name 'student_nam' is not defined
#
# Reading bottom-up: "NameError" (type) tells us Python doesn't
# recognise a name we used; "name 'student_nam' is not defined"
# (message) tells us WHICH name; "line 42" (location) tells us WHERE
# to look. It's a typo — 'student_nam' should be 'student_name'.
print("A NameError usually means a typo in a variable name.")

# ── 3. THE BROKEN LINE — COMMENTED OUT ON PURPOSE ───────────────
# Below is a REAL line that would raise a NameError if it ran, because
# 'class_size' is never defined — only 'number_of_students' is. It is
# commented out so this lesson still runs cleanly end-to-end. This
# mirrors how you might annotate a mock exam: showing the mistake next
# to the correction, so the pattern sinks in.
number_of_students = 28
# print("Class size:", class_size)              # ❌ NameError — 'class_size' was never defined
print("Class size:", number_of_students)  # ✅ fixed — using the name we actually defined

# 🧪 TRY IT: uncomment the ❌ line above, save the file, and re-run it
# (uv run python python_course/module_01_hello_python/lesson_02_reading_errors.py).
# Read the traceback bottom-up, find the line number, then comment the
# line back out (or fix the variable name) so the file runs clean again.

# ── 4. A SECOND FAMILY OF ERROR — SYNTAX ────────────────────────
# A SyntaxError means Python couldn't even understand the shape of your
# sentence — like a student handing in an essay with no closing full
# stop. Below is an example of broken syntax, kept as a comment (a real
# SyntaxError would stop this whole file from running, since Python
# checks the "grammar" of every line before running any of them):
#
#   print("Missing closing quote)     # ❌ SyntaxError: unterminated string literal
#
# The fix is simply to close the quote: print("Missing closing quote").
# SyntaxErrors point at WHERE Python got confused, not necessarily at
# the exact character that's missing — so read a little to each side
# of the reported line, too.
print("A SyntaxError usually means punctuation is missing: a quote, a bracket, a colon.")

print("✅ Lesson 1.2 complete — you can now read a traceback bottom-up!")
