"""Individual automation flows.

Each module here plans one specific automation against Gemma's school
systems. "Plans" is deliberate: every flow starts as a pure function
that builds the Microsoft Graph request it *would* make, with no
network call and no auth required to test it. That planning step is
what makes a flow's shape testable and reviewable before it ever
touches a real token — see `docs/security.md
<../../../../docs/security.md>`_ for why that boundary matters here.
"""
