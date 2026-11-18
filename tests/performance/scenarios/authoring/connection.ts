import { assertCondition, requireRecord } from "../queries/types";
import type { PreparedSample } from "../../harness/execution/samples";
import type { QueryEnvironment } from "../queries/execute";
import type { ScenarioClient } from "../../harness/clients/session";

/** Test-only credentials stay in closures and are restored before other families execute. */
export async function prepareConnection(
    client: ScenarioClient,
    environment: QueryEnvironment,
    capability: string,
    binding: string,
): Promise<PreparedSample> {
    const token = environment.registry.publicationToken;
    assertCondition(typeof token === "string" && token.length > 0);
    const configure = async () => {
        const result = await client("ulvia/cms.authoring", "configure-connection", "http", { token });
        assertCondition(result.observation.validated && requireRecord(result.output).configured === true);
    };
    await configure();
    const configured = capability === "configure-connection";
    return {
        async send() {
            return (
                await client("ulvia/cms.authoring", capability, binding, configured ? { token } : {}, (output) => {
                    const status = requireRecord(output);
                    assertCondition(status.configured === configured);
                    assertCondition(status.repositoryUrl === environment.registry.origin);
                })
            ).observation;
        },
        async verify() {
            const result = await client("ulvia/cms.authoring", "get-connection", "http", {});
            assertCondition(result.observation.validated);
            assertCondition(requireRecord(result.output).configured === configured);
        },
        close: configure,
    };
}

/** Prime the live reader, disconnect through the ordinary command, and measure the refreshed state. */
export async function prepareConnectionRead(
    client: ScenarioClient,
    environment: QueryEnvironment,
    binding: string,
): Promise<PreparedSample> {
    const mutation = await prepareConnection(client, environment, "disconnect-connection", "http");
    const assertDisconnected = (output: unknown) => {
        const status = requireRecord(output);
        assertCondition(
            status.configured === false &&
                status.repositoryId === null &&
                status.repositoryUrl === environment.registry.origin &&
                Object.keys(status).toSorted().join(",") === "configured,repositoryId,repositoryUrl",
            "authoring-connection-stale-or-sensitive-state",
        );
    };
    try {
        const primed = await client("ulvia/cms.authoring", "get-connection", "http", {});
        const connected = requireRecord(primed.output);
        assertCondition(
            primed.observation.validated &&
                connected.configured === true &&
                connected.repositoryUrl === environment.registry.origin &&
                typeof connected.repositoryId === "string",
        );
        const changed = await mutation.send();
        assertCondition(changed.validated, "authoring-connection-disconnect-failed");
        return {
            async send() {
                return (await client("ulvia/cms.authoring", "get-connection", binding, {}, assertDisconnected))
                    .observation;
            },
            async verify() {
                await mutation.verify?.();
                const foreign = await client("ulvia/cms.authoring", "get-connection", "http", {}, undefined, {
                    httpCredentials: { cookie: environment.registry.cookie },
                });
                assertCondition(
                    !foreign.observation.validated && [401, 403].includes(foreign.observation.status),
                    "authoring-connection-foreign-session",
                );
                const saved = await client("ulvia/cms.authoring", "get-connection", "http", {}, assertDisconnected);
                assertCondition(saved.observation.validated);
            },
            close: mutation.close,
        };
    } catch (error) {
        await mutation.close?.();
        throw error;
    }
}
