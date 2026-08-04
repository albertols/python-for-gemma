"""
🎓 LESSON 4.2 — Loops
======================

WHAT YOU WILL LEARN
--------------------
- How a for loop repeats code once per item in a list — finally, no more copy-pasting!
- How range() generates a sequence of numbers to loop over
- How a while loop repeats code as long as a condition stays True
- How to count matches inside a loop with a running total

RESOURCES (open these!)
------------------------
📖 Docs   : https://docs.python.org/3/tutorial/controlflow.html#for-statements
🎬 Video  : https://www.youtube.com/watch?v=6iF8Xb7Z3wQ
🖼 Visual : see INDEX.md concept map

HOW TO RUN ME
-------------
    uv run python python_course/module_04_control_flow/lesson_02_loops.py
"""

# ── 1. for — REPEATING CODE ONCE PER LIST ITEM ──────────────────
# Back in Module 03, printing a whole register meant either one
# print() per name or printing the list all at once. A for loop finally
# gives you the missing piece: run the SAME indented block once for
# EVERY item in a list automatically — like calling a register out
# loud, one name at a time, without writing "print(name)" thirty times.
register = ["Aisha", "Ben", "Chidi", "Dev"]
for student in register:
    print("Present:", student)

# 🧪 TRY IT: add a fifth name to `register` above the loop and re-run —
# notice you didn't need to add a new print() line for it.

# ── 2. range() — LOOPING OVER NUMBERS, NOT A LIST ────────────────
# range(n) generates the numbers 0, 1, 2, ... up to (not including) n
# — the same "stop is not included" rule you learned with slicing in
# Module 03. It's perfect for "do this exactly n times", like ringing
# the bell for each of 3 remaining exam periods today.
for period in range(3):
    print("Exam period", period + 1, "starting")

# ── 3. while — REPEATING UNTIL A CONDITION BECOMES FALSE ─────────
# A for loop repeats a known number of times. A while loop instead
# repeats for as long as its condition stays True — like a teacher
# still collecting hands-up questions "while there are questions left",
# with no fixed number decided in advance. Be careful: something
# inside the loop MUST eventually make the condition False, or it
# repeats forever — here, `questions_left` counts down each time.
questions_left = 3
while questions_left > 0:
    print("Questions remaining:", questions_left)
    questions_left = questions_left - 1
print("No more questions — moving on.")

# 🧪 TRY IT: change the starting value of `questions_left` to 5 and
# re-run — count how many lines print before "moving on" appears.

# ── 4. COUNTING MATCHES INSIDE A LOOP ────────────────────────────
# A very common pattern: start a counter at 0, then add 1 to it every
# time the loop finds a match — like a teacher tallying how many
# scripts in a pile scored above the pass mark, one tick per pass,
# building the total as they go through the stack.
scores = [35, 62, 41, 78, 39]
pass_mark = 40
passes = 0
for score in scores:
    if score >= pass_mark:
        passes = passes + 1
print(f"{passes} out of {len(scores)} scores passed")

# 🧪 TRY IT: change `pass_mark` to 50 and re-run — watch the pass
# count drop as the bar gets higher.

print("✅ Lesson 4.2 complete — you can now repeat code with for, range(), and while!")
