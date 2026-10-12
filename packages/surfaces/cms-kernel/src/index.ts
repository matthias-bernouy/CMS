/**
 * @bernouy/cms-kernel — the CMS HTTP application.
 *
 * `KernelCms` mounts public and administration Pages, authentication and
 * feature-owned HTTP handlers under an injected runner. It receives a
 * read-only content projection and runtime adapters from the composition root.
 *
 * Pure on-demand rendering — no Playwright, no build-time pre-rendering.
 */

export { default as KernelCms } from "cms-kernel/KernelCms";
export type { KernelCmsConfig } from "cms-kernel/KernelCmsConfig";
export { isKernelReservedPath } from "cms-kernel/http/pages/reservedPaths";
