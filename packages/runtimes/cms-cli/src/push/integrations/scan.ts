import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
    type IntegrationAnswerValue,
    type IntegrationDefinition,
    type IntegrationImportOptions,
} from "@bernouy/cms-integrations";

export type LocalIntegrationImport = {
    kind: string;
    answers: Record<string, IntegrationAnswerValue>;
    options?: IntegrationImportOptions;
    definition?: IntegrationDefinition;
};

export type LocalIntegration = {
    /** Integration identifier, equal to the imported kind. */
    id: string;
    /** File stem (e.g. "shop"). */
    slug: string;
    /** Relative path (e.g. "integrations/shop.json"). */
    file: string;
    /** The import payload sent to the integrations API. */
    request: LocalIntegrationImport;
    /** Canonical hash for local change-detection against `.p9r-state.json`. */
    hash: string;
};

const INTEGRATIONS_SUBDIR = "integrations";

/** Walk `<siteDir>/integrations/*.json` — one tracked integration import per file.
 *  Generated runtime Source artifacts live under `.p9r/generated/sources/` and
 *  are intentionally not scanned as authoring input. */
export async function scanIntegrations(siteDir: string): Promise<LocalIntegration[]> {
    const root = join(siteDir, INTEGRATIONS_SUBDIR);
    if (!existsSync(root)) {
        return [];
    }

    const files = (await readdir(root)).filter((f) => f.endsWith(".json") && !f.startsWith("."));
    const out: LocalIntegration[] = [];
    for (const file of files.sort()) {
        const raw = await readFile(join(root, file), "utf-8");
        let request: LocalIntegrationImport;
        try {
            request = normalizeIntegrationImport(JSON.parse(raw), file.slice(0, -".json".length));
        } catch (e) {
            throw new Error(
                `Invalid integration in ${INTEGRATIONS_SUBDIR}/${file}: ${e instanceof Error ? e.message : e}`,
            );
        }
        const id = integrationImportId(request, file.slice(0, -".json".length));
        out.push({
            id,
            slug: file.slice(0, -".json".length),
            file: `${INTEGRATIONS_SUBDIR}/${file}`,
            request,
            hash: canonicalIntegrationHash(request),
        });
    }
    return out;
}

/** Stable, key-order-fixed projection hashed for change-detection. Only ever
 *  compared against the same builder's output stored in state, so it just has
 *  to be deterministic — not byte-identical to any server projection. */
export function canonicalIntegrationHash(request: LocalIntegrationImport): string {
    return createHash("sha256").update(stableJson(request)).digest("hex");
}

function normalizeIntegrationImport(value: unknown, _slug: string): LocalIntegrationImport {
    if (!isRecord(value)) {
        throw new Error("JSON root must be an object");
    }
    const kind = stringField(value, "kind");
    if (!kind) {
        throw new Error(`missing "kind"`);
    }
    const answers = recordField(value, "answers");
    if (!answers) {
        throw new Error(`missing "answers" object`);
    }
    const options = optionalRecord(value.options) as IntegrationImportOptions | undefined;
    return {
        kind,
        answers: answers as Record<string, IntegrationAnswerValue>,
        ...(options ? { options } : {}),
        ...(isRecord(value.definition) ? { definition: value.definition as unknown as IntegrationDefinition } : {}),
    };
}

function integrationImportId(request: LocalIntegrationImport, _slug: string): string {
    return request.kind;
}

function recordField(value: Record<string, unknown>, key: string): Record<string, unknown> | null {
    return optionalRecord(value[key]);
}

function optionalRecord(value: unknown): Record<string, unknown> | null {
    return isRecord(value) ? value : null;
}

function stringField(value: Record<string, unknown>, key: string): string | null {
    const raw = value[key];
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableJson(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(stableJson).join(",")}]`;
    }
    if (isRecord(value)) {
        return `{${Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}
