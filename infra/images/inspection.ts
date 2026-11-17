import { command } from "../process";

export const COMPONENTS = ["edge", "provider"] as const;
export type ImageComponent = (typeof COMPONENTS)[number];
export type ImageArtifact = { component: ImageComponent; reference: string; id: string };
export type Capture = (args: readonly string[]) => Promise<string>;

export function imageReference(component: ImageComponent, version: string): string {
    return `docker.io/cyaxis/ulvia-${component}:${version}`;
}

/** Build and publication use the same component, version, revision and identity checks. */
export async function inspectImage(
    component: ImageComponent,
    version: string,
    revision: string,
    capture: Capture = (args) => command(args, { capture: true }),
): Promise<ImageArtifact> {
    const reference = imageReference(component, version);
    const values = JSON.parse(await capture(["docker", "image", "inspect", reference]));
    const image = Array.isArray(values) && values.length === 1 ? values[0] : null;
    const labels = image?.Config?.Labels;
    if (
        !/^sha256:[0-9a-f]{64}$/u.test(image?.Id ?? "") ||
        labels?.["io.ulvia.component"] !== component ||
        labels?.["io.ulvia.stack-api"] !== "1" ||
        labels?.["io.ulvia.hosting-api"] !== "1" ||
        labels?.["org.opencontainers.image.version"] !== version ||
        labels?.["org.opencontainers.image.revision"] !== revision
    ) {
        throw new Error(`Refusing mismatched official image: ${reference}`);
    }
    return { component, reference, id: image.Id };
}

export async function inspectImages(version: string, revision: string, capture?: Capture): Promise<ImageArtifact[]> {
    const images: ImageArtifact[] = [];
    for (const component of COMPONENTS) {
        images.push(await inspectImage(component, version, revision, capture));
    }
    return images;
}
