import type { ContainerCluster } from "./cluster";
import { provisionInstance } from "../provision";
import { waitForHttp } from "../docker";

export async function scratchSite(
    cluster: ContainerCluster,
    image: string,
    providerUrl: string,
    operatorToken: string,
    administrator: { email: string; password: string },
    alias: string,
) {
    const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(null) });
    const port = reservation.port!;
    reservation.stop(true);
    const url = `http://127.0.0.1:${port}`;
    const name = `${cluster.id}-${alias}`;
    const instance = await provisionInstance(
        providerUrl,
        operatorToken,
        name,
        url,
        administrator,
        `http://${alias}:3000`,
        { id: "ulvia", version: "1.3.0" },
    );
    await cluster.run(name, alias, image, [
        "--publish",
        `127.0.0.1:${port}:3000`,
        "--env",
        `CMS_PUBLIC_URL=${url}`,
        "--env",
        "CMS_INSTALLATIONS_PROVIDER_URL=http://ulvia-provider:5103",
        "--env",
        `CMS_INSTALLATIONS_PROVIDER_TOKEN=${instance.credentials.instanceAccessToken}`,
    ]);
    await waitForHttp(`${url}/readyz`);
    return { url, name, administrator };
}
