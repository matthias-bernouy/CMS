import { sharedDeployment } from "./containers/deployment";
import { createTraceProbe, installDeliveryFixture } from "./containers/deliveryFixture";
import { repositoryApplication } from "./containers/repository";
import { publishBundledReleases } from "./repository/bootstrap";
import { provisionInstance } from "./provision";
import { scratchSite } from "./containers/scratchSite";
import { configureRepository, initializeEmpty } from "./repository/initializationClient";

import { docker, waitForHttp } from "./docker";
import { upgradeProvider } from "./provider-upgrade";
import type { ContainerResourceLimits } from "./containers/cluster";
import type { DeploymentSetup } from "./containers/deployment";
export { docker, waitForHttp } from "./docker";

export async function mcpContainers(
    images: { edge: string; provider: string },
    prepareRepository?: (url: string, token: string) => Promise<void>,
    fetchPreload?: string,
    initialResponseCache?: boolean,
    resources?: ContainerResourceLimits,
    prepareServices?: DeploymentSetup,
) {
    const deployment = await sharedDeployment(images, fetchPreload, initialResponseCache, resources, prepareServices);
    const {
        cluster,
        hosting,
        providerUrl,
        providerName,
        edgeName,
        cmsUrl,
        namedUrl,
        operatorToken,
        administrator,
        startEdge,
        close,
    } = deployment;
    const { id, names } = cluster;
    try {
        const repository = await repositoryApplication(cluster, providerUrl, operatorToken, hosting);
        const repositoryUrl = repository.url;
        await publishBundledReleases(repositoryUrl, "http://ulvia-provider:5103", repository.pat.token);
        await initializeEmpty(repositoryUrl, repository.administrator);
        await installDeliveryFixture(repositoryUrl, repository.administrator, repository);
        if (prepareRepository) {
            await prepareRepository(repositoryUrl, repository.pat.token);
        }
        const instance = await provisionInstance(providerUrl, operatorToken, id, cmsUrl, administrator, cmsUrl);
        await hosting.claimDomain(instance.instance.id, cmsUrl);
        const named = await provisionInstance(
            providerUrl,
            operatorToken,
            `${id}-named`,
            namedUrl,
            administrator,
            namedUrl,
        );
        await hosting.claimDomain(named.instance.id, namedUrl);
        await configureRepository(namedUrl, administrator, repositoryUrl);
        await initializeEmpty(namedUrl, administrator);
        await configureRepository(cmsUrl, administrator, repositoryUrl);
        await initializeEmpty(cmsUrl, administrator);
        await installDeliveryFixture(cmsUrl, administrator, repository);
        await createTraceProbe(cmsUrl, administrator);
        return {
            id,
            gatewayUrl: cmsUrl,
            namedStatus: named.instance.status,
            providerUrl: () => cluster.endpoint(providerName, 5103),
            waitForProvider: () => waitForHttp(`${providerUrl}/readyz`),
            instanceToken: instance.credentials.instanceAccessToken,
            routingSecret: hosting.edgeSecret,
            namedToken: named.credentials.instanceAccessToken,
            cmsUrl,
            namedUrl,
            repositoryUrl,
            repository,
            administrator,
            providerName,
            instanceId: instance.instance.id,
            control: { origin: hosting.origin, administrator: hosting.administrator },
            createPendingSite: (alias: string) => scratchSite(deployment, alias),
            upgradeProvider: async (image: string) => {
                await upgradeProvider(
                    providerName,
                    image,
                    operatorToken,
                    instance.instance.id,
                    names,
                    await cluster.endpoint(providerName, 5103),
                );
                await waitForHttp(`${cmsUrl}/readyz`);
            },
            edgeName,
            async setResponseCache(enabled: boolean) {
                await docker(["rm", "--force", `${edgeName}-ingress`, edgeName]);
                await startEdge(enabled);
                await waitForHttp(`${cmsUrl}/readyz`);
            },
            close,
            async createEdgeReplica() {
                const name = `${edgeName}-replica`;
                await cluster.run(name, "edge-replica", images.edge, [
                    "--publish",
                    "127.0.0.1::3000",
                    "--env",
                    "CMS_HOSTING_PROVIDER_URL=http://ulvia-provider:5103",
                    "--env",
                    `CMS_HOSTING_EDGE_SECRET=${hosting.edgeSecret}`,
                    "--env",
                    "CMS_EDGE_RESPONSE_CACHE=true",
                ]);
                const endpoint = await cluster.endpoint(name, 3000);
                await waitForHttp(`${endpoint}/readyz`);
                return { name, endpoint };
            },
            async restartProvider(stopTimeoutSeconds = 10) {
                if (!Number.isSafeInteger(stopTimeoutSeconds) || stopTimeoutSeconds < 0 || stopTimeoutSeconds > 10) {
                    throw new Error("Invalid test restart stop timeout");
                }
                await docker(["restart", "--time", String(stopTimeoutSeconds), providerName]);
                await waitForHttp(`${await cluster.endpoint(providerName, 5103)}/readyz`);
            },
            async diagnostics() {
                return (
                    await Promise.all(
                        [providerName, edgeName].map(async (name) => {
                            const result = await docker(["logs", "--tail", "30", name], true);
                            return `${name}\n${result.stdout}${result.stderr}`;
                        }),
                    )
                ).join("\n");
            },
        };
    } catch (error) {
        const logs = await Promise.all(
            names.map(async (name) => {
                const value = await docker(["logs", "--tail", "15", name], true);
                return `${name}\n${value.stdout}${value.stderr}`;
            }),
        );
        await close();
        throw new Error(`${String(error)}\n${logs.join("\n")}`);
    }
}
