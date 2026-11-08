import { randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { MongoClient } from "mongodb";
import { documentationChildren } from "../documentation/processes";
import { waitForHttp } from "../docker";
import { configureRepository } from "./initializationClient";
import { provisionInstance } from "../provision";
import { instanceDatabaseName } from "../../../../packages/runtimes/ulvia-provider-server/src/runtime/stores/storageRoots";
import type { OfflineRuntimeNetwork } from "./network";

export async function repositoryProcesses() {
    const mongo = process.env.ULVIA_REPOSITORY_TEST_MONGO_URL!;
    const model = process.env.ULVIA_REPOSITORY_TEST_MODEL_DIR!;
    const workspace = resolve(import.meta.dir, "../../../..");
    const root = join(workspace, "artifacts/repository-cms-goal/flows", randomUUID());
    await mkdir(join(root, "files"), { recursive: true, mode: 0o700 });
    // The shipped manifest admits this exact loopback Provider origin.
    const ports = Array.from({ length: 3 }, (_, index) =>
        Bun.serve({ hostname: "127.0.0.1", port: index === 0 ? 5103 : 0, fetch: () => new Response(null) }),
    );
    const [providerUrl, cmsUrl, neighbourUrl] = ports.map((server) => server.url.origin);
    ports.forEach((server) => server.stop(true));
    const processes = documentationChildren(root, workspace);
    const mongoUrl = new URL(mongo);
    mongoUrl.pathname = `/ulvia_registry_journey_${randomBytes(8).toString("hex")}`;
    const client = new MongoClient(mongoUrl.href);
    const operatorToken = randomBytes(32).toString("base64url");
    const network: OfflineRuntimeNetwork = {
        ULVIA_TEST_HTTP_ORIGINS: JSON.stringify([providerUrl, cmsUrl, neighbourUrl]),
        ULVIA_TEST_DENIED_NETWORK: join(root, "denied-network.txt"),
    };
    const admin = { email: "administrator@example.test", password: `Admin-${randomBytes(24).toString("base64url")}` };
    const environment = {
        MONGO_URL: mongoUrl.href,
        CMS_FILES_DIR: join(root, "files"),
        CMS_SESSION_SECRET: randomBytes(32).toString("base64url"),
        CMS_KEK_ACTIVE_ID: "journey",
        CMS_KEK_RING_JSON: JSON.stringify({ journey: randomBytes(32).toString("hex") }),
        // The local Edge does not exist during bootstrap; no remote Repository is available.
        ULVIA_PROVIDER_PORT: new URL(providerUrl!).port,
        ULVIA_PROVIDER_HOST: "127.0.0.1",
        ULVIA_PROVIDER_PUBLIC_URL: providerUrl!,
        ULVIA_PROVIDER_OPERATOR_TOKEN: operatorToken,
        ULVIA_EMBEDDING_MODEL_DIR: model,
        ...network,
    };
    const preload = resolve(import.meta.dir, "network.ts");
    let provider = processes.start(
        "provider",
        [
            process.execPath,
            "--no-macros",
            "run",
            `--preload=${preload}`,
            "packages/runtimes/ulvia-provider-server/src/index.ts",
        ],
        environment,
    );
    const close = async () => {
        await processes.close();
        try {
            await client.connect();
            const records = await client
                .db()
                .collection<{ storageKey: string }>("ulvia_provider_instances")
                .find({})
                .toArray();
            for (const record of records) {
                await client.db(instanceDatabaseName(record.storageKey)).dropDatabase();
            }
            await client.db().dropDatabase();
        } finally {
            await client.close();
        }
    };
    try {
        await waitForHttp(`${providerUrl}/ulvia/operator/instances`, { Authorization: `Bearer ${operatorToken}` });
        const registry = await provisionInstance(
            providerUrl!,
            operatorToken,
            "repository-journey",
            cmsUrl!,
            admin,
            cmsUrl!,
        );
        const edge = async (name: string, url: string, token: string) => {
            processes.start(
                name,
                [process.execPath, "run", `--preload=${preload}`, "packages/runtimes/cms-edge-server/src/index.ts"],
                {
                    MODE: "PROD",
                    CMS_PORT: new URL(url).port,
                    CMS_HOST: "127.0.0.1",
                    CMS_PUBLIC_URL: url,
                    CMS_INSTALLATIONS_PROVIDER_URL: providerUrl!,
                    CMS_INSTALLATIONS_PROVIDER_TOKEN: token,
                    ...network,
                },
            );
            await waitForHttp(`${url}/healthz`);
        };
        await edge("edge", cmsUrl!, registry.credentials.instanceAccessToken);
        await configureRepository(cmsUrl!, admin, cmsUrl!, true);
        return {
            root,
            cmsUrl: cmsUrl!,
            providerUrl: providerUrl!,
            admin,
            registry,
            close,
            async neighbour() {
                const created = await provisionInstance(
                    providerUrl!,
                    operatorToken,
                    "ordinary-journey",
                    neighbourUrl!,
                    admin,
                    neighbourUrl!,
                );
                await edge("neighbour", neighbourUrl!, created.credentials.instanceAccessToken);
                await configureRepository(neighbourUrl!, admin, cmsUrl!);
                return neighbourUrl!;
            },
            async restart() {
                await processes.stop(provider);
                provider = processes.start(
                    "provider-restarted",
                    [
                        process.execPath,
                        "--no-macros",
                        "run",
                        `--preload=${preload}`,
                        "packages/runtimes/ulvia-provider-server/src/index.ts",
                    ],
                    environment,
                );
                await waitForHttp(`${providerUrl}/ulvia/operator/instances`, {
                    Authorization: `Bearer ${operatorToken}`,
                });
            },
        };
    } catch (error) {
        await close();
        throw new Error(`Repository runtime journey failed; inspect ${root}`, { cause: error });
    }
}
