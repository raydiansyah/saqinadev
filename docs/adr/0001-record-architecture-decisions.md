# 0001. Record architecture decisions

- Status: accepted
- Date: 2026-10-16

## Context

Decisions were made in conversations and plan files, and are easy to lose. A new contributor, human
or AI, cannot tell why the system is the way it is.

## Decision

Significant decisions are written as short ADRs in `docs/adr/`, numbered, in this format: context,
decision, consequences, status. A decision is significant when it is hard to reverse, affects several
areas, or a reasonable person would ask "why not the other way?". Superseded ADRs stay, marked as such.

## Consequences

- The reasoning survives people and tools changing.
- Each ADR costs a few minutes; trivial choices do not get one.
- Examples to write next: PostgreSQL rate limiting, two-way document sync, Row Level Security in
  stages, the project change outbox and memory journal.
