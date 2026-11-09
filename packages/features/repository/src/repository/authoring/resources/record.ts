import { AUTHORING_SOURCE_LIMITS } from "../preparations/source/limits";
import { readFile, stat, open } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { isResourceId, resourcePublisher, resourceName, parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import { RepositoryRequestError } from "../../core/errors";
import { sourceDigest, MAX_PREPARATION_RECORD_BYTES } from "../preparations/record";
import { parseSourceSnapshot } from "../snapshot";
import type { AuthoredArtifactKind } from "./compiler";

export interface ArtifactPreparation {
    readonly schema: "ulvia.artifact-preparation.v1";
    readonly preparationId: string;
    readonly kind: AuthoredArtifactKind;
    readonly id: string;
    readonly version: string;
    readonly publisherId: string;
    readonly digest: string;
    readonly canonicalJson: string;
    readonly sourceJson: string;
    readonly sourceDigest: string;
    readonly expiresAt: number;
    readonly repositoryOrigin: string;
    readonly repositoryId: string | null;
}

export async function readArtifactPreparation(root: string, kind: AuthoredArtifactKind, id: string, digest: string) {
    const refuse = () =>
        new RepositoryRequestError("REJECTED", "Preparation is invalid, changed, foreign or expired. Prepare again.");
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(id) || !/^sha256:[a-f0-9]{64}$/u.test(digest)) {
        throw refuse();
    }
    const path = join(root, id);
    try {
        if ((await stat(join(path, "prepared.json"))).size > MAX_PREPARATION_RECORD_BYTES) {
            throw refuse();
        }
        const value = parseStrictJson(
            await readFile(join(path, "prepared.json")),
            MAX_PREPARATION_RECORD_BYTES,
            16,
        ) as unknown as ArtifactPreparation;
        if (
            value.schema !== "ulvia.artifact-preparation.v1" ||
            value.preparationId !== id ||
            value.kind !== kind ||
            !isResourceId(value.id) ||
            resourcePublisher(value.id) !== value.publisherId ||
            typeof value.version !== "string" ||
            value.digest !== digest ||
            typeof value.canonicalJson !== "string" ||
            sourceDigest(value.canonicalJson) !== digest ||
            typeof value.sourceJson !== "string" ||
            sourceDigest(value.sourceJson) !== value.sourceDigest ||
            !Number.isSafeInteger(value.expiresAt) ||
            value.expiresAt <= Date.now() ||
            typeof value.repositoryOrigin !== "string" ||
            (value.repositoryId !== null && typeof value.repositoryId !== "string")
        ) {
            throw refuse();
        }
        const canonical = parseStrictJson(value.canonicalJson, 8 * 1024 * 1024, 64) as Record<string, unknown>;
        const owner =
            kind === "contract"
                ? canonical.publisherId
                : (canonical.provenance as Record<string, unknown>)?.publisherId;
        if (
            canonical.kind !== kind ||
            canonical.version !== value.version ||
            owner !== value.publisherId ||
            (kind === "contract" ? canonical.contractId : canonical.providerId) !== value.id
        ) {
            throw refuse();
        }
        parseSourceSnapshot(value.sourceJson, kind);
        return { path, prepared: value };
    } catch (error) {
        if (["EACCES", "EPERM", "EIO", "EMFILE", "ENFILE"].includes((error as NodeJS.ErrnoException).code ?? "")) {
            throw error;
        }
        throw refuse();
    }
}

export async function verifyArtifactSources(path: string, prepared: ArtifactPreparation) {
    for (const file of parseSourceSnapshot(prepared.sourceJson, prepared.kind).files) {
        const handle = await open(
            join(path, resourceName(prepared.id), file.path),
            constants.O_RDONLY | constants.O_NOFOLLOW,
        );
        try {
            const info = await handle.stat();
            if (
                !info.isFile() ||
                info.size > AUTHORING_SOURCE_LIMITS.fileBytes ||
                (await handle.readFile("utf8")) !== file.content
            ) {
                throw new RepositoryRequestError("REJECTED", "Prepared sources changed. Prepare again.");
            }
        } finally {
            await handle.close();
        }
    }
}
