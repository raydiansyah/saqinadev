---
title: Plan and Build with agents
description: Ask Saqina to plan or build from the Studio chat, follow the agents as they work, stop or retry, read the real code changes, and (for platform owners) set up who the agents are and what they may do.
order: 6
updated: 2026-10-30
---

In the Studio you can ask Saqina to plan a piece of work or to build it. A team of agents does the work, each with a job of its own, and every screen shows what they are really doing. This guide covers using Plan and Build, reading the results, and, for platform owners, managing the agents.

## Chat, Plan or Build

Under the message box there is a switch with three choices. What you type is handled the way the choice says.

| Choice | What happens |
|---|---|
| **Chat** | Saqina answers and talks it over. Nothing is changed. |
| **Plan** | Saqina plans the tasks and who does them. Nothing is built until you press **Build this plan**. |
| **Build** | The agents start working at once, on a work branch. You do not press anything on an agent. |

![The message box with the Chat, Plan and Build switch](/api/docs/assets/owner/agents-03-composer-modes.png)

Your instruction appears in the chat with a card that shows the state of the work. The choice is remembered in this browser for this project. People with view access can only chat.

## Follow a build

When a build starts, the work area turns to **Agents** and gets wider. Nothing needs a reload: the screen follows the server.

- Each agent shows what it is doing: **Running**, **Waiting for agent** (it needs another agent's result first), **Reviewing**, **Blocked**, **Succeeded**, **Failed** or **Idle**. The state comes from the agent's tasks, not from a timer.
- The line at the top shows the state of the whole execution, the time it has taken and how many tasks are done out of all tasks. It counts only tasks that really finished.
- **Handoffs and messages** lists what the agents told each other, for example a request to review. **Activity** lists what happened, in order.

![The Agents tab while a build runs: the Backend Developer is running and the Frontend Developer is waiting for it](/api/docs/assets/owner/agents-04-running.png)

If the connection drops, a notice says so and Saqina keeps checking every few seconds. If you leave and come back, or reload, the same state is there: it is kept on the server.

## The plan

The **Plan** tab shows the goal, the risks the planner saw, and the tasks in steps. A task in step 2 waits for the tasks it depends on in step 1; two tasks that write the same files never run at the same time. Each task shows who owns it, its state, what it waits for and its acceptance criteria. When a task stopped, it says why in plain words.

![The Plan tab: the goal and the tasks in steps, each with its owner and state](/api/docs/assets/owner/agents-05-plan.png)

A plan made with **Plan** waits for you.

![A plan that is ready and waiting: Build this plan and Change the plan](/api/docs/assets/owner/agents-07-plan-mode.png)

- **Build this plan** starts the agents on the tasks as planned.
- **Change the plan** takes new words and plans again. The old tasks are set aside; they are not erased. A plan that is already being built cannot be changed this way: stop it and start again.

## Stop and try again

- **Stop** ends an execution. Work nobody is doing stops at once. A task an agent is running finishes its current step first, so the state says **Cancelling** until it has stopped. Saqina never says it stopped before it did.
- A task that **failed** or is **blocked** has **Try again**. Tasks that were waiting behind it are released and checked again. Work that already succeeded is not done twice.
- Saqina also retries by itself, a few times and with a pause, when a failure may pass (a busy service, a short outage). It does not retry a failure that cannot get better.
- A failed review does not end the work: the author gets the findings and a revision task, and the review runs again. This repeats only a few times, then the execution fails and says so.

## The code the agents changed

Agents write code to a **work branch** of your repository, named `saqina/exec-` and a short code. They never touch your main branch, open a pull request or deploy. Merging and publishing stay yours.

- **Code** lists the files the work branch changed against your main branch, with the lines added and removed, and the diff of each file. It comes from the repository itself. Until the first commit it says there is no code change yet.
- **Git** shows the branch, the commits and the CI results for the branch. For a repository on this machine it says nothing is pushed anywhere.
- **Preview** shows the preview of the work branch when your repository is connected to Vercel and a build of that branch exists. With none, it says so and what to check. It keeps one frame and swaps the address when a newer build is ready.
- **Publish** shows five separate facts: code written, build passed, preview ready, ready to deploy, published. A stage nobody reported on says **not known**; Saqina does not guess. Publishing itself is still your step.

![The Code tab: the files the agents changed and the diff of one of them](/api/docs/assets/owner/agents-06-code-diff.png)

## What the agents may not do

- They write only the files their task lists, never secrets files, never a file with a secret in it, and never outside the work branch.
- They cannot merge, open a pull request, change another branch or deploy. A request like that becomes a proposal for you in **Approvals**, or is refused.
- Text found in your files, in the earlier work of another agent or in a message is read as information. It cannot give an agent a new permission or new orders.
- Each agent can use only the tools its definition lists.

## When it stops

| What you see | What it means | What to do |
|---|---|---|
| No AI model is set up | Nothing could be planned or written | Ask a platform owner to add a model under AI & Models |
| No repository is connected | Agents have nowhere to write code | Connect one in the Git tab |
| No agent is on for a role | The plan names a role no agent covers, or an agent was switched off | A platform owner switches the agent on; run it again |
| The plan was refused | The plan had a cycle, too many tasks or an unknown role | Plan again, with a clearer request |
| A change was refused before it was written | The agent tried a file outside its task or with a secret in it | Try again, or change the task |
| The repository refused the operation | The host said no (access, a busy branch) | Check the repository connection, then try again |
| The time limit ran out | The agent or the whole execution took too long | Try again, or split the work |

## For platform owners: the agent registry

Under **AI & Models**, **Agents** lists every kind of agent Saqina has. Only platform owners see this page. Projects follow these definitions; they cannot change them.

![The agent registry: nine agents, each with its role, version and state](/api/docs/assets/owner/agents-01-registry.png)

Nine agents are there to start with: Planner, Architect, Backend Developer, Frontend Developer, Database Engineer, QA Engineer, Code Reviewer, DevOps Engineer and Docs Writer. They are only a starting point: edit, switch off, archive, or add your own with **New agent**.

A definition says who the agent is and what it may do:

- **Instructions**, **responsibilities**, **allowed scope**, **forbidden work**, **input it needs**, **output it gives** and **definition of done**.
- **Model**: a model of its own, or the role's model from **Agent mapping**.
- **Tools** and **permissions**: only what is ticked can be used. Merging, deploying and deleting a project cannot be ticked.
- **May hand work to**: the agents it may pass work to.
- **Attempts per task**, **time limit** and **priority**.

![An agent's definition: instructions and the fields that limit it](/api/docs/assets/owner/agents-02-edit.png)

Good to know:

- Every save is a new **version** with a full copy, and the page lists who changed what and when. The audit trail records which fields changed, never the instruction text.
- A change applies to **new** executions. An execution that is already running keeps the definitions it started with.
- **Switch off** stops the agent from getting new tasks anywhere. **Archive** also removes it from every project's team. Restore brings it back.
- Each card shows how often the agent has run, finished and failed, across all projects. These are counts only: the messages and files of a client's project stay in that project.

## For people who run Saqina

Agents run on a background queue. It is worked after each request, and a scheduled call to `/api/cron/executions` catches the rest. The schedule, and what to do when an execution looks stuck, are in `docs/runbook.md` in the repository.
