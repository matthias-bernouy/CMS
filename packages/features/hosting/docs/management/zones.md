# Verified DNS zones

Hosting 1.1 adds runtime zone administration through Control's signed administrator
authority. A verified zone authorizes its apex and all descendant hostnames on
this installation. It does not assign those names to an instance automatically.

## Create sites under one zone

1. Call `zones.claim` with `{"hostname":"cyaxis-demo.fr"}` (no `*.` or URL).
2. Publish the exact returned TXT name and value. The dedicated record is
   `_ulvia-zone.cyaxis-demo.fr`; an individual domain's `_ulvia` proof cannot
   verify a zone. The proof binds the zone, Control identity and claim generation.
3. Call `zones.verify` with the hostname and returned `expectedRevision`.
4. Call `instances.create` with each exact origin, for example
   `https://artisan1.cyaxis-demo.fr`. A verified zone admits its primary domain
   without another TXT proof; the creation response has `proof: null`.
   `domains.claim` also accepts verified-zone aliases. Its existing response
   still contains a domain proof; no TXT is needed when its state is `verified`.

Use `zones.list` with `after: null` and a limit from 1 to 50. Follow `nextCursor`
until null. Results contain hostname, state and revision, without internal Control
or claim identifiers. Every new capability has HTTP and MCP bindings.

## Disable and reclaim

`zones.disable` requires the current revision. It removes this zone's automatic
admission grant without modifying existing domains, instances or TLS readiness.
Admissions that already observed a verified grant may finish concurrently with
disable. Later admissions fall back to the individual-domain TXT workflow unless
another verified ancestor or deployment-owned suffix independently grants them.
An existing pending domain is not upgraded implicitly after zone verification.

Claiming a disabled zone starts a new pending generation with a different proof;
the old TXT cannot reactivate it. Retrying a pending or verified claim retains its
generation. Verification and disable use revision checks; after a conflict read
`zones.list` before deciding whether to retry. Failed DNS or revoked administrator
checks leave zone business state unchanged.

## Deployment and delivery

Zone grants are persisted in the hosting database and scoped to the installation's
Control identity. No environment change or restart is needed to add a zone.
Deployment-owned managed suffixes remain an optional separate authority source.
DNS routing and HTTPS remain separate: configure wildcard DNS or individual DNS
records towards the installation. Zone verification neither obtains a wildcard
certificate nor changes Caddy's existing certificate policy.

Admission performs one bounded indexed query for exact hostname ancestors, loading
at most one matching zone. Ordinary request routing performs no zone lookup.
Existing installation state is not backfilled. Deploying this release does not
rewrite an instance's pinned contract; select the admitted Hosting 1.1 release
through the normal explicit upgrade flow before using the new tools.
