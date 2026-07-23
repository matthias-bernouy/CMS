# Analytics Privacy and CNIL Compliance Plan

Status: implemented technical architecture; deployment governance remains
site-specific.

This document defines the CmsCore `privacy-strict` analytics profile intended
to fit the French CNIL audience-measurement consent exemption. It is an
engineering and compliance plan, not legal advice, a certification, or proof
that a deployed site is compliant. Removing a consent banner remains
conditional on the whole site, its integrations, infrastructure, purposes, and
actual configuration.

The product acceptance target is that `cms-analytics` itself can run without
prior consent or an analytics consent banner once every gate in this document
passes. The site must still provide the required information and durable
opt-out. A different tracker or processing purpose elsewhere on the site can
independently require consent.

Official references:

- [CNIL audience-measurement guidance](https://www.cnil.fr/fr/cookies-solutions-pour-les-outils-de-mesure-daudience)
- [CNIL July 2025 self-assessment](https://www.cnil.fr/sites/default/files/2025-07/outil_d_auto-evaluation_mesure_d_audience.pdf)
- [CNIL guidance on anonymisation](https://www.cnil.fr/fr/technologies/lanonymisation-de-donnees-personnelles)
- [GDPR Article 11 through the CNIL](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre2)
- [Article 82 of the French Data Protection Act](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000037813978)
- [EDPB Guidelines 2/2023 on URL and pixel tracking](https://www.edpb.europa.eu/system/files/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf)

## Product decisions

CmsCore makes the following decisions for the consent-exempt profile:

1. `privacy-strict` is the fail-closed default.
2. Page views, page entries, external referring domains, direct same-site
   transitions, request health, and coarse technical breakdowns use aggregate
   counters only. No raw event is retained.
3. Visitor estimation uses a per-site, per-day HLL++ sketch. The
   `analytics_seen` per-visitor collection is removed.
4. The visitor input is ephemeral: it is used to update the sketch and is never
   persisted as a row or raw event.
5. IPv4 is truncated to `/24`; IPv6 is truncated to `/48`.
6. The User-Agent contributes only coarse device and browser categories.
7. Reports publish only thresholded, rounded data from closed buckets.
8. Opt-out is part of the first technical delivery and is evaluated before any
   visitor input is constructed.
9. Settings owns privacy configuration and compliance. Analytics dashboards
   only consume protected reports.
10. A future `advanced` profile cannot exist without a consent-aware event
    gateway.
11. UTM parameters, campaign identifiers, marketing acquisition
    classification, conversions, integration joins, cohorts, and individual
    journeys are unavailable in `privacy-strict`.
12. Referrer collection is limited to a normalized external registrable domain.
    It never retains the external URL, path, query, fragment, or campaign
    parameter.

This referrer decision is intentional. The CNIL self-assessment permits
collection when the referrer is limited to its host, while separately requiring
UTM/campaign identifiers and marketing acquisition measurement to be disabled.
CmsCore applies the stricter registrable-domain reduction and keeps the result
independent from HLL++, accounts, orders, and integrations.

These choices deliberately sacrifice exact low-volume analytics, rolling
visitor identity, recurring-visitor reports, and marketing attribution in order
to retain a credible consent-exempt default. They still provide useful content,
traffic-origin, navigation, device, browser, performance, and request-health
analytics.

## Implementation status

The `privacy-strict` technical path is implemented across `cms-analytics`,
Delivery, Control, and the production/development composition roots:

- minimized page observations are converted directly into versioned aggregate
  counters;
- one global site/day HLL++ estimate replaces per-visitor rows;
- Delivery applies opt-out and GPC before event construction;
- strict reports enforce closed windows, `k = 10`, suppression, `Other`, and
  rounding for every API consumer;
- Settings owns collection controls, retention, evidence, and publishable
  compliance snapshots;
- Analytics exposes Overview, Content, Traffic origins, and Request health
  through its secondary navigation;
- legacy unversioned rollups and `analytics_seen` rows are purged by the
  idempotent store migration at initialization.

This implementation does not itself authorize removal of a banner. The
automatic checks cover the CmsCore component; the published notice, full-site
tracker audit, infrastructure logs, roles, transfers, legal basis, and
legal/DPO review remain deployment gates.

## Legacy gaps addressed

The implementation started from the following verified legacy gaps. They are
retained here as migration rationale and are no longer descriptions of the
current strict path:

- the visitor fingerprint receives the complete IP address and User-Agent;
- the daily salt is not scoped to the visited site;
- forwarded addresses are trusted by default;
- acquisition and external-referrer counters are always written without a
  profile gate;
- content views do not require a resolved page ID;
- Delivery does not pass the resolved page ID to analytics;
- page and flow counters can contain raw paths;
- reports expose exact low-volume values from live windows;
- `analytics_seen` stores one pseudonymous row per daily visitor for 48 hours;
- rollups have no expiry;
- production creates a random secret when configuration is missing;
- visitors have no durable opt-out;
- `uniqueVisitors` is a sum of daily uniques, not unique people over a range.

The current random secret is also a correctness defect. Restarts and replicas
derive different identities, causing the same person to be counted repeatedly.
The production secret must be stable over time and shared by every Delivery
instance for the site.

Storage isolation alone is insufficient in a multi-tenant environment.
Identical identifiers in separate collections can still be correlated.
Identifier derivation and storage must both be tenant-scoped.

## Privacy profiles

Introduce an explicit profile:

```ts
type AnalyticsPrivacyProfile = "privacy-strict" | "advanced";
```

`privacy-strict` permits only content counts, coarse device and browser
categories, request performance and health, aggregated same-site transitions,
observed entry pages, normalized external referring domains, and estimated
daily visitors.

It rejects UTM and campaign identifiers, marketing acquisition classification,
conversion marketing, account or CRM identifiers, integration data,
cross-source joins, raw events, cross-site identity, multi-day identity, and
individual journeys.

`advanced` is reserved for future work. The runtime and admin must reject it
until a consent-aware collection gateway can prove that an event is authorized.
It must never be enabled implicitly or by a dashboard toggle. Campaign
counters, even if aggregate and unconnected to a visitor, belong to this future
profile because the CNIL self-assessment explicitly requires UTM and campaign
identifiers to be disabled for the audience-measurement exemption.

## Ephemeral visitor input

The strict visitor input is derived only after minimisation:

1. truncate IPv4 to `/24`;
2. truncate IPv6 to `/48`;
3. map missing or invalid addresses to a fixed category;
4. reduce User-Agent to coarse `device` and `browser` values;
5. calculate an HMAC containing an algorithm version, site scope, UTC day,
   truncated address, device, and browser.

```text
HMAC-SHA-256(
  secret,
  profileVersion | siteScope | utcDay | truncatedIp | device | browser
)
```

`/48` is intentionally more privacy-preserving than `/56`, because it retains
eight fewer IPv6 address bits. It may still correspond to a household or
organization for some providers, so the choice and its measurement impact must
remain documented. A future move to a coarser `/40` or `/32` requires accuracy
testing; `/56` is not an acceptable strict-mode hardening.

The HMAC output rotates daily and differs across sites. It exists only in
memory while updating the daily sketch. It is not added to a raw-event log or
stored in a per-visitor document.

This is an ephemeral pseudonymous input, not a claim that no pseudonymisation
ever occurs. The request IP remains personal data while it is being processed.
The strict guarantee is that neither the address nor the derived visitor input
is retained, exposed, or associated with content, referrers, transitions, or
integration data.

The analytics secret is mandatory in production, stable over time, shared
between replicas, and never logged. The site scope uses a stable tenant ID or
normalized public origin and base path. Changing either input resets daily
visitor estimation and must be an explicit operational action.

Proxy trust defaults to disabled. A runtime may trust `X-Forwarded-For` only
behind a known proxy that overwrites client-supplied forwarding headers.
Production enables it with `ANALYTICS_TRUST_PROXY=true` and records the
deployment verification separately with
`ANALYTICS_TRUSTED_PROXY_VERIFIED=true`; the compliance gate fails closed when
trust is enabled without that attestation.

## Daily visitor estimation

Replace `analytics_seen` with per-site, per-day HLL++ sketches. HLL++ is
required instead of a minimal original-HLL estimator because low cardinalities
are the normal case for early CmsCore sites.

The initial precision is `p = 12`, or 4,096 logical registers, yielding an
approximate standard error of 1.6%. The implementation uses a 64-bit hash,
native sparse representation, linear counting at low cardinality, LogLog-Beta
bias correction, and a bounded transition to dense registers. Each request
derives a register index and rank from the site/day HMAC and atomically applies
the register maximum.

Register maximum is idempotent and commutative. Duplicate updates are harmless,
update order does not matter, and lost best-effort writes only cause
underestimation. This makes HLL++ compatible with the fire-and-forget Delivery
write path and safe to merge across replicas.

The sketch changes visitor storage from one record per estimated visitor to
bounded per-site/day state. It removes the large deduplication index and the
cleanup workload associated with `analytics_seen`. It does not eliminate
page-view processing or the aggregate counter writes.

An optional short-lived in-process combiner may batch register maxima before
Mongo writes. It stores only register indexes and ranks, flushes at a bounded
interval, has bounded memory, and accepts small undercounting after a process
crash. Counter increments for a request should likewise use one ordered bulk
operation rather than independent network round trips.

A single tenant/day document is nevertheless a potential WiredTiger hot
document. The store therefore supports `N` striped sub-sketches. Each update
chooses a stripe independently without putting visitor-derived material in the
document key. Finalization merges every stripe register-by-register with
`max`, producing the same logical sketch as an unstriped stream.

The default is 16 stripes. A repeatable local MongoDB 8 benchmark
(`tests/hll/stripeBenchmark.ts`) paced 50, 100, 250, 500, and 1,000 atomic
register-max updates per second with 1, 4, 8, and 16 stripes. One representative
run produced:

| Target updates/s | 1 stripe conflicts | 4 stripes | 8 stripes | 16 stripes |
| ---: | ---: | ---: | ---: | ---: |
| 50 | 73 | 1 | 1 | 1 |
| 100 | 332 | 40 | 4 | 4 |
| 250 | 1,457 | 441 | 135 | 11 |
| 500 | 2,593 | 919 | 391 | 90 |
| 1,000 | 5,067 | 2,291 | 906 | 439 |

Every run completed without operation errors and sustained the target rate on
the local single-node container. Across two runs at 1,000 updates/s, p95 was
10.63–15.09 ms for one stripe, 6.16–7.12 ms for four, and 6.20–6.74 ms for
sixteen. The paced burst harness makes p99 unsuitable as a capacity promise;
it ranged roughly 304–351 ms. Average BSON document size at 1,000 updates was
8,563 bytes for one stripe and 674 bytes per document for sixteen stripes.
A container sample observed 22.98% CPU and 136.6 MiB memory, but this local
sample is not a production sizing guarantee. Sixteen stripes cut measured
write conflicts by about 91% versus one stripe and 81% versus four at the
highest tested rate, for only sixteen bounded site/day documents.

An hourly finalizer processes closed UTC days:

1. read the closed striped sketches;
2. merge all stripes with register-wise `max`;
3. calculate the HLL++ estimate;
4. idempotently set the daily visitor-estimate rollup;
5. mark the sketches finalized;
6. allow their 48-hour TTL to delete them.

Finalization is restart-safe and never uses `$inc` for the final daily value.
The 48-hour grace period permits recovery after a delayed worker or deployment.
Dashboards never query an open sketch and do not expose its registers.

HLL++ removes per-visitor persistence and substantially reduces
linkability, but it is not declared anonymous merely because it is a sketch.
It remains an internal derived dataset subject to access control, tenant
isolation, short retention, and the self-assessment. Only the protected report
boundary is presented as anonymous output.

Daily estimation means CmsCore does not promise recurring visitors, cross-day
deduplication, or rolling-24-hour unique people. The visitor card is labelled
`Estimated visitors — last completed UTC day`; it does not reuse the generic
`24h` label. Page-view and health charts may still use the last 24 completed
hour buckets. Longer ranges expose visitor-day estimates and daily averages,
not unique persons over the whole range.

HLL++ estimates distinct daily visitor inputs. It does not measure visits or
sessions. A site that needs only page views, referrers, and transitions may
disable visitor estimation entirely; in that configuration analytics never
constructs the address-derived HMAC.

Only one global visitor sketch exists per site and UTC day. There are no
per-page, per-referrer, per-device, per-browser, per-transition, or
per-integration visitor sketches.

## Strict collection and filtering policy

### Counted content views

Content views require a successfully resolved CMS page and stable page ID.
Unmatched requests, 404s, redirects, and server errors may contribute only to
bounded request-health counters. Arbitrary scanner paths never become content
dimensions.

A request counts as a content view only when all of the following are true:

- the method is `GET`;
- Delivery resolved a stable CMS page ID or an explicitly approved bounded
  route-template identity;
- the resolved response represents HTML content;
- the final status is `2xx` or `304`;
- the request is not an asset, API, admin, system, privacy, preview, or health
  endpoint;
- the request is not classified as automation, link preview, prefetch, or
  synthetic monitoring.

`HEAD`, `OPTIONS`, redirects, errors, unknown routes, and non-HTML responses
never increment content, entry, transition, referrer, or visitor metrics.
Request health remains a separate bounded dataset and never falls back to raw
paths.

### Bot, automation, and pollution filtering

Filtering is a versioned pipeline rather than one ad-hoc User-Agent regular
expression. It combines:

- a maintained and tested signature set for conventional crawlers, SEO tools,
  AI crawlers, command-line clients, scraping frameworks, link unfurlers,
  vulnerability scanners, and synthetic monitors;
- explicit detection of empty or malformed User-Agents;
- `Purpose`, `Sec-Purpose`, and equivalent prefetch or prerender signals;
- method, resolved endpoint kind, response content type, and final status;
- bounded write budgets and dimension cardinality;
- self-referral removal and strict external-referrer parsing.

Known automation includes, without being limited to, `curl`, `wget`,
`python-requests`, `aiohttp`, `Scrapy`, Go HTTP clients, Playwright/Puppeteer
defaults, Googlebot, Bingbot, GPTBot, CCBot, ClaudeBot, Bytespider, Ahrefs,
Semrush, DotBot, Slackbot, Discordbot, WhatsApp previews, and social-card
fetchers. Signatures live in a maintainable data module with fixtures and an
explicit `filterVersion`; they are not scattered through handlers.

Automation and malformed requests may increment coarse operational exclusion
counters, but never human page views or HLL++. Analytics does not retain raw
User-Agents, IP addresses, unknown paths, or rejected referrer values for
debugging. Operational server, CDN, and firewall logs are separate processing
activities with their own retention and compliance review.

Filtering must fail closed when route identity, proxy trust, origin, or event
classification is ambiguous. Updating a filter version is documented and does
not rewrite historical totals.

### Allowed aggregate dimensions

The strict rollup allowlist is:

- `pv|all`;
- `pv|page`;
- `pv|device`;
- `pv|browser`;
- `entry|page`;
- `pv|referrer`;
- `flow|edge` between safe page identities;
- bounded request-health status, latency-bin, and exclusion-reason metrics;
- finalized daily visitor estimates.

`pv|acquisition` is disabled. CmsCore does not classify traffic into marketing
channels, calculate campaign performance, or infer conversions in strict mode.
The Traffic origins report is a literal view of aggregate external referring
domains, not an acquisition-attribution report.

Delivery supplies the resolved current page ID. Both ends of an internal
navigation edge must resolve to safe CMS page IDs or normalized route-template
identities. Raw dynamic paths, query strings, form values, email addresses,
tokens, and account identifiers are rejected.

### Referrers, entries, and transitions

For a valid content request, Delivery parses `Referer` as follows:

1. a same-site referrer is resolved to a safe page identity;
2. a resolved different page produces one direct `flow|edge`; a same-page
   referrer produces no edge, so refreshes do not become self-transitions;
3. a request with a safe same-site predecessor produces neither an entry nor a
   traffic-origin increment;
4. every other valid content request produces one `entry|page` increment;
5. an external HTTP or HTTPS referrer on that entry request is reduced to a
   lowercase, canonical registrable domain using a maintained Public Suffix
   List and increments `pv|referrer`;
6. scheme, credentials, port, path, query, fragment, subdomain detail, and URL
   parameters are discarded before the counter write;
7. an entry request with an absent, invalid, disallowed, or
   privacy-suppressed external referrer increments only the aggregate
   `No external referrer` category.

`No external referrer` must not be labelled `Direct`: bookmarks, applications,
privacy settings, referrer policies, and intermediaries can all suppress the
header.

External referrer storage uses a fixed-capacity frequent-item structure or
equivalent bounded heavy-hitter admission policy per bucket. Overflow is
aggregated into `Other`; a first-seen cardinality cap is forbidden because a
scanner could fill it before legitimate traffic arrives. The UI exposes when a
bucket saturated.

An `entry|page` increment means that a content request had no safe same-site
predecessor. It is an observed entry request, not a new session or a unique
visitor. Referrer headers can be absent or client-controlled, so origin reports
describe observed request signals rather than verified human provenance.

Internal edges are direct aggregate increments and never create sessions. A
report may state that `40% of observed outgoing transitions from Home went to
Profile` when both numerator and denominator are publishable. It must not state
that `40% of users followed that journey`.

The graph is necessarily incomplete because browsers and site policies may
suppress `Referer`. It supports direct A-to-B transitions only; it cannot
reconstruct an individual A-to-B-to-C path, a session funnel, an exact exit
rate, or a journey leading to a conversion.

### Campaign parameters

Strict analytics never reads or stores `utm_*`, `gclid`, `fbclid`, `msclkid`,
CRM IDs, affiliate IDs, or equivalent campaign parameters. Page counters use
the resolved page identity, so query variations cannot create new content
dimensions.

Renaming a campaign parameter or embedding it in a landing-page path does not
change its marketing purpose. The self-assessment documentation instructs site
owners not to distribute tracked campaign URLs when relying on the strict
exemption. If another part of the site consumes such identifiers, it is outside
strict analytics and requires separate legal and consent evaluation.

## Public privacy routes

Use an explicit privacy namespace rather than `/.cms/default/*`. Delivery
registers these routes before the default page GET:

```text
GET  /.cms/privacy/analytics
POST /.cms/privacy/analytics/opt-out
POST /.cms/privacy/analytics/enable
GET  /.cms/privacy/analytics/self-assessment
```

The main GET returns a no-JavaScript-required HTML page describing collection,
exclusions, retention, current preference, and links to the privacy policy and
published self-assessment. It includes opt-out and enable forms.

Responses use:

```text
Cache-Control: private, no-store
Vary: Cookie
Referrer-Policy: no-referrer
```

The opt-out POST stores only a first-party boolean:

```text
p9r_analytics_opt_out_<site>=1
```

The cookie is `HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS, has no `Domain`,
uses the tenant base path or `/`, and has a proposed non-rolling 13-month
lifetime. The enable POST clears it with `Max-Age=0`. Both POST routes validate
the origin and return a `303`. GET requests never mutate the preference.

Delivery checks this preference before reading IP or User-Agent data, deriving
the HMAC, constructing an analytics event, or invoking the store. `Sec-GPC: 1`,
and optionally `DNT: 1`, may suppress the current request as defence in depth
but do not replace the clickable opt-out.

## Anonymous report boundary

Protection belongs in the feature read layer so every API, dashboard, and
future export receives the same result. UI-only masking is insufficient.

The initial publication policy is:

- require at least 10 observations for a key, category, or edge;
- omit rare keys rather than revealing their existence;
- group suitable suppressed values into `Other`;
- round published counts to the nearest ten;
- derive percentages only from publishable values;
- omit latency maxima and rates when their denominator is insufficient;
- support only fixed `24h`, `7d`, and `30d` windows;
- anchor reports to completed hour or day buckets;
- apply the same rules to exports and every dimension combination.

Completed buckets prevent polling an incrementing counter and correlating it
with an individual visit. Exact low-volume analytics do not belong in
`privacy-strict`. Small sites will often have useful total traffic trends while
high-cardinality page, browser, and transition breakdowns remain sparse.

The UI uses `Estimated daily visitors` and `Average daily visitors`, never
`Unique visitors` across a range. It uses `Observed navigation transitions`
instead of `User journeys`, `Observed entry requests` instead of `Sessions`,
and `No external referrer` instead of `Direct traffic`.

Report metadata includes the active filter, rollup, visitor-estimator, and
privacy-policy versions, the last closed bucket, suppressed-value count, and
dimension-saturation state. This makes changes in totals explainable without
exposing rejected requests or low-volume dimensions.

CmsCore documents the metric contract:

- page views are filtered valid content responses, not all HTTP GET requests;
- referrer counts are arrivals carrying an external registrable domain, not
  people or attributed conversions;
- entries are requests without a safe same-site predecessor, not sessions;
- transitions are observed direct A-to-B edges, not individual paths;
- estimated visitors are HLL++ estimates for one closed UTC day;
- health totals include bounded request classes but never arbitrary paths.

## Retention and isolation

Active HLL++ sketches expire after 48 hours. Rollups gain an `expiresAt`
field and TTL index. Expiry is fixed on bucket creation and is never extended
by later increments.

Strict rollup retention is 395 days by default and configurable only downward
to one day. Shortening retention also shortens existing Mongo expiry dates and
removes already-out-of-range aggregates. Retention is periodically reviewed.
Deleting a site deletes its tenant-scoped sketches and rollups.

Every customer has separate storage scope and site-scoped HMAC input. CmsCore
does not pool client analytics, calculate cross-client reach, or reuse data for
its own purposes.

## Data-subject rights

The processing does not create a civil, account, or durable analytics identity.
CmsCore must not collect additional information solely to identify a person for
a rights request.

The operating procedure is:

- publish clear information and a contact path;
- apply opt-out immediately to future requests;
- explain that no per-visitor analytics record is retained;
- allow active sketches to expire within 48 hours;
- apply access or erasure when the requester provides sufficient additional
  information and the controller can actually identify relevant personal data;
- document when GDPR Article 11 applies because identification is impossible;
- treat effectively anonymized published statistics as outside individual
  access and erasure.

The controller or DPO decides each request. The product must not claim that
access and erasure are categorically impossible, nor build new identifying
data merely to answer them.

## Administration and self-assessment

Configuration and compliance belong under `Settings > Privacy & analytics`.
Dashboards only consume protected data.

Analytics uses the same secondary navigation pattern as Integrations. The
strict profile initially exposes four static dashboards:

1. `Overview`: protected page-view trend, estimated visitors for the last
   completed UTC day, average daily visitors, device/browser summaries, and
   filter-health notices.
2. `Content`: top CMS pages, observed entry pages, and protected direct
   navigation transitions, including next-page percentages based on
   publishable outgoing edges.
3. `Traffic origins`: top normalized external referring domains and the
   `No external referrer` category. It contains no campaigns, UTM values,
   marketing-channel classification, or conversion attribution.
4. `Request health`: bounded status classes, latency distributions, excluded
   automation counts, unmatched-request totals, and filter-version changes.

There is no raw analytics-log dashboard because strict analytics does not
persist raw requests or events. Infrastructure logs remain outside
`cms-analytics`.

Settings shows analytics enablement, active profile, address masks, HMAC
rotation, sketch state, report threshold, retention, proxy and secret readiness,
site scope, filter version, last closed bucket, referrer-capacity saturation,
secure-cookie state, public opt-out URL, notice text, and self-assessment
status.

Initially, administrators may disable analytics, shorten retention, and publish
documentation. Visitor estimation may be disabled independently, leaving only
pure aggregate counters and no address-derived HMAC. Compliance-critical
parameters stay locked by the profile. Marketing acquisition and campaign
dashboards are absent in strict mode.

The complete evaluator is admin-only:

```text
GET  /api/analytics/compliance
POST /api/analytics/compliance/snapshots
```

Each criterion has a stable ID, `pass`, `fail`, `manual-review`, or
`not-applicable` status, evidence, and required actions. A snapshot records the
CmsCore version, profile version, CNIL checklist version, date, non-secret
configuration fingerprint, automatic checks, and manual attestations.

The public self-assessment route serves only the last explicitly published,
sanitized snapshot. Configuration changes mark it stale. It must never claim
that CmsCore is "CNIL certified" or "CNIL approved".

Manual evidence covers actual purpose, notice publication, RGPD legal basis,
processing register, DPA and processor role, lack of provider reuse, hosting
and transfers, customer isolation, other site trackers, data-subject request
handling, and CDN/proxy/server log policies.

## Implemented sequence

Stages 0 through 4 below are implemented for the CmsCore technical component.
The list remains the traceability map for code review and future migrations.
The banner may be removed for this analytics component only after the
deployment-specific no-prior-consent release gate and all organizational
requirements are met.

### Stage 0 — contracts and visitor-estimation spike

- add the `privacy-strict` profile and forbidden-capability checks;
- freeze the metric semantics for page views, entries, referrers, transitions,
  health counters, and visitor estimates;
- prototype 64-bit HLL++ sparse/dense behavior, bias correction, atomic
  register updates, estimation, and idempotent finalization;
- use one ordered bulk counter write per request; an in-process HLL combiner
  remains optional because striped atomic updates met the local benchmark;
- compare unstriped storage with `4`, `8`, and `16` striped sketches;
- load-test `50`, `100`, `250`, `500`, and `1,000` updates per second;
- measure Mongo write conflicts, retries, p95/p99 latency, CPU, and BSON size;
- prove that striped merging produces the same logical register set;
- test accuracy from 10 to 1,000 distinct inputs and across the dense
  transition;
- verify multi-replica duplicates, losses, restart recovery, and TTL behavior;
- document the measured threshold that requires striping;
- freeze the visitor algorithm, sketch schema, filter, and rollup versions.

The HLL++ spike passed its local concurrency and recovery criteria.
`analytics_seen` is not part of the resulting architecture.

### Stage 1 — stop over-collection and add opposition

- count only resolved HTML content GETs with accepted final statuses;
- add the versioned bot, automation, preview, and prefetch filter pipeline;
- minimize IP and User-Agent before HMAC derivation;
- add site/day HMAC scope;
- require a stable shared production secret;
- make proxy trust fail-closed;
- disable marketing acquisition and all campaign-parameter collection;
- normalize external referrers to registrable domains and add bounded
  heavy-hitter storage;
- require and propagate page IDs;
- add aggregate entry-page and safe direct-edge counters;
- reject raw page, referrer, and flow paths;
- add rollup and sketch TTLs;
- mount public privacy routes before the page wildcard;
- enforce opt-out before all visitor processing.

This stage was implemented before the anonymous publication boundary.

### Stage 2 — anonymous publication

- implement threshold, suppression, `Other`, and rounding;
- use completed fixed buckets;
- prevent filter combinations and polling from isolating visits;
- add report metadata for filtering, saturation, privacy versions, and closed
  buckets;
- update visitor, referrer, entry, and navigation labels;
- build the four strict dashboards and secondary navigation;
- apply protection to all APIs and future exports.

### Stage 3 — migration

- version the visitor algorithm and HLL++ schema;
- stop legacy acquisition and unnormalized referrer writes;
- purge acquisition, legacy referrer, unsafe raw-path, and unsafe flow rollups;
- start a fresh referrer series under the strict normalization version;
- stop creating `analytics_seen` rows after HLL++ activation;
- purge legacy seen rows during the controlled idempotent migration;
- do not combine incompatible visitor algorithms;
- verify TTLs, site scopes, and shared secrets in every environment.

### Stage 4 — governance and admin

- add Settings status and safe controls;
- add the compliance evaluator and snapshots;
- publish notice and self-assessment templates;
- document DPA, controller/processor roles, rights handling, logs, hosting, and
  transfers;
- audit every site cookie, script, embed, and integration.

## No-prior-consent release gate

The analytics component qualifies for its no-prior-consent deployment profile
only after:

- `privacy-strict` is active in production;
- the opt-out prevents all visitor-input construction;
- marketing acquisition, UTM, campaign, conversion, and integration analytics
  are absent;
- external referrers are limited to normalized registrable domains and bounded
  aggregate storage;
- bot, automation, preview, prefetch, route, response, and status filtering is
  active and tested;
- visitor estimation no longer persists per-visitor rows;
- reports and exports enforce anonymous publication;
- retention and tenant isolation are operational;
- the privacy notice and opt-out link are published;
- the self-assessment is complete and current;
- all other cookies, scripts, embeds, integrations, and infrastructure logs
  have been reviewed;
- hosting, transfers, DPA, legal basis, and rights procedures are documented;
- the responsible legal or DPO review is complete.

Another non-exempt tracker can still require consent even when CmsCore
analytics satisfies the strict profile.

## Validation

Implementation uses an isolated worktree and runs
`bun install --frozen-lockfile` plus `bun run check:all` before changes.

Focused tests cover:

- valid HTML page-view admission and every excluded request class;
- maintained bot, automation, scanner, link-preview, prefetch, and malformed-UA
  fixtures;
- filter-version changes and bounded exclusion counters;
- IPv4 and IPv6 truncation;
- coarse User-Agent inputs;
- HMAC site/day rotation and cross-site separation;
- stable shared secrets across restarts and replicas;
- fail-closed proxy trust;
- HLL++ low-cardinality accuracy, bias correction, sparse/dense transition,
  register updates, and error bounds;
- hot-document contention, stripe distribution and merging at
  `50`–`1,000` updates per second;
- multi-replica duplicates and losses, finalization, restart, and TTL behavior;
- opt-out ordering, origin validation, and cookie attributes;
- registrable-domain normalization, self-referrals, invalid referrers, Public
  Suffix List behavior, saturation, heavy-hitter admission, and `Other`;
- strict rejection of UTM, click IDs, CRM IDs, and campaign dimensions;
- forbidden-dimension enforcement, page-ID requirements, observed entries, and
  safe direct edges;
- threshold, suppression, rounding, closed windows, and differencing resistance;
- report wording, denominator protection, and metadata;
- secondary navigation and the four strict dashboards;
- Delivery route ordering;
- Mongo rollup TTLs and tenant isolation;
- stale self-assessment snapshots.

After implementation, run `bun run format`, inspect the diff, and run
`bun run check:all` again in the same worktree. Resolve all new errors,
warnings, and blocking quality findings before handoff.
