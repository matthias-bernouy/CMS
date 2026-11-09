import { randomBytes } from "node:crypto";
import type { ContainerCluster } from "./cluster";
import { provisionInstance } from "../provision";
import { configureRepository } from "../repository/initializationClient";
import { repositoryApi } from "../repository/client";

/** Registry is a logical CMS on the shared Edge; activation stays an explicit native choice. */
export async function repositoryApplication(
    cluster: ContainerCluster,
    providerUrl: string,
    operatorToken: string,
    hosting: {
        registryOrigin: string;
        claimDomain(instanceId: string, origin: string): Promise<void>;
        disableInstance(instanceId: string): Promise<unknown>;
    },
) {
    const url = hosting.registryOrigin;
    const name = `${cluster.id}-edge`;
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
        url,
    );
    await hosting.claimDomain(instance.instance.id, url);
    await configureRepository(url, administrator, url, true);
    const api = repositoryApi(url);
    const account = await api.signup("publisher@example.test", `Publisher-${randomBytes(24).toString("base64url")}!`);
    if (account.administrator) {
        throw new Error("Container publisher must be an ordinary CMS account");
    }
    const pat = await api.pat(account.cookie);
    return {
        url,
        name,
        instance,
        administrator,
        account,
        pat,
        disable: () => hosting.disableInstance(instance.instance.id),
    };
}
