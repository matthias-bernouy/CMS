import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { secretRefToKey, type SecretReader } from "@bernouy/cms-secrets";
import { IntegrationRuntimeError } from "../../../core/errors";
import type {
    IntegrationMigrationExternalPhaseHandler,
    IntegrationMigrationStepContext,
} from "../../../interfaces/IntegrationConnectorDeployer";
import { buildFunctionBody } from "../functionBundle";
import { resolveExistingSupabaseDirectory } from "../paths";
import { SupabaseManagementClient } from "../SupabaseManagementClient";
import type { SupabaseConnectorDeployerConfig } from "../types";

type FunctionReceipt = { slug: string; bundleDigest: string };
const RECEIPT_PREFIX = "cms-supabase-functions-v1:";

export class SupabaseFunctionMigrationHandler implements IntegrationMigrationExternalPhaseHandler {
    private readonly client: SupabaseManagementClient;

    constructor(
        config: SupabaseConnectorDeployerConfig,
        private readonly integrationSecrets?: SecretReader,
    ) {
        this.client = new SupabaseManagementClient({
            projectRef: required(config.projectRef, "projectRef"),
            accessToken: required(config.accessToken, "accessToken"),
            apiBaseUrl: (config.apiBaseUrl ?? "https://api.supabase.com").replace(/\/+$/, ""),
            fetch: config.fetch ?? fetch,
        });
    }

    async execute(context: IntegrationMigrationStepContext) {
        assertPhase(context);
        const receipts: FunctionReceipt[] = [];
        for (const transition of context.connectors.filter((connector) => connector.provider === "supabase")) {
            const connector = targetConnector(context, transition.connectorKey);
            assertSideBySideCutover(context, transition.connectorKey, connector.functions ?? []);
            const connectorRoot = await resolveExistingSupabaseDirectory(
                context.targetPackageRoot,
                connector.root ?? "",
            );
            const secrets = await targetFunctionSecrets(context, connector.functions ?? [], this.integrationSecrets);
            if (secrets.length) {
                await this.client.setFunctionSecrets(secrets);
            }
            for (const fn of [...(connector.functions ?? [])].sort((left, right) =>
                left.name.localeCompare(right.name),
            )) {
                const result = parseFunction(
                    await this.client.deployFunctionWithReceipt(fn.name, await buildFunctionBody(connectorRoot, fn)),
                    fn.name,
                );
                receipts.push({ slug: result.slug, bundleDigest: result.bundleDigest });
            }
        }
        return { externalOperationId: encodeReceipt(receipts) };
    }

    async confirm(context: IntegrationMigrationStepContext, previous: { externalOperationId?: string }) {
        assertPhase(context);
        const receipts = decodeReceipt(previous.externalOperationId);
        if (!receipts || !sameSlugs(receipts, expectedSlugs(context))) {
            return { confirmed: false };
        }
        for (const receipt of receipts) {
            const current = parseFunction(await this.client.getFunction(receipt.slug), receipt.slug);
            if (current.status !== "ACTIVE" || current.bundleDigest !== receipt.bundleDigest) {
                return { confirmed: false };
            }
        }
        return { confirmed: true, externalOperationId: previous.externalOperationId };
    }
}

async function targetFunctionSecrets(
    context: IntegrationMigrationStepContext,
    functions: NonNullable<ReturnType<typeof targetConnector>["functions"]>,
    reader: SecretReader | undefined,
): Promise<Array<{ name: string; value: string }>> {
    const resolved = new Map<string, string>();
    for (const fn of functions) {
        for (const [name, configured] of Object.entries(fn.secrets ?? {})) {
            const value = await targetFunctionSecret(context, configured, reader);
            const previous = resolved.get(name);
            if (previous !== undefined && previous !== value) {
                throw new IntegrationRuntimeError(`Supabase Function secret "${name}" has conflicting target values`);
            }
            resolved.set(name, value);
        }
    }
    return [...resolved].sort(([left], [right]) => left.localeCompare(right)).map(([name, value]) => ({ name, value }));
}

async function targetFunctionSecret(
    context: IntegrationMigrationStepContext,
    configured: string,
    reader: SecretReader | undefined,
): Promise<string> {
    const generated = configured.match(/^\s*\{\{\s*generated\.([A-Za-z0-9_-]+)\s*\}\}\s*$/)?.[1];
    const key = generated ? context.installation.secretRefs[generated] : secretRefToKey(configured);
    if (!key) {
        if (configured.includes("{{")) {
            throw new IntegrationRuntimeError("Supabase Function migration contains an unsupported secret template");
        }
        return configured;
    }
    if (!reader) {
        throw new IntegrationRuntimeError("Supabase Function migration requires the integration secret store");
    }
    const value = await reader.get(key);
    if (!value) {
        throw new IntegrationRuntimeError(`Supabase Function migration secret "${key}" is unavailable`);
    }
    return value;
}

function assertPhase(context: IntegrationMigrationStepContext): void {
    if (context.phase !== "deploy-functions") {
        throw new IntegrationRuntimeError(`Supabase function handler cannot execute phase "${context.phase}"`);
    }
}

function targetConnector(context: IntegrationMigrationStepContext, connectorKey: string) {
    const connector = context.targetDefinition.connectors?.find((candidate) => candidate.connectorKey === connectorKey);
    if (!connector) {
        throw new IntegrationRuntimeError(`Target connector "${connectorKey}" is unavailable`);
    }
    return connector;
}

function assertSideBySideCutover(
    context: IntegrationMigrationStepContext,
    connectorKey: string,
    targetFunctions: Array<{ name: string }>,
): void {
    const transition = context.connectors.find((connector) => connector.connectorKey === connectorKey);
    if (!transition?.plan.cmsMediated) {
        return;
    }
    const sourceConnectors = (context.sourceDefinition.connectors ?? []).filter(
        (connector) => connector.connectorKey === connectorKey || connector.provider === transition.provider,
    );
    const sourceSlugs = new Set(
        sourceConnectors.flatMap((connector) => connector.functions ?? []).map((fn) => fn.name),
    );
    if (!targetFunctions.some((fn) => !sourceSlugs.has(fn.name))) {
        throw new IntegrationRuntimeError(
            `CMS binding switch for connector "${connectorKey}" requires a target Function slug deployed alongside the source`,
        );
    }
}

function expectedSlugs(context: IntegrationMigrationStepContext): string[] {
    return context.connectors
        .filter((connector) => connector.provider === "supabase")
        .flatMap((transition) => targetConnector(context, transition.connectorKey).functions ?? [])
        .map((fn) => fn.name)
        .sort();
}

function sameSlugs(receipts: FunctionReceipt[], expected: string[]): boolean {
    const actual = receipts.map((receipt) => receipt.slug).sort();
    return actual.length === expected.length && actual.every((slug, index) => slug === expected[index]);
}

function parseFunction(value: unknown, expectedSlug: string): FunctionReceipt & { status: string } {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new IntegrationRuntimeError("Supabase returned invalid Function metadata", 502);
    }
    const record = value as Record<string, unknown>;
    const slug = typeof record.slug === "string" ? record.slug : "";
    const status = typeof record.status === "string" ? record.status : "";
    const bundleDigest = typeof record.ezbr_sha256 === "string" ? record.ezbr_sha256 : "";
    if (slug !== expectedSlug || !status || !bundleDigest) {
        throw new IntegrationRuntimeError(`Supabase returned incomplete metadata for Function "${expectedSlug}"`, 502);
    }
    return { slug, status, bundleDigest };
}

function encodeReceipt(receipts: FunctionReceipt[]): string {
    const bytes = canonicalJsonBytes({ schema: "cms.supabase.function-receipt.v1", functions: receipts });
    return `${RECEIPT_PREFIX}${Buffer.from(bytes).toString("base64url")}`;
}

function decodeReceipt(value: string | undefined): FunctionReceipt[] | null {
    if (!value?.startsWith(RECEIPT_PREFIX)) {
        return null;
    }
    try {
        const parsed = JSON.parse(Buffer.from(value.slice(RECEIPT_PREFIX.length), "base64url").toString("utf8"));
        if (
            parsed?.schema !== "cms.supabase.function-receipt.v1" ||
            !Array.isArray(parsed.functions) ||
            parsed.functions.some(
                (entry: unknown) =>
                    !entry ||
                    typeof entry !== "object" ||
                    typeof (entry as FunctionReceipt).slug !== "string" ||
                    typeof (entry as FunctionReceipt).bundleDigest !== "string",
            )
        ) {
            return null;
        }
        return parsed.functions as FunctionReceipt[];
    } catch {
        return null;
    }
}

function required(value: string, name: string): string {
    const parsed = value.trim();
    if (!parsed) {
        throw new IntegrationRuntimeError(`Supabase ${name} is required`);
    }
    return parsed;
}
