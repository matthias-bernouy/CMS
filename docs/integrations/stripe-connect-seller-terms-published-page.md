# Stripe Connect seller terms from a published CMS page

`commerce-stripe-payments` can bind its seller agreement to one published CMS
page. The integration resolver supplies the exact published page snapshot to
the Stripe Connect provider during installation. The provider never fetches an
installation-supplied URL: it validates and hashes the trusted resolver payload
and archives the full page, link label, and consent statement.

The archived revision is append-only. Its public version is
`cms-page:<revision-sha256>` and its evidence hash is the SHA-256 digest of the
canonical published page. The mutable singleton configuration only points to
the current immutable revision. Seller acceptances reference that revision by
a composite foreign key and cannot be updated or deleted.

Both generic seller entry points obtain the same
`marketplaceTermsRequirement` from Stripe Connect:

- `commerce-offer-price-form`;
- `stripe-connect-onboarding`.

They render the server-returned consent statement and published page link,
require an unchecked explicit checkbox, and submit the exact displayed version
and hash. The acceptance RPC locks the current configuration and compares both
values before inserting evidence. A publication/configuration change between
display and submission returns `MARKETPLACE_TERMS_VERSION_CHANGED`; the UI
reloads the requirement and leaves consent unchecked.

## Configuration and publication lifecycle

The optional `sellerTermsDocuments` installation input accepts at most one
entry with a stable key, public label, exact consent statement, and `page-link`.
The page must already be published. After changing or republishing it, rerun
the linking integration so the resolver supplies the new published snapshot.
That creates a new immutable revision, makes it current, and requires a new
acceptance. Re-selecting a prior published revision safely reuses its existing
evidence and existing seller acceptances.

Stable `1.0.0` keeps the required `sellerTermsVersion` and `sellerTermsHash`
inputs as a rollout fallback. With no selected page, their validated pair
remains authoritative and existing installed artifacts retain their previous
behavior. Once a page-backed configuration is current, server state overrides
that fallback and older clients cannot manufacture acceptance: page-mode
acceptance requires the displayed compare-and-set pair.

Recommended rollout order:

1. update the Stripe Connect provider integration;
2. rerun `commerce-stripe-payments` with valid legacy fallback values and,
   optionally, the published seller page;
3. verify `getConnectStatus.marketplaceTermsRequirement`;
4. exercise both seller forms before enabling protected sales.

The assembled PostgreSQL contract
`stripe-connect-marketplace-terms` verifies fresh install, idempotent reapply,
page-mode compare-and-set rejection, legacy compatibility, immutable evidence,
forced RLS, and private RPC grants.
