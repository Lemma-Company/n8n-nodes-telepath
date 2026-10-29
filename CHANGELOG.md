# Changelog

## 0.1.2

- Preserve empty JSON request bodies in n8n's HTTP adapter so optional-only operations such as List Telegram chats work without adding a Limit field.
- Test OAuth credentials with an authenticated, read-only list-chats request, including accounts with an empty archive.

## 0.1.1

- Use the official n8n release command in GitHub Actions so the release guard and npm provenance are applied correctly.
- First public npm release; 0.1.0 publication stopped before upload.


## 0.1.0

Initial Telepath node with 30 operations across chats, media, Notes, reminders, channels, the separate bot inbox and scoped archive deletion. Includes OAuth dynamic client registration, S256 PKCE, account-scoped authorization, request pacing and bounded rate-limit handling. Ambiguous writes are not automatically retried.
