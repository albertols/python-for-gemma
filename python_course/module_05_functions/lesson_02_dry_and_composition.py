"""
🎓 LESSON 5.2 — DRY and Composition
==================================

WHAT YOU WILL LEARN
-------------------
- What DRY means: Don't Repeat Yourself — write logic once, reuse it everywhere
- How one function can call another function (composition)
- How small, single-purpose functions combine into bigger behaviour
- Why fixing a bug in a shared function fixes it everywhere that function is used

RESOURCES (open these!)
-----------------------
📖 Docs   : https://docs.python.org/3/tutorial/controlflow.html#more-on-defining-functions
🎬 Video  : https://www.youtube.com/results?search_query=python+dry+principle+dont+repeat+yourself+tutorial
🖼 Visual : see INDEX.md concept map

HOW TO RUN ME
-------------
    uv run python python_course/module_05_functions/lesson_02_dry_and_composition.py
"""


# ── 1. DRY — DON'T REPEAT YOURSELF ────────────────────────────────
# Each lesson file in this course runs standalone, so we redefine
# percentage() here from Lesson 5.1. But inside a REAL program (like
# your homework_05.py), you'd write this formula in exactly ONE place
# and call it from everywhere it's needed — that's DRY in practice: one
# master mark scheme, reused for every calculation, instead of
# reinventing the formula each time you need it.
def percentage(score, total):
    return score / total * 100


print(percentage(20, 20))

# 🧪 TRY IT: call percentage(20, 20) and confirm a perfect score
# returns exactly 100.0 — no surprises at the boundary.


# ── 2. COMPOSITION — ONE FUNCTION BUILDING ON ANOTHER ─────────────
# apply_curve() doesn't touch percentage() at all — it solves a
# DIFFERENT problem (adding a bonus to raw marks) but the PATTERN is
# the same: write once, call many times. Notice it builds a NEW list
# rather than editing the original — like applying a curve to a fresh
# photocopy of the mark sheet, never scribbling over the original
# register.
def apply_curve(scores, bonus):
    curved = []
    for score in scores:
        curved.append(score + bonus)
    return curved


print(apply_curve([58, 63], 2))

# 🧪 TRY IT: change bonus to 5 and re-run — watch both curved scores
# rise by 5 instead of 2.


# ── 3. FUNCTIONS CALLING FUNCTIONS — TRUE COMPOSITION ─────────────
# format_report() does NOT recalculate "score / total * 100" itself —
# it CALLS percentage(), the function we already wrote and trust. This
# is composition: a bigger function built by combining smaller ones,
# each doing exactly one job. It's also DRY in action — the percentage
# FORMULA lives in exactly one place in this whole file.
def format_report(name, scores, total):
    pieces = []
    for score in scores:
        pct = percentage(score, total)
        pieces.append(f"{score}/{total} ({pct}%)")
    return f"{name}: " + ", ".join(pieces)


print(format_report("Ana", [15, 18], 20))

# 🧪 TRY IT: add a third score to the list (e.g. [15, 18, 20]) and
# re-run — watch format_report() handle it with zero changes to its code.

# ── 4. WHY DRY MATTERS — ONE FIX, EVERYWHERE ──────────────────────
# Imagine the school later decides percentages should round to one
# decimal place. If you'd copy-pasted "score / total * 100" into five
# different functions, you'd need to find and fix all five — and it's
# easy to miss one, the same way re-printing five separate worksheets
# by hand risks one going out with the old numbers. Because
# format_report() COMPOSES percentage() instead of repeating its
# formula, fixing percentage() once would automatically fix every
# function built on top of it.
print("If percentage() ever changes, format_report() updates automatically — that's the payoff of DRY.")

print("✅ Lesson 5.2 complete — you can now write DRY functions that call each other!")
