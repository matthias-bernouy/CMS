import { verifyStoredProviderManifestJson } from "@bernouy/ulvia-providers";
import { parseProviderRuntimeReportJson } from "@bernouy/ulvia-providers/installations";
import { admitContractReleaseJson } from "@bernouy/ulvia-contracts";
import { readProviderCredential } from "../../../integration/instance/providers/credentials";
import { scenarioClient } from "../../harness/clients/session";
import { isolatedOrigin, responseBytes } from "../../harness/transport/http";
import { assertCondition, requireRecord } from "../queries/types";
import type { CapabilityInventory } from "../../capabilities/types";
import type { QueryEnvironment } from "../queries/execute";

/** Only the disposable named instance may serve as a remote Provider. Secrets stay in closures. */
export function providerPeers(inventory: CapabilityInventory) {
    const peers = new WeakMap<QueryEnvironment, Promise<Awaited<ReturnType<typeof readPeer>>>>();
    return (environment: QueryEnvironment) => {
        let peer = peers.get(environment);
        if (!peer) {
            peer = readPeer(inventory, environment);
            peers.set(environment, peer);
        }
        return peer;
    };
}

async function readPeer(inventory: CapabilityInventory, environment: QueryEnvironment) {
    assertCondition(environment.stack.providerName.startsWith("ulvia-mcp-") && environment.stack.providerControl);
    const origin = await environment.stack.providerControl.origin();
    isolatedOrigin(origin);
    const { token } = await readProviderCredential(environment.stack.providerName, `${environment.stack.id}-named`);
    const response = await fetch(new URL("/ulvia/report", origin), {
        headers: { authorization: `Bearer ${token}` },
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
    });
    const bytes = await responseBytes(response);
    assertCondition(response.status === 200);
    const report = parseProviderRuntimeReportJson(bytes);
    assertCondition(report.instanceId !== environment.stack.instanceId);
    const client = scenarioClient(inventory, environment.main);
    const listed = await client("ulvia/cms.installations", "list-available-providers", "http", {});
    assertCondition(listed.observation.validated);
    const items = requireRecord(listed.output).items;
    assertCondition(Array.isArray(items));
    const pin = items
        .map(requireRecord)
        .find((item) => item.id === report.providerId && item.digest === report.manifest.digest);
    assertCondition(pin);
    const registry = scenarioClient(inventory, { ...environment.registry, token: "", tools: [] });
    const downloaded = await registry("ulvia/repository", "release-download", "http", {
        kind: "provider-manifest",
        publisherId: pin.publisherId,
        id: pin.id,
        version: pin.version,
    });
    assertCondition(downloaded.observation.validated && downloaded.output instanceof Uint8Array);
    const { manifest, digest } = await verifyStoredProviderManifestJson(downloaded.output, report.manifest.digest);
    assertCondition(manifest.providerId === report.providerId && manifest.version === report.manifest.version);
    const endpoint = "http://ulvia-provider:5103";
    assertCondition(manifest.endpoint.allowedOrigins.includes(endpoint));
    const observedLogs = inventory.targets.find(
        (row) => !row.retained && row.release.contractId === "ulvia/cms.observability",
    );
    assertCondition(observedLogs);
    const logBytes = await registry("ulvia/repository", "release-download", "http", {
        kind: "contract",
        publisherId: "ulvia",
        id: observedLogs.release.contractId,
        version: observedLogs.release.version,
    });
    assertCondition(logBytes.observation.validated && logBytes.output instanceof Uint8Array);
    const logs = await admitContractReleaseJson(logBytes.output);
    assertCondition(logs.digest === observedLogs.release.digest);
    return {
        token,
        report,
        manifest,
        digest,
        endpoint,
        logs: logs.release,
        pin: {
            repositoryId: pin.repositoryId,
            publisherId: pin.publisherId,
            id: pin.id,
            version: pin.version,
            digest: pin.digest,
        },
    };
}

export type ProviderPeer = Awaited<ReturnType<ReturnType<typeof providerPeers>>>;
