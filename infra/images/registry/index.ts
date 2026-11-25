import type { RegistryFetch } from "./connection";
import { command } from "../../process";
import type { CommandOptions } from "../../process";
import type { ImageArtifact } from "../inspection";
import { COMPONENTS, imageReference } from "../inspection";
import { isReleaseVersion } from "../../distribution/options";
import { registryConnection } from "./connection";
import { digest, runtimeDescriptor, imageConfig } from "./identity";

export type ImageRegistryTransport = {
    fetch: RegistryFetch;
    run: (args: readonly string[], options?: CommandOptions) => Promise<unknown>;
};

/** Match the inspected Docker store ID against the verified index, manifest or config address. */
export async function remoteImageIdentity(
    image: ImageArtifact,
    request: RegistryFetch = fetch,
): Promise<string | null> {
    const version = image.reference.slice(image.reference.lastIndexOf(":") + 1);
    if (
        !COMPONENTS.includes(image.component) ||
        !isReleaseVersion(version) ||
        image.reference !== imageReference(image.component, version) ||
        !digest(image.id)
    ) {
        throw new Error("Invalid official image publication coordinate");
    }
    const read = await registryConnection(`cyaxis/ulvia-${image.component}`, request);
    const root = await read(version);
    if (!root) {
        return null;
    }
    const descriptor = runtimeDescriptor(root.value);
    const manifest = descriptor ? await read(descriptor.digest, descriptor.size) : root;
    if (!manifest) {
        throw new Error("Published Docker image references a missing runtime manifest");
    }
    const config = imageConfig(manifest.value);
    if (image.id === root.digest || image.id === manifest.digest) {
        return image.id;
    }
    return config;
}

export async function prepareImagePublication(
    images: readonly ImageArtifact[],
    transport: ImageRegistryTransport = { fetch, run: command },
) {
    async function present(image: ImageArtifact): Promise<boolean> {
        const identity = await remoteImageIdentity(image, transport.fetch);
        if (identity !== null && identity !== image.id) {
            throw new Error(`Docker image ${image.reference} already exists with different content`);
        }
        return identity !== null;
    }
    for (const image of images) {
        await present(image);
    }
    async function verify(): Promise<void> {
        for (const image of images) {
            if (!(await present(image))) {
                throw new Error(`Docker image ${image.reference} is not published; run the runtime phase first`);
            }
        }
    }
    return {
        verify,
        async publish(): Promise<void> {
            for (const image of images) {
                if (await present(image)) {
                    continue;
                }
                const localId = await transport.run(
                    ["docker", "image", "inspect", "--format", "{{.Id}}", image.reference],
                    { capture: true },
                );
                if (typeof localId !== "string" || localId.trim() !== image.id) {
                    throw new Error(`Local Docker tag ${image.reference} changed before push`);
                }
                let uncertain: unknown;
                try {
                    await transport.run(["docker", "push", image.reference]);
                } catch (error) {
                    uncertain = error;
                }
                if (!(await present(image))) {
                    throw new Error(
                        `Docker image ${image.reference} publication is not confirmed; retry the runtime phase`,
                        { cause: uncertain },
                    );
                }
            }
            await verify();
        },
    };
}
