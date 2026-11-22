---
trigger: always_on
description: Consult the graphify knowledge graph at graphify-out/ for codebase and architecture questions.
---

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- For codebase or architecture questions, when `graphify-out/graph.json` exists, first run `.tools\graphify\graphify.cmd query "<question>"` (CLI) or `query_graph` (MCP). Use `.tools\graphify\graphify.cmd path "<A>" "<B>"` / `shortest_path` for relationships and `.tools\graphify\graphify.cmd explain "<concept>"` / `get_node` for focused concepts. When the answer is under a Markdown heading, `.tools\graphify\graphify.cmd section "<heading>"` / `get_section` returns that section's text, so the .md need not be opened. These return a scoped subgraph, usually much smaller than `GRAPH_REPORT.md` or raw grep output.
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context
- After modifying code files in this session, run `.tools\graphify\graphify.cmd update .` to keep the graph current (AST-only, no API cost)
