<!-- workmap -->
## Work map (workmap) - mandatory reporting

Every piece of work goes on the work map (`docs/workmap.html`, source `docs/shared/workmap.md`, CLI `python3 scripts/workmap.py` from the project root; prefer the CLI over editing the markdown by hand):

- Every node has a stable unique id assigned by `add` (Epics `1 2 3`, Features `P1 P2`, Tasks `T1 T2`, Subtasks `B1 B2`); ids are never edited, renumbered or reused. Refer to nodes by id (`set T12 done`) in commands, briefs and reports.
- Before starting: `find "<text>"` or `show -d 2` to locate the node, then `set <id> doing -o <agent name>`; if it is new, `add "<Epic>/<Feature>" "<Work item>" -s doing -o <agent name>` (prints the new id). The owner (`-o`) is whoever does the work, agent or person; it shows on the map.
- When done: `set <id> done -n "<one-line result>"`. Waiting on something: `pause`. Dropped: `cancel`. Never delete nodes.
- Node names: 2-4 words, 12-26 characters, noun phrases, no status or ids in the name; siblings of similar length; details go in `-n`.
- Delegating: every subagent brief gets the WORKMAP REPORTING block (workmap skill, `references/reporting.md`) and must report its node id, status and result back; record it before using the output.
- End of every turn with work: print a "Workmap report" (`<id> <name> → status` for each changed node, `show -s doing` summary, `docs/workmap.html`).
- A task is not done until the map says done.
<!-- /workmap -->
