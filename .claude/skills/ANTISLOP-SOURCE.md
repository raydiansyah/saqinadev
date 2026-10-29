# antislop skills (vendored)

Copied unchanged from https://github.com/miqdadbadjuber/anti-slop at commit
`3005235d030b4793146ad9afe8d01045efd90e1d` (release 3.2.24, see `antislop/VERSION`), folder `skills/`.
MIT licence: see `ANTISLOP-LICENSE`. `antislop-human` and `antislop-ui` also carry the licence of the
web-quality references they include.

These folders are the project's default antislop install for AI tools working on this repository
(Claude Code reads `.claude/skills/`). The pointer block at the end of `AGENTS.md` tells every tool
where they are and sets the mode to DURING.

To update: copy the new release's `skills/antislop*` folders over these in whole, update the commit
and release above, and copy the same text into `src/lib/skills/builtin/antislop/` (the product's
built-in copy). Never edit the skill text here.
