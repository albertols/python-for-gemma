"""
🎓 LESSON 6.2 — Exceptions
=========================

WHAT YOU WILL LEARN
-------------------
- Why an unhandled error stops a program dead, mid-run
- How try/except catches an error and lets your program recover
- How to catch a SPECIFIC error type instead of "anything at all"
- Why exceptions are a safety net, not something to fear

RESOURCES (open these!)
-----------------------
📖 Docs   : https://docs.python.org/3/tutorial/errors.html#handling-exceptions
🎬 Video  : https://www.youtube.com/watch?v=NIWwJbo-9_8
🖼 Visual : see INDEX.md concept map

HOW TO RUN ME
-------------
    uv run python python_course/module_06_files_errors/lesson_02_exceptions.py
"""

from pathlib import Path

sandbox = Path(__file__).parent / "sandbox"
sandbox.mkdir(exist_ok=True)

# ── 1. THE PROBLEM — AN UNHANDLED ERROR STOPS EVERYTHING ─────────
# Lesson 1.2 taught you errors are feedback, not failure. But an error
# that isn't HANDLED doesn't just print red text — it stops the ENTIRE
# program right there, like a fire alarm cutting a lesson short
# mid-sentence: nothing after that line runs. Dividing by zero is
# undefined maths, so Python refuses outright rather than guessing:
empty_scores = []
# average = sum(empty_scores) / len(empty_scores)   # ❌ ZeroDivisionError: division by zero
print("Dividing by zero raises ZeroDivisionError — Python refuses to guess an answer.")

# ── 2. try/except — CATCHING THE ERROR AND RECOVERING ────────────
# try means "attempt this, it might fail". except ZeroDivisionError
# means "if THAT SPECIFIC problem happens, run this instead and keep
# going" — like having a backup activity ready for when the projector
# fails, rather than cancelling the whole lesson.
try:
    average = sum(empty_scores) / len(empty_scores)
except ZeroDivisionError:
    print("No scores recorded — defaulting average to 0.0")
    average = 0.0
print("Average:", average)

# 🧪 TRY IT: change empty_scores to [10, 20] just above the try block
# and re-run — watch the try block succeed and the except branch never fire.

# ── 3. CATCHING A SPECIFIC ERROR, NOT "ANYTHING" ──────────────────
# We caught ZeroDivisionError specifically, not every possible error.
# A bare `except:` would also swallow an UNRELATED bug — like a typo
# causing a NameError — silently, as if it were the "no scores" case,
# hiding a real mistake instead of surfacing it. Naming the exact error
# type keeps except honest: it only steps in for the problem you
# actually planned for.
register = {"Ana": 17, "Ben": 14}
try:
    mark = register["Cai"]
except KeyError:
    print("Cai isn't in the register yet — treating as no mark.")
    mark = None
print("Cai's mark:", mark)

# 🧪 TRY IT: change "Cai" to "Ana" above and re-run — see the try block
# succeed this time, with the except branch never running.

# ── 4. FILES + EXCEPTIONS TOGETHER — A MISSING FILE ───────────────
# Reading a file that was never written raises FileNotFoundError — the
# file-system equivalent of the KeyError above. Wrapping it in
# try/except means a missing register doesn't crash your whole grading
# script; it's exactly the pattern your homework's safe_average() uses
# to survive an empty list instead of crashing.
missing_file = sandbox / "does_not_exist.txt"
try:
    contents = missing_file.read_text()
except FileNotFoundError:
    print("does_not_exist.txt isn't there yet — treating the register as empty.")
    contents = ""
print("Contents:", repr(contents))

# 🧪 TRY IT: write missing_file.write_text("Dev\n") ABOVE the try block
# (like Lesson 6.1 taught) and re-run — see the except branch NOT fire.

print("✅ Lesson 6.2 complete — you can now catch specific errors and keep your program running!")
