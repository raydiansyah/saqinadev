# 8. Delivery answers are independent

Status: accepted (2026-10-29). Risk lane: Yellow (it changes how the progress page records answers).

## Context

The progress page asks three questions: is the system built, reviewed, deployed? Until now an answer
settled the others: "reviewed: yes" also set "built: yes", and "built: not yet" reset review and
deploy. People read that as a bug: toggling one question changed another they had not touched.

## Decision

- Each answer changes only its own question. Nothing is inferred from another answer.
- Answers that disagree (reviewed but not built, deployed before built and reviewed) are flagged with
  a note on the page, and the project's next step becomes "confirm the delivery answers" until a
  person settles them. Advice, never a rule: the answer is stored as given.
- "Answer and adjust tasks" moves tasks for the one answer given, forward only: built moves open tasks
  to review, reviewed moves every task to done. "Not yet" and the deploy answer move nothing.

## Consequences

- A project can briefly hold contradictory answers; the warning and the next step make that visible.
- The stage pipeline mirrors the answers as given.
- `settleAnswers` is gone; `answersContradict` and the notes in `delivery/consistency.ts` replace it.
