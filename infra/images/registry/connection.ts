import { createHash } from "node:crypto";
import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import { metadataBytes, metadataJson } from "../../distribution/metadata";

export type RegistryFetch = (url: string, init: RequestInit) => Promise<Response>;
const ACCEPT =
    "application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json";

/** Official public image metadata only; publisher credentials stay with the Docker CLI. */
export async function registryConnection(repository: string, request: RegistryFetch) {
    const auth = await request(
        `https://auth.docker.io/token?service=registry.docker.io&scope=${encodeURIComponent(`repository:${repository}:pull`)}`,
        { redirect: "error", signal: AbortSignal.timeout(15_000) },
    );
    if (!auth.ok) {
        await auth.body?.cancel();
        throw new Error(`Docker registry token request failed (${auth.status})`);
    }
    const grant = (await metadataJson(auth, 65_536, "Docker token")) as { token?: unknown };
    if (typeof grant?.token !== "string" || !/^[A-Za-z0-9._~-]{1,32768}$/u.test(grant.token)) {
        throw new Error("Docker registry returned an invalid pull grant");
    }
    return async (reference: string, expectedSize?: number) => {
        const response = await request(
            `https://registry-1.docker.io/v2/${repository}/manifests/${encodeURIComponent(reference)}`,
            {
                redirect: "error",
                signal: AbortSignal.timeout(15_000),
                headers: { accept: ACCEPT, authorization: `Bearer ${grant.token}`, "cache-control": "no-cache" },
            },
        );
        if (response.status === 404) {
            const failure = (await metadataJson(response, 4096, "Docker refusal")) as {
                errors?: { code?: unknown }[];
            };
            if (
                Array.isArray(failure?.errors) &&
                failure.errors.length > 0 &&
                failure.errors.every(
                    (entry) => entry && (entry.code === "MANIFEST_UNKNOWN" || entry.code === "NAME_UNKNOWN"),
                )
            ) {
                return null;
            }
            throw new Error("Docker registry returned an unrecognized missing-image response");
        }
        if (!response.ok) {
            await response.body?.cancel();
            throw new Error(`Docker registry manifest request failed (${response.status})`);
        }
        const bytes = await metadataBytes(response, 1_048_576, "Docker manifest");
        const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
        if (
            response.headers.get("docker-content-digest") !== digest ||
            (reference.startsWith("sha256:") && reference !== digest) ||
            (expectedSize !== undefined && expectedSize !== bytes.byteLength)
        ) {
            throw new Error("Docker registry manifest digest or size mismatch");
        }
        return { value: parseStrictJson(bytes, 1_048_576, 16), digest };
    };
}
