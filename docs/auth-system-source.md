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
| `POST` | `/.cms/sources/system-auth/signup` | `{ "email": string, "password": string, "displayName"?: string }` | `{ "ok": true }` |
| `POST` | `/.cms/sources/system-auth/requestEmailVerification` | `{ "email": string }` | `{ "ok": true }` |
| `POST` | `/.cms/sources/system-auth/confirmEmailVerification` | `{ "token": string }` | `{ "ok": true }` |
| `POST` | `/.cms/sources/system-auth/requestPasswordReset` | `{ "email": string }` | `{ "ok": true }` |
| `POST` | `/.cms/sources/system-auth/confirmPasswordReset` | `{ "token": string, "password": string }` | `{ "ok": true }` |

`@bernouy/cms-control` mounts the same provider behind the admin guard and keeps
signup disabled there. `@bernouy/cms-delivery` can expose signup when its public
auth config allows it.

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
