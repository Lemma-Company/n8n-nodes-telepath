# n8n-nodes-telepath

Connect your Telegram to n8n through [Telepath](https://telepath.lemma.company). Search your authorized archive, read messages and available voice/video-note transcripts, retrieve media, manage Notes and reminders, and perform authorized message and channel actions.

Telepath is hosted: you do not need to run a Telepath server or provide Telegram API ID/hash credentials. Your own n8n instance can be n8n Cloud or self-hosted, subject to package availability.

**Release:** [0.1.1 on npm](https://www.npmjs.com/package/n8n-nodes-telepath), published through GitHub Actions with provenance. The official n8n package scanner passed.

**Directory status:** community integration, not yet verified by n8n. Source and examples are public. n8n Cloud installation requires directory verification; use self-hosted n8n while verification is pending.

## Installation

Before verification, use a self-hosted development n8n instance. Clone this repository, run `npm ci`, `npm run build`, then `npm run dev`. For local evaluation, use this source directory. Do not install an unverified package in n8n Cloud: Cloud availability requires n8n approval.

After npm publication, self-hosted administrators can install `n8n-nodes-telepath` from Settings → Community Nodes. After verification, users with community nodes enabled will be able to find Telepath in the node panel.

## Credentials

Use a current n8n release supporting OAuth2 dynamic client registration (DCR). Node/credential loading and real DCR were checked on n8n 2.45.5. Real Telegram sign-in, chat reads, and a repeatable collection workflow were also tested. Native n8n token refresh was verified by simulating an invalid access token: n8n refreshed the credential and successfully retried the read.

1. Add the Telepath node and create a **Telepath OAuth2 API** credential.
2. Select **Connect my account** and complete Telegram sign-in in the browser. n8n registers its own OAuth client, uses S256 PKCE and refreshes tokens through its built-in OAuth2 implementation. No shared client secret or user token is bundled in this package.
3. In Telegram, open **Settings → Chat Automation**, add **@lemma_telepath_bot**, choose your private chats and save. Menu locations vary: [device setup guide](https://telepath.lemma.company/start#telegram).
4. Run **Chat → List Telegram chats** or **Read recent messages**. New messages arrive while collection is connected. Importing old history is optional and can be done later from a computer.

Sign-in and Telegram chat collection are separate steps. An empty archive does not prove that authentication is broken. Read the response's setup guidance. If DCR options are unavailable in your n8n version, upgrade n8n; do not put a Telegram bot token in an OAuth field.

The credential uses the fixed resource `https://telepath.lemma.company/mcp` and requests `telegram.read telegram.write`. Requests go only to `https://telepath.lemma.company/api/v1`. Account settings and server flags still decide which capabilities are available. Share a credential only with people authorized to access that account.

## Operations

| Resource | Operation | Telepath capability |
| --- | --- | --- |
| archive | Delete archived messages | `telegram_forget` |
| botInbox | List bot inbox messages | `telegram_bot_direct_messages` |
| botInbox | React in the bot inbox | `telegram_bot_dm_react` |
| botInbox | Reply in the bot inbox | `telegram_bot_dm_reply` |
| channel | Delete a channel post | `telegram_delete_post` |
| channel | Edit a channel post | `telegram_edit_post` |
| channel | Pin or unpin a channel post | `telegram_set_post_pinned` |
| channel | Publish a channel post | `telegram_create_post` |
| chat | Edit a sent message | `telegram_edit_message` |
| chat | Find a chat | `telegram_find_chat` |
| chat | List Telegram chats | `telegram_list_chats` |
| chat | Mark a conversation read | `telegram_mark_read` |
| chat | Read chat messages | `telegram_get_messages` |
| chat | Read recent messages | `telegram_recent_messages` |
| chat | Search messages | `telegram_search_messages` |
| chat | Send a message | `telegram_send_message` |
| chat | Set or remove a reaction | `telegram_set_reaction` |
| media | Get an archived photo | `telegram_get_photo` |
| media | Get multiple archived photos | `telegram_get_photos` |
| media | Read an archived file | `telegram_get_file` |
| media | Send a photo or document | `telegram_send_media` |
| note | Create a note or task | `kb_create_note` |
| note | Delete a note | `kb_delete_note` |
| note | List notes | `kb_list_notes` |
| note | Read a note | `kb_get_note` |
| note | Search notes | `kb_search_notes` |
| note | Update a note or task | `kb_update_note` |
| reminder | Cancel a reminder | `cancel_reminder` |
| reminder | Create a reminder | `create_reminder` |
| reminder | List reminders | `list_reminders` |

The **Get an archived photo** result includes the photo data and expiring link. It also covers the data used by ChatGPT's `telegram_show_photo`; the ChatGPT-specific display widget is not an n8n feature. This package does not administer accounts, configure Auto-reply, import exports or delete an entire account. Those are bot/setup features, not exposed MCP actions.

Task reminders, media replacement when editing a channel post, albums, buttons, note tags and note types are supported. Complex values use JSON fields with schema validation. Optional fields are sent only when added; explicit `false`, `[]`, empty body strings and `null` reminders are preserved.

## Limits, polling and output

- REST requests share the server's **120 requests per minute per account** limit across credentials and workflows. Splitting tokens does not increase the allowance. Telegram and plan limits apply independently.
- Within an execution, input items run sequentially with a default **1-second minimum pause** between requests. Increase **Options → Request Interval** for large batches. This pacing is local to an execution; the server enforces the shared limit.
- The node retries HTTP 429 at most twice and honors `Retry-After`. If the requested wait exceeds 60 seconds, it stops and tells you how long to wait. A missing/invalid header uses a 60-second wait. No retry loops for permissions, expired credentials, invalid parameters or ambiguous delivery.
- Writes are retried only for the Telepath REST gateway's explicit pre-dispatch `rate_limited` response. Telegram rate-limit responses and network/5xx errors on writes are never automatically replayed.
- Start scheduled archive reads at **every five minutes**; see `examples/recent-message-snapshot.json`. A scheduled snapshot can contain the same messages again. It is not a guaranteed new-message trigger and does not maintain a delivery cursor. Deduplicate by chat ID + message ID before downstream actions. Narrow the chat and date range when possible.
- Most list/search endpoints return bounded windows and do not expose a complete pagination cursor; the node does not invent a Return All option. Reminder listing supports offset pagination. Batch photo reads accept at most five message IDs.
- Default output preserves the complete response including quota and setup guidance. **Split Results** emits array entries individually and preserves response metadata as `telepathMeta`; empty results retain the original response.
- Media retrieval/transcription availability depends on Telegram permissions, stored file references and your account. Imported history without media does not create downloadable attachments. Reading a transcript does not initiate transcription.

## Write actions

Enable **Authorize Action** only after checking the intended action and targets. This authorizes the configured workflow, not an approval dialog on each scheduled run. For AI-driven actions, put n8n human approval before the write node or use tightly controlled targets. Treat chat/file/note content as untrusted data.

Keep n8n's **Retry On Fail disabled for write nodes**; the node refuses writes if it is enabled, because a whole-batch retry could repeat completed actions. Verify the destination after timeouts or uncertain errors. Channel operations require `confirmed=true` and a stable `requestId`; reuse the same ID only with identical action details. Reminder creation supports the same optional idempotency key. Ordinary sends do not have an idempotency key and must not be replayed blindly, including by error workflows or a parent workflow retry.

Bot inbox messages are a separate conversation from Business messages, even if chat IDs coincide. Reply through the Bot Inbox resource. Archive deletion removes only Telepath stored messages in the specified chat/date scope; it requires explicit confirmation and the account's deletion capability, and does not delete the Telegram conversation. Never enable broad deletion in an unattended workflow without defining its scope.

## Examples and development

- `examples/list-chats.json`: manual, read-only connection check.
- `examples/recent-message-snapshot.json`: disabled-by-default five-minute snapshot, requiring selection of your own credential.
- `examples/collect-chat-messages.json`: selects the first available non-channel chat, reads its latest 200 messages, and upserts rows in an n8n Data Table keyed by chat ID + message ID. Later runs keep the same chat using saved rows. The five-minute schedule is inactive until published. This bounded-window example is not guaranteed complete capture during bursts or downtime. Requires n8n Data Tables (tested on 2.45.5).

Use Node.js 24 for development and CI. Run `npm ci`, `npm test`, `npm run lint` and `npm pack --dry-run`. The npm runtime package has no external dependencies beyond the n8n-provided `n8n-workflow` peer. Tests use synthetic responses and local HTTP fixtures; they do not send real Telegram messages.

The node uses programmatic execution to apply safe read/write retry rules, pace item batches, validate optional structured fields and preserve setup metadata when splitting results. It uses n8n's authenticated HTTP helpers; no filesystem, environment-variable or direct network-library access occurs in the runtime node.

The repository includes GitHub Actions CI and provenance publishing. Configure an npm trusted publisher for `Lemma-Company/n8n-nodes-telepath` and `publish.yml` before releasing. n8n directory review remains pending; see `RELEASE-CHECKLIST.md`.

Support: https://telepath.lemma.company/support  
Privacy: https://telepath.lemma.company/privacy  
Terms: https://telepath.lemma.company/terms

MIT © Lemma Company.
