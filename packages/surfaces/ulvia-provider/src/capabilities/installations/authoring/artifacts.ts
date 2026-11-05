import { CollectionPreparationError } from "@bernouy/cms-repository/repository/authoring";
import type { RepositoryAuthoring } from "@bernouy/cms-repository/repository/authoring";
import { ProviderCapabilityDispatchError } from "../../../dispatch/registry";

export async function invokeArtifactAuthoring(
    authoring: RepositoryAuthoring,
    id: string,
    input: Readonly<Record<string, unknown>>,
): Promise<unknown> {
    const kind = id.includes("provider-manifest") ? "provider-manifest" : "contract";
    if (id.startsWith("prepare-")) {
        try {
            return { valid: true, ...(await authoring.prepareArtifact(kind, required(input.sourceJson))) };
        } catch (error) {
            if (!(error instanceof CollectionPreparationError)) {
                throw error;
            }
            return {
                valid: false,
                diagnostics: error.diagnostics ?? [
                    { code: `${kind}.invalid`, severity: "error", message: error.message },
                ],
            };
        }
    }
    if (id.startsWith("publish-")) {
        return authoring.publishArtifact(kind, required(input.preparationId), required(input.expectedDigest));
    }
    return authoring.artifactSources(
        kind,
        required(input.namespace),
        required(input[kind === "contract" ? "contractId" : "providerId"]),
        required(input.version),
    );
}
function required(value: unknown): string {
    if (typeof value !== "string" || !value) {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value;
}
