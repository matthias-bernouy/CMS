# Stripe Connect seller terms from a published CMS page

Stripe Connect owns its seller agreement as runtime business state. The
agreement is no longer an installation answer of `commerce-stripe-payments`.
An administrator publishes it from the Stripe Connect seller-terms dashboard.

The dashboard accepts a stable document key, public label, exact consent
statement, and CMS published-page snapshot URL. The management Edge Function
downloads the public snapshot without forwarding CMS credentials, validates
its URL and payload, verifies its digest, and archives the page.

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

## Runtime publication lifecycle

The initial dashboard revision is `new`. Publication uses optimistic
concurrency: the submitted `expectedVersion` must still be current. A concurrent
publication returns `MARKETPLACE_TERMS_VERSION_CHANGED` instead of overwriting
another administrator's work.

Publishing or republishing a page creates or reuses its immutable revision and
makes it current atomically. Sellers who accepted another revision remain
attached to its evidence and must explicitly accept the new version. Selecting
a prior revision safely reuses its archived evidence and existing acceptances.

Legacy version/hash configuration remains readable during migration, but new
configuration is dashboard-owned. `commerce-stripe-payments` only consumes the
provider's current requirement and forwards the exact seller-visible version
and hash for compare-and-set acceptance.

An unconfigured provider returns an empty seller-capability snapshot. This lets
the linking integration install and activate its structural Commerce
requirement without inventing legal content. Sellers become ready only after
valid terms are published and accepted.

Recommended rollout order:

1. update the Stripe Connect provider integration;
2. open the Stripe Connect seller-terms dashboard and publish the current CMS
   page snapshot;
3. install or update `commerce-stripe-payments`;
4. verify `getConnectStatus.marketplaceTermsRequirement`;
5. exercise both seller forms before enabling protected sales.

The runtime management boundary is a separate additive Edge Function. The
existing Stripe payment function and its HTTP contract remain unchanged during
the rollout, so in-flight payment and onboarding calls do not switch code
implicitly.

The PostgreSQL and upgrade contracts verify fresh install, idempotent
publication, concurrent-publish rejection, legacy compatibility, immutable
evidence, forced RLS, private RPC grants, and preservation of a published page
and seller acceptance across an upgrade from `1.0.0`.
