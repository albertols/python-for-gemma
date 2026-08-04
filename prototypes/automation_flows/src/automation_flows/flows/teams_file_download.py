"""Plan: fetch the staff calendar `.xlsx` from a Teams channel.

This is the first real automation flow on the roadmap, because its
output — the staff calendar workbook — is exactly what
``ai_teacher_planner`` needs to read (see that prototype's
``calendar_reader.read_calendar``). Today it only *plans* the request;
teaching it to actually fetch a file is the next step, once Gemma
answers D4/D5 in ``QUESTIONS_FOR_GEMMA.md`` (whether school IT allows
device-code sign-in, and which Teams channel holds the file).
"""

from pathlib import Path
from urllib.parse import quote

GRAPH_API_ROOT = "https://graph.microsoft.com/v1.0"
DOWNLOAD_DIR = Path("~/Downloads").expanduser()


def plan_download(channel: str, filename: str) -> dict:
    """Build the Graph request and local destination for a channel file.

    Pure and network-free on purpose: it exists so the *shape* of the
    download — which URL, which local path — is testable without a
    signed-in session. The URL is illustrative, not final: Graph
    actually addresses files by site ID and drive ID, not by a
    human-readable channel name, so ``{channel}`` here is a stand-in
    until the real site/drive is discovered (that discovery, plus the
    authenticated GET itself using :func:`automation_flows.graph_auth.build_auth_config`,
    is the flow's documented next step — still no network call in this
    scaffold).
    """
    quoted_channel = quote(channel)
    quoted_filename = quote(filename)
    graph_url = f"{GRAPH_API_ROOT}/sites/{quoted_channel}/drive/root:/{quoted_filename}"
    local_path = str(DOWNLOAD_DIR / filename)
    return {
        "graph_url": graph_url,
        "local_path": local_path,
    }
