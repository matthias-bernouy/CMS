import { CollectionPreparationError } from "cms-repository/repository/authoring/preparations/errors";
import type { AuthoringService } from "cms-repository/application/authoring/interfaces/AuthoringServices";
/** An invalid authored candidate remains a successful diagnostic result, without publishing anything. */
export async function prepareCandidate(
    authoring: AuthoringService,
    kind: "collection" | "contract" | "provider-manifest",
    sourceJson: string,
) {
    try {
        const result =
            kind === "collection"
                ? await authoring.prepare(sourceJson)
                : await authoring.prepareArtifact(kind, sourceJson);
        return { valid: true as const, ...result };
    } catch (error) {
        if (!(error instanceof CollectionPreparationError)) {
            throw error;
        }
        return {
            valid: false as const,
            diagnostics: error.diagnostics ?? [
                { code: `${kind}.invalid`, severity: "error" as const, message: error.message },
            ],
        };
    }
}
