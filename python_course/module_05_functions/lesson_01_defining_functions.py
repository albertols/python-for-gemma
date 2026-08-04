"""
🎓 LESSON 5.1 — Defining Functions
=================================

WHAT YOU WILL LEARN
-------------------
- How def creates a reusable, named block of code
- How parameters let you feed different data into the same block
- How return hands a value back to whoever called the function
- How local variables inside a function stay invisible outside it (scope)

RESOURCES (open these!)
-----------------------
📖 Docs   : https://docs.python.org/3/tutorial/controlflow.html#defining-functions
🎬 Video  : https://www.youtube.com/watch?v=9Os0o3wzS_I
🖼 Visual : see INDEX.md concept map

HOW TO RUN ME
-------------
    uv run python python_course/module_05_functions/lesson_01_defining_functions.py
"""

# ── 1. THE PROBLEM — COPY-PASTING THE SAME CALCULATION ──────────
# Before functions, working out a percentage for every student means
# retyping the same formula each time — like re-writing "marks out of
# total, times 100" by hand on every single script instead of using one
# mark scheme for the whole stack. Retyping invites typos, and if the
# formula ever needs fixing, you'd have to hunt down every copy.
ana_score, ana_total = 15, 20
ana_percentage = ana_score / ana_total * 100
print("Ana:", ana_percentage)

ben_score, ben_total = 18, 20
ben_percentage = ben_score / ben_total * 100
print("Ben:", ben_percentage)


# ── 2. def — GIVING A CALCULATION A NAME ─────────────────────────
# def creates a function: a named, reusable block of code, written once
# and run as many times as you like — exactly like designing ONE mark
# scheme that every marker applies to every script, rather than each
# marker inventing their own method. The indented block below the
# colon is the function's body — it only runs when the function is
# CALLED, not when Python first reads the def line.
def percentage(score, total):
    return score / total * 100


print(percentage(15, 20))

# 🧪 TRY IT: call percentage(20, 20) on its own line and print() the
# result — confirm a perfect score returns 100.0.

# ── 3. PARAMETERS — THE INPUT SLOTS INSIDE THE PARENTHESES ───────
# score and total are PARAMETERS: named placeholders that get filled in
# with whatever values you hand over when you CALL the function — like
# blank slots on a mark scheme template ("student's mark: ___, total:
# ___") that get filled in fresh for every single script you mark. The
# same function, percentage(), now works for ANY student.
print(percentage(18, 20))
print(percentage(7, 10))

# 🧪 TRY IT: call percentage() with your own two numbers (e.g. a mark
# out of a homework you've set) and print() the result.

# ── 4. return vs print — HANDING BACK A VALUE, NOT JUST DISPLAYING IT
# print() just displays something on screen for a human to read, then
# forgets it. return is different: it hands the value BACK to whoever
# called the function, so the program can store it, compare it, or pass
# it on — the difference between a TA reading a mark aloud once (print)
# and physically handing back the marked script so you can act on it
# (return). Because percentage() RETURNS a value, we can catch it in a
# variable and reuse it.
ana_result = percentage(15, 20)
print("Stored result:", ana_result, "— type:", type(ana_result))
if ana_result >= 70:
    print("That's a Merit-worthy percentage.")


# ── 5. SCOPE — VARIABLES INSIDE A FUNCTION STAY INSIDE ────────────
# A variable created INSIDE a function only exists while that function
# is running, and disappears the moment it finishes — its "scope" is
# local to the function, like a private note a marker scribbles on a
# script that never makes it into the staffroom conversation outside.
# A variable created OUTSIDE every function (like ana_score above) is
# "global" and CAN be read from inside a function, but a LOCAL variable
# cannot be read from outside.
def show_scope_demo():
    local_note = "only visible inside show_scope_demo()"
    print("Inside the function:", local_note)


show_scope_demo()
# print(local_note)  # ❌ NameError — 'local_note' only exists inside show_scope_demo()

# 🧪 TRY IT: uncomment the ❌ line above, save, and re-run this file.
# Read the traceback bottom-up (Lesson 1.2 skills!), then comment the
# line back out so the file runs clean again.

print("✅ Lesson 5.1 complete — you can now define functions with parameters, return values, and scope!")
