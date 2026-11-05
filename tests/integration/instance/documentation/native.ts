import { randomBytes } from "node:crypto";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { MongoClient } from "mongodb";
import { provisionInstance } from "../provision";
import { waitForHttp } from "../docker";
import { publishBundledReleases } from "../repository/bootstrap";
import { documentationRepositoryEntrypoint } from "./repository";
import { repositoryApi } from "../repository/client";
import { documentationChildren } from "./processes";
import { documentationPreparations, waitForDocumentationPreparation } from "./cold/preparations";

export async function documentationProcesses() {
    const root = await mkdtemp(join(tmpdir(), "ulvia-documentation-flow-"));
    const workspace = resolve(import.meta.dir, "../../../..");
    const reservations = Array.from({ length: 4 }, (_, index) =>
        Bun.serve({ hostname: "127.0.0.1", port: index === 2 ? 5103 : 0, fetch: () => new Response(null) }),
    );
    const [mongoPort, repositoryPort, providerPort, edgePort] = reservations.map((server) => server.port!);
    reservations.forEach((server) => {
        server.stop(true);
    });
    const processes = documentationChildren(root, workspace);
    const { start, stop } = processes;
    const close = async () => {
        await processes.close();
        await rm(root, { recursive: true, force: true });
    };
    const mongoUrl = `mongodb://127.0.0.1:${mongoPort}/documentation_control?retryWrites=false`;
    const repositoryUrl = `http://127.0.0.1:${repositoryPort}`;
    const providerUrl = `http://127.0.0.1:${providerPort}`;
    const cmsUrl = `http://127.0.0.1:${edgePort}`;
    try {
        await mkdir(join(root, "mongo"));
        start("mongo", [
            process.env.ULVIA_DOCUMENTATION_MONGOD ?? "mongod",
            "--dbpath",
            join(root, "mongo"),
            "--bind_ip",
            "127.0.0.1",
            "--port",
            String(mongoPort),
            "--nounixsocket",
            "--quiet",
        ]);
        const mongo = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 15_000 });
        await mongo.connect();
        await mongo.close();
        start("repository", [
            process.execPath,
            "run",
            documentationRepositoryEntrypoint,
            join(root, "repository"),
            String(repositoryPort),
        ]);
        await waitForHttp(`${repositoryUrl}/readyz`);
        const account = await Bun.file(join(root, "repository/fixture-account.json")).json();
        await publishBundledReleases(repositoryUrl, providerUrl, account.token);
        await mkdir(join(root, "files"));
        if (process.env.ULVIA_DOCUMENTATION_MODEL_CACHE) {
            await cp(process.env.ULVIA_DOCUMENTATION_MODEL_CACHE, join(root, "files/.documentation-models"), {
                recursive: true,
            });
        }
        const operatorToken = randomBytes(32).toString("base64url");
        const env = {
            MODE: "PROD",
            MONGO_URL: mongoUrl,
            CMS_FILES_DIR: join(root, "files"),
            CMS_SESSION_SECRET: randomBytes(32).toString("base64url"),
            CMS_KEK_ACTIVE_ID: "control",
            CMS_KEK_RING_JSON: JSON.stringify({ control: randomBytes(32).toString("hex") }),
            CMS_REPOSITORY_URL: repositoryUrl,
            CMS_REPOSITORY_ALLOW_INSECURE_HTTP: "true",
            ULVIA_PROVIDER_PORT: String(providerPort),
            ULVIA_PROVIDER_HOST: "127.0.0.1",
            ULVIA_PROVIDER_PUBLIC_URL: providerUrl,
            ULVIA_PROVIDER_OPERATOR_TOKEN: operatorToken,
            ...(process.env.ULVIA_DOCUMENTATION_MODEL_CACHE
                ? { ULVIA_EMBEDDING_MODEL_DIR: join(root, "files/.documentation-models") }
                : {}),
        };
        const startProvider = () =>
            start(
                "provider",
                [process.execPath, "--no-macros", "run", "packages/runtimes/ulvia-provider-server/src/index.ts"],
                env,
            );
        let provider = startProvider();
        await waitForHttp(`${providerUrl}/ulvia/operator/instances`, { Authorization: `Bearer ${operatorToken}` });
        const administrator = {
            email: "documentation@ulvia.local",
            password: `Docs-${randomBytes(24).toString("base64url")}!`,
        };
        const instance = await provisionInstance(
            providerUrl,
            operatorToken,
            "documentation-native",
            cmsUrl,
            administrator,
            cmsUrl,
        );
        const startEdge = async (name: string, url: string, token: string) => {
            start(name, [process.execPath, "run", "packages/runtimes/cms-edge-server/src/index.ts"], {
                MODE: "PROD",
                CMS_PORT: new URL(url).port,
                CMS_HOST: "127.0.0.1",
                CMS_PUBLIC_URL: url,
                CMS_INSTALLATIONS_PROVIDER_URL: providerUrl,
                CMS_INSTALLATIONS_PROVIDER_TOKEN: token,
            });
            await waitForHttp(`${url}/readyz`);
            const api = repositoryApi(url);
            const admin = await api.session(administrator.email, administrator.password);
            const connected = await api.request(
                "ulvia/cms.authoring",
                "/configure-connection",
                "POST",
                { token: account.token },
                admin,
            );
            if (connected.status !== 200) {
                throw new Error(`Documentation authoring connection failed (${connected.status})`);
            }
            await connected.body?.cancel();
        };
        await startEdge("edge", cmsUrl, instance.credentials.instanceAccessToken);
        return {
            cmsUrl,
            administrator,
            mongoUrl,
            close,
            processOutcomes: processes.outcomes,
            documentationPreparations: () => documentationPreparations(root, instance.instance.id),
            waitForDocumentation: (afterCount = 0, revision?: string) =>
                waitForDocumentationPreparation(root, instance.instance.id, afterCount, revision),
            async createNeighbour() {
                const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(null) });
                const neighbourUrl = `http://127.0.0.1:${reservation.port}`;
                reservation.stop(true);
                const neighbour = await provisionInstance(
                    providerUrl,
                    operatorToken,
                    "documentation-neighbour",
                    neighbourUrl,
                    administrator,
                    neighbourUrl,
                );
                await startEdge("neighbour", neighbourUrl, neighbour.credentials.instanceAccessToken);
                return { cmsUrl: neighbourUrl, administrator };
            },
            async restartProvider(beforeStart?: () => Promise<unknown>) {
                await stop(provider);
                await beforeStart?.();
                provider = startProvider();
                await waitForHttp(`${providerUrl}/ulvia/operator/instances`, {
                    Authorization: `Bearer ${operatorToken}`,
                });
            },
            diagnostics: async () => {
                const logs = await Promise.all(
                    ["repository", "provider", "edge", "neighbour"].map(async (name) =>
                        (await Bun.file(join(root, `${name}.log`)).exists())
                            ? `${name}: ${(await Bun.file(join(root, `${name}.errors.log`)).text()).slice(-2500)} ${(await Bun.file(join(root, `${name}.log`)).text()).slice(-2500)}`
                            : "",
                    ),
                );
                return logs.join("\n");
            },
        };
    } catch (error) {
        const logs = await Promise.all(
            ["mongo", "repository", "provider", "edge"].map(async (name) => {
                const file = Bun.file(join(root, `${name}.errors.log`));
                return (await file.exists()) ? `${name}: ${(await file.text()).slice(-2000)}` : "";
            }),
        );
        await close();
        throw new Error(`${String(error)}\n${logs.join("\n")}`);
    }
}
