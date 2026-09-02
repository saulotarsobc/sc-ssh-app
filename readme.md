# SC - SSH Keys Manager

A local-first desktop application for managing SSH hosts with simple, passwordless access. Add a host once and connect with `ssh alias`; the app handles its dedicated key in the background.

The renderer never receives filesystem, process, or Electron access. All privileged operations run in Electron's main process through a narrow, validated `window.sshManager` API.

![banner](./demo/banner.png)

---

## Features

- Host-first home screen with search, connection status, test, connect, edit, rotate, and remove actions
- One-step host setup: verify the server, create a dedicated ED25519 identity, install its public key, write OpenSSH config, and test `ssh alias`
- Keys are implementation details attached to hosts rather than a separate workflow
- Guided host lifecycle plus an advanced OpenSSH config editor with validation, diff review, atomic writes, and backups
- Conservative alphabetical organization that preserves order-sensitive global directives, wildcards, `Include`, and `Match` barriers
- Assisted remote rotation with preflight, configurable `authorized_keys` backup retention, new-key test, rollback, revocation, and audit history
- Host-key verification against `known_hosts`
- `ssh-agent` diagnostics and support for protected identities
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

SSH files remain the source of truth. Each host created by the guided flow receives one dedicated identity. App metadata, policies, and audit records are stored under Electron's `userData` directory using atomic JSON writes. Removing a guided host also archives its dedicated key for recovery; shared identities are left untouched.

Passwords and passphrases stay in memory unless the user explicitly enables persistence. Persistence is refused when Electron reports that a secure OS-backed storage provider is unavailable. Sensitive fields are redacted from audit output.

The config organizer only sorts independent literal `Host` blocks inside safe regions. Before an organized config is written, the app compares normalized `ssh -G` output for affected hosts and aborts if effective configuration changes.

## Releases

Tags matching `vX.Y.Z` run verification and unsigned packaging on GitHub-hosted Windows, macOS, and Linux runners. The workflow publishes installers and updater manifests to the matching GitHub Release.

Unsigned builds may trigger SmartScreen, Gatekeeper, or Linux package warnings. The builder and CI are structured so signing/notarization credentials can be added later without changing the release format. Never commit signing secrets; provide them through repository secrets and the platform-specific electron-builder environment variables.

## Current scope

FIDO2/hardware tokens, SSH certificates, specialized ProxyJump management, autonomous unattended rotation, and a full `known_hosts` editor are intentionally outside v1. Existing advanced OpenSSH directives remain available through the raw editor and are preserved.

## License

MIT
