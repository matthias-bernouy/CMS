# Public Authentication

Delivery mounts CMS-owned authentication under `/.cms/auth` when public auth is
configured. These routes work independently of provider selections and the
legacy Source repository.

| Method | Path | JSON body | Response |
| --- | --- | --- | --- |
| `GET` | `/.cms/auth/me` | none | `{ "subject": Subject \| null }` |
| `POST` | `/.cms/auth/login` | `{ "email": string, "password": string, "returnTo"?: string }` | Session response and cookie |
| `POST` | `/.cms/auth/logout` | none | `{ "ok": true }` and a cleared cookie |
| `POST` | `/.cms/auth/signup` | `{ "email": string, "password": string }` | `{ "ok": true }` |
| `POST` | `/.cms/auth/email/verification/request` | `{ "email": string }` | `{ "ok": true }` |
| `POST` | `/.cms/auth/email/verification/confirm` | `{ "token": string }` | `{ "ok": true }` |
| `POST` | `/.cms/auth/password/reset/request` | `{ "email": string }` | `{ "ok": true }` |
| `POST` | `/.cms/auth/password/reset/confirm` | `{ "token": string, "password": string }` | `{ "ok": true }` |

Signup is mounted only when the configured public auth actions allow it. It
creates a local credential and CMS membership, then sends the verification
message. Extra JSON fields are rejected by the auth action input parser.

Use `GET /.cms/auth/me` in a `cms-source` binding for account state. Action
forms can submit to the corresponding auth route. For example:

```html
<form cms-source="/.cms/auth/login" cms-source-method="POST" cms-source-trigger="submit">
  <input name="email" type="email" required>
  <input name="password" type="password" required>
  <button type="submit">Log in</button>
</form>
```

Delivery does not mount `/.cms/sources`. Provider data and file reads use
selected gateway capabilities under `/.cms/call`, `/.cms/media`, and
`/.cms/image`.
