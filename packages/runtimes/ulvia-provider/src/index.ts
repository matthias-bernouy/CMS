import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { admitContractReleaseJson } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { admitProviderManifestJson } from "@bernouy/cms-repository/providers";
import type { ProviderRuntimeReport } from "@bernouy/cms-repository/providers/installations";
import { createOfficialProviderHandler } from "@bernouy/ulvia-official-provider";
import { FileSubmissionStore } from "@bernouy/ulvia-official-provider/local-fs";

const resourceRoot = required("ULVIA_OFFICIAL_RESOURCE_ROOT");
const dataRoot = required("ULVIA_OFFICIAL_DATA_DIR");
const token = required("ULVIA_OFFICIAL_TOKEN");
const port = Number(required("ULVIA_OFFICIAL_PORT"));
if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("ULVIA_OFFICIAL_PORT must be a valid port");
}

const contracts = new InMemoryReleaseCatalogue();
for (const id of ["catalog.items", "forms.submissions", "media.assets"]) {
    const bytes = await readFile(join(resourceRoot, "contracts", id, "definition.json"));
    await contracts.publish(await admitContractReleaseJson(bytes));
}
const manifestBytes = await readFile(join(resourceRoot, "providers", "ulvia.official", "definition.json"));
const admission = await admitProviderManifestJson(manifestBytes, contracts);
const report: ProviderRuntimeReport = {
    protocol: "ulvia-provider/v1",
    providerId: admission.manifest.providerId,
    account: { id: "local-dev", label: "Ulvia local provider" },
    buildVersion: admission.manifest.version,
    manifest: { version: admission.manifest.version, digest: admission.digest },
    implementations: admission.manifest.implementations.map((item) => ({
        contractId: item.contractId,
        version: item.version,
        digest: item.digest,
        status: "ready" as const,
    })),
};
const handler = createOfficialProviderHandler({
    token,
    report,
    contracts: {
        catalog: await implementedRelease("catalog.items"),
        forms: await implementedRelease("forms.submissions"),
        media: await implementedRelease("media.assets"),
    },
    submissions: new FileSubmissionStore(join(dataRoot, "submissions")),
});
const server = Bun.serve({ hostname: "127.0.0.1", port, fetch: handler });
console.log(`Official local provider: http://127.0.0.1:${server.port}`);

function required(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`${name} is required`);
    }
    return value;
}

async function implementedRelease(contractId: string) {
    const implementation = admission.manifest.implementations.find((item) => item.contractId === contractId);
    if (!implementation) {
        throw new Error(`Official provider manifest lacks ${contractId}`);
    }
    const published = await contracts.get(contractId, implementation.version);
    if (!published || published.admission.digest !== implementation.digest) {
        throw new Error(`Official provider contract ${contractId}@${implementation.version} is unavailable`);
    }
    return published.admission.release;
}
