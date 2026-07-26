import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import {
    OFFICIAL_REPOSITORY_BOOTSTRAP_EVIDENCE_PATH,
    OFFICIAL_SCHEMA_BASELINE_GENERATED_AT,
    OFFICIAL_SCHEMA_BASELINE_GENERATOR_IMAGE,
} from "@bernouy/cms-official-integrations/publication";
import { collectOfficialIntegrationSchemaCalibration } from "../calibration";
import { buildOfficialRepositoryBootstrapEvidence } from "./baselineEvidence";

assertPinnedGenerator(process.env);
const mode = generationMode(Bun.argv.slice(2));
const calibration = await collectOfficialIntegrationSchemaCalibration({
    env: process.env,
    officialRoot: OFFICIAL_INTEGRATIONS_ROOT,
    now: () => OFFICIAL_SCHEMA_BASELINE_GENERATED_AT,
});
const evidence = await buildOfficialRepositoryBootstrapEvidence(calibration);
const bytes = canonicalJsonBytes(evidence);
const target = resolve(OFFICIAL_INTEGRATIONS_ROOT, OFFICIAL_REPOSITORY_BOOTSTRAP_EVIDENCE_PATH);
if (mode === "write") {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
} else {
    const committed = await readFile(target);
    if (!equalBytes(committed, bytes)) {
        throw new Error("Committed official bootstrap evidence does not match pinned schema calibration");
    }
}
console.info(
    JSON.stringify({
        schema: evidence.schema,
        mode,
        reviewedSchemaBaselines: evidence.reviewedSchemaBaselines.length,
        grandfatheredAnonymousConstraints: evidence.anonymousConstraintGrandfathering.reduce(
            (total, entry) => total + entry.findings.length,
            0,
        ),
        bytes: bytes.byteLength,
    }),
);

function generationMode(args: readonly string[]): "check" | "write" {
    if (args.length !== 1 || (args[0] !== "--check" && args[0] !== "--write")) {
        throw new Error("Schema baseline generation requires exactly one of --check or --write");
    }
    return args[0] === "--write" ? "write" : "check";
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function assertPinnedGenerator(env: Record<string, string | undefined>): void {
    if (env.CMS_SCHEMA_BASELINE_GENERATOR_IMAGE !== OFFICIAL_SCHEMA_BASELINE_GENERATOR_IMAGE) {
        throw new Error("Schema baseline generation requires the approved pinned Bun generator image");
    }
}
