from automation_flows.flows.teams_file_download import plan_download
from automation_flows.graph_auth import build_auth_config


def test_auth_config_never_contains_secrets():
    cfg = build_auth_config()
    assert cfg["authority"].startswith("https://login.microsoftonline.com/")
    assert "client_secret" not in cfg, "device-code flow needs NO secret — that's the point"


def test_plan_download_builds_graph_url():
    plan = plan_download("Hastings Secondary Staff", "Tab 2025-26-Secondary Calendar ALL STAFF.xlsx")
    assert "Hastings%20Secondary%20Staff" in plan["graph_url"]
    assert plan["local_path"].endswith("Tab 2025-26-Secondary Calendar ALL STAFF.xlsx")
