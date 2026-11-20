import type { AuthoringServices } from "repository/application/authoring/interfaces/AuthoringServices";
import type { PreparationCaptureInput } from "repository/application/authoring/schemas/preparations/captures";
import type { ProviderCapabilityInvocationContext } from "@bernouy/cms-gateway/provider/server";
import { exampleCaptureDocument } from "repository/collections/tooling/examples/capture";
import { createCapture, captureOwner, captureLocale } from "@bernouy/content/captures";
import { AuthoringInputError } from "./input";
import { CaptureError, CAPTURE_LIMITS } from "@bernouy/browser-capture";
async function prepareCapture(
    services: AuthoringServices,
    input: PreparationCaptureInput,
    context: ProviderCapabilityInvocationContext,
) {
    captureOwner(context);
    input = { ...input, locale: captureLocale(input.locale) };
    if (!services.authoringCaptures || !services.authoring.preview) {
        throw new CaptureError("UNAVAILABLE");
    }
    const artifact = await services.authoring.preview(input.preparationId, input.expectedDigest);
    const dependencies = await services.authoringCaptures.dependencies(
        input.dependencies,
        CAPTURE_LIMITS.inputBytes - artifact.assets.reduce((sum, asset) => sum + asset.bytes.size, 0),
    );
    const ids = new Set([artifact.release.collectionId]);
    let bytes = artifact.assets.reduce((sum, asset) => sum + asset.bytes.size, 0);
    for (const dependency of dependencies) {
        if (ids.has(dependency.release.collectionId)) {
            throw new AuthoringInputError("Duplicate capture dependency");
        }
        ids.add(dependency.release.collectionId);
        bytes += dependency.assets.reduce((sum, asset) => sum + asset.bytes.size, 0);
    }
    if (bytes > CAPTURE_LIMITS.inputBytes) {
        throw new CaptureError("LIMIT_EXCEEDED");
    }
    const result = await exampleCaptureDocument(artifact, dependencies, input, {
        kind: "prepared-example",
        id: `${input.preparationId}/${input.exampleId}/${input.previewId}`,
        revision: input.preparationId,
        releaseDigest: artifact.digest,
        dependencies: dependencies.map((item) => ({ id: item.release.collectionId, digest: item.digest })),
    });
    return createCapture(
        services.authoringCaptures,
        result.document,
        { width: result.width, height: result.height, mode: "viewport", themeMode: input.themeMode },
        result.source,
        input.locale,
        context,
    );
}

export async function capturePreparation(
    services: AuthoringServices,
    input: PreparationCaptureInput,
    context: ProviderCapabilityInvocationContext,
) {
    captureOwner(context);
    if (!services.authoringCaptures) {
        throw new CaptureError("UNAVAILABLE");
    }
    return services.authoringCaptures.run(() => prepareCapture(services, input, context));
}
