---
title: Semantic search in Memory
description: Turn on search by meaning for a project, see what is sent and to whom, read the states, and turn it off.
order: 7
updated: 2026-11-05
---

Semantic search finds a memory or a wiki passage by what it means, not only by the words in it. Ask "who pays for hosting" and it can find the memory "the client covers the Vercel bill", which shares no word with the question. Without it, Memory searches by words and exact matches (names, ids, file paths).

It is **off** for every project until a project admin turns it on. The platform owner decides which embedding model is used.

## What is sent, and to whom

- **Sent:** the text of approved memories and wiki passages that the whole project can read. Each text is cut at 6000 characters. When someone asks a question, the question is sent too.
- **To whom:** the embedding provider that the platform owner chose in AI & Models. The provider returns a list of numbers (a vector) for each text. Saqina stores those numbers next to the memory and uses them to compare meanings.
- **Not included:** private items, items limited to named people or agents, items still waiting for review, and expired items are not embedded. If an item is made private while an indexing run is in progress, it can, in a narrow window, still be sent in that run; it is then not stored.
- **Not stored in logs:** the text of memories and questions. Usage records keep the model, the token count and the time.

## Step 1: the platform owner picks the embedding model

Only the platform owner sees this page.

1. Open **AI & Models**.
2. In the **Embedding model** section, choose a model from the list. The list shows only models that can create embeddings, from an OpenAI-compatible endpoint or Gemini. Anthropic has no embedding model.
3. Press **Save embedding model**.

![The Embedding model section in AI & Models with one embedding model chosen and the Save embedding model button](/api/docs/assets/owner/semantic-01-embedding-model.png)

If the list is empty, add a provider that offers an embedding model first. Choose **None** and save to stop semantic search for the whole platform; the stored vectors of every project are then deleted.

Changing the model makes every project that uses semantic search embed its text again. Until that finishes, search leans on words and exact matches.

## Step 2: a project admin turns it on

1. Open the project, then **Memory**. You land on **Overview**.
2. Find **Semantic search** and press **Turn on semantic search**.
![The Memory overview with the Semantic search line showing Off](/api/docs/assets/owner/semantic-02-overview-off.png)

3. Read the consent text: "Send project text to an embedding provider?" It names the provider your text goes to and repeats what is on this page. If the platform owner later switches to another provider, your text goes to that one without a new consent request. Press **Turn on**.

![The consent dialog asking to send project text to an embedding provider, with Cancel and Turn on](/api/docs/assets/owner/semantic-03-consent.png)

Saqina records who turned it on, when, and which version of the consent text they saw. Indexing starts in the background.

## What the states mean

The **Semantic search** line on the Overview shows **On**, **On, indexing: x of y**, or **Off**. Off has two variants: plain Off, and Off because the platform owner has not chosen an embedding model.

| You see | Meaning |
|---|---|
| **On. Memory and wiki are also searched by meaning.** | Every eligible item has a vector. |
| **On, indexing: x of y items are ready.** | Saqina is still creating vectors. Until it finishes, the items not yet ready are found only by words and exact matches. |
| **Off. Memory is searched by words and exact matches.** | The switch is off. |
| **Off. The platform owner has not chosen an embedding model yet.** | The switch may be on, but there is no model, so nothing is searched by meaning. |

**Degraded** is never shown on the Overview. It appears only in a search result, including what an MCP client receives, when the question could not be embedded in time and the answer used words only. When an assistant or an agent searches memory, the result also says whether semantic search was used: `on`, `off` or `degraded`. `degraded` means this one search was meant to use meaning, but the embedding provider did not answer within 0.9 seconds or returned an error. The answer is still correct for words and exact matches; it may miss a memory that only meaning would find. Ask again later. If it keeps happening, tell the platform owner.

## Turn it off

1. Open **Memory** and find **Semantic search**.
2. Press **Turn off semantic search** and confirm.

Turning it off deletes the project's stored vectors and stops new requests to the provider; a request already in flight cannot be recalled. Search goes back to words and exact matches. The memories and wiki pages themselves are not touched. Turning it on again indexes everything again.

## Common problems

- **You do not see the Turn on button.** Either you are not a project admin (ask an admin of the project), or the platform owner has not chosen an embedding model yet. The Overview says so and the button is hidden.
- **The page says "The platform owner has not chosen an embedding model."** Ask the platform owner to do step 1.
- **It stays at "On, indexing".** The provider is probably failing (wrong key, quota used up, model removed). Open **Memory**, then **Processing**. Jobs named "Index for semantic search" show "Will retry" or "Failed". Tell the platform owner, who checks the provider in AI & Models. Search keeps working by words in the meantime.
