# Auth System Source

The readonly `system-auth` provider exposes CMS-owned public authentication
through the same source catalogue as regular providers. It is intended for
site-authored login, signup, email verification, password reset, and account
state pages.

The CMS does not ship public auth blocs by default. Sites call these endpoints
from authored blocs or forms.

## Runtime Paths

When a surface is configured with both a source repository and public auth,
these endpoints are available on the site origin:

| Method | Path | JSON body | Response |
| --- | --- | --- | --- |
| `GET` | `/.cms/sources/system-auth/me` | none | `{ "subject": Subject \| null }` |
| `POST` | `/.cms/sources/system-auth/login` | `{ "email": string, "password": string, "returnTo"?: string }` | `{ "subject": Subject }` and a session cookie |
| `POST` | `/.cms/sources/system-auth/logout` | none | `{ "ok": true }` and a cleared session cookie |
| `GET` | `/.cms/sources/system-auth/signupLegalRequirements` | none | `{ "documents": SignupLegalRequirement[] }` |
| `POST` | `/.cms/sources/system-auth/signup` | `{ "email": string, "password": string, "acceptedLegalDocumentVersionIds"?: string[] }` | `{ "ok": true }` |
| `POST` | `/.cms/sources/system-auth/requestEmailVerification` | `{ "email": string }` | `{ "ok": true }` |
| `POST` | `/.cms/sources/system-auth/confirmEmailVerification` | `{ "token": string }` | `{ "ok": true }` |
| `POST` | `/.cms/sources/system-auth/requestPasswordReset` | `{ "email": string }` | `{ "ok": true }` |
| `POST` | `/.cms/sources/system-auth/confirmPasswordReset` | `{ "token": string, "password": string }` | `{ "ok": true }` |

`@bernouy/cms-control` mounts the same provider behind the admin guard and keeps
signup disabled there. `@bernouy/cms-delivery` can expose signup when its public
auth config allows it.

When `signupLegalAcceptance` is configured, clients load the current
requirements first and submit every returned `versionId`. The server resolves
the published CMS pages again, computes their canonical SHA-256 hashes, and
records the immutable snapshots against the newly-created CMS user. Page
content and hashes supplied by a client are never accepted. Omitting the policy
preserves the legacy signup behavior and returns an empty requirements list.

The direct auth equivalent is
`GET /.cms/auth/signup/legal-requirements`. The production runtime backs the
policy with the `auth.signupLegalDocuments` system setting:

```json
{
    "auth.signupLegalDocuments": [
        {
            "key": "terms-of-use",
            "label": "Terms of use",
            "consentText": "I accept the terms of use.",
            "pageId": "stable-cms-page-id",
            "enabled": true
        }
    ]
}
```

Every enabled entry must point to a published page. Draft or missing pages fail
closed. Empty settings leave signup unchanged and do not create proof records.
Changing the page, label, or consent text creates a new version id; existing
proofs remain untouched.

Legal requirements are materialized and validated before the credential lookup,
so an existing email and an unknown email have the same public response for a
missing, stale, or unavailable policy version.

Signup activation is a forward-only, retryable saga:

1. create an unverified credential, or authenticate the password of an existing
   credential that has no CMS membership;
2. append the immutable proof with a deterministic id derived from the CMS user
   id and exact accepted version set;
3. create the CMS membership as the final activation step;
4. only then send verification, or mark the credential verified when email
   delivery is disabled.

An ambiguous proof acknowledgement therefore leaves an unverified credential
without membership. Submitting the same email, password, and current versions
again resumes the saga. Exact proof retries preserve the first `acceptedAt` and
snapshot; a later version set creates another event. Evidence that contradicts
an existing deterministic id is rejected. Email verification and password
reset ignore credentials that do not yet have an activated membership.

Pending credentials are retained intentionally so an interrupted signup can be
reconciled by retry. Automatic expiry is not implemented: an operational
cleanup job may report credentials without a matching `local:<sub>` membership
after a chosen retention period, but deletion must follow the site's legal and
support retention policy rather than an implicit runtime timeout.

## Authoring Contract

Use `GET /.cms/sources/system-auth/me` as a normal `cms-source` to render
authenticated and anonymous states.

Use action endpoints from custom blocs or forms with a JSON payload:

```js
await fetch("/.cms/sources/system-auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
});
```

The editor source catalogue includes method, response fields, and JSON
request-body fields for action endpoints. Structure data-source binding still
only offers `GET` sources, so login and reset actions are not accidentally
inserted as `cms-source` fetches.
