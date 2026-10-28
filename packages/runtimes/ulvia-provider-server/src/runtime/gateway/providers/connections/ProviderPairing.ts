import { readRemoteProviderReport } from "../readReport";
import {
    preparePairing,
    completePairing,
    installationDigest,
    pairingConflict,
    type PairingInput,
} from "./PairingIntent";
import { secretKeyToRef, secretRefToKey } from "@bernouy/secret-store";
import { ProviderInstallationLifecycle } from "@bernouy/cms-repository/providers/installations";
import { HttpGatewayTransport } from "@bernouy/cms-gateway/http";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import type { ProviderStores } from "../../../stores/providerStores";
import type { createProviderGateway } from "../../createProviderGateway";

export class ProviderPairing {
    constructor(
        private readonly stores: ProviderStores,
        private readonly gateway: Awaited<ReturnType<typeof createProviderGateway>>,
        private readonly cmsUrl: string,
    ) {}
    async configure(input: PairingInput, actorId: string, operationId?: string) {
        const { stores, gateway } = this;
        const source = await stores.installations.get({ siteId: gateway.siteId, installationId: input.installationId });
        if (!source || source.installation.status !== "enabled") {
            throw new TypeError("Enabled Provider installation required");
        }
        if (source.installation.gatewayTokenRef && !input.rotate) {
            const key = secretRefToKey(source.installation.gatewayTokenRef)!;
            const token = await stores.contractSecrets.installations.get(key);
            if (!token) {
                throw new Error("Provider return credential unavailable");
            }
            if (!source.observation) {
                const upstream = await stores.contractSecrets.installations.get(
                    secretRefToKey(source.installation.providerTokenRef)!,
                );
                if (!upstream) {
                    throw new Error("Provider credential unavailable");
                }
                await stores.installations.recordObservation(
                    { siteId: gateway.siteId, installationId: source.installation.id },
                    source.revision,
                    await readRemoteProviderReport(source.installation.endpoint, upstream),
                );
            }
            await gateway.providers.registerCredential(
                source.installation.id,
                source.installation.gatewayTokenRef,
                token,
            );
            await completePairing(stores, source.installation.id, source.installation.gatewayTokenRef);
            return { installationId: source.installation.id, paired: true };
        }
        const intent = await preparePairing(stores, source, input, actorId, operationId);
        const credentialRef = secretKeyToRef(intent.key);
        if (source.installation.gatewayTokenRef !== credentialRef) {
            if (installationDigest(source) !== intent.baseDigest) {
                throw pairingConflict();
            }
            const release = await stores.releases.get("ulvia.provider.connections", "1.0.0");
            const capability = release?.admission.release.capabilities.find(
                (item) => item.id === "connections.configure",
            );
            const served = source.observation?.report.implementations.find(
                (item) =>
                    item.contractId === "ulvia.provider.connections" &&
                    item.digest === release?.admission.digest &&
                    item.status === "ready",
            );
            const token = await stores.contractSecrets.installations.get(intent.key);
            if (!release || !capability || !served || !token || !source.observation) {
                throw new TypeError("Provider pairing contract is unavailable");
            }
            await gateway.providers.beginCredential(source.installation.id, credentialRef, token, intent.baseDigest);
            const network = new NodeGatewayHttpNetwork({
                resolveToken: async (reference) => {
                    const key = secretRefToKey(reference);
                    const value = key && (await stores.contractSecrets.installations.get(key));
                    if (!value) {
                        throw new Error("Provider credential unavailable");
                    }
                    return value;
                },
                allowPrivateAddresses: true,
            });
            const transport = new HttpGatewayTransport({ network });
            const result = await transport.send({
                requestId: crypto.randomUUID(),
                instanceId: source.observation.report.instanceId,
                installationId: source.installation.id,
                endpoint: source.installation.endpoint,
                providerTokenRef: source.installation.providerTokenRef,
                release: release.admission.release,
                capability,
                input: {
                    connectionId: source.installation.id,
                    cmsUrl: this.cmsUrl,
                    token,
                    generation: intent.expectedRevision,
                },
            });
            if (
                result.errorCode ||
                (result.output as { configured?: boolean })?.configured !== true ||
                (result.output as { connectionId?: string })?.connectionId !== source.installation.id
            ) {
                throw new Error("Provider did not acknowledge pairing");
            }
            const lifecycle = new ProviderInstallationLifecycle(stores.installations, stores.manifests, () =>
                new Date().toISOString(),
            );
            const preparation = await lifecycle.prepareModification(
                { siteId: gateway.siteId, installationId: source.installation.id },
                source.revision,
                { gatewayTokenRef: credentialRef },
                source.observation.report,
            );
            const modified = await lifecycle.modify(preparation, actorId);
            await lifecycle.observe(
                { siteId: gateway.siteId, installationId: source.installation.id },
                modified.revision,
                source.observation.report,
            );
        }
        const activeToken = await stores.contractSecrets.installations.get(intent.key);
        if (!activeToken) {
            throw new Error("Provider credential unavailable");
        }
        await gateway.providers.registerCredential(source.installation.id, credentialRef, activeToken);
        await completePairing(stores, source.installation.id, credentialRef);
        if (source.installation.gatewayTokenRef && source.installation.gatewayTokenRef !== credentialRef) {
            await stores.contractSecrets.installations.delete(secretRefToKey(source.installation.gatewayTokenRef)!);
        }
        return { installationId: source.installation.id, paired: true };
    }
}
