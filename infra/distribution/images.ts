import { command } from "../process";

export type ImageArtifact = { component: "edge" | "provider"; reference: string; id: string };
export const COMPONENTS = ["edge", "provider"] as const;
export type Capture = (args: readonly string[]) => Promise<string>;

export async function inspectImages(
    version: string,
    revision: string,
    capture: Capture = (args) => command(args, { capture: true }),
) {
    const images: ImageArtifact[] = [];
    for (const component of COMPONENTS) {
        const reference = `docker.io/cyaxis/ulvia-${component}:${version}`;
        const values = JSON.parse(await capture(["docker", "image", "inspect", reference]));
        const image = values[0];
        const labels = image?.Config?.Labels;
        if (
            values.length !== 1 ||
            !/^sha256:[0-9a-f]{64}$/u.test(image?.Id ?? "") ||
            labels?.["io.ulvia.component"] !== component ||
            labels?.["io.ulvia.stack-api"] !== "1" ||
            labels?.["io.ulvia.hosting-api"] !== "1" ||
            labels?.["org.opencontainers.image.version"] !== version ||
            labels?.["org.opencontainers.image.revision"] !== revision
        ) {
            throw new Error(`Refusing mismatched distribution image: ${reference}`);
        }
        images.push({ component, reference, id: image.Id });
    }
    return images;
}
