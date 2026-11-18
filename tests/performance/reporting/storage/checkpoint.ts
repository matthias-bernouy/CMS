import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { exclusiveJson, realDirectory } from "./io";
import type { RunMetadata, RunReport } from "../types";
import type { CapabilityInventory, ScenarioDefinition, ScenarioResult } from "../../capabilities/types";

type Header = Readonly<{
    metadata: Omit<RunMetadata, "finishedAt">;
    inventory: CapabilityInventory;
    scenarios: readonly ScenarioDefinition[];
}>;

/** Process-interruption evidence is separate from sealed reports and cannot become a reference. */
export async function createCheckpoint(root: string, header: Header) {
    const id = header.metadata.id;
    if (!/^\d{8}T\d{6}Z-[a-f0-9]{7,40}-[a-f0-9]{8}$/u.test(id)) {
        throw new Error("Invalid performance checkpoint ID");
    }
    await mkdir(root, { recursive: true, mode: 0o700 });
    await realDirectory(root);
    const directory = join(root, id);
    await mkdir(directory, { mode: 0o700 });
    await exclusiveJson(join(directory, "header.json"), { format: 1, referenceEligible: false, ...header });
    const planned = new Set(header.scenarios.map((scenario) => scenario.id));
    const recorded = new Set<string>();
    const chain = createHash("sha256");
    let closed = false;
    return {
        directory,
        async record(result: ScenarioResult) {
            if (closed || !planned.has(result.scenario) || recorded.has(result.scenario)) {
                throw new Error("Unknown, duplicate or closed checkpoint scenario");
            }
            const name = `${String(recorded.size + 1).padStart(6, "0")}.json`;
            const bytes = await exclusiveJson(join(directory, name), result);
            chain.update(name).update(bytes);
            recorded.add(result.scenario);
        },
        async close(status: RunReport["status"]) {
            if (closed) {
                throw new Error("Checkpoint was already closed");
            }
            await exclusiveJson(join(directory, "closed.json"), {
                id,
                report: id,
                reportStatus: status,
                planned: header.scenarios.length,
                recorded: recorded.size,
                chainSha256: chain.digest("hex"),
                referenceEligible: false,
            });
            closed = true;
        },
    };
}
