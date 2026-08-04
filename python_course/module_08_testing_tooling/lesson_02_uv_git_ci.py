"""
🎓 LESSON 8.2 — uv, git, and CI
==============================

WHAT YOU WILL LEARN
-------------------
- What `uv sync` actually does, and why it makes "works on my machine" obsolete
- The git story: add (stage), commit (snapshot), push (share), pull (receive)
- What the green tick on GitHub actually checks, every single time you push
- How TDD (8.1) + git + CI form one safety net, from now on, forever

RESOURCES (open these!)
-----------------------
📖 Docs   : https://docs.astral.sh/uv/
🎬 Video  : https://www.youtube.com/watch?v=mAFoROnOfHs
🖼 Visual : see INDEX.md concept map (gitGraph of add → commit → push → CI → pull)

HOW TO RUN ME
-------------
    uv run python python_course/module_08_testing_tooling/lesson_02_uv_git_ci.py

Note: this lesson does NOT shell out to git or uv — it explains what
those commands do with prints and comments, the same way Lesson 8.1
explained pytest without importing it. The 🧪 TRY IT steps below ask
YOU to type the real commands in your own terminal.
"""

# ── 1. THE PROBLEM — "IT WORKS ON MY MACHINE" ─────────────────────
# Imagine emailing a worksheet to a colleague, but it only opens
# correctly because of a font YOU happen to have installed — it looks
# broken on theirs. Code has the same trap: different Python versions,
# different installed packages, and it silently "works" for you but
# breaks for Gemma, or for a marker, or six months from now for you.
print("The trap: code that only runs correctly on the machine that wrote it.")

# ── 2. uv sync — EVERYONE GETS THE EXACT SAME SETUP ────────────────
# pyproject.toml lists WHAT packages this project needs; uv.lock
# records the EXACT version of every one of them, down to the last
# digit. `uv sync` reads both and builds a private .venv/ folder with
# precisely those versions installed — like photocopying the exact
# same exam paper for every student, instead of each one copying it
# out by hand and introducing typos. Run it once after cloning, and
# again any time pyproject.toml changes.
print("uv sync  ->  reads pyproject.toml + uv.lock, builds .venv/ with the EXACT same packages every time.")
print("uv run pytest  ->  runs a command INSIDE that .venv, guaranteed to match everyone else's.")

# 🧪 TRY IT: in your terminal (not this file), run `uv sync --all-packages`
# and read the output — it should say "Audited" or list packages, proving
# your .venv already matches this project's lock file.

# ── 3. git — A DIARY OF SNAPSHOTS, NOT JUST A BACKUP ───────────────
# git tracks your project as a sequence of SNAPSHOTS over time, each
# one a deliberate, labelled save point — like dating and filing every
# draft of a lesson plan, so you can always see exactly what changed
# and when, and rewind if a "improvement" turns out to be a mistake.
# Four commands cover the whole everyday story:
git_story = {
    "add": "stage a file — 'mark this ready to be included in the next snapshot'",
    "commit": "save a labelled snapshot of everything staged, with a message explaining WHY",
    "push": "send your new snapshots up to GitHub, so others (and CI) can see them",
    "pull": "fetch snapshots others made, and bring your own copy up to date",
}
for command, meaning in git_story.items():
    print("git", command, "->", meaning)

# 🧪 TRY IT: in your terminal, run `git status` inside this repo and
# read the output — it tells you which files are staged, changed, or
# untracked, in plain English.

# ── 4. CI — A ROBOT THAT RE-CHECKS YOUR WORK ON A CLEAN MACHINE ───
# Every push and pull request runs `.github/workflows/ci.yml` on a
# brand-new GitHub-hosted computer that has NONE of your local setup —
# exactly like a moderator re-marking a sample of scripts completely
# fresh, with no knowledge of how the first marker scored them, to
# prove the mark scheme was applied fairly and consistently.
ci_steps = [
    "uv sync --all-packages   # rebuild the EXACT environment, from scratch",
    "uv run ruff check .      # is the code STYLE clean — no unused imports, etc.?",
    "uv run ruff format --check .   # is the code LAYOUT exactly as ruff would format it?",
    "uv run pytest -v         # do ALL the non-homework tests still pass?",
]
print("CI runs, on a clean machine, every push and pull request:")
for step in ci_steps:
    print("  ", step)

# ✅ = every step above succeeded — the GREEN TICK next to your commit
#      on GitHub. It means: "this really works, not just on my machine."
# ❌ = at least one step failed — a RED CROSS. Click it on GitHub to
#      read exactly which step failed and why, then fix and push again.
print("Green tick ✅  = uv sync + ruff check + ruff format --check + pytest ALL passed on a clean machine.")
print("Red cross  ❌  = one of those steps failed — click it to see exactly which one.")

# 🧪 TRY IT: open .github/workflows/ci.yml in your editor and match
# each line to one of the four ci_steps printed above.

# ── 5. THE FULL SAFETY NET — TDD + git + CI, FROM NOW ON ───────────
# Lesson 8.1's red-green-refactor happens on YOUR machine, in seconds.
# git records each honest snapshot. CI then PROVES those green tests
# stay green on a completely clean machine too — the same three-layer
# safety net that gave you tests/test_setup.py's very first green tick
# back in Task 1, now explained end to end.
print("TDD (local) + git (history) + CI (clean-machine proof)")
print("= the safety net behind every green tick you'll ever see.")

print("✅ Lesson 8.2 complete — you know what uv sync, git add/commit/push/pull, and CI's green tick really mean!")
