// `@bernouy/mt-delivery-cms` — multi-tenant build-time delivery cron.
//
// Hosts a single bun process that periodically iterates the same
// tenants registry used by `@bernouy/mt-cms-control`, and for every
// tenant with `delivery.enabled === true` runs `DeliveryBuilder.runOnce()`
// to render pages, generate variants, and upload everything to the
// tenant's public CDN bucket.

export { MtDeliveryCms }       from "src/exports/MtDeliveryCms";
export type { MtDeliveryCmsDeps } from "src/exports/MtDeliveryCms";
export { buildTenant }         from "src/core/tenant/buildTenant";
export type { BuildTenantOptions } from "src/core/tenant/buildTenant";
