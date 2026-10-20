# Access authentication

Authentication is exposed by the required `ulvia.cms.access` contract. The
Kernel owns no authentication capability, user store, session secret or
authentication route family. Its only authentication responsibilities are to
resolve the request actor through `resolve-actor` and to apply validated browser
session effects returned by Access.

The official Access contract publishes these public capabilities:

| Effect | Capability | Purpose |
| --- | --- | --- |
| query | `resolve-actor` | Resolve the opaque browser credential to anonymous, authenticated or administrator state. |
| command | `login-password` | Prove local credentials and establish a session. |
| command | `logout` | Clear the browser session. |
| command | `signup` | Create or resume a local account. |
| command | `request-email-verification` | Send a verification message without disclosing account existence. |
| command | `confirm-email-verification` | Consume a one-time verification token. |
| command | `request-password-reset` | Send a recovery message without disclosing account existence. |
| command | `confirm-password-reset` | Consume a one-time recovery token and set a password. |

Pages use the ordinary declarative binding grammar. There is no `kernel.auth`
namespace or special browser transport:

```html
<form cms-mutation="ulvia.cms.access:login-password as session">
    <input name="email" type="email" autocomplete="username" required>
    <input name="password" type="password" autocomplete="current-password" required>
    <button type="submit">Log in</button>
</form>
```

Credential bytes are not part of a capability input. The browser sends either
the `cms-session` cookie or an `Authorization: Bearer` credential. The Kernel
forwards exactly one opaque credential to `resolve-actor`; the Provider resolves
it and joins the result with the Access administrator grant. A Bearer credential
has precedence and never falls back to a cookie when invalid.

`login-password` and `logout` declare the typed `session` response effect. The
Provider returns only semantic data (`establish` with token and expiry, or
`clear`). The Gateway validates that the selected contract and successful
capability response permit that effect. Only then does the Kernel emit the
fixed `cms-session` cookie with `HttpOnly`, `SameSite=Lax`, `Path=/` and
`Secure` on HTTPS. Provider `Set-Cookie` headers never pass through.

The official collection contributes `/login`, `/confirm-email` and
`/reset-password` as ordinary Pages. Adding another login method changes the
Access provider implementation and its contract capabilities; it does not add
Kernel-owned authentication code.
