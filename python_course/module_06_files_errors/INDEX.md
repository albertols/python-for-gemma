# 🎓 Module 06 — Files and Exceptions

Every program until now has forgotten everything the moment it
finished running. This module gives your code a memory: reading and
writing real files on disk with `pathlib`, building a tiny CSV
register by hand, and using `try`/`except` so a missing file or an
empty class list doesn't crash the whole thing. By the end, you'll
have saved and re-read real marks data and completed your sixth
homework.

## 🎯 What you'll learn

- Representing a file location with `pathlib.Path`
- Saving text to disk with `write_text()` and reading it back with `read_text()`
- Splitting file contents into lines safely with `.splitlines()`
- Writing and reading a simple CSV file by hand with `.split(',')`
- Why an unhandled error stops a program dead, mid-run
- Catching a SPECIFIC error with `try`/`except` so your program recovers instead of crashing

## 🗺️ Concept map

```mermaid
flowchart LR
    A["📁 pathlib.Path"]:::concept --> B["✍️ write_text / read_text"]:::concept
    B --> C["📊 CSV by hand"]:::concept
    C --> D["💥 Unhandled errors"]:::warn
    D --> E["🛡️ try / except"]:::concept
    E --> F["📝 Homework 06"]:::win
    classDef concept fill:#4F86C6,color:#fff,stroke:#2B4C7E
    classDef win fill:#59A96A,color:#fff,stroke:#2E5E3A
    classDef warn fill:#F4A259,color:#333,stroke:#B87333
```

## 📚 Lessons

| File | Concept | 📖 Docs | 🎬 Video |
|---|---|---|---|
| `lesson_01_reading_writing_files.py` | `pathlib`, `read_text`/`write_text`, CSV by hand | [Python tutorial: reading and writing files](https://docs.python.org/3/tutorial/inputoutput.html#reading-and-writing-files) | [Python Tutorial: File Objects](https://www.youtube.com/watch?v=Uh2ebFW8OYM) |
| `lesson_02_exceptions.py` | `try`/`except`, catching specific errors | [Python tutorial: handling exceptions](https://docs.python.org/3/tutorial/errors.html#handling-exceptions) | [Python Tutorial: Try/Except Blocks](https://www.youtube.com/watch?v=NIWwJbo-9_8) |

## 📝 Homework

Complete the three functions in `homework_06.py`, then check your work:

```
uv run pytest python_course/module_06_files_errors -v -m homework
```

## ✅ Progress checklist

- [ ] Ran `lesson_01_reading_writing_files.py` and read every comment
- [ ] Completed all three 🧪 TRY IT experiments in lesson 6.1
- [ ] Looked inside the `sandbox/` folder and saw `register.txt` and `marks.csv`
- [ ] Ran `lesson_02_exceptions.py` and read every comment
- [ ] Completed all three 🧪 TRY IT experiments in lesson 6.2
- [ ] Filled in all three TODOs in `homework_06.py`
- [ ] All three homework tests pass (`uv run pytest python_course/module_06_files_errors -v -m homework`)

## 🆘 When you're stuck

1. Re-read the comments in the lesson file — the answer is usually explained right above the code.
2. Ask the homework-checker agent — it hints, it never spoils the answer.
3. Ask Claude to **explain** the concept — never to solve the homework for you.
