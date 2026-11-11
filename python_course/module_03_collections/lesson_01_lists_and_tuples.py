"""
🎓 LESSON 3.1 — Lists and Tuples
===============================

WHAT YOU WILL LEARN
-------------------
- How to store many values in one variable with a list
- How to reach a single item with an index, and a slice of items with [start:stop]
- How to grow a list with .append()
- How a tuple is like a list that can never be changed once created

RESOURCES (open these!)
-----------------------
📖 Docs   : https://docs.python.org/3/tutorial/introduction.html#lists
🎬 Video  : https://www.youtube.com/watch?v=W8KRzm-HUcc
🖼 Visual : see INDEX.md concept map

HOW TO RUN ME
-------------
    uv run python python_course/module_03_collections/lesson_01_lists_and_tuples.py
"""

# ── 1. LISTS — ONE VARIABLE, MANY VALUES ────────────────────────
# In Module 02 every variable held exactly one value. A list holds
# many values in one ordered variable — square brackets, items
# separated by commas. Think of it as a whole class register in a
# single exercise book, instead of one separate name badge per pupil.
register = ["Aisha", "Ben", "Chidi", "Dev"]
print("Register:", register)

# 🧪 TRY IT: create your own list called `subjects` with three subjects
# you teach, then print() it.
subjects = ["Business Y11", "Business Y12", "Business Y13"]
print("Subjects:" , subjects)

# ── 2. INDEXING — REACHING ONE ITEM BY POSITION ─────────────────
# Every item in a list has a position number called an INDEX, and
# Python counts from 0, not 1 — the first name is register[0], like a
# seating plan numbered from the front-left desk. Negative indexes
# count from the end, so register[-1] is always the LAST item, handy
# when you don't know exactly how many students are on the list.
print("First on the register:", register[0])
print("Last on the register:", register[-1])

# ── 3. SLICING — REACHING SEVERAL ITEMS AT ONCE ─────────────────
# A slice register[start:stop] gives you a whole chunk of the list —
# like reading out "the first three names" from a register instead of
# calling one at a time. IMPORTANT: stop is NOT included, so [0:3]
# means "positions 0, 1, 2" — three names, not four. It's the same
# rule as a page range "pages 1 to 3" meaning three pages, but written
# with the number just past the last one you want.
first_two = register[0:2]
print("First two:", first_two)

# 🧪 TRY IT: predict what register[1:3] will print before you add a
# print(register[1:3]) line and run this file to check.
print(register[1:3])

# ── 4. .append() — GROWING A LIST ────────────────────────────────
# .append() adds one new item to the END of a list — like a late
# student arriving and being added to the bottom of today's register,
# without needing to retype the names already on it.
register.append("Efe")
print("Register after late arrival:", register)
print("Register length:", len(register))

# ── 5. TUPLES — A LIST THAT CAN NEVER CHANGE ────────────────────
# A tuple looks like a list but uses round brackets, and once created
# it can never be modified — no .append(), no changing an item. Use a
# tuple for facts that should stay fixed, like a term's official start
# and end date on the school calendar: values nobody should be able to
# accidentally edit later in the code.
term_dates = ("2026-09-01", "2026-12-18")
print("Term starts:", term_dates[0], "| Term ends:", term_dates[1])

# 🧪 TRY IT: try term_dates.append("2027-01-01") — read the error
# message (an AttributeError), then delete that line so this file
# runs clean again. That error IS the point: tuples refuse to grow.

print("✅ Lesson 3.1 complete — you can now index, slice, and grow a list, and spot when a tuple fits better!")
