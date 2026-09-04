# Site acceptance with local data

A persistent `ulvia dev` site complements release audits. It proves that a
useful composition of sources, collections, CMS content, and site-owned assets
works as a product. It must remain isolated from production data and secrets.

## Separate package data from site data

Install reusable capabilities before recreating the site:

- sources own schemas, business rules, endpoints, Storage, functions, and
  operator dashboard views;
- collections own reusable blocs, endpoint requirements, and theme contracts;
- the site owns pages, site blocs, logo, favicon, organization settings,
  navigation, SEO values, and `--site-*` overrides.

Do not add customer identity to a collection to make one acceptance site look
correct. A site header composed from collection blocs becomes a site bloc once
it contains the site's logo or navigation.

## Copy only public reference material

When an existing site is the visual reference, access it read-only and copy
only information already publicly delivered to visitors. Typical safe inputs
are the favicon, logo, page copy, public organization metadata, routes, and
theme values.

Keep the local host and local service URLs. Never copy production API keys,
cookies, provider credentials, webhook secrets, database dumps, private files,
or personal customer records. Remap legacy theme variable names to the current
contracts before saving copied CSS.

## Build fictional business state

Use reserved domains such as `.test`, clearly fictional names, and non-routable
contact details. Prefer real CMS Source calls over direct database inserts so
the fixture exercises validation, authorization, media handling, and business
transitions.

A marketplace acceptance dataset should normally include:

1. an administrator and several users with different roles;
2. configured taxonomies, brands, products, and local media;
3. verified and unverified sellers where both states matter;
4. draft, moderated, active, reserved, and unavailable offers;
5. at least one order visible to both its buyer and seller;
6. mutable runtime policy, legal, or consent data when the flow uses it.

Keep generated images in the selected `ULVIA_DATA_DIR`, not in Git and not in a
shared cache. The CMS should ingest them through the same local upload endpoint
used by normal authoring.

## Simulate external providers at their boundary

Local Auth, PostgreSQL, Storage, Edge Functions, MongoDB, and CMS endpoints are
real services. Third-party providers such as Stripe or a carrier may still be
stubs. Do not use production keys merely to make the fixture look complete.

If a provider callback is unavailable locally, simulate the smallest trusted
result at that boundary, then continue through the real domain command and
read models. Record which transition was simulated. This validates the CMS and
source behavior but is not evidence that provider onboarding, payment,
shipping, refunds, or webhooks work end to end.

## Acceptance matrix

Test public and authenticated behavior separately:

- public pages load with expected status, metadata, favicon, responsive layout,
  source data, empty states, filters, and navigation;
- a seller sees their own offers and sales but not another seller's private
  data;
- a buyer sees their orders and can reach the next valid action;
- operator dashboard views expose the same state through authorized endpoints;
- desktop and mobile captures have no blank page, overlapping content,
  undefined custom element, or browser exception;
- a restart preserves CMS content, selected resources, files, identities, and
  business records.

For a reference reconstruction, capture the same route and viewport matrix on
the reference and local sites. Compare structure and flows, not accidental
production data. Keep the screenshots outside Git unless they are intentional
test fixtures.

## What this does not replace

Local site acceptance does not replace `ulvia audit`. The audit verifies fresh
installation and every known upgrade in disposable environments. The
persistent site verifies one realistic composition and catches visual,
cross-source, and workflow problems that isolated conformance tests cannot.
