# Capture sandbox deployment review — 2026-11-19

Status: **superseded by the native Playwright worker**. The user initially
approved a six-syscall seccomp proposal, then selected a separate capture worker
and explicitly chose native host execution. The current patch removes the
Provider seccomp artifact and every Docker isolation relaxation. No custom
AppArmor policy, unconfined system paths, extra capabilities, privileged mode,
Docker socket or host network is shipped for captures.

## Historical evidence

The first prototype ran Bubblewrap inside the shared Provider container.
Host Chromium captures and the signed Provider/MCP journey worked. Docker's
ordinary seccomp policy refused `unshare -Urn true`; a disposable non-root,
network-free container accepted that namespace probe with a modified profile.

That profile derived from [Moby's default policy](https://github.com/moby/profiles/blob/main/seccomp/default.json),
retrieved 2026-11-19, original SHA-256
`3320527d4568265ac97a077609b1bfd4cfd0d789eeb9239b7e094b1526675406`.
The prototype `/tmp/ulvia-seccomp-capture.json`, SHA-256
`672da474caa92c3842189300fd6becdce82ef1088efeb59c03598109304f3622`,
added unconditional allowance for `unshare`, `mount`, `umount2`, `pivot_root`,
`setns` and `clone`. Automatic review initially rejected persistent application
because every process in the shared Provider would gain that kernel surface.
The user explicitly approved it before its temporary implementation.

The subsequent complete browser probe showed that seccomp was insufficient:
AppArmor refused mount propagation (`Failed to make / slave: Permission denied`).
An ephemeral diagnostic container with AppArmor disabled then refused the new
proc mount (`Can't mount proc on /proc: Operation not permitted`). No further
persistent security relaxation was applied. Namespace creation alone had not
proved that the complete worker could execute in Docker.

## Current resolution

The native worker runs under a dedicated unprivileged host account, without CMS
operating credentials. Playwright launches Chromium through the same isolated
engine that passed host tests. A private Unix socket accepts explicit document
bytes and returns bounded image bytes; there is no public listener. The Docker
Provider mounts only the socket directory read-only and uses the configured
shared group. Its original container security policy remains unchanged.

The [runtime guide](../development/visual-captures.md) describes prerequisites,
operator setup, the shipped systemd service template, saved optional connection
configuration and verification. Tests use disposable local processes; they do not
install a system account or activate an operator's host service.
