import { sharedDeployment } from "./deployment";
import { repositoryApplication } from "./repository";
import { scratchSite } from "./scratchSite";
import { docker, waitForHttp } from "../docker";

/** Start an empty Registry on the shared Edge, without any collection publication. */
export async function scratchRepository(images: { provider: string; edge: string }) {
    const stack = await sharedDeployment(images);
    const { cluster, hosting, providerName, edgeName, providerUrl, operatorToken } = stack;
    try {
        const repository = await repositoryApplication(cluster, providerUrl, operatorToken, hosting);
        return {
            url: repository.url,
            administrator: repository.administrator,
            providerName,
            edgeName,
            disableRepository: repository.disable,
            createSite: (alias: string) => scratchSite(stack, alias),
            close: stack.close,
            async probeProvider() {
                const started = performance.now();
                const response = await fetch(`${providerUrl}/ulvia/operator/instances?limit=1`, {
                    headers: { Authorization: `Bearer ${operatorToken}` },
                    signal: AbortSignal.timeout(5_000),
                });
                await response.body?.cancel();
                return { status: response.status, durationMs: performance.now() - started };
            },
            async restart() {
                await docker(["restart", providerName]);
                await waitForHttp(`${providerUrl}/readyz`);
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
        await stack.close();
        throw error;
    }
}
