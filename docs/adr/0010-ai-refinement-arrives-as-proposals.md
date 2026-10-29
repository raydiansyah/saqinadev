# 10. AI refinement of the PRD, plan and name

Status: accepted (2026-10-29). Risk lane: Red (a model writes project documents).

## Context

The interview generates the PRD and plan from rules and templates. People asked for a model to make
them more specific, following the Superpowers skills, for a "Generate PRD" form with an Enhance button,
and for the project name to come from the plan instead of being typed. PRD A3 says a model never
writes on its own.

## Decision

- **Templates stay the fallback.** With no model set up, everything works from rules as before.
- **After the interview** a model refines the PRD (with `brainstorming`) and the plan document (with
  `writing-plans`), after the response is sent. The result is one proposal from the planner agent;
  nothing changes until a person approves it. Only an untouched first draft is refined.
- **Generate PRD** is a form with one field per section, filled from the current PRD or the
  interview. Enhance improves one section at a time (a model, or a rules-only tidy-up); Save is the
  person's own edit. A saved new version clears signatures and goes back to draft for approval.
- **The name.** `projects.name_source` records where the name came from. An `auto` name follows the
  plan (from the preview plan at creation, then a model-suggested title after the interview); a
  person's rename (`user`) or a repository name is never replaced. The slug never changes.

## Consequences

- A model's output is checked before use (a whole document with its sections; a short plain title).
- A refined plan document does not change milestones or tasks; the assistant's plan intent does that,
  through its own proposals.
