"""
🎓 LESSON 8.1 — pytest and the TDD Story
=======================================

WHAT YOU WILL LEARN
-------------------
- What assert means: Python's built-in "check this is true, or complain"
- How a tiny hand-written check function is a "test" in miniature
- The red-green-refactor story: write the check, watch it fail, make it pass
- That you've been doing TDD since Module 01 — every homework was red-green

RESOURCES (open these!)
-----------------------
📖 Docs   : https://docs.pytest.org/en/stable/how-to/index.html
🎬 Video  : https://www.youtube.com/watch?v=cHYq1MRoyI0
🖼 Visual : see INDEX.md concept map

HOW TO RUN ME
-------------
    uv run python python_course/module_08_testing_tooling/lesson_01_pytest_and_tdd.py

Note: this lesson does NOT `import pytest` — pytest is a real dependency
of this project (see the [dependency-groups] in pyproject.toml), but a
lesson file's job is to teach the IDEA by hand first. Every
test_homework_0N.py file you've been running all course already shows
you real pytest code — go peek at one after this lesson.
"""

# ── 1. THE PROBLEM — HOW DO YOU KNOW CODE IS RIGHT? ───────────────
# Every homework so far, you ran `uv run pytest ... -m homework` and
# trusted the result. But what IS that command actually doing? Without
# it, "is my code right?" means re-reading it by eye every single time
# — like re-marking the same script from scratch after every single
# edit, instead of having a mark scheme you can re-apply instantly.
print("Question: how do you know percentage(15, 20) really returns 75.0?")


# ── 2. assert — PYTHON'S BUILT-IN "CHECK THIS IS TRUE" ────────────
# assert is a keyword: assert CONDITION checks the condition and does
# NOTHING if it's true — completely silent, like a mark scheme tick
# that doesn't need announcing. If the condition is FALSE, assert
# raises an AssertionError, Module 06's kind of exception, and the
# optional text after the comma becomes the error message — exactly
# the 💡 Hint messages you've been reading in every test_homework file.
def percentage(score, total):
    return score / total * 100


assert percentage(15, 20) == 75.0  # silent — the check passed
print("assert percentage(15, 20) == 75.0  ->  passed silently, nothing printed by assert itself")

try:
    assert percentage(15, 20) == 999, "💡 Hint: that's clearly the wrong expected value on purpose."
except AssertionError as error:
    print("A deliberately wrong assert raised:", error)

# 🧪 TRY IT: change the 999 above to 75.0 and re-run — watch the
# except branch NOT fire, because the assert now passes silently.


# ── 3. A HAND-ROLLED "CHECK" FUNCTION — A TEST IN MINIATURE ───────
# A "test" is just a function containing one or more asserts, with a
# name starting with test_ so a tool can find it automatically —
# precisely the shape of every function inside every test_homework_0N.py
# file you've already been running. Below, we write and run one BY
# HAND, without any testing tool, to see exactly what pytest automates.
def test_percentage_perfect_score():
    assert percentage(20, 20) == 100.0, "💡 Hint: a perfect score should be exactly 100%."


def run_check(check_function):
    try:
        check_function()
        print(f"🟢 GREEN — {check_function.__name__} passed")
    except AssertionError as error:
        print(f"🔴 RED — {check_function.__name__} failed: {error}")


run_check(test_percentage_perfect_score)

# 🧪 TRY IT: write your own test_percentage_zero() function above
# run_check's definition, asserting percentage(0, 20) == 0.0, then call
# run_check(test_percentage_zero) and confirm you see 🟢 GREEN.


# ── 4. RED — GREEN — REFACTOR — THE TDD STORY ─────────────────────
# Test-Driven Development writes the CHECK first, before the code that
# satisfies it exists — like writing the mark scheme before the exam
# paper, so you know exactly what "correct" means before you start.
# Step 1, RED: write a check for a function that doesn't exist yet.
def test_apply_late_penalty():
    assert apply_late_penalty(80) == 70, "💡 Hint: a late penalty of 10 marks."


# If we ran run_check(test_apply_late_penalty) right now, Python would
# raise NameError: apply_late_penalty is not defined — that's RED, and
# it's exactly the ModuleNotFoundError you saw the FIRST time you ever
# opened a fresh homework module before writing any code.


# Step 2, GREEN: write the SMALLEST code that satisfies the check.
def apply_late_penalty(score):
    return score - 10


run_check(test_apply_late_penalty)  # 🟢 GREEN now that the function exists


# Step 3, REFACTOR: improve the code WITHOUT changing what it does —
# the check stays green throughout, proving nothing broke.
def apply_late_penalty(score):  # noqa: F811 (deliberate redefinition — this IS the refactor step)
    penalty = 10
    return score - penalty


run_check(test_apply_late_penalty)  # still 🟢 GREEN after refactoring

# 🧪 TRY IT: change apply_late_penalty's penalty to 15 and re-run this
# file — watch test_apply_late_penalty go 🔴 RED, because the check
# still expects a penalty of 10. Change it back to 10 to go green again.

# ── 5. YOU'VE BEEN DOING TDD SINCE MODULE 01 ───────────────────────
# Every single homework this course, the test_homework_0N.py file
# existed BEFORE your solution — Claude Fable, or your teacher, wrote
# the checks first, exactly like Step 1 above. The first time you ran
# `-m homework` on a fresh module, you saw RED (💡 hints everywhere).
# You filled in the TODOs — GREEN. `uv run pytest` is simply a tool
# that finds every test_ function across the whole project, runs
# run_check() on all of them automatically, and prints one tidy
# summary — everything Lesson 8.1 just did by hand, at scale.
print("You've been doing TDD since Module 01 — every homework was red, then green.")

print("✅ Lesson 8.1 complete — you now know what pytest automates, and why tests come first!")
