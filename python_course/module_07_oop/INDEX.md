# 🎓 Module 07 — Object-Oriented Programming

Every noun in a school — a student, an exam, a mark scheme — has been
living in loose variables and dictionaries so far, with nothing
forcing "this name" and "these scores" to stay together. This module
gives you `class`: your own blueprint for bundling data and behaviour
into ONE reusable object. By the end, you'll have modelled a Student,
an Exam, and a Rubric as tiny classes — the same shape of thinking the
AI Examiner prototype will need at full scale — and completed your
seventh homework.

## 🎯 What you'll learn

- Why bundling data and behaviour beats separate loose variables
- Defining a blueprint with `class`, and filling it in with `__init__`
- What `self` means, and how attributes belong to ONE instance
- Writing methods — functions that live inside a class and read `self`
- Composition: one object holding or using another object
- Splitting a problem into several small, single-purpose classes

## 🗺️ Concept map

```mermaid
flowchart LR
    A["🏗️ class blueprint"]:::concept --> B["🧬 __init__ & self"]:::concept
    B --> C["🎒 attributes"]:::concept
    C --> D["⚙️ methods"]:::concept
    D --> E["🧩 composition"]:::concept
    E --> F["🤖 baby AI Examiner"]:::ai
    F --> G["📝 Homework 07"]:::win
    classDef concept fill:#4F86C6,color:#fff,stroke:#2B4C7E
    classDef win fill:#59A96A,color:#fff,stroke:#2E5E3A
    classDef ai fill:#8E6BAF,color:#fff,stroke:#5D3F7A
```

## 📚 Lessons

| File | Concept | 📖 Docs | 🎬 Video |
|---|---|---|---|
| `lesson_01_your_first_class.py` | `class`, `__init__`, `self`, attributes, methods — Student | [Python tutorial: a first look at classes](https://docs.python.org/3/tutorial/classes.html#a-first-look-at-classes) | [Corey Schafer — OOP 1: Classes and Instances](https://www.youtube.com/watch?v=ZDa-Z5JzLYM) |
| `lesson_02_classes_working_together.py` | Exam + Rubric, composition, objects as school nouns | [Python tutorial: class and instance variables](https://docs.python.org/3/tutorial/classes.html#class-and-instance-variables) | [Corey Schafer — OOP 1: Classes and Instances](https://www.youtube.com/watch?v=ZDa-Z5JzLYM) |

## 📝 Homework

Complete the methods in `homework_07.py` — `Student.average()`,
`Student.best_score()`, `Exam.percentage()`, and `Rubric.max_marks()`
— then check your work:

```
uv run pytest python_course/module_07_oop -v -m homework
```

## ✅ Progress checklist

- [ ] Ran `lesson_01_your_first_class.py` and read every comment
- [ ] Completed all three 🧪 TRY IT experiments in lesson 7.1
- [ ] Ran `lesson_02_classes_working_together.py` and read every comment
- [ ] Completed both 🧪 TRY IT experiments in lesson 7.2
- [ ] Filled in `average()` and `best_score()` on `Student` in `homework_07.py`
- [ ] Filled in `percentage()` on `Exam` and `max_marks()` on `Rubric`
- [ ] All four homework tests pass (`uv run pytest python_course/module_07_oop -v -m homework`)

## 🆘 When you're stuck

1. Re-read the comments in the lesson file — the answer is usually explained right above the code.
2. Ask the homework-checker agent — it hints, it never spoils the answer.
3. Ask Claude to **explain** the concept — never to solve the homework for you.
