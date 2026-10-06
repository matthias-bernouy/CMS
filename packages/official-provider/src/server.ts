import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { admitContractReleaseJson } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { admitProviderManifestJson } from "@bernouy/cms-repository/providers";
import type { ProviderRuntimeReport } from "@bernouy/cms-repository/providers/installations";
import { OfficialCmsInstanceDiscovery } from "./core/InstanceDiscovery";
import { createOfficialProviderHandler } from "./http/handler";
import { FileInstanceRegistry } from "./local-fs/FileInstanceRegistry";
import { FileSubmissionStore } from "./local-fs/FileSubmissionStore";
import { HttpOfficialCoreCapabilities } from "./http/HttpOfficialCoreCapabilities";

const resourceRoot = required("ULVIA_OFFICIAL_RESOURCE_ROOT");
const dataRoot = required("ULVIA_OFFICIAL_DATA_DIR");
const token = required("ULVIA_OFFICIAL_TOKEN");
const coreVersion = required("ULVIA_OFFICIAL_CORE_VERSION");
const coreHealthUrl = required("ULVIA_OFFICIAL_CORE_HEALTH_URL");
const coreCallUrl = required("ULVIA_OFFICIAL_CORE_CALL_URL");
const coreCallToken = required("ULVIA_OFFICIAL_CORE_CALL_TOKEN");
const port = Number(required("ULVIA_OFFICIAL_PORT"));
if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("ULVIA_OFFICIAL_PORT must be a valid port");
}

const coreContractIds = [
    "ulvia.cms.access",
    "ulvia.cms.collections",
    "ulvia.cms.design",
    "ulvia.cms.files",
    "ulvia.cms.operations",
    "ulvia.cms.pages",
    "ulvia.cms.providers",
] as const;
const contracts = new InMemoryReleaseCatalogue();
for (const id of [
    "catalog.items",
    "forms.submissions",
    "media.assets",
    "ulvia.provider.cms-instances",
    ...coreContractIds,
]) {
    const bytes = await readFile(contractPath(id));
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
const instances = new OfficialCmsInstanceDiscovery(
    new FileInstanceRegistry(join(dataRoot, "instances", "registry.json")),
    "default",
    async (instance) => {
        const response = await fetch(instance.healthUrl, {
            redirect: "manual",
            signal: AbortSignal.timeout(2_000),
        });
        return response.status >= 200 && response.status < 500;
    },
);
await instances.registerCurrent({
    id: "default",
    label: "Local CMS",
    lifecycleState: "running",
    coreVersion,
    contracts: coreContractIds.map(implementedContract),
    healthUrl: coreHealthUrl,
});
const handler = createOfficialProviderHandler({
    token,
    report,
    contracts: {
        catalog: await implementedRelease("catalog.items"),
        core: await Promise.all(coreContractIds.map(implementedRelease)),
        forms: await implementedRelease("forms.submissions"),
        instances: await implementedRelease("ulvia.provider.cms-instances"),
        media: await implementedRelease("media.assets"),
    },
    core: new HttpOfficialCoreCapabilities(coreCallUrl, coreCallToken),
    instances,
    submissions: new FileSubmissionStore(join(dataRoot, "submissions")),
});
const server = Bun.serve({ hostname: "127.0.0.1", port, fetch: handler });
console.log(`Official local provider: http://127.0.0.1:${server.port}`);

function contractPath(id: string): string {
    return join(resourceRoot, "contracts", ...(id.startsWith("ulvia.cms.") ? ["cms"] : []), id, "definition.json");
}

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

function implementedContract(contractId: string) {
    const implementation = admission.manifest.implementations.find((item) => item.contractId === contractId);
    if (!implementation) {
        throw new Error(`Official provider manifest lacks ${contractId}`);
    }
    return {
        contractId: implementation.contractId,
        version: implementation.version,
        digest: implementation.digest,
    };
}
