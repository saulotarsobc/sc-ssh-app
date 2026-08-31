# SC - SSH Keys Manager

A local-first desktop application for managing SSH identities, OpenSSH host configuration, key rotation, and `ssh-agent` from one place.

The renderer never receives filesystem, process, or Electron access. All privileged operations run in Electron's main process through a narrow, validated `window.sshManager` API.

## Features

- Inventory and health checks for keys in `~/.ssh`
- ED25519 and RSA 4096 key creation, private-key import, metadata, tags, archive, restore, and permanent deletion
- Public-key copy/export without exposing private material
- Guided host CRUD plus a raw OpenSSH config editor with validation, diff review, atomic writes, and backups
- Conservative alphabetical organization that preserves order-sensitive global directives, wildcards, `Include`, and `Match` barriers
- Assisted remote rotation with preflight, `authorized_keys` backup, new-key test, rollback, revocation, and audit history
- Host-key verification against `known_hosts`
- `ssh-agent` inventory, add, remove, and interactive `ssh-add` for protected identities
- Optional OS-protected secret persistence through Electron `safeStorage`
- Diagnostics, activity history, rotation reminders, tray behavior, and native terminal launch
- No account, cloud sync, telemetry, or private-key export

## Requirements

- Node.js 24.18 or newer
- OpenSSH client tools (`ssh`, `ssh-keygen`, and `ssh-add`) available on `PATH`
- Windows 10/11, current macOS, or a modern Linux desktop

Remote rotation in v1 targets Unix/OpenSSH servers using `authorized_keys`.

## Development

```bash
npm install
npm run dev
```

Quality checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Build an installer for the current platform:

```bash
npm run dist
```

Generated installers are written to `out/`.

## Data and security model

SSH files remain the source of truth. App metadata, policies, and audit records are stored under Electron's `userData` directory using atomic JSON writes. Archived keys are moved to a recoverable app-data area and cannot be archived while referenced by active hosts.

Passwords and passphrases stay in memory unless the user explicitly enables persistence. Persistence is refused when Electron reports that a secure OS-backed storage provider is unavailable. Sensitive fields are redacted from audit output.

The config organizer only sorts independent literal `Host` blocks inside safe regions. Before an organized config is written, the app compares normalized `ssh -G` output for affected hosts and aborts if effective configuration changes.

## Releases

Tags matching `vX.Y.Z` run verification and unsigned packaging on GitHub-hosted Windows, macOS, and Linux runners. The workflow publishes installers and updater manifests to the matching GitHub Release.

Unsigned builds may trigger SmartScreen, Gatekeeper, or Linux package warnings. The builder and CI are structured so signing/notarization credentials can be added later without changing the release format. Never commit signing secrets; provide them through repository secrets and the platform-specific electron-builder environment variables.

## Current scope

FIDO2/hardware tokens, SSH certificates, specialized ProxyJump management, autonomous unattended rotation, and a full `known_hosts` editor are intentionally outside v1. Existing advanced OpenSSH directives remain available through the raw editor and are preserved.

## License

MIT
