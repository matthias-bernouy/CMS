import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import { createSecretResolver } from "@bernouy/cms-secrets";
import { executeEndpoint, type Source, type SourceEndpoint } from "@bernouy/cms-sources";
import { IntegrationRuntimeError } from "../../../errors";
import type { IntegrationImportDeps } from "../../../../interfaces/IntegrationImport";
import type {
    IntegrationMigrationConnectorTransition,
    IntegrationMigrationProbe,
    IntegrationMigrationStepContext,
} from "../../../../interfaces/IntegrationConnectorDeployer";
import { MAX_INTEGRATION_MIGRATION_SMOKE_BODY_BYTES } from "../../../../interfaces/IntegrationConnectorDeployer";
import { buildCmsSourceBindingTarget, cmsSourceDigest } from "./bindingTarget";

export class CmsSourceFunctionalMigrationProbe implements IntegrationMigrationProbe {
    constructor(
        private readonly deps: IntegrationImportDeps,
        private readonly mode: "target" | "stable",
    ) {}

    async run(context: IntegrationMigrationStepContext): Promise<{ externalOperationId: string }> {
        this.assertPhase(context);
        const target = await buildCmsSourceBindingTarget(this.deps, context);
        if (!target) {
            return { externalOperationId: `cms-smoke:${this.mode}:none` };
        }
        const source = await this.resolveSource(target.source, target.digest);
        const receipts = [];
        const mediated = context.connectors
            .filter((connector) => connector.plan.cmsMediated)
            .sort((left, right) => left.connectorKey.localeCompare(right.connectorKey));
        for (const connector of mediated) {
            receipts.push(await this.runDeclaredSmoke(source, connector));
        }
        const digest = await sha256Hex(canonicalJsonBytes({ mode: this.mode, sourceDigest: target.digest, receipts }));
        return { externalOperationId: `cms-smoke:${this.mode}:${digest}` };
    }

    private assertPhase(context: IntegrationMigrationStepContext): void {
        const expected = this.mode === "target" ? "smoke-target" : "smoke-cms";
        if (context.phase !== expected) {
            throw new IntegrationRuntimeError(`CMS ${this.mode} smoke cannot execute phase "${context.phase}"`);
        }
    }

    private async resolveSource(target: Source, targetDigest: string): Promise<Source> {
        if (this.mode === "target") {
            return target;
        }
        const installed = await this.deps.sources.getSource(target.urn);
        if (!installed || (await cmsSourceDigest(installed)) !== targetDigest) {
            throw new IntegrationRuntimeError(
                `stable CMS smoke requires the exact target Source binding "${target.urn}"`,
                409,
            );
        }
        return installed;
    }

    private async runDeclaredSmoke(source: Source, connector: IntegrationMigrationConnectorTransition) {
        const smoke = connector.plan.cmsMediated?.smoke;
        if (!smoke) {
            throw new IntegrationRuntimeError(
                `CMS-mediated migration for connector "${connector.connectorKey}" requires a functional smoke contract`,
                422,
            );
        }
        const urn = `${source.urn}:${smoke.endpointId}`;
        const endpoint = source.endpoints.find((candidate) => candidate.urn === urn);
        if (!endpoint) {
            throw new IntegrationRuntimeError(`CMS migration smoke endpoint "${urn}" was not found`, 422);
        }
        assertSmokeEndpointContract(endpoint, smoke.expectedStatus, smoke.expectedBody !== undefined);
        const response = await executeEndpoint(
            endpoint,
            new Request(`http://cms-migration.invalid/${encodeURIComponent(urn)}`, { method: endpoint.method }),
            {
                ...this.deps.sourceExecutorDeps,
                resolveSecret: this.deps.sourceExecutorDeps?.resolveSecret ?? createSecretResolver(this.deps.secrets),
            },
        );
        if (response.status !== smoke.expectedStatus) {
            throw new IntegrationRuntimeError(
                `CMS migration smoke endpoint "${urn}" returned ${response.status}; expected ${smoke.expectedStatus}`,
                409,
            );
        }
        const body = await boundedResponseBody(response, urn);
        const expectedDigest = await bodyDigest(smoke.expectedBody !== undefined, smoke.expectedBody);
        const actualDigest = await bodyDigest(body.present, body.value);
        if (actualDigest !== expectedDigest) {
            throw new IntegrationRuntimeError(`CMS migration smoke endpoint "${urn}" returned an unexpected body`, 409);
        }
        return {
            connectorKey: connector.connectorKey,
            endpointUrn: urn,
            endpointDigest: await sha256Hex(canonicalJsonBytes(endpoint)),
            status: response.status,
            bodyDigest: actualDigest,
        };
    }
}

function assertSmokeEndpointContract(endpoint: SourceEndpoint, expectedStatus: number, expectsBody: boolean): void {
    if (endpoint.method !== "GET" && endpoint.method !== "HEAD") {
        throw new IntegrationRuntimeError(`CMS migration smoke endpoint "${endpoint.urn}" must use GET or HEAD`, 422);
    }
    const output = endpoint.output?.find((candidate) => candidate.status === String(expectedStatus));
    if (!output) {
        throw new IntegrationRuntimeError(
            `CMS migration smoke endpoint "${endpoint.urn}" does not declare status ${expectedStatus}`,
            422,
        );
    }
    if (Boolean(output.body) !== expectsBody || (endpoint.method === "HEAD" && expectsBody)) {
        throw new IntegrationRuntimeError(
            `CMS migration smoke endpoint "${endpoint.urn}" body expectation does not match its declared response`,
            422,
        );
    }
}

async function boundedResponseBody(response: Response, urn: string): Promise<{ present: boolean; value?: unknown }> {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_INTEGRATION_MIGRATION_SMOKE_BODY_BYTES) {
        throw new IntegrationRuntimeError(
            `CMS migration smoke endpoint "${urn}" exceeded ${MAX_INTEGRATION_MIGRATION_SMOKE_BODY_BYTES} response bytes`,
            409,
        );
    }
    if (!text) {
        return { present: false };
    }
    try {
        return { present: true, value: JSON.parse(text) as unknown };
    } catch {
        throw new IntegrationRuntimeError(`CMS migration smoke endpoint "${urn}" returned invalid JSON`, 409);
    }
}

async function bodyDigest(present: boolean, value: unknown): Promise<string> {
    return await sha256Hex(canonicalJsonBytes(present ? { present, value } : { present }));
}
