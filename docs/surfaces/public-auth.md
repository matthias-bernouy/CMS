# Public Authentication

The Kernel mounts CMS-owned authentication under `/.cms/auth` when public auth is
configured. These routes work independently of provider selections.
Paths below are relative to the Kernel's base path. `@bernouy/cms-auth/http`
supplies the registrar, and the runtime injects the public auth operations.

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

Use `cms-query="kernel.auth:me as account"` for account state. The binding
runtime maps this closed Kernel query to `GET /.cms/auth/me`. Action forms can
submit to the corresponding auth route. For example:

```html
<form cms-mutation="kernel.auth:login as session">
  <input name="email" type="email" required>
  <input name="password" type="password" required>
  <button type="submit">Log in</button>
</form>
```

The Kernel does not mount `/.cms/sources`. Provider data, files and image
representations use selected gateway capabilities under `/.cms/call`.

See [binding forms](../blocs/data-bindings.md) for submission state and
[provider identities](../providers/README.md#identity) for the separate
provider alias contract. Public login establishes the CMS session; it does not
select or approve a provider installation.
