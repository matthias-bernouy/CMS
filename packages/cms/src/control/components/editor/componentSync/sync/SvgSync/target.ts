import { lockActions } from "./lock";
import type { SvgSync } from "./SvgSync";

/**
 * Resolve the current `<svg slot="X">` light-DOM child on the parent
 * component. Mirror of `ImageSync/target.ts:resolveTarget` adapted to
 * SVG — same single-source-of-truth-in-light-DOM pattern: the slotted
 * SVG IS what the user sees (projected through `<slot name="X">` in the
 * bloc shadow), so the editor preview clones the same node and stays
 * truthful to the live render.
 */
export function resolveTarget(host: SvgSync): SVGElement | null {
    const component = host._component;
    if (!component) return null;
    const slot = host.slotName;
    if (!slot) return component.querySelector("svg");
    return component.querySelector(`svg[slot="${slot}"]`);
}

/**
 * Seed the default SVG into the parent component if no `<svg slot="X">`
 * child exists yet. The default markup comes from `<p9r-svg-sync>`'s
 * own light-DOM children — typically a single inline `<svg>` written by
 * the bloc author in configuration.html. We clone (not move) so the
 * template stays available for future remounts and for the "Reset" path.
 *
 * No sanitize on the inline default: bloc-author markup is source-code-
 * trusted. Sanitize only runs on user-uploaded files coming back from
 * MediaCenter (see `mediaCenter.ts`).
 */
export function syncDefault(host: SvgSync) {
    if (resolveTarget(host)) return;
    const template = host.querySelector("svg");
    if (!template) return;
    const fresh = template.cloneNode(true) as SVGElement;
    if (host.slotName) fresh.setAttribute("slot", host.slotName);
    lockActions(fresh);
    host._component?.appendChild(fresh);
}
