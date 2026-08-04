# 🎓 Module 03 — Collections

One variable per student doesn't scale to a class of thirty. This
module teaches you Python's four ways to hold many values at once: the
ordered, changeable list; the ordered, frozen tuple; the key-lookup
dictionary; and the duplicate-free set. By the end, you'll manage a
whole register and gradebook in a handful of lines, and complete your
third homework.

## 🎯 What you'll learn

- Storing many values in one list, and reaching them by index or slice
- Growing a list with `.append()`
- Why a tuple is a list that can never change
- Pairing a key with a value in a dictionary, and looking it up safely with `.get()`
- Viewing a dictionary's `.keys()`, `.values()`, and `.items()`
- De-duplicating a list into a set of unique values

## 🗺️ Concept map

```mermaid
flowchart LR
    A["📋 List"]:::concept --> B["🔢 Index & Slice"]:::concept
    B --> C["➕ .append()"]:::concept
    C --> D["🔒 Tuple (frozen)"]:::concept
    D --> E["📖 Dict: key → value"]:::concept
    E --> F["🧩 Set: unique only"]:::concept
    F --> G["📝 Homework 03"]:::win
    classDef concept fill:#4F86C6,color:#fff,stroke:#2B4C7E
    classDef win fill:#59A96A,color:#fff,stroke:#2E5E3A
```

## 📚 Lessons

| File | Concept | 📖 Docs | 🎬 Video |
|---|---|---|---|
| `lesson_01_lists_and_tuples.py` | Lists, indexing, slicing, `.append()`, tuples | [Python tutorial: lists](https://docs.python.org/3/tutorial/introduction.html#lists) | [Corey Schafer — Lists, Tuples, and Sets](https://www.youtube.com/watch?v=W8KRzm-HUcc) |
| `lesson_02_dicts_and_sets.py` | Dictionaries, `.get()`, `.keys()`/`.values()`/`.items()`, sets | [Python tutorial: dictionaries](https://docs.python.org/3/tutorial/datastructures.html#dictionaries) | [Corey Schafer — Dictionaries: Key-Value Pairs](https://www.youtube.com/watch?v=daefaLgNkw0) |

## 📝 Homework

Complete the three functions in `homework_03.py`, then check your work:

```
uv run pytest python_course/module_03_collections -v -m homework
```

## ✅ Progress checklist

- [ ] Ran `lesson_01_lists_and_tuples.py` and read every comment
- [ ] Completed all three 🧪 TRY IT experiments in lesson 3.1
- [ ] Ran `lesson_02_dicts_and_sets.py` and read every comment
- [ ] Completed all three 🧪 TRY IT experiments in lesson 3.2
- [ ] Filled in all three TODOs in `homework_03.py`
- [ ] All three homework tests pass (`uv run pytest python_course/module_03_collections -v -m homework`)

## 🆘 When you're stuck

1. Re-read the comments in the lesson file — the answer is usually explained right above the code.
2. Ask the homework-checker agent — it hints, it never spoils the answer.
3. Ask Claude to **explain** the concept — never to solve the homework for you.
