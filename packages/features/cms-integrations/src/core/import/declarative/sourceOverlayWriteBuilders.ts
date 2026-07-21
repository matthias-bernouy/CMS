import type { SourceOverlay } from "@bernouy/cms-sources";
import { IntegrationInputError, IntegrationRuntimeError } from "../../errors";
import type { IntegrationSourceOverlayWrite } from "../sourceOverlayWrites";
import type { IntegrationImportDeps } from "../../../interfaces/IntegrationImport";

export async function buildSourceOverlayWrites(
    deps: IntegrationImportDeps,
    overlays: SourceOverlay[],
): Promise<IntegrationSourceOverlayWrite[]> {
    if (!overlays.length) {
        return [];
    }
    if (!deps.sourceOverlays) {
        throw new IntegrationRuntimeError("source overlay repository not configured");
    }

    const writes: IntegrationSourceOverlayWrite[] = [];
    const seen = new Set<string>();
    for (const overlay of overlays) {
        if (seen.has(overlay.id)) {
            throw new IntegrationInputError("artifacts", `duplicate source overlay artifact "${overlay.id}"`);
        }
        seen.add(overlay.id);
        const previous = await deps.sourceOverlays.getOverlay(overlay.id);
        writes.push({ overlay: mergeSourceOverlayArtifact(overlay, previous), previous });
    }
    return writes;
}

function mergeSourceOverlayArtifact(overlay: SourceOverlay, previous: SourceOverlay | null): SourceOverlay {
    if (!previous || overlay.fieldSource || overlay.fields.length) {
        return overlay;
    }
    return {
        ...overlay,
        fields: previous.fields,
        ...(overlay.sections?.length
            ? { sections: overlay.sections }
            : previous.sections
              ? { sections: previous.sections }
              : {}),
    };
}
