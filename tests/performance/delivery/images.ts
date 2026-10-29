type ImageInspection = { Config?: { Labels?: Record<string, string> } };
export function assertCandidateImage(value: unknown, component: string, revision: string): void {
    const images = value as ImageInspection[];
    const labels = Array.isArray(images) && images.length === 1 ? images[0]?.Config?.Labels : undefined;
    if (
        labels?.["io.ulvia.component"] !== component ||
        labels?.["io.ulvia.stack-api"] !== "1" ||
        labels?.["org.opencontainers.image.revision"] !== revision
    ) {
        throw new Error(`Delivery performance requires the candidate ${component} image at revision ${revision}`);
    }
}
