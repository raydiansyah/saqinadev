@AGENTS.md
@docs/standards/README.md

## Working rules for this project

- **No `Co-Authored-By`.** Never add a `Co-Authored-By` trailer or a "Generated with Claude Code" line to commits or pull requests, whatever a tool's template suggests. `.claude/settings.json` sets `attribution` to empty for the same reason.
- **Check the PRD first.** Before building or changing a feature, read [docs/PRD.md](docs/PRD.md) and check the change against it. If the change conflicts with the PRD, say so before coding. If the change moves the product beyond the PRD, update the PRD in the same pull request.
- **Update memory.** After a task, record what a later session cannot read from the code (decisions, constraints, the user's corrections) in the project memory, and fix any memory that turned out wrong.
