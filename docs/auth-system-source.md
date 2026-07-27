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
| `POST` | `/.cms/sources/system-auth/signup` | `{ "email": string, "password": string }` | `{ "ok": true }` |
| `POST` | `/.cms/sources/system-auth/requestEmailVerification` | `{ "email": string }` | `{ "ok": true }` |
| `POST` | `/.cms/sources/system-auth/confirmEmailVerification` | `{ "token": string }` | `{ "ok": true }` |
| `POST` | `/.cms/sources/system-auth/requestPasswordReset` | `{ "email": string }` | `{ "ok": true }` |
| `POST` | `/.cms/sources/system-auth/confirmPasswordReset` | `{ "token": string, "password": string }` | `{ "ok": true }` |

`@bernouy/cms-control` mounts the same provider behind the admin guard and keeps
signup disabled there. `@bernouy/cms-delivery` can expose signup when its public
auth config allows it.

Signup has no policy or legal-document knowledge. Integrations can attach
synchronous request and response triggers to `system-auth/signup`. Additional
form fields remain opaque to Auth while the trigger pipeline can map them
explicitly; integrations must never map the password into another function.

The request trigger runs before credential mutation and can block signup. A
successful signup also exposes `cmsUserId` to response triggers through the
server-only `$trigger` projection. This field is never serialized into the
public response. It is `null` for an existing credential whose password could
not be verified, preventing the endpoint from disclosing another user's id.
Response triggers that persist user-owned records must require a non-null
`$response.body.cmsUserId`.

The direct `POST /.cms/auth/signup` route is kept for compatibility. When the
source gateway is configured, Delivery dispatches it internally through the
same `system-auth/signup` pipeline so integration triggers cannot be bypassed.
An auth-only host without Sources keeps the neutral direct signup behavior.

The optional `LocalCredentialStore.verifyPassword` capability verifies a
password without treating an unverified credential as login-ready. Built-in
stores implement it. Existing custom stores remain source-compatible; if one
cannot verify a pending credential, the retry fails closed and that credential
must be reconciled administratively before signup can resume.

Pending credentials are retained intentionally so an interrupted membership
activation can be reconciled by retry. Automatic expiry is not implemented: an
operational cleanup job may report credentials without a matching
`local:<sub>` membership after a chosen retention period.

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
