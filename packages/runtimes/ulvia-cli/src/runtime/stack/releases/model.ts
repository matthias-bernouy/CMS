import { createHash } from "node:crypto";
import { assertImageVersion } from "../orchestration/images";

export const RELEASE_FILES = ["services.yml", "services-tls.yml", "mongo/provision-provider.js"] as const;
export type StackRelease = Readonly<{
    schema: "ulvia.stack-release.v1";
    version: string;
    stackApi: 1;
    files: Readonly<Record<(typeof RELEASE_FILES)[number], string>>;
    digest: string;
}>;

export function releaseDigest(value: Omit<StackRelease, "digest">): string {
    return `sha256:${createHash("sha256")
        .update(
            JSON.stringify({
                schema: value.schema,
                version: value.version,
                stackApi: value.stackApi,
                files: Object.fromEntries(RELEASE_FILES.map((name) => [name, value.files[name]])),
            }),
        )
        .digest("hex")}`;
}

export function parseStackRelease(value: unknown): StackRelease {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Invalid stack release");
    }
    const row = value as Record<string, unknown>;
    if (
        Object.keys(row).sort().join(",") !== "digest,files,schema,stackApi,version" ||
        row.schema !== "ulvia.stack-release.v1" ||
        row.stackApi !== 1 ||
        typeof row.version !== "string" ||
        !row.files ||
        typeof row.files !== "object" ||
        Array.isArray(row.files)
    ) {
        throw new Error("Unsupported or incomplete stack release");
    }
    assertImageVersion(row.version);
    const files = row.files as Record<string, unknown>;
    if (Object.keys(files).sort().join(",") !== [...RELEASE_FILES].sort().join(",")) {
        throw new Error("Invalid stack release file inventory");
    }
    for (const name of RELEASE_FILES) {
        if (typeof files[name] !== "string" || !files[name].length || Buffer.byteLength(files[name]) > 65_536) {
            throw new Error("Invalid stack release file size");
        }
    }
    const release = {
        schema: "ulvia.stack-release.v1" as const,
        version: row.version,
        stackApi: 1 as const,
        files: Object.fromEntries(RELEASE_FILES.map((name) => [name, files[name]])) as StackRelease["files"],
    };
    if (row.digest !== releaseDigest(release)) {
        throw new Error("Stack release digest mismatch");
    }
    for (const repository of ["caddy", "mongo"]) {
        if (
            !new RegExp(`image: ${repository}:[^\\s]+@sha256:[a-f0-9]{64}(?:\\s|$)`, "u").test(
                release.files["services.yml"],
            )
        ) {
            throw new Error(`Stack release must pin ${repository} by digest`);
        }
    }
    return { ...release, digest: row.digest };
}
