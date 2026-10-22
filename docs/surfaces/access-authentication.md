# Access And Authentication

Identity and account operations are exposed by the required
`ulvia.cms.access` contract. The Kernel owns no authentication capability,
account store, administrator store, session secret or authentication route
family. Its only responsibilities are to resolve one request actor through
Access and to apply validated browser session effects returned by Access.

## Official Capabilities

The public account lifecycle is:

| Effect | Capability | Purpose |
| --- | --- | --- |
| query | `resolve-actor` | Resolve one opaque browser credential to anonymous, authenticated or administrator state. |
| command | `login-password` | Prove local credentials and establish a session. |
| command | `logout` | Clear the browser session. |
| command | `signup` | Create or resume a local account. |
| command | `request-email-verification` | Send a verification message without disclosing account existence. |
| command | `confirm-email-verification` | Consume a one-time verification token. |
| command | `request-password-reset` | Send a recovery message without disclosing account existence. |
| command | `confirm-password-reset` | Consume a one-time recovery token and set a password. |

The same contract exposes administrator-only `overview`, `list-users`,
`get-user`, `set-administrator`, `delete-user` and `update-site` capabilities.
An administrator is an ordinary account plus a revisioned Gateway-owned
administrator grant; authorization is not embedded in the authentication
subject record.

## Browser Flow

Pages use the ordinary declarative binding grammar. There is no `kernel.auth`
namespace or special browser transport:

```html
<form cms-mutation="ulvia.cms.access:login-password as session">
    <input name="email" type="email" autocomplete="username" required>
    <input name="password" type="password" autocomplete="current-password" required>
    <button type="submit">Log in</button>
</form>
```

The browser sends either the `cms-session` cookie or an
`Authorization: Bearer` credential. Kernel forwards exactly one opaque, typed
credential to the selected `ulvia.cms.access/resolve-actor` capability; it does
not forward arbitrary browser Cookie or Authorization headers to every
capability. A Bearer credential has precedence and never falls back to a cookie
when invalid. Actor resolution is memoized only for the lifetime of the current
request.

The Provider resolves the credential through `cms-auth`, joins the membership
with the administrator grant and returns the trusted actor state. Subsequent
capability calls are authorized and dispatched by Gateway; callers cannot
choose their own subject or administrator flag.

## Session Effects

`login-password` and `logout` declare the contract-level `session` response
effect. The Provider returns semantic data (`establish` with an opaque token and
expiry, or `clear`). Gateway accepts that effect only for a successful
capability whose admitted contract explicitly declares it. Session effects are
currently reserved to public synchronous structured commands in
`ulvia.cms.access`.

Only after validation does Kernel emit the fixed `cms-session` cookie with
`HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` on HTTPS and a bounded expiry.
Provider `Set-Cookie` headers never pass through. A provider cannot select a
cookie name, domain or policy.

The official collection contributes `/login`, `/confirm-email` and
`/reset-password` as ordinary Pages. The MVP implements local password
authentication only. OIDC is intentionally absent; magic links, passkeys or
OIDC can later be added as Access capabilities without adding Kernel-owned
authentication endpoints, provided they resolve through the same actor and
session-effect boundary.
