# ⚙️ Automation Flows

This is one of your four end-of-course prototypes — see
[`docs/adr/001-prototype-build-order.md`](../../docs/adr/001-prototype-build-order.md)
for why it's built first, in parallel with the AI Teacher Planner. It's also the repo's **showcase for the
security model**: every flow here talks to Microsoft Graph (Teams,
OneDrive, SharePoint) using the device-code sign-in pattern, with
**no client secret ever stored in this repo** — see
[`docs/security.md`](../../docs/security.md) for the full picture,
diagram included.

## 🎯 What this will do for you

Once flows are fully built out, this prototype turns the weekly things
you currently do by hand in Teams, SIMS, Cognita Connect, and
SchoolCloud into small, reviewable Python scripts — each one signing
in as *you*, through *your* browser, never through a stored password.

## ✅ What exists today

- **`src/automation_flows/graph_auth.py`** — `build_auth_config()`,
  which builds the (secret-free) settings an MSAL device-code sign-in
  needs: authority, scopes, and where the token cache lives on your
  Mac. Read its docstring — it's a short, plain-language lesson on how
  device-code sign-in works and why it's the pattern for this whole
  prototype.
- **`src/automation_flows/flows/teams_file_download.py`** —
  `plan_download(channel, filename)`, a pure function that builds the
  Graph request *shape* for fetching a file from a Teams channel, with
  no network call and no sign-in required to test it.
- **`tests/test_flows.py`** — two passing tests: one proving the auth
  config never grows a `client_secret` key, one proving a download plan
  URL-encodes the channel name and points at the right local filename.

Try it yourself:

```bash
uv run pytest prototypes/automation_flows -v
```

## 🗺️ Flows roadmap

Row 1 is deliberately first: the staff calendar is what
`ai_teacher_planner` needs to read, so fetching it unblocks that
prototype's real build-out too.

| Flow | School system | Status | Unblocked by |
|---|---|---|---|
| Staff calendar fetch | Teams (feeds `ai_teacher_planner`) | Planning only (`plan_download`); no sign-in or download yet | **D5** — which Teams channel holds the file? (**D4** — is device-code sign-in allowed at all?) |
| SIMS task automation | SIMS (runs in a VM) | Not started — likely stays manual, or at most screen-level automation, since SIMS has no Graph API | **D2** — what do you actually do inside the SIMS VM each week? |
| Cognita Connect task automation | Cognita Connect | Not started | **D3** — web app or desktop app? (shapes whether this is even automatable) |
| SchoolCloud task automation | SchoolCloud | Not started | Pending D1 (which weekly tasks are worth automating) and how SchoolCloud is normally used |

Every row above also needs **D1** — your top 3 repetitive weekly
tasks — to know which of these is worth building next. See
[`QUESTIONS_FOR_GEMMA.md`](../../QUESTIONS_FOR_GEMMA.md), section D.

## 🔒 Security

This prototype exists to prove a pattern, not just fetch a file: **no
client secret, ever, in this repo.** Every flow signs in using the
Microsoft device-code flow — you type a short code into your own
browser, Microsoft hands back a token, and that token is cached only
at `~/.cache/automation_flows/token_cache.json` on your own Mac. It's
never typed, pasted, or shown to Claude or any other AI model.

- Full explanation and diagram: [`docs/security.md`](../../docs/security.md)
- Why plain Python + Graph instead of a visual tool like n8n:
  [`docs/adr/003-python-msgraph-automation-stack.md`](../../docs/adr/003-python-msgraph-automation-stack.md)

## 🚧 What's next

1. Answer **D4/D5** (or confirm device-code sign-in is allowed and name
   the Teams channel) so `graph_auth.py` can grow its actual
   `msal.PublicClientApplication` + `acquire_token_by_device_flow()`
   call, with an `msal.SerializableTokenCache` persisted to
   `token_cache_path`.
2. Once signed in, replace `plan_download`'s illustrative
   `{channel}`-in-URL shape with the real site ID and drive ID Graph
   actually needs (discovered via the `/sites` and `/drives`
   endpoints).
3. Wire the download itself: an authenticated `GET` against
   `plan_download()`'s `graph_url`, streamed to `local_path`.
4. Repeat the plan-first pattern for SIMS, Cognita Connect, and
   SchoolCloud once D1–D3 are answered.
