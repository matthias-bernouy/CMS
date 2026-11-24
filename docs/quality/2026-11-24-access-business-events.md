# Access business Events and optional email workflows — 2026-11-24

## Scope and release identity

Implemented in the isolated `codex/access-business-events` worktree, based on
`f8a7ae933`, with the independent Authoring change `21541c1ac` preserved.
Access is `1.2.0`; its reviewed digest is
`sha256:3e8189f1023bf4be12c3385aa113bbe806022b5cf2903d88d80e27b2e394fc3c`.
The combined official Provider manifest is `1.15.0`. Workspace branch `v1.0.22`
remains unchanged. No remote publication is part of this task.

Access declares `account.created` for every new CMS membership and
`account.email-verified` for the first actual local email-link/password-reset
proof. Administrator-preverified and delivery-disabled signup policies do not
emit proof. Existing login refreshes do not emit creation. Verification/reset
security messages remain Access-owned.

Public payloads contain a random opaque `accountRef`, business timestamps and
provider/proof metadata, never a raw login subject, email, password or token.
The new ADMIN HTTP query `get-event-account` returns only creation time and an
optional sensitive email. It cannot resolve foreign/deleted references. A
replacement membership gets a new reference even when its raw identity is reused.

The CLI bootstrap admits three optional artifacts: the existing Forms email
workflow plus `ulvia/account-created-email@1.0.0` and
`ulvia/account-welcome-email@1.0.0`. Catalogue availability does not install or
activate them. The welcome workflow reads the minimal current profile, checks
membership creation time and skips missing/replaced members. Exact Access
1.0/1.1 snapshots retain their original dependency lists and execution behavior;
there is no historical creation-event backfill.

## Evidence

The final combined static check passed all ten checks. The ordinary suite passed
4,661 tests, with 151 intentionally disabled integration cases and zero failures.
The enabled Events/Forms/Workflow/Auth Mongo stage passed 34 tests.

[Auth fact tests](../../packages/features/auth/tests/accounts/events/facts.test.ts)
cover signup retries, administrator/external members, actual versus implicit
verification, invalid/expired tokens, repeated reset, concurrent confirmations,
retained implementations and causal-scope isolation.
[Privacy tests](../../packages/features/auth/tests/accounts/events/privacy.test.ts)
cover an external identity containing an email, minimal profile resolution,
reference invalidation/recreation and closed journal decoding without reflecting
private malformed payloads in errors.

[Worker tests](../../packages/features/auth/tests/accounts/events/worker.test.ts)
exercise response loss with stable occurrence/body, replacement-lease fencing,
deleted members and the 24-hour source publication deadline.
[Standalone Mongo tests](../../packages/features/auth/tests/accounts/events/mongo.test.ts)
cover concurrent atomic capture, a failed credential write, reopen/retry,
prefix/database isolation, concurrent explicit reference registration for an
existing member, minimal profile reads and bounded journal projections.

The enabled [native journey](../../tests/integration/instance/accounts/journey.test.ts)
passed 162 assertions using production-shaped local images and a synthetic SMTP
sink. It executes both official definitions through actual publication, triggers,
Gateway calls and persisted runs. It verifies anonymous/member refusal, a foreign
instance administrator receiving 404, refusal of browser-forged Access events,
security mail, real proof, immediate Provider restart with zero stop timeout,
no duplicate welcome on reset, causal-loop suppression, disabled-email signup
and reference invalidation after deletion. Restart occurs after confirmation;
the deterministic response-loss tests cover the specific source handoff gap.

Full `bun run verify` subsequently exited with code 0 in the same task worktree,
including the Forms browser/SMTP recovery journey, the native shared-stack
browser journey, and both fresh/restart TLS certificate journeys. Initial and
final static checks each passed all ten checks. Validation combines the Access
changes with `21541c1ac` (the independent Authoring change on `v1.0.23`); current
wire versions are Access 1.2.0 and official Provider manifest 1.15.0. No measured
performance campaign or remote publication was performed.

## Operation and storage review

Membership creation remains one business `findOneAndUpdate`: reference and intent
are part of its `$setOnInsert`. Proof capture is one conditional credential update;
a repeated proof uses a missed CAS and an ordinary verification-timestamp update.
Preparing evidence reads one projected member for an existing reference; explicit
first registration can require a read, CAS and confirmation read. Journaled
majority acknowledgement applies to the affected Auth collections.

A source worker reads two indexed projected pages, at most 13 records each,
returns/handles at most 25, then claims, checks current membership and acknowledges
with an occurrence/token fence. Readers exclude credential hashes and encrypted
emails. Profile resolution uses one unique-index projected user read, plus the
existing field-crypto/key resolution. No new cache is introduced. These are
operation-count/bound evidence, not measured latency or throughput certification.
The static performance plan contains 314 executors and 2,343 scenarios, including
nominal/cold/warm/concurrent/reference-invalidation cases for the new query.

The atomic proof method remains in `MongoLocalCredentialStore` despite its
187-line size advisory. Splitting that CAS away from its owning credential state
would obscure the atomicity boundary. Larger pre-existing runtime composition
files receive only the feature wiring; no directory-fanout error is accepted.

## Limits

Source publication retries for 24 hours from the business fact, independently of
broker acceptance/delivery retention. Expired source intent leaves a small
operator diagnostic until its owning account data is removed. No public event
history API is added. No global FIFO or exactly-once SMTP guarantee is claimed.
An already dispatched publication/mail can finish after deletion. Cold discovery
and recovery are eventual. External identity-provider membership creation is
covered at the injected membership boundary; no live third-party identity service
was contacted. No actor identity is inferred from the created member, and direct
host store callers must preserve trusted automation causation explicitly.
