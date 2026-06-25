# System Auth Gateway

The readonly `system-auth` provider exposes CMS-owned authentication through the
same data-source catalogue as regular gateway providers. It is intended for
site-authored login, signup, verification and reset pages; the CMS does not ship
public auth blocs by default.

## Runtime Path

When a surface is configured with both a gateway repository and public auth,
these endpoints are available on the site origin:

| Method | Path | JSON body | Response |
| --- | --- | --- | --- |
| `GET` | `/.cms/gateway/system-auth/me` | none | `{ "subject": Subject \| null }` |
| `POST` | `/.cms/gateway/system-auth/login` | `{ "email": string, "password": string, "returnTo"?: string }` | `{ "subject": Subject }` and a session cookie |
| `POST` | `/.cms/gateway/system-auth/logout` | none | `{ "ok": true }` and a cleared session cookie |
| `POST` | `/.cms/gateway/system-auth/signup` | `{ "email": string, "password": string, "displayName"?: string }` | `{ "ok": true }` |
| `POST` | `/.cms/gateway/system-auth/requestEmailVerification` | `{ "email": string }` | `{ "ok": true }` |
| `POST` | `/.cms/gateway/system-auth/confirmEmailVerification` | `{ "token": string }` | `{ "ok": true }` |
| `POST` | `/.cms/gateway/system-auth/requestPasswordReset` | `{ "email": string }` | `{ "ok": true }` |
| `POST` | `/.cms/gateway/system-auth/confirmPasswordReset` | `{ "token": string, "password": string }` | `{ "ok": true }` |

Control mounts the same provider behind the admin guard and keeps signup
disabled there. Delivery can expose signup when its public auth config allows it.

## Authoring Contract

Use `GET /.cms/gateway/system-auth/me` as a normal `cms-source` to render
authenticated/anonymous states.

Use action endpoints from custom blocs or forms with a JSON payload:

```js
await fetch("/.cms/gateway/system-auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
});
```

The editor source catalogue includes `method`, response fields, and the JSON
request-body fields for action endpoints. Structure data-source binding still
only offers `GET` sources, so login/reset actions are not accidentally inserted
as `cms-source` fetches.
