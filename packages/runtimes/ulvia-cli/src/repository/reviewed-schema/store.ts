import { canonicalJsonBytes, parseStrictJsonDocument } from "@bernouy/cms-integration-packages";
import type { ReviewedConnectorSchemaBaseline } from "@bernouy/cms-integration-registry";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
    exactRecord,
    parseReviewedSchemaBaselines,
    parseReviewedSchemaTarget,
    type ReviewedSchemaTarget,
} from "./parser";

const DOCUMENT_SCHEMA = "cms.ulvia.local-reviewed-schema-baselines.v1" as const;
const MAX_DOCUMENT_BYTES = 16 * 1_024 * 1_024;

export class LocalReviewedSchemaBaselineStore {
    constructor(private readonly repositoryRoot: string) {}

    async get(target: ReviewedSchemaTarget): Promise<readonly ReviewedConnectorSchemaBaseline[]> {
        const path = this.path(target);
        const regular = await lstat(path).then(
            (stats) => stats.isFile() && !stats.isSymbolicLink(),
            () => false,
        );
        if (!regular) {
            return [];
        }
        const bytes = await readFile(path);
        if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
            throw new Error(`Local reviewed schema baselines are too large for ${coordinate(target)}`);
        }
        const value = parseStrictJsonDocument(bytes, MAX_DOCUMENT_BYTES);
        if (!equalBytes(bytes, canonicalJsonBytes(value))) {
            throw new Error(`Local reviewed schema baselines are not canonical for ${coordinate(target)}`);
        }
        const document = exactRecord(value, "reviewed schema baseline document", ["schema", "target", "baselines"]);
        if (document.schema !== DOCUMENT_SCHEMA) {
            throw new Error("Local reviewed schema baseline document has an unsupported schema");
        }
        parseReviewedSchemaTarget(document.target, target);
        return parseReviewedSchemaBaselines(document.baselines, target);
    }

    async put(
        target: ReviewedSchemaTarget,
        baselines: readonly ReviewedConnectorSchemaBaseline[],
    ): Promise<readonly ReviewedConnectorSchemaBaseline[]> {
        const parsed = parseReviewedSchemaBaselines(baselines, target);
        const path = this.path(target);
        const bytes = canonicalJsonBytes({ schema: DOCUMENT_SCHEMA, target, baselines: parsed });
        const directory = join(this.repositoryRoot, ".registry", "pulled-schema-baselines");
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
        try {
            await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
            await rename(temporary, path);
        } catch (error) {
            await unlink(temporary).catch(() => undefined);
            throw error;
        }
        return parsed;
    }

    private path(target: ReviewedSchemaTarget): string {
        parseReviewedSchemaTarget(target, target);
        return join(this.repositoryRoot, ".registry", "pulled-schema-baselines", `${target.packageDigest}.json`);
    }
}

function coordinate(target: Pick<ReviewedSchemaTarget, "kind" | "version">): string {
    return `${target.kind}@${target.version}`;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
