"""
🎓 LESSON 3.2 — Dictionaries and Sets
======================================

WHAT YOU WILL LEARN
--------------------
- How a dictionary pairs a key with a value, like a gradebook
- How to look up a value by key, and use .get() to avoid crashes
- How .keys(), .values(), and .items() give you each part of a dictionary
- How a set stores only unique values — perfect for de-duplicating a list

RESOURCES (open these!)
------------------------
📖 Docs   : https://docs.python.org/3/tutorial/datastructures.html#dictionaries
🎬 Video  : https://www.youtube.com/watch?v=daefaLgNkw0
🖼 Visual : see INDEX.md concept map

HOW TO RUN ME
-------------
    uv run python python_course/module_03_collections/lesson_02_dicts_and_sets.py
"""

# ── 1. DICTIONARIES — PAIRING A KEY WITH A VALUE ────────────────
# A list finds items by position (0, 1, 2, ...). A dictionary finds
# items by a meaningful KEY instead — curly braces, key: value pairs.
# It's exactly a gradebook: instead of "student in seat 2", you look
# a mark up directly by the student's NAME.
gradebook = {"Ana": 61, "Ben": 74, "Cai": 68}
print("Gradebook:", gradebook)

# 🧪 TRY IT: add a fourth student to `gradebook` (another key: value
# pair inside the braces) and print() the whole dictionary again.

# ── 2. LOOKING UP A VALUE BY KEY ──────────────────────────────────
# Square brackets after a dictionary name look up a value by its key —
# like finding Ben's mark by running your finger down the "name"
# column of a mark sheet until you hit "Ben", then reading across.
print("Ben's mark:", gradebook["Ben"])

# ── 3. .get() — A SAFER LOOKUP FOR KEYS THAT MIGHT BE MISSING ────
# gradebook["Zack"] would crash with a KeyError, because "Zack" isn't
# in the gradebook — same problem as searching a mark sheet for a name
# that was never entered. .get() looks up a key safely and returns
# None (or a default you choose) instead of crashing, the same way
# you'd write "N/A" on a report rather than leave a blank that stops
# the whole report from printing.
print("Zack's mark (missing):", gradebook.get("Zack"))
print("Zack's mark (with default):", gradebook.get("Zack", "not entered"))

# 🧪 TRY IT: run gradebook["Zack"] directly (no .get()) and read the
# KeyError traceback bottom-up, the way you learned in Lesson 1.2 —
# then remove that line so the file runs clean again.

# ── 4. .keys(), .values(), .items() — THE THREE VIEWS ────────────
# .keys() gives every key (all the names), .values() gives every value
# (all the marks), and .items() gives every key PAIRED with its value
# together — three different ways to view the same gradebook, like
# viewing a spreadsheet by just the name column, just the marks
# column, or both columns side by side.
print("Names:", gradebook.keys())
print("Marks:", gradebook.values())
print("Pairs:", gradebook.items())

# ── 5. SETS — ONLY UNIQUE VALUES, NO DUPLICATES ──────────────────
# A set is written with curly braces like a dictionary, but holds
# plain values with no keys, and automatically drops duplicates. It's
# the code equivalent of listing which SUBJECTS appear on a busy
# timetable — even if "Business" is taught five times a week, it only
# needs to appear once in the list of subjects offered.
subjects_taught_each_day = ["Business", "Economics", "Business", "Business", "Economics"]
unique_subjects = set(subjects_taught_each_day)
print("Subjects taught (with repeats):", subjects_taught_each_day)
print("Unique subjects:", unique_subjects)

# 🧪 TRY IT: check membership with "Economics" in unique_subjects —
# print() the result (a bool!) and see it return True.

print("✅ Lesson 3.2 complete — you can now look things up by key and de-duplicate a list with a set!")
