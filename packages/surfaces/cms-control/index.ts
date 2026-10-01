/**
 * @bernouy/cms-control — public entry point.
 *
 * Mounts the admin layer of the CMS on the runner the consumer provides:
 *   - server-rendered admin pages under `<basePath>/admin/*`
 *   - REST API under `<basePath>/api/*`
 *   - admin web components bundled as `control-components.js`
 *
 * Persistence (content, files, secrets), the auth chain, and the public
 * Delivery layer live in separate packages — pick the impls that fit your
 * deployment and pass them in.
 */

// ── Admin composition root ─────────────────────────────────────────────
export { ControlCms, ControlCms as Cms } from "./src/ControlCms";
export type { ControlCmsOptions } from "./src/ControlCms";
// Browser-safe Bloc compilation uses the `@bernouy/cms-control/component`
// sub-entry, which exposes only `Component` and keeps server code out of view
// bundles.
