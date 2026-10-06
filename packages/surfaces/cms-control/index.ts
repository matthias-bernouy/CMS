/**
 * @bernouy/cms-control — public entry point.
 *
 * Mounts the Control kernel on the runner the consumer provides:
 *   - authentication and collection-page bootstrap routes
 *   - the shared `/.cms/*` Control transports
 *   - the binding and Bloc host runtime bundled as `control-runtime.js`
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
