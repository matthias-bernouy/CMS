import { parseHTML } from "linkedom";
import type { ContentBindingValidationOptions } from "cms-content/application/core/validation/bindingCapabilities";
import { ContentValidationError } from "cms-content/application/core/validation/errors";
import { parseSvgCapabilityReference } from "cms-content/blocs/core/markup/security/svgReference";

export async function validateSvgCapabilityReferences(
    htmlFragments: readonly (string | undefined)[],
    options: ContentBindingValidationOptions,
): Promise<void> {
    const targets = new Map<string, NonNullable<ReturnType<typeof parseSvgCapabilityReference>>>();
    for (const html of htmlFragments) {
        if (!html) {
            continue;
        }
        const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
        for (const element of document.querySelectorAll("svg[cms-svg]")) {
            const target = parseSvgCapabilityReference(element.getAttribute("cms-svg") ?? "");
            if (target) {
                targets.set(`${target.contractId}\0${target.bindingPath}`, target);
            }
        }
    }
    if (targets.size === 0) {
        return;
    }
    if (!options.validateSvgCapabilities) {
        if (options.requireSvgCapabilityResolution) {
            throw new ContentValidationError(
                "content",
                "cms-svg capability references require an exact selected public SVG capability",
            );
        }
        return;
    }
    await options.validateSvgCapabilities([...targets.values()]);
}
