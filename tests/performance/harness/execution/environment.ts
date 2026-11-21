import { mcpTokenRefresh } from "../clients/refresh";
import { isolationSession } from "../clients/isolation";
import type { mcpContainers } from "../../../integration/instance/containers";
import type { connectBrowser } from "../../../integration/instance/oauth";
import type { QueryEnvironment } from "../../scenarios/queries/execute";
import type { CapabilityInventory, ScenarioDefinition } from "../../capabilities/types";
import type { DnsControl } from "../services/dns/client";
import type { SmtpService } from "../services/smtp/client";
import type { TlsControl } from "../services/tls/container";

type Stack = Awaited<ReturnType<typeof mcpContainers>>;
type Connection = Awaited<ReturnType<typeof connectBrowser>>;

/** Credentials remain live closures, so later scenarios receive rotated tokens rather than stale copies. */
export function assessmentEnvironment(
    stack: Stack,
    connection: Connection,
    session: Readonly<{ cookie: string; accountId: string }>,
    inventory: CapabilityInventory,
    dns?: DnsControl,
    smtp?: SmtpService,
    tls?: TlsControl,
) {
    const refresh = mcpTokenRefresh({ origin: stack.cmsUrl, clientId: connection.clientId, token: connection.token });
    const mcpBindings = new Set(
        inventory.targets.flatMap((target) =>
            target.definition.bindings
                .filter((binding) => binding.transport === "mcp")
                .map((binding) => JSON.stringify([target.key, binding.id])),
        ),
    );
    const environment: QueryEnvironment = {
        stack: {
            id: stack.id,
            providerName: stack.providerName,
            edgeName: stack.edgeName,
            instanceId: stack.instanceId,
            control: stack.control,
            providerControl: { origin: stack.providerUrl, token: stack.instanceToken },
            operatorControl: { origin: stack.providerUrl, token: stack.operatorToken },
            routingControl: { origin: stack.providerUrl, secret: stack.routingSecret },
            ...(dns ? { dns } : {}),
            ...(smtp ? { smtp } : {}),
            ...(tls ? { tls } : {}),
            createPendingSite: stack.createPendingSite,
            restartProvider: () => stack.restartProvider(1),
        },
        main: {
            origin: stack.cmsUrl,
            cookie: session.cookie,
            subjectId: session.accountId,
            get token() {
                return connection.token.access_token;
            },
            tools: connection.tools,
        },
        registry: {
            origin: stack.repositoryUrl,
            cookie: stack.repository.account.cookie,
            subjectId: stack.repository.account.accountId,
            publicationToken: stack.repository.pat.token,
        },
        isolationSite: isolationSession(stack.cmsUrl, stack.namedUrl, stack.administrator),
    };
    return {
        environment,
        async prepare(definition: ScenarioDefinition) {
            if (definition.obligations.some((row) => mcpBindings.has(JSON.stringify([row.target, row.binding])))) {
                // Default scenarios have at most thirteen timed/warm-up calls
                // with 30-second timeouts; reserve time for slow preparation too.
                await refresh(10 * 60_000);
            }
        },
    };
}
