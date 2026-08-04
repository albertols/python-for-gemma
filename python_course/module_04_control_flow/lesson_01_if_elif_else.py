"""
🎓 LESSON 4.1 — if, elif, else
=============================

WHAT YOU WILL LEARN
-------------------
- How comparison operators (==, !=, <, >, <=, >=) produce a bool
- How an if statement runs code only when a condition is True
- How elif checks another condition when the first was False
- How else catches everything that didn't match above it
- How to chain several elif branches into grade boundaries

RESOURCES (open these!)
-----------------------
📖 Docs   : https://docs.python.org/3/tutorial/controlflow.html#if-statements
🎬 Video  : https://www.youtube.com/watch?v=DZwmZ8Usvnk
🖼 Visual : see INDEX.md concept map

HOW TO RUN ME
-------------
    uv run python python_course/module_04_control_flow/lesson_01_if_elif_else.py
"""

# ── 1. COMPARISON OPERATORS — QUESTIONS WITH A True/False ANSWER ─
# You met bool in Module 02: exactly True or False. Comparison
# operators (==, !=, <, >, <=, >=) are how you ASK a yes/no question
# about your data — like asking "did this student pass?" and getting
# back a definite answer, not a maybe.
score = 74
print("Is 74 at least 70?", score >= 70)
print("Is 74 exactly 100?", score == 100)

# 🧪 TRY IT: change `score` to a different number and re-run — watch
# both answers update.

# ── 2. if — RUN CODE ONLY WHEN SOMETHING IS TRUE ─────────────────
# An if statement runs the indented block beneath it ONLY when its
# condition is True — exactly like a rule on a mock exam: "IF you
# score 70 or above, write 'Merit' on the paper." If the condition is
# False, Python simply skips the indented block and moves on.
if score >= 70:
    print("Merit — well done!")

# ── 3. else — THE CATCH-ALL FOR EVERYTHING ELSE ──────────────────
# else runs when the if condition was False — no question asked, it's
# simply "otherwise". Together, if/else cover every possibility: one
# branch or the other always runs, the same way a report always says
# either "Merit" or "Keep practising" — never both, never neither.
if score >= 70:
    print("Result: Merit")
else:
    print("Result: Keep practising")

# 🧪 TRY IT: set score = 50 above the if/else block and re-run — watch
# which branch fires this time.

# ── 4. elif — CHECKING SEVERAL CONDITIONS IN ORDER ───────────────
# elif ("else if") lets you check more than two possibilities. Python
# tests each condition from TOP to BOTTOM and runs the FIRST one that
# is True, then skips the rest entirely — like marking against a grade
# boundary table, top boundary first: check A* before A, A before B,
# because a 95 technically also satisfies "≥70" but you want the
# HIGHEST matching grade, not just any matching one.
mark = 82
if mark >= 90:
    grade = "A*"
elif mark >= 80:
    grade = "A"
elif mark >= 70:
    grade = "B"
elif mark >= 60:
    grade = "C"
else:
    grade = "U"
print(f"Mark {mark} → grade {grade}")

# 🧪 TRY IT: change `mark` to 95, then to 55, and re-run each time —
# confirm the grade lands where the boundary table says it should.

print("✅ Lesson 4.1 complete — you can now branch your code with if, elif, and else!")
