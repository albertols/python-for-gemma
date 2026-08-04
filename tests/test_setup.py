"""Smoke test: proves the toolchain works. Gemma's very first green tick. ✅"""

import sys


def test_python_is_modern_enough():
    assert sys.version_info >= (3, 12), "💡 Hint: run 'uv sync' — uv installs the right Python."
