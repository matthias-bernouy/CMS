/**
 * @bernouy/cms-control — public entry point.
 *
 * Mounts the admin layer of the CMS on the runner the consumer provides:
 *   - server-rendered admin pages under `<basePath>/admin/*`
 *   - REST API under `<basePath>/api/*`
 *   - the visual editor (web components bundled as `control-components.js`)
 *
 * Persistence (content, files, secrets), the auth chain, and the public
 * Delivery layer live in separate packages — pick the impls that fit your
 * deployment and pass them in.
 */

// ── Admin composition root ─────────────────────────────────────────────
export { ControlCms, ControlCms as Cms } from "./src/ControlCms";
export type { ControlCmsOptions } from "./src/ControlCms";
export type {
    RepositoryCompatibilityQuery,
    RepositoryManagementGateway,
    RepositoryReevaluationInput,
    RepositoryStablePromotionInput,
    RepositoryVersionBlockInput,
} from "./src/core/admin/control/mountRoutes/repositoryGateway";
export type {
    IntegrationDefinition,
    IntegrationDefinitionRepository,
} from "@bernouy/cms-integrations";

// Browser-safe bloc authoring symbols live in two sub-entries:
//   • `@bernouy/cms-control/component` — exposes only `Component`.
//   • `@bernouy/cms-control/editor`    — exposes `Editor` + `registerEditor`.
// Keeping them in sub-entries guarantees the view bundle visitors download
// never drags editor-side code. The editor entry is intercepted by
// `p9rExternalsPlugin` so its symbols read from `window.p9rEditor` (singleton
// across blocs).
