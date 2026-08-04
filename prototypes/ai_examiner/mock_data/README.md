# Mock data

`student1_2026_03_01_BUSINESS.png` is a 1×1 placeholder pixel, not a real
scan — it exists only so `ExamSubmission.from_filename()` and the tests
have a real file on disk to point at, in the anonymised
`student1_YYYY_MM_DD_SUBJECT.png` naming pattern this prototype expects.
It stands in until **B1** in
[`QUESTIONS_FOR_GEMMA.md`](../../../QUESTIONS_FOR_GEMMA.md) is answered
and 2–3 real anonymised sample scans arrive. Real scans — anonymised or
not — never belong here: they go only in this prototype's `real_data/`
folder, which is already excluded from git (see the workspace
`.gitignore`) and is never read into an AI context window.
