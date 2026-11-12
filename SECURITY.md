# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |
| < 0.1.0 | No |

NextLine targets DSH `0.2.2-rc.2` through `0.3.0` (exclusive). A DSH version outside `engines.dsh` is unsupported and may be refused by the plugin manager.

## Reporting a vulnerability

Please do **not** open a public issue for a security problem. Use the repository's **Security → Report a vulnerability** flow (GitHub private vulnerability reporting) so the report stays private while it is assessed.

Include:

- the affected version and DSH version;
- the smallest reproduction;
- whether conversation text, credentials, local files, or the composer DOM are involved;
- any suggested mitigation.

Do not include real API keys or private conversation transcripts in the report; redact them first.

## Scope

NextLine reads selected text from the current conversation and recent sessions and sends it to the model provider configured for that session. It does not add an external service, store credentials, or upload the full session library. Relevant reports include unintended data disclosure, missing bounds on history or output, prompt-injection paths, and composer/DOM behavior that could alter a draft without the user's action.

Basic secret redaction is a convenience, not a complete sensitive-data detector. For sensitive conversations, set `historyEnabled: false` or disable the plugin.
