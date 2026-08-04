---
name: lesson-creator
description: Create or extend python_course and claude_course modules and lessons following the house style. Use when asked to add a lesson, module, or homework.
---

# Lesson Creator

Encodes the house style used by every module in `python_course/` so a new
lesson, homework set, or whole module is indistinguishable from the
hand-built ones already in the repo. Also routes `claude_course/` requests
to the right place — see "Two tracks" immediately below before touching
either directory.

**Living exemplar:** `python_course/module_01_hello_python/` — when in
doubt, open it and match its *shape* exactly (headers, underlines, marker
usage, hint style, docstring format). This skill describes the current,
evolved convention actually used across all eight `python_course` modules.
Where anything else you've read (including an older house-style planning
doc) disagrees with this skill or the exemplar module, **this skill and the
exemplar module win** — they reflect what the repo actually settled on.

## Two tracks — read this before creating anything

This repo has two course tracks, and they are **not** structured the same
way. Get this wrong and you'll create files that don't belong.

- **`python_course/module_XX_<name>/`** — `INDEX.md` **+** `lesson_*.py` +
  `homework_XX.py` + `test_homework_XX.py`. Everything in this skill (module
  anatomy, lesson anatomy, homework anatomy, test anatomy, markers, the
  RED/GREEN/revert ritual) applies here in full.
- **`claude_course/module_XX_<name>/`** — `INDEX.md` **only**. Verified
  against all 7 existing `claude_course` modules: there is no `lesson_*.py`,
  no `homework_*.py`, no `test_homework_*.py`, ever — Claude Code itself is
  the "lesson," and the module folder holds only its `INDEX.md` (concept
  map, docs/video links, a hands-on exercise run against this repo, and
  self-assessment criteria). **Never create `.py`, homework, or test files
  under `claude_course/`.** For the exact section anatomy and content of a
  `claude_course/*/INDEX.md` (its `📚 Learn` / `🛠 Hands-on exercise` /
  `🧭 You know you've got it when…` variant), use the **`visual-docs-creator`**
  skill — that's where the `claude_course` INDEX anatomy lives, in full.

## Module anatomy (`python_course` — see "Two tracks" above for `claude_course`)

A module lives at `python_course/module_XX_<name>/` and contains:

```
module_XX_<name>/
  INDEX.md                   # see visual-docs-creator skill for full anatomy
  lesson_01_<topic>.py        # at least one lesson, usually two
  lesson_02_<topic>.py
  homework_XX.py              # TODO-stub functions or classes
  test_homework_XX.py         # @pytest.mark.homework tests with 💡 hints
  .gitignore                  # ONLY if the module writes files at runtime
  sandbox/                    # ONLY if the module writes files — git-ignored, never committed
```

Do **not** touch the repo-root `pyproject.toml` when adding a module — the
`homework` marker and the `-m 'not homework'` default are registered once,
there, and already apply to every module automatically.

If a lesson writes files to disk (a "files and errors" style module), have
it create them inside `Path(__file__).parent / "sandbox"`
(`sandbox.mkdir(exist_ok=True)`) and add a module-local `.gitignore`
containing just `sandbox/`, so generated files are never committed. See
`python_course/module_06_files_errors/` (`.gitignore`,
`lesson_01_reading_writing_files.py`) for the pattern.

## Lesson file anatomy (`lesson_XX_<topic>.py`)

```python
"""
🎓 LESSON X.Y — <Title>
=======================

WHAT YOU WILL LEARN
-------------------
- <bullet>
- <bullet>

RESOURCES (open these!)
-----------------------
📖 Docs   : <official docs URL>
🎬 Video  : <YouTube URL — see Links policy below>
🖼 Visual : see INDEX.md concept map

HOW TO RUN ME
-------------
    uv run python python_course/module_XX_<name>/lesson_XX_<topic>.py
"""

# ── 1. <CONCEPT NAME> ──────────────────────────────────────────
# <comment explaining WHY, naming the concept in plain English,
#  with a teaching analogy from Gemma's world — a Business/Economics
#  teacher: marks, registers, prices, exam papers, rubrics, invoices>
<code>

# 🧪 TRY IT: <one-line experiment instruction — change something and re-run>
```

**Underline rule (exact-match, not decorative).** Every underline — the
`===` under the title, the `---` under `WHAT YOU WILL LEARN`, the
`-----------------------` under `RESOURCES (open these!)`, the
`-------------` under `HOW TO RUN ME` — must be made of the matching
character repeated to be **exactly** as long as the text directly above it.
Count with `len()` (the emoji and the em dash each count as 1 character);
don't eyeball it. Verified example from the exemplar:

```
🎓 LESSON 1.1 — Your First Program     <- len() == 33
=================================      <- 33 '=' characters, no more, no less
```

A mismatched underline length is a house-style bug, the same as a typo.

**Rules:**

- Every code group is preceded by a numbered `# ── N. NAME ──...` banner
  comment that names the concept and explains **why** it matters, not just
  what the code does.
- Every explanation of an abstract concept uses a teaching or
  Business/Economics analogy from Gemma's world (see the theming rule
  below) — never an analogy from an unrelated domain.
- Every lesson has **at least two** `# 🧪 TRY IT:` prompts (some later
  lessons have three or four; never fewer than two). Each is a one-line,
  concrete, testable instruction: "change X, re-run the file, see what
  happens" — not an open-ended "explore this more" prompt.
- Lessons run top-to-bottom with **no errors** and every `print()` call
  contributes to a story (a register, a receipt, a walk through a
  traceback) — never a bare debugging `print(x)`.
- If a lesson demonstrates an error on purpose, keep the broken line
  **commented out** (paired `# ❌ ...` / `# ✅ ...` lines) so the file
  still runs clean end-to-end — a lesson file must never raise on a normal
  run. See `python_course/module_01_hello_python/lesson_02_reading_errors.py`.
- `HOW TO RUN ME` gives the literal, copy-pasteable command with the real
  module and file names — never a placeholder path.

## Homework anatomy (`homework_XX.py`)

Header docstring — this exact shape, and note the run command carries
`-m homework` (the evolved convention; older references without it are
stale):

```python
"""
📝 HOMEWORK XX — <Title>
Complete each function where you see TODO.
Check your work:   uv run pytest python_course/module_XX_<name> -v -m homework
Stuck? Ask the homework-checker agent (see INDEX.md) — it hints, never spoils.
"""
```

### Function-based stub (the default)

```python
def function_name(param: type) -> type:
    """<one-line task description in teacher language>

    Example:
        >>> function_name(example)
        expected
    """
    # TODO: <specific instruction — name the exact method/expression/formula
    # needed, e.g. "sum(self.scores) / len(self.scores)" or "max()" — but
    # never write it as a finished, pasteable `return ...` statement>
    return ...
```

**Hint-directness note:** the exemplars are more generous than pure Socratic
questioning — a TODO or test hint routinely names the *exact* expression,
builtin, or method chain required (`"sum(self.scores) / len(self.scores)"`,
`"max()"`, `"read_text() then .splitlines()"`). That is normal and expected,
not a spoiler. What must never happen is (a) writing the finished `return`
line for the student, or (b) stating the literal expected *output value* as
if it were the justification (e.g. "the answer is 15.0" is a spoiler; "use
`sum(self.scores) / len(self.scores)`" is a hint). For fixed-string tasks
(like `homework_01.py`) the exact string is unavoidably visible in the
docstring's `Example:` block — that's fine, the task itself is "type this
text exactly."

### Class-based stub (OOP-style modules — see `module_07_oop`, `module_08_testing_tooling`)

`__init__` is **always fully written**, never a TODO — it just assigns
constructor parameters onto `self`, verbatim. Every **method** body is the
TODO:

```python
class Student:
    """One student: a name, plus every score they've been given so far."""

    def __init__(self, name: str, scores: list):
        self.name = name
        self.scores = scores

    def average(self) -> float:
        """Return this student's mean score.

        Example:
            >>> Student("Ana", [15, 18, 12]).average()
            15.0
        """
        # TODO: sum(self.scores) / len(self.scores)
        return ...
```

**Stub-safety rule (critical, non-negotiable).** Every stub method or
function body must be exactly `# TODO: <hint>` followed by a bare
`return ...` — nothing else. No attribute access, no dict/list mutation,
no arithmetic that could raise *before* the calling test's `assert` line
executes. `return ...` (Ellipsis) can never equal a real expected value, so
the test's assert always fails cleanly and shows its `💡` hint. If a stub
did anything else first — e.g. an `add_student` stub that actually tried to
write into `self.students` before being filled in, or a `class_average`
stub that summed an empty collection — a student could see a raw
`KeyError` / `AttributeError` / `ZeroDivisionError` traceback instead of a
hint, which is a house-style violation. Study
`python_course/module_07_oop/homework_07.py` and
`python_course/module_08_testing_tooling/homework_08.py` (`Gradebook`):
every method, no matter how "obviously" it should touch `self`, is just
`# TODO: <hint>` then `return ...`.

## Test anatomy (`test_homework_XX.py`, same folder as the homework file)

```python
"""✅ Homework XX checker. Run me:  uv run pytest python_course/module_XX_<name> -v -m homework"""

import homework_XX
import pytest


@pytest.mark.homework
def test_function_name():
    assert homework_XX.function_name(...) == expected, (
        "💡 Hint: <name the exact technique/expression needed, per the hint-directness note above>"
    )
```

**Rules:**

- Import the homework module **at top level**, bare (`import homework_XX`),
  not as a package import. pytest adds the test file's own directory to
  `sys.path` (there's no `__init__.py`), so this always resolves — even
  though the homework module is still a stub.
- Every test function/case carries `@pytest.mark.homework`. Nothing in a
  homework test file runs under a plain `uv run pytest`.
- **Every assert that can fail because of a student mistake carries a
  `💡 Hint:` message.** The hint points at the technique or expression to
  use (e.g. `"sum(self.scores) / len(self.scores)"`,
  `"read_text() then .splitlines()"`) — it never states the finished code
  or gives away the literal expected value as the "answer". This is *not*
  absolute, though: a plain sanity check on something the scaffolding
  already gave the student (e.g. `assert s.name == "Ana"` right after
  constructing `Student("Ana", ...)`, or a happy-path first assert of a
  pair where the *next* assert is the one that actually exercises the
  student's TODO and carries the hint) may skip the hint — because that
  assert can't meaningfully fail from a student mistake in the code they
  wrote. See `python_course/module_07_oop/test_homework_07.py::test_student_average`
  (`assert s.name == "Ana"`, no hint, then the hinted `average()` assert)
  and `python_course/module_06_files_errors/test_homework_06.py::test_safe_average`
  (unhinted `safe_average([10, 20]) == 15.0` happy path, then the hinted
  empty-list edge case). When in doubt, add the hint — omit it only when an
  exemplar shows the same pattern.
- When a test needs multiple asserts, **order the safe ones first**: put
  an assert that can never raise on a bare stub (e.g. `f.exists()`) before
  one that would raise if the stub did nothing (e.g. `f.read_text()` on a
  file that was never created). This guarantees a hinted assertion
  *failure*, never an unhandled exception. Study
  `python_course/module_06_files_errors/test_homework_06.py::test_save_marks`
  — it asserts `f.exists()` (with its own hint) strictly before it asserts
  on `f.read_text()`.
- For class-based homework, construct the object with real constructor
  arguments (never `...`), then call the stub method under test.

## Marker & run-command conventions

- The `homework` pytest marker and the default `-m 'not homework'` addopts
  are registered exactly once, in the repo-root `pyproject.toml`. Never
  edit that file when adding a module — it already covers every module.
- Plain `uv run pytest` (from the repo root) runs the **whole** suite but
  **excludes** every `@pytest.mark.homework` test. This is what keeps the
  full gate/CI green even though every shipped homework file is an
  unfinished stub.
- Check one module's homework specifically with:
  `uv run pytest python_course/module_XX_<name> -v -m homework`
- Quote both commands exactly this way — verbatim — everywhere they
  appear (`INDEX.md`, the homework file's docstring, the test file's
  docstring): students copy-paste them.

## Links policy

- 📖 **Docs** — official documentation only. `docs.python.org/3/tutorial/...`
  for Python-fundamentals modules; `docs.pytest.org`, `docs.astral.sh/uv`
  for the testing/tooling module; `https://code.claude.com/docs/...` for
  anything in `claude_course/`. Verify the exact URL resolves (WebFetch it)
  before shipping it.
- 🎬 **Video** — YouTube only. Use a specific `watch?v=` URL only if you can
  positively verify (via WebFetch, or another reliable check) that it is a
  real, canonical, well-known video on the exact topic. If you cannot
  verify a specific video, fall back to a search-results URL instead:
  `https://www.youtube.com/results?search_query=<url-encoded+query>`.
  Never guess or fabricate a `watch?v=` id, and never ship a link that
  could 404.
- 🖼 **Visual** — lesson files just say "see INDEX.md concept map"; the
  actual diagram lives in `INDEX.md` (see the `visual-docs-creator`
  skill). Prefer mermaid over any external image; only embed an external
  image if you're confident the source is stable long-term.

## Business/Economics theming rule

Every example is Business/Economics-flavoured and drawn from Gemma's world
as a teacher: students, class registers, marks/scores, exam papers, mark
schemes/rubrics, prices, invoices, receipts, gradebooks, attendance.
Analogies for abstract programming concepts borrow directly from teaching
(a red pen mark ↔ an error message; annotating a mock exam ↔ a
commented-out broken line paired with its fix; a name badge ↔ a string's
quotes; a lesson-plan sticky note ↔ a code comment). Never use generic
placeholders (`foo`, `bar`, `widget`, `Item 1`, `Person A`) — if a
throwaway noun is needed, make it a school one (a student name, a subject,
a class name).

## Verification ritual: RED → GREEN → revert

Tests are written **before** the homework is filled in, and the homework
file that ships is always the **stub**, never a solved version. Follow this
exact sequence for every module or lesson you add or change:

1. Write `test_homework_XX.py` first — the full test suite for the module,
   `@pytest.mark.homework` on every test, a `💡 Hint:` on every assert that
   can fail from a student mistake (see the hint-omission carve-out in Test
   anatomy above for the rare sanity-check exception).
2. Write `homework_XX.py` as **stubs only** (function/method bodies are
   `# TODO: <hint>` + `return ...`; any class `__init__` is fully
   implemented, never a TODO).
3. Run `uv run pytest python_course/module_XX_<name> -v -m homework` and
   capture the output — this is the **RED** capture. Confirm every test
   fails, and that every failure that's expected to carry a hint shows it,
   not a raw
   traceback (`AttributeError`, `KeyError`, `TypeError`,
   `ZeroDivisionError`, etc. must never escape before the assert runs —
   see the stub-safety rule above).
4. Temporarily fill in a real, correct implementation for every TODO.
   Re-run the same command and confirm every test now passes — this is the
   **GREEN** capture. It proves the tests are actually satisfiable and
   that your expected values and hints are correct.
5. Revert `homework_XX.py` back to stubs (TODO comments + `return ...`;
   restore any `__init__`-only class body). The committed/shipped homework
   file must never contain a working solution.
6. Run the full gate from the repo root:
   - `uv run pytest` — full suite, homework excluded, must be clean.
   - `uv run pytest python_course/module_XX_<name> -v -m homework` — must
     be **RED again** (stubs are back in place), hints visible.
   - `uv run ruff check .` — must be clean.
   - `uv run ruff format --check .` — must be clean (run
     `uv run ruff format .` first if it isn't). `.md` files are excluded
     from ruff via `extend-exclude` in `pyproject.toml` — don't hand-fight
     ruff over markdown, just follow the `INDEX.md` exemplar's formatting.

## Final checklist

Before calling a lesson/homework/module task done, confirm every item:

- [ ] `INDEX.md` updated: new lesson row in the table, checklist items for
      every new `🧪 TRY IT`, homework bullet, mermaid concept-map node
      added (see `visual-docs-creator` skill for its full anatomy).
- [ ] Mermaid concept map uses the exact house palette `classDef`s and an
      emoji on every node.
- [ ] `INDEX.md`'s "Completed N 🧪 TRY IT experiments" wording states a
      count that **equals** the actual number of `# 🧪 TRY IT:` occurrences
      in the lesson file(s) — grep to confirm, never estimate.
- [ ] Every docstring header underline (`===`, `---`,
      `-----------------------`, `-------------`) is **exactly** as long
      as the text it underlines — counted, not eyeballed.
- [ ] Every 📖 Docs and 🎬 Video link verified per the Links policy above
      (no unverified `watch?v=` URLs, no unverifiable docs URLs).
- [ ] Every example is Business/Economics themed; no generic placeholders.
- [ ] `homework_XX.py` shipped as **stubs** — you reverted after the GREEN
      capture, it is not the solved version.
- [ ] Homework stub bodies are `return ...` only — no code that could
      raise before an assert executes.
- [ ] `test_homework_XX.py`: every test carries `@pytest.mark.homework`,
      every assert that can fail from a student mistake carries a
      `💡 Hint:` (sanity checks on given scaffolding may omit it, per the
      exemplars), hints never leak the literal answer, and asserts that
      could raise on a broken stub are ordered
      after asserts that can't.
- [ ] RED captured (stub run shows hinted failures, no tracebacks), GREEN
      captured (solved run shows all-pass), then reverted back to stubs.
- [ ] `uv run pytest` clean (homework excluded).
- [ ] `uv run pytest python_course/module_XX_<name> -v -m homework` shows
      the RED state with hints — the final, shipped state.
- [ ] `uv run ruff check .` clean.
- [ ] `uv run ruff format --check .` clean.
- [ ] Repo-root `pyproject.toml` left untouched.
