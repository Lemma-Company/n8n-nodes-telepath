# Release checklist

## Implemented locally

- 30 typed, allowlisted operations with no arbitrary API URL or tool dispatch.
- OAuth2 credentials using n8n dynamic registration and S256 PKCE.
- No bundled tokens/client secrets and no runtime dependencies beyond n8n's peer.
- Account permissions and plan allowances remain enforced by Telepath.
- Per-item pacing and bounded 429 handling; ambiguous writes are not replayed.
- Write approval, scoped archive deletion, bot-inbox separation.
- English documentation, examples, MIT, CI and provenance publishing workflow.

## Verification before public submission

- [x] Real n8n 2.45.5 loads Telepath, its AI-tool variant and OAuth credential (checked through its authenticated API).
- [x] User completed setup and OAuth in the n8n editor and confirmed a successful manual run. The user also reviewed the icon; automated browser visual QA was unavailable.
- [x] Real n8n DCR against Telepath passed after explicit approval: authorization URL, S256, scopes, canonical resource and redirect URI verified. This initial DCR-only check issued no user tokens; the later user-authorized sign-in is recorded below.
- [x] Real Telegram sign-in and read operations passed. A collector workflow saved 200 messages into a temporary n8n table; a repeat run retained 200 unique rows. A subsequent user-run updated the same 200 rows without duplicates.
- [x] Verify refresh using n8n's actual OAuth helper: injected an invalid access token into the isolated test credential; native refresh saved a new token and the complete read/table workflow succeeded. Temporary plaintext credential files were removed. Revoked-grant reconnect remains a manual support path.
- [x] 30-operation REST catalog deployed; existing 25 routes preserved. Health and unauthenticated guards checked.
- [x] Public `Lemma-Company/n8n-nodes-telepath` repository created; GitHub CI passed. npm publisher verified as `olegnikeshin`, with user-confirmed 2FA.
- [x] Configure npm trusted publishing for `.github/workflows/publish.yml`.
- [x] Publish version 0.1.1 from tag `v0.1.1` through GitHub Actions with provenance (run 40849007959). Version 0.1.0 stopped before upload because the workflow initially bypassed the official release command.
- [x] Official `@n8n/scan-community-package` passed all checks for `n8n-nodes-telepath@0.1.1`, including attested source at commit `8369b69`.
- [ ] Submit through https://creators.n8n.io/nodes and address reviewer feedback.

The local tests use synthetic accounts and mocked Telegram calls. They do not prove the complete n8n browser sign-in journey or imply that n8n has approved this package. Do not mark external gates complete based only on local build/lint output.

## 0.1.2 regression verification

- 15 package tests pass, including optional-only POST bodies and the credential probe definition; strict lint passes.
- 60 requests across all 30 operations pass through the actual n8n 2.45.5 HTTP adapter to a local receiver: minimum required fields and populated optional fields. JSON bodies are checked against the backend REST schemas; GET query/path mapping is checked separately.
- Reproduce the cross-repository transport check after building both projects with:
  `node tests/http-contract.mjs /path/to/n8n-runtime /path/to/telepath-backend`.
  The runtime directory must contain `node_modules/@n8n/backend-network`; the backend must contain `dist/rest-catalog.js`. Test traffic stays on localhost. No user credentials are used.
- The backend's 19 isolated REST tests pass with synthetic accounts and mocked Telegram calls.
- This coverage verifies serialization, routing and server behavior in fixtures. Real message sends, reactions, archive deletion and channel publishing were not executed against user chats.
