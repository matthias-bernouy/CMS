# @bernouy/mailer-smtp

`Mailer` implementation backed by [`nodemailer`](https://nodemailer.com)
over SMTP. The single class lives at `src/SmtpMailer.ts` and is the only
public export.

## What it implements

The `Mailer` contract from `@bernouy/core`:

```ts
interface Mailer { send(message: MailMessage): Promise<void> }
type MailMessage = { to, subject, html, text?, from? }
```

Consumers that need transactional email (password reset, magic link, …)
inject one. Auth providers in `@bernouy/auth-*` accept a `Mailer` as an
optional dep — features that need email are disabled when none is wired.

## API

`DefaultSmtpMailer` (single export). Constructor takes a
`SmtpMailerConfig`:

```ts
type SmtpMailerConfig = {
    host: string;
    port: number;
    secure?: boolean;          // default false
    auth?: { user, pass };
    defaultFrom: string;       // used when MailMessage.from is absent
};
```

## Conventions

- **`nodemailer` is a peer dep, loaded dynamically.** The first `send()`
  call does `await import("nodemailer")` and caches the transporter.
  Consumers who only use a console / no-op mailer pay nothing — they
  don't even need `nodemailer` installed.
- **No `@types/nodemailer` requirement.** The transporter is typed `any`
  on purpose so consumers don't have to install the types package. If
  you change the call site of `transporter.sendMail`, mirror the
  nodemailer shape manually.
- The dynamic import handles both ESM (`nodemailer.createTransport`) and
  CJS interop (`nodemailer.default.createTransport`) — keep both
  fallbacks if you touch `transporter()`.

## Dependencies

- runtime: `@bernouy/core` (for `Mailer` + `MailMessage` types)
- peer: `nodemailer ^6.9.16`

## When to extend

Add another file in `src/` (e.g. `SesMailer.ts`) and export it from
`src/index.ts`. Do not split `SmtpMailer.ts` — at 59 lines it's well
under the 120-line per-file ceiling.
