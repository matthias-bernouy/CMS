import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repositoryApi } from "../repository/client";
import { configureRepository, initializeEmpty } from "../repository/initializationClient";

/** Private operator bootstrap and ordinary empty Control setup for disposable shared deployments. */
export async function createContainerHosting(port: number) {
    const root = await mkdtemp(join(tmpdir(), "ulvia-container-hosting-"));
    const file = join(root, "administrator.json");
    const administrator = {
        email: "operator@example.test",
        password: `Operator-${randomBytes(24).toString("base64url")}!`,
    };
    await writeFile(file, JSON.stringify(administrator), { mode: 0o600 });
    const origin = `http://control.localhost:${port}`;
    const registryOrigin = `http://registry.localhost:${port}`;
    const edgeSecret = randomBytes(32).toString("base64url");
    let actor: { cookie: string } | undefined;
    const call = async (capability: string, input: unknown) => {
        if (!actor) {
            throw new Error("Control must be configured before hosting administration");
        }
        const response = await repositoryApi(origin).request(
            "ulvia/cms.hosting",
            `/hosting/${capability}`,
            "POST",
            input,
            actor,
        );
        if (!response.ok) {
            throw new Error(`Hosting ${capability} refused (${response.status}): ${await response.text()}`);
        }
        return response.json();
    };
    return {
        administrator,
        origin,
        registryOrigin,
        edgeSecret,
        providerEnvironment: {
            ULVIA_CONTROL_ORIGIN: origin,
            ULVIA_CONTROL_BOOTSTRAP_FILE: file,
            ULVIA_EDGE_ROUTING_SECRET: edgeSecret,
            ULVIA_HOSTING_PROXY_URL: `http://127.0.0.1:${port}`,
        },
        providerOptions: [
            "--volume",
            `${file}:/run/ulvia/control-administrator.json:ro`,
            "--env",
            `ULVIA_CONTROL_ORIGIN=${origin}`,
            "--env",
            "ULVIA_CONTROL_BOOTSTRAP_FILE=/run/ulvia/control-administrator.json",
            "--env",
            `ULVIA_EDGE_ROUTING_SECRET=${edgeSecret}`,
            "--env",
            "ULVIA_HOSTING_PROXY_URL=http://edge:3000",
        ],
        async initialize(repositoryOrigin = registryOrigin) {
            await configureRepository(origin, administrator, repositoryOrigin);
            actor = await repositoryApi(origin).session(administrator.email, administrator.password);
            await initializeEmpty(origin, administrator, actor.cookie);
        },
        async claimDomain(instanceId: string, targetOrigin: string) {
            const result = await call("domains.claim", { instanceId, origin: targetOrigin });
            if (result.domain.state !== "active") {
                throw new Error("A local test domain must be active before use");
            }
        },
        disableInstance: (instanceId: string) => call("instances.disable", { instanceId }),
        close: () => rm(root, { recursive: true, force: true }),
    };
}
