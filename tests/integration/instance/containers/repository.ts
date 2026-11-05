import { randomBytes } from "node:crypto";
import type { ContainerCluster } from "./cluster";
import { provisionInstance } from "../provision";
import { waitForHttp } from "../docker";
import { repositoryApi } from "../repository/client";

/** Registry bootstraps from the same Provider snapshot before its own Edge exists. */
export async function repositoryApplication(
    cluster: ContainerCluster,
    edgeImage: string,
    providerUrl: string,
    operatorToken: string,
) {
    const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(null) });
    const port = reservation.port!;
    reservation.stop(true);
    const url = `http://127.0.0.1:${port}`;
    const name = `${cluster.id}-registry-edge`;
    const administrator = {
        email: "registry-admin@example.test",
        password: `Admin-${randomBytes(24).toString("base64url")}!`,
    };
    const instance = await provisionInstance(
        providerUrl,
        operatorToken,
        `${cluster.id}-registry`,
        url,
        administrator,
        "http://repository:3000",
        { id: "repository", version: "1.0.0" },
    );
    await cluster.run(name, "repository", edgeImage, [
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
    const api = repositoryApi(url);
    const account = await api.signup("publisher@example.test", `Publisher-${randomBytes(24).toString("base64url")}!`);
    if (account.administrator) {
        throw new Error("Container publisher must be an ordinary CMS account");
    }
    const pat = await api.pat(account.cookie);
    return { url, name, instance, administrator, account, pat };
}
