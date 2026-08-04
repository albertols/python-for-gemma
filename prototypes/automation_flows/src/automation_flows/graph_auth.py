"""Microsoft Graph sign-in — the device-code flow, in plain words.

Gemma's school runs on Microsoft 365 (Teams, OneDrive, SharePoint), so
any automation that reads a file from Teams needs to sign in as her.
This module builds the *configuration* for that sign-in. It does not
sign anyone in — see "What's next" below for that.

**How device-code sign-in works** (the same kind of sign-in a smart TV
app uses): the automation asks Microsoft for a short code, shows it to
Gemma, and she types that code into ``https://microsoft.com/devicelogin``
in her own browser — the normal way she already signs into Microsoft
365. Microsoft checks her password (never seen by this code, never seen
by Claude) and hands back a token: a temporary "yes, this is Gemma"
pass. This module never asks for, sees, or stores a password. There is
no ``client_secret`` anywhere in this file — device-code flow is built
specifically so a script like this one doesn't need one.

**Where the token goes.** Once acquired (see "What's next"), the token
is cached at ``TOKEN_CACHE_PATH`` — a file on Gemma's own Mac, nowhere
else. It is never committed (``**/*token_cache*`` is in the workspace
``.gitignore``), never opened by Claude (blocked by
``.claude/settings.json`` deny rules), and never pasted into a chat.
Full picture, with a diagram: `docs/security.md
<../../../docs/security.md>`_.

**What's next** (out of scope for this scaffold — no network calls
here): the real sign-in step will use ``msal.PublicClientApplication``
built from :func:`build_auth_config`'s ``client_id`` and ``authority``,
call ``acquire_token_by_device_flow()`` to do the interactive step
above, and wrap the app's token cache in an ``msal.SerializableTokenCache``
that gets read from and written to ``TOKEN_CACHE_PATH`` (serialize on
every acquire, so a re-run doesn't ask Gemma to sign in again until the
token actually expires).
"""

import os
from pathlib import Path

GRAPH_AUTHORITY = "https://login.microsoftonline.com/organizations"
GRAPH_SCOPES = ["Files.Read", "Sites.Read.All"]
TOKEN_CACHE_PATH = Path("~/.cache/automation_flows/token_cache.json").expanduser()


def build_auth_config() -> dict:
    """Build the (secret-free) config an MSAL device-code sign-in needs.

    Reads ``GRAPH_CLIENT_ID`` from the environment (set it in a local
    ``.env`` file, never committed) so the client ID itself — a public,
    non-secret identifier for the app registration — isn't hardcoded
    either. There is deliberately no ``client_secret`` key: device-code
    flow authenticates Gemma, not the app, so no secret is needed.
    """
    return {
        "client_id": os.environ.get("GRAPH_CLIENT_ID", "SET-ME-IN-.env"),
        "authority": GRAPH_AUTHORITY,
        "scopes": GRAPH_SCOPES,
        "token_cache_path": TOKEN_CACHE_PATH,
    }
