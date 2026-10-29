# 11. Chat attachments in S3, and connector tools from the chat

Status: accepted (2026-10-29). Risk lane: Red (file uploads, data to models, outside tools).

## Context

People want to attach files in the Studio chat, add skills and connectors as context, and have a
connector actually do something from the chat. Saqina had no file storage and the chat had no way to
run a tool.

## Decision

- **S3 for bytes.** Attachments go to a private S3 bucket (or an S3-compatible store through
  `S3_ENDPOINT`), signed with SigV4 by `aws4fetch` (MIT, no dependencies) rather than the much larger
  AWS SDK. Keys are `projects/<project>/attachments/<uuid>`, never the file name. The bucket is never
  public: files are served by `/api/projects/[slug]/attachments/[id]` after the membership check, with
  `nosniff`, a sandbox CSP, and download (not inline) for anything but images.
- **Database fallback only outside production.** Without S3, development and tests keep bytes in
  `chat_attachments.data`; production refuses uploads and `/api/health` reports `fileStorage: false`.
- **The type comes from the bytes.** PNG, JPEG, WebP, GIF and PDF by signature; text only with a text
  extension, valid UTF-8, at most 200 KB. SVG and HTML are refused. 5 MB and 5 files per message.
- **Binding.** An upload belongs to its uploader until it is sent; sending binds it to one message, and
  only the uploader's own unsent files can be bound. Unsent uploads are deleted after a day.
- **To the model.** Text files are outside data in the prompt. Images and PDFs are sent only to a model
  with the `vision` capability; otherwise the reply says they were not read. Attaching a file to a
  message for Saqina is the person's consent to send it to the project's model.
- **Tools from the chat.** Connectors picked in the composer, or named in the message, are offered to
  the model, which picks one tool and its input (rules do it without a model). The tool runs through
  `executeTool`: policy, audit, rate limit, idempotency and approval are the same as everywhere else.
  A high-risk tool becomes a proposal. Results are shown as plain text.

## Consequences

- Deleting a message or project removes the attachment rows; S3 objects of deleted projects are left
  for a lifecycle rule on the bucket (recommended: expire `projects/` objects with no row after review).
- Moving to another store means a new `FileStore` driver; nothing else changes.
