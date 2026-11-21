import { observeHttp } from "../../harness/clients/http";
import { observeMcp } from "../../harness/clients/mcp";
import { sampleScenario } from "../../harness/execution/samples";
import type { MeasuredStack } from "../../harness/docker/collect";
import type { ClientCall, McpTool } from "../../harness/clients/types";
import type { ScenarioSession } from "../../harness/clients/session";
import type { ScenarioResult } from "../../capabilities/types";
import { requireRecord } from "./types";
import type { QueryContext, QueryScenario } from "./types";
import type { DnsControl } from "../../harness/services/dns/client";
import type { SmtpService } from "../../harness/services/smtp/client";
import type { TlsControl } from "../../harness/services/tls/container";

export type QueryEnvironment = Readonly<{
    stack: MeasuredStack &
        Readonly<{
            restartProvider: () => Promise<void>;
            instanceId: string;
            control?: Readonly<{ origin: string; administrator: { email: string; password: string } }>;
            dns?: DnsControl;
            smtp?: SmtpService;
            tls?: TlsControl;
            providerControl?: Readonly<{ origin: () => Promise<string>; token: string }>;
            operatorControl?: Readonly<{ origin: () => Promise<string>; token: string }>;
            routingControl?: Readonly<{ origin: () => Promise<string>; secret: string }>;
            createPendingSite?: (
                alias: string,
            ) => Promise<
                Readonly<{ url: string; instanceId: string; administrator: { email: string; password: string } }>
            >;
        }>;
    main: Readonly<{ origin: string; cookie: string; token: string; subjectId: string; tools: readonly McpTool[] }>;
    registry: Readonly<{ origin: string; cookie: string; subjectId: string; publicationToken?: string }>;
    isolationSite?: () => Promise<ScenarioSession>;
}>;

export async function executeQuery(scenario: QueryScenario, environment: QueryEnvironment): Promise<ScenarioResult> {
    const { definition, target, obligation, recipe } = scenario;
    const site = recipe.site === "registry" ? environment.registry : environment.main;
    const context: QueryContext = { subjectId: site.subjectId, collectionId: "ulvia.test/smoke-kit" };
    const call: ClientCall = {
        origin: site.origin,
        target,
        binding: obligation.binding,
        input: recipe.input?.(context) ?? {},
        credentials: obligation.binding === "mcp" ? { token: environment.main.token } : { cookie: site.cookie },
        assert: (output) => recipe.assert(requireRecord(output), context),
    };
    const send = () => (obligation.binding === "mcp" ? observeMcp(call, environment.main.tools) : observeHttp(call));
    return sampleScenario(environment.stack, definition, obligation, async () => ({
        async send() {
            if (obligation.variant === "cold") {
                await environment.stack.restartProvider();
            }
            return send();
        },
    }));
}
