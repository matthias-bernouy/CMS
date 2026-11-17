import { sharedDeployment } from "./containers/deployment";
import { createTraceProbe, installDeliveryFixture } from "./containers/deliveryFixture";
import { repositoryApplication } from "./containers/repository";
import { initializationApi, configureRepository } from "./repository/initializationClient";
import { repositoryApi } from "./repository/client";
import { publishBundledReleases } from "./repository/bootstrap";
import { provisionInstance } from "./provision";
import { scratchSite } from "./containers/scratchSite";

import { docker, waitForHttp } from "./docker";
import { upgradeProvider } from "./provider-upgrade";
import type { ContainerResourceLimits } from "./containers/cluster";
export { docker, waitForHttp } from "./docker";

export async function mcpContainers(
    images: { edge: string; provider: string },
    prepareRepository?: (url: string, token: string) => Promise<void>,
    fetchPreload?: string,
    initialResponseCache?: boolean,
    resources?: ContainerResourceLimits,
) {
    const deployment = await sharedDeployment(images, fetchPreload, initialResponseCache, resources);
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
            namedToken: named.credentials.instanceAccessToken,
            cmsUrl,
            namedUrl,
            repositoryUrl,
            repository,
            administrator,
            providerName,
            instanceId: instance.instance.id,
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

async function initializeEmpty(origin: string, administrator: { email: string; password: string }) {
    const session = await repositoryApi(origin).session(administrator.email, administrator.password);
    const setup = initializationApi(origin, session.cookie);
    const review = await setup.plan(null);
    await setup.apply(null, review.digest);
}
