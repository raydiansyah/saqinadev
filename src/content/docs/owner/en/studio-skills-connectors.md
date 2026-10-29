---
title: Studio, skills and connectors
description: Start building from an approved PRD, work in the Studio, generate a PRD with Enhance, and set up skills, connectors and agent models.
order: 5
updated: 2026-10-29
---

This guide covers the path from an agreed PRD to work in progress, and the platform settings that the assistant and agents use in every project.

## Generate a PRD

On **PRD**, press **Generate PRD**. The form has one field per section, filled from the current PRD or, when there is none yet, from the project interview.

- **Enhance** makes one section more specific. With an AI model set up, the model rewrites it following the Superpowers *brainstorming* skill; without one, Saqina tidies the text by rules and adds nothing new.
- **Enhance all sections** goes through them one by one.
- **Save as PRD** writes a new version. Signatures are cleared and the PRD goes back to draft, so it is approved again before agents work from it.

After the interview, when a model is set up, Saqina also refines the generated PRD and plan with the Superpowers skills and names the project from its plan. The refined documents wait in **Approvals**; nothing changes until you approve. A name you typed yourself is never replaced.

![The Generate PRD form with one field per section and an Enhance button under each](/api/docs/assets/owner/studio-01-generate-prd.png)

## Start building

Once the PRD or the plan is **approved**, or an agreement is signed by both parties, the document shows **Start building**.

- When the project is built in Saqina, every open task goes to the team agent whose role fits it, and the agents start. Each result is a proposal in **Approvals**.
- When the project is built elsewhere, the button only opens the Studio.

Pressing it again does not give a task to two agents.

## The Studio

The Studio puts the chat beside a work area.

- **Plan** shows milestones and tasks. When you ask for a plan in the chat, the work area turns to it.
- **Agents** shows the agents at work and links to each run.
- **Code**, **Preview**, **Git** and **Publish** are coming next.

When the assistant is not sure what a change-making request meant, it asks in the chat first and does nothing until you answer **Yes, go ahead**.

![The Studio: the chat on the left, the work area with Plan, Agents and the coming tabs on the right](/api/docs/assets/owner/studio-02-studio.png)

## Skills and connectors (platform owner)

Under **AI & Models**:

- **Skills**: working methods in SKILL.md format used in every project. Superpowers is built in. Install more by pasting a SKILL.md or linking to one on GitHub, and choose where each is used. Saqina only reads a skill's text; it never runs anything from it.
- **Connectors**: MCP servers connected once for every project. Firecrawl, Exa and Context7 are one click plus an API key; any other server can be added as a custom MCP. Tools that say they change nothing start switched on; the rest wait for you. Keys are stored encrypted and never shown again.

![Skills under AI & Models, with Superpowers built in](/api/docs/assets/owner/studio-03-skills.png)

![Connectors under AI & Models: Firecrawl, Exa, Context7 and a custom MCP server](/api/docs/assets/owner/studio-04-connectors.png)

## Agent model

On **Agents**, **Configure** lets you pick the model from the ones set up under AI & Models, or **Automatic**, which follows the project and platform defaults. There is no field to type a model name.
