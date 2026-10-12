# Local Provider And CMS Initialization

**Status (2026-10-12): local and Docker bootstrap operational.**

The development CLI seeds its persistent repository with the official
contracts, provider manifest and collection. The production image carries the
same pre-admitted snapshot. The CMS runtime then connects Ulvia Provider and
installs or upgrades the official collection before the site Kernel starts.
Provider-owned creation, update, stop, backup and restore operations remain
future lifecycle work.

## Responsibility Boundary

An instance provider owns CMS instance lifecycle, private instance routing and
its own credentials. Ulvia Provider implements the official `ulvia.cms.*`
capabilities by adapting feature-owned operations. The site Kernel owns Page rendering,
authentication, administration, assets and capability transport.

Provider credentials remain opaque durable secrets to CmsCore. A provider may
associate one with an account or instance by any private mechanism. For live
calls, the gateway derives a standard short-lived HMAC Bearer granting one exact
contract release capability for the opaque `instanceId` declared by the runtime
report. CmsCore does not copy provider-private routing data into collection
inputs or execution plans.

## Current Composition

The local stack contains:

```text
official repository
  -> exact contracts, provider manifest and collection release
Ulvia Provider
  -> provider-facing ulvia.cms.* capability implementation
site Kernel
  -> all local and collection Pages on one route registry
persistent MongoDB, files and encrypted secrets
```

The CLI starts the repository, Ulvia Provider and Kernel as separate local HTTP applications.
The production Compose stack uses one CMS service plus one private repository
service from the same immutable image. This proves offline bootstrap; it is not
yet a general provider implementation capable of provisioning arbitrary CMS
instances.

## Fresh Installation Flow

1. Start the private repository and make the verified bootstrap artifacts
   readable.
2. Initialize durable CMS stores and run adjacent data migrations.
3. Start Ulvia Provider and expose its admitted contract bindings.
4. Connect and select the official provider using the injected runtime
   credential.
5. Install or upgrade the official collection through the collection service.
6. Reconcile every collection and site Page in the single site route registry.
7. Mount the Kernel and derive each Page's access from its exact transitive
   capability plan.
8. Report readiness only after stores, routes, collection state, provider
   selection and both HTTP applications are consistent.

The repository contains admitted immutable artifacts; runtime startup never
reads the authored source folders. Repeating the sequence is idempotent.

## Administration Bootstrap

Provider administration and CMS administration are separate authorities. The
local composition creates the first CMS administrator from explicit deployment
configuration. Rich CMS administration is then delivered by ordinary
collection Pages. Those Pages use the same renderer and `/.cms/call` transport
as every other Page and become administrative because their required
capabilities require administrator access.

There is no `control` Page surface, separate administration route registry or
second renderer. Login and fatal recovery documents remain Kernel-owned because
they must work before an authored Page can be authorized and rendered.

## Recovery

Restart reopens the durable stores, resumes interrupted collection migrations,
reconciles Page routes and reactivates exact execution plans before readiness.
An incompatible collection or unavailable required provider keeps affected
writes unavailable instead of serving a mixed state. Provider lifecycle
recovery for creating, restoring or replacing whole CMS instances is still
outside the current `ulvia.cms.*` contracts.
