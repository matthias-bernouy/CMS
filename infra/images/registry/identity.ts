const IMAGE_TYPES = new Set([
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.v2+json",
]);
const INDEX_TYPES = new Set([
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
]);
export type Descriptor = {
    digest: string;
    size: number;
    mediaType: string;
    platform?: { os?: string; architecture?: string };
    annotations?: Record<string, string>;
};
export function digest(value: unknown): value is string {
    return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
}

export function runtimeDescriptor(value: unknown): Descriptor | null {
    const index = value as { schemaVersion?: unknown; mediaType?: string; manifests?: Descriptor[] };
    if (!INDEX_TYPES.has(index?.mediaType ?? "")) {
        return null;
    }
    if (
        index.schemaVersion !== 2 ||
        !Array.isArray(index.manifests) ||
        index.manifests.length < 1 ||
        index.manifests.length > 16
    ) {
        throw new Error("Invalid Docker image index");
    }
    for (const entry of index.manifests) {
        if (
            !entry ||
            !digest(entry.digest) ||
            !Number.isSafeInteger(entry.size) ||
            entry.size < 1 ||
            entry.size > 1_048_576 ||
            !IMAGE_TYPES.has(entry.mediaType)
        ) {
            throw new Error("Invalid Docker image descriptor");
        }
    }
    const images = index.manifests.filter(
        (entry) => entry.annotations?.["vnd.docker.reference.type"] !== "attestation-manifest",
    );
    if (images.length !== 1) {
        throw new Error("Official release requires exactly one runtime image per component");
    }
    const runtime = images[0]!;
    for (const entry of index.manifests) {
        if (
            entry !== runtime &&
            (entry.annotations?.["vnd.docker.reference.digest"] !== runtime.digest ||
                entry.platform?.os !== "unknown" ||
                entry.platform?.architecture !== "unknown")
        ) {
            throw new Error("Docker attestation does not reference the runtime image");
        }
    }
    return runtime;
}

export function imageConfig(value: unknown): string {
    const image = value as {
        schemaVersion?: number;
        mediaType?: string;
        config?: { digest?: unknown; size?: unknown; mediaType?: string };
        layers?: unknown[];
    };
    if (
        image?.schemaVersion !== 2 ||
        !IMAGE_TYPES.has(image.mediaType ?? "") ||
        !digest(image.config?.digest) ||
        !Number.isSafeInteger(image.config?.size) ||
        Number(image.config?.size) < 1 ||
        !["application/vnd.oci.image.config.v1+json", "application/vnd.docker.container.image.v1+json"].includes(
            image.config?.mediaType ?? "",
        ) ||
        !Array.isArray(image.layers) ||
        image.layers.length > 1024
    ) {
        throw new Error("Invalid Docker runtime manifest");
    }
    return image.config.digest;
}
