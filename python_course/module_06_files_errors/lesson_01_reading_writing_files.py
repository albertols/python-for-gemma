"""
🎓 LESSON 6.1 — Reading and Writing Files
========================================

WHAT YOU WILL LEARN
-------------------
- How pathlib.Path represents a file location as an object, not just text
- How write_text() saves text to disk, and read_text() reads it back
- How to build a tiny CSV file by hand and read it back with .split(',')
- Why files let a program remember data between runs, instead of losing it all

RESOURCES (open these!)
-----------------------
📖 Docs   : https://docs.python.org/3/tutorial/inputoutput.html#reading-and-writing-files
🎬 Video  : https://www.youtube.com/watch?v=Uh2ebFW8OYM
🖼 Visual : see INDEX.md concept map

HOW TO RUN ME
-------------
    uv run python python_course/module_06_files_errors/lesson_01_reading_writing_files.py
"""

from pathlib import Path

# ── 1. pathlib — A FILE LOCATION AS AN OBJECT, NOT JUST TEXT ─────
# Path() turns a file location into an object you can build up piece by
# piece with `/`, the same way a school address is built from named
# parts (building, floor, room) rather than one fragile hand-typed
# string. Path(__file__).parent means "the folder THIS lesson file
# lives in" — it works no matter who runs it or from where.
sandbox = Path(__file__).parent / "sandbox"
sandbox.mkdir(exist_ok=True)
print("Sandbox folder ready at:", sandbox)
# Every demo file below is written INSIDE sandbox/ on purpose — it's
# obvious what's throwaway practice, and sandbox/ is git-ignored, so
# none of these files ever get committed to the class repository.

# ── 2. write_text() — SAVING TEXT TO DISK ─────────────────────────
# write_text() saves a string to a file, creating it if it doesn't
# exist — like printing out a fresh copy of the class register and
# putting it in a folder. \n means "start a new line", exactly like
# pressing Enter between names.
register_file = sandbox / "register.txt"
register_file.write_text("Ana\nBen\nCai\nGem")
print("Wrote register.txt — open", register_file, "in your editor to see it.")

# 🧪 TRY IT: open sandbox/register.txt in your file explorer or IDE —
# confirm it really is three lines of plain text on disk.

# ── 3. read_text() — READING IT BACK ──────────────────────────────
# read_text() reads the whole file back as one string. .splitlines()
# then breaks it into a list, one entry per line, WITHOUT adding an
# empty entry for the trailing newline — unlike a naive .split("\n"),
# which treats that final \n as "one more line" and adds a stray "" at
# the end, like miscounting an empty row at the bottom of a register.
contents = register_file.read_text()
print("Raw contents:", repr(contents))
names = contents.splitlines()
print("splitlines() ->", names)
naive_split = contents.split("\n")
print("split('\\n') instead ->", naive_split, "(see the trailing '' ?)")

# 🧪 TRY IT: add a fourth name (with its own \n) to the write_text()
# call above, re-run, and check it appears in both lists.

# ── 4. CSV BY HAND — ONE ROW PER LINE, COMMA-SEPARATED ────────────
# CSV (comma-separated values) is the plain-text version of a
# spreadsheet: each line is one row, and a comma separates the columns
# — here, a student's name and their mark. No special library needed
# to write one by hand: just build the right string.
marks_file = sandbox / "marks.csv"
marks = {"Ana": 17, "Ben": 14, "Gem": 18}
lines = []
for student_name, mark in marks.items():
    lines.append(f"{student_name},{mark}")
marks_file.write_text("\n".join(lines) + "\n")
print("Wrote marks.csv:")
print(marks_file.read_text())

# Reading a CSV by hand means splitting each line at the comma with
# .split(',') — the reverse of how we built it above.
for line in marks_file.read_text().splitlines():
    student_name, mark = line.split(",")
    print(student_name, "scored", mark)

# 🧪 TRY IT: add a third student to the marks dict above and re-run —
# watch a third row appear in both marks.csv and the printed loop.

print("✅ Lesson 6.1 complete — check the sandbox/ folder to see the files you just created!")
