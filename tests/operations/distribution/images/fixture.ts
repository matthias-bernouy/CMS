import { createHash } from "node:crypto";
import type { ImageArtifact } from "../../../../infra/images/inspection";
import type { RegistryFetch } from "../../../../infra/images/registry/connection";

export function manifest(value: unknown) {
    const body = JSON.stringify(value);
    return { body, digest: `sha256:${createHash("sha256").update(body).digest("hex")}`, size: Buffer.byteLength(body) };
}
export const image: ImageArtifact = {
    component: "edge",
    reference: "docker.io/cyaxis/ulvia-edge:1.2.3",
    id: `sha256:${"a".repeat(64)}`,
};
export function registryFixture(artifact = image) {
    const documents = new Map<string, ReturnType<typeof manifest>>();
    const requests: string[] = [];
    const writes: string[] = [];
    let lost = false;
    let refusal = 0;
    function put(value: unknown, reference = "1.2.3") {
        const document = manifest(value);
        documents.set(reference, document);
        documents.set(document.digest, document);
        return document;
    }
    function runtime(id = artifact.id) {
        return {
            schemaVersion: 2,
            mediaType: "application/vnd.oci.image.manifest.v1+json",
            config: { mediaType: "application/vnd.oci.image.config.v1+json", digest: id, size: 64 },
            layers: [],
        };
    }
    const request: RegistryFetch = async (url, init) => {
        requests.push(url);
        if (new URL(url).origin === "https://auth.docker.io") {
            if (new Headers(init.headers).has("authorization")) {
                throw new Error("Credentials forwarded to token service");
            }
            return Response.json({ token: "public-pull-grant" });
        }
        if (
            new URL(url).origin !== "https://registry-1.docker.io" ||
            new Headers(init.headers).get("authorization") !== "Bearer public-pull-grant" ||
            init.redirect !== "error"
        ) {
            throw new Error("Foreign request or missing request fence");
        }
        if (refusal) {
            return new Response(null, { status: refusal });
        }
        const reference = decodeURIComponent(new URL(url).pathname.split("/manifests/")[1]!);
        const document = documents.get(reference);
        return document
            ? new Response(document.body, { headers: { "docker-content-digest": document.digest } })
            : Response.json({ errors: [{ code: "MANIFEST_UNKNOWN" }] }, { status: 404 });
    };
    return {
        image,
        put,
        runtime,
        documents,
        requests,
        writes,
        fetch: request,
        loseReply: () => {
            lost = true;
        },
        refuse: (status: number) => {
            refusal = status;
        },
        run: async (args: readonly string[]) => {
            if (args[1] === "image" && args[2] === "inspect") {
                return artifact.id;
            }
            writes.push(args.join(" "));
            put(runtime());
            if (lost) {
                throw new Error("lost acknowledgement");
            }
        },
    };
}
