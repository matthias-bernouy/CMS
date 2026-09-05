# Site acceptance with local data

A persistent `ulvia dev` environment complements integration release audits. It
lets a site repository exercise its real pages, assets, selected collections,
Sources, and workflows without production data or credentials.

## Keep the site outside CmsCore

CmsCore owns the reusable platform and its integration packages. A downstream
site repository owns all customer-specific material:

- pages, routes, copy, navigation, and site blocs;
- logos, favicons, media, organization details, and SEO configuration;
- locale, currency, country, business policy, and `--site-*` overrides;
- deterministic seed data and browser acceptance scenarios;
- screenshots and other visual-regression artifacts.

Do not copy a downstream site fixture into `ulvia-cli`, an official collection,
or another CmsCore package. The site should invoke `ulvia dev` as an external
development tool and populate the resulting CMS through supported APIs.

## Separate package data from site data

Install reusable capabilities before recreating the site:

- Sources own schemas, business rules, endpoints, Storage, functions, and
  operator dashboard views;
- collections own reusable blocs, endpoint requirements, and theme contracts;
- the site owns authored content, identity, configuration, and resource
  selection.

In the current official stack, Ulvia contributes the shared theme contract and
Mossa contributes reusable `mossa-*` blocs. The `forms` integration remains a
data Source; visual form controls belong to a collection or to native CMS
editing, not to a Source-owned renderer.

## Create an isolated environment

Use a dedicated persistent directory for each downstream project or test run:

```bash
export ULVIA_DATA_DIR=/tmp/my-site-acceptance
bun run ulvia -- release --all
bun run ulvia -- dev
```

An installed CLI can use `ulvia ...` directly. The site repository may then run
its own seed and browser-test commands against the Control and Delivery URLs
reported by `ulvia dev`.

Do not commit `ULVIA_DATA_DIR`, a MongoDB dump, a local repository, provider
credentials, or raw site snapshots. A deterministic seed should be source code
in the downstream repository and should rebuild state through CMS and Source
APIs.

## Use safe reference material

When an existing deployment is the visual reference, access it read-only and
copy only information already public to visitors. Never copy production API
keys, cookies, webhook secrets, database dumps, private files, or personal
customer records.

Use reserved domains such as `.test`, fictional identities, non-routable contact
details, and unmistakably local provider credentials. Prefer real Source calls
over direct database inserts so validation, authorization, media handling, and
business transitions remain exercised.

## Simulate providers at their boundary

Local Auth, PostgreSQL, Storage, Edge Functions, MongoDB, and CMS endpoints are
real services. External payment, shipping, email, or similar providers may use
integration-owned local simulators.

Simulate the smallest trusted provider result, then continue through the real
domain command and read models. A simulator validates local application
behavior; it is not proof that a production provider account, webhook, refund,
or payout works end to end.

## Downstream acceptance matrix

A site repository should test public and authenticated behavior separately:

1. install the exact collection resources and Sources the site declares;
2. create site content, configuration, users, media, and business data;
3. visit every public route and relevant empty, loading, success, and error
   state;
4. exercise representative authorized workflows through real Source endpoints;
5. check desktop and mobile layouts, browser errors, undefined custom elements,
   and local 404/5xx responses;
6. restart `ulvia dev` against the same data directory and prove that content,
   resource selections, files, identities, and business records survive;
7. audit and install candidate upgrades before repeating the same acceptance
   suite.

Keep screenshots in the downstream project only when they are intentional test
fixtures; otherwise write them to a temporary or ignored artifact directory.

## CmsCore smoke test

CmsCore retains one deliberately neutral system test:

```bash
ULVIA_RUN_LOCAL_E2E=1 \
bun test packages/runtimes/ulvia-cli/tests/cli/dev-local.e2e.test.ts
```

It verifies the local repository, one Supabase-backed Source, one generic CMS
page, Delivery rendering, and restart persistence. It is not a bundled example
site and does not replace acceptance in a downstream site repository.

## What this does not replace

Site acceptance does not replace `ulvia audit`. The audit verifies fresh
installation and known upgrades in disposable environments. A downstream site
suite verifies one real composition and catches visual, cross-Source, and
workflow problems that isolated conformance tests cannot.

Both checks remain local. Remote admission and deployment require their own
server-side verification and staging gates.
