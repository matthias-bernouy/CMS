import { describe, expect, test } from "bun:test";
import { isNativeBlocTag, prepare_bloc } from "@bernouy/cms-bloc-compile";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import { InMemoryDashboardRepository, validateDashboard, type Dashboard } from "@bernouy/cms-dashboards";
import { functionEndpointUrn, InMemoryFunctionRepository, validateFunction } from "@bernouy/cms-functions";
import {
    InMemoryIntegrationInstallationRepository,
    runIntegrationInstallation,
    type IntegrationAnswerValue,
    type IntegrationBlocArtifact,
    type IntegrationConnectorDeployer,
    type IntegrationConnectorDeployment,
    type IntegrationDefinition,
    type IntegrationImportDeps,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryRolesRepository, PUBLIC_ROLE, USER_ROLE } from "@bernouy/cms-permissions";
import { InMemoryRelationRepository } from "@bernouy/cms-relations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import {
    InMemorySourceOverlayRepository,
    InMemorySourceRepository,
    makeEndpointUrn,
    makeSourceUrn,
    sourceEndpointAccessMode,
    validateSource,
    type DataShape,
    type SourceEndpoint,
} from "@bernouy/cms-sources";
import { InMemoryTriggerRepository, validateTrigger } from "@bernouy/cms-triggers";
import { stripeWebhookProvisioner } from "../../../../tests/helpers/stripeWebhookProvisioner";

const INTEGRATION_KINDS = ["basic-blocs", "commerce", "stripe-connect", "commerce-stripe-payments"] as const;

const SELLER_TERMS_VERSION = "seller-terms-2026-07-13";
const SELLER_TERMS_HASH = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("Commerce protected Stripe combined installation", () => {
    test("installs the real dependency graph with compatible contracts and least-privilege access", async () => {
        const definitions = await loadDefinitions();
        const sources = new InMemorySourceRepository();
        const sourceOverlays = new InMemorySourceOverlayRepository();
        const functions = new InMemoryFunctionRepository();
        const triggers = new InMemoryTriggerRepository();
        const dashboards = new InMemoryDashboardRepository();
        const roles = new InMemoryRolesRepository();
        const relations = new InMemoryRelationRepository();
        const secrets = new InMemorySecretStore();
        const installations = new InMemoryIntegrationInstallationRepository();
        const blocs = new InMemoryCmsRepository();
        const deployments: IntegrationConnectorDeployment[] = [];
        const connectorDeployer: IntegrationConnectorDeployer = {
            provider: "supabase",
            async previewOutputs() {
                return { functionsBaseUrl: "https://combined-install.test/functions/v1" };
            },
            async deploy(deployment) {
                deployments.push(structuredClone(deployment));
                return {
                    provider: "supabase",
                    outputs: { functionsBaseUrl: "https://combined-install.test/functions/v1" },
                };
            },
        };
        const deps: IntegrationImportDeps = {
            sources,
            sourceOverlays,
            functions,
            triggers,
            dashboards,
            roles,
            relations,
            secrets,
            installations,
            connectorDeployers: [connectorDeployer],
            provisioners: [stripeWebhookProvisioner()],
            sourceExecutorDeps: {
                fetchImpl: async (input) => afterInstallationResponse(new Request(input)),
                resolveSecret: async () => "combined-install-cms-api-key",
            },
            blocs: repositoryBackedBlocImporter(blocs),
        };

        await install("basic-blocs", {}, definitions, deps, installations);
        await install(
            "commerce",
            { id: "commerce", buyerLegalEnabled: false, buyerLegalDocuments: [] },
            definitions,
            deps,
            installations,
        );
        await install(
            "stripe-connect",
            {
                id: "stripe-connect",
                stripeSecretKey: "sk_test_combined_install",
                stripePublishableKey: "pk_test_combined_install",
                defaultCountry: "FR",
                defaultCurrency: "eur",
                sellerActivityDescription: "Second-hand marketplace test activity.",
            },
            definitions,
            deps,
            installations,
        );
        const linkingResult = await install(
            "commerce-stripe-payments",
            {
                sellerTermsVersion: SELLER_TERMS_VERSION,
                sellerTermsHash: SELLER_TERMS_HASH,
                sellerPayoutSchedule: "daily",
            },
            definitions,
            deps,
            installations,
        );

        expect(
            deployments.map((deployment) => ({
                integrationKind: deployment.integrationKind,
                dataApiSchemas: deployment.dataApiSchemas,
                schemas: deployment.schemas.map((schema) => ("manifest" in schema ? schema.manifest : schema.path)),
                functions: deployment.functions.map((fn) => fn.name),
            })),
        ).toEqual([
            {
                integrationKind: "commerce",
                dataApiSchemas: ["commerce"],
                schemas: ["sql/schema.manifest.json"],
                functions: ["cms-commerce"],
            },
            {
                integrationKind: "stripe-connect",
                dataApiSchemas: ["stripe_connect"],
                schemas: ["sql/schema.manifest.json"],
                functions: ["cms-stripe-connect"],
            },
        ]);
        expect(linkingResult.installation.status).toBe("success");
        expect(linkingResult.artifacts.map((artifact) => artifact.type)).toEqual([
            ...Array(17).fill("function"),
            ...Array(15).fill("trigger"),
            "dashboard",
            "bloc",
        ]);
        for (const kind of INTEGRATION_KINDS) {
            expect((await installations.get(kind))?.status).toBe("success");
        }

        const installedSources = await sources.getAllSources();
        expect(installedSources.map((source) => source.urn).sort()).toEqual(["urn:commerce", "urn:stripe-connect"]);
        for (const source of installedSources) {
            expect(validateSource(source)).toEqual([]);
        }
        expect(
            sourceEndpointAccessMode(
                (await sources.getEndpoint(makeEndpointUrn("stripe-connect", "createProtectedPayment")))!,
            ),
        ).toBe("system");
        expect(
            sourceEndpointAccessMode(
                (await sources.getEndpoint(makeEndpointUrn("stripe-connect", "getProtectedPayment")))!,
            ),
        ).toBe("system");
        expect(
            sourceEndpointAccessMode(
                (await sources.getEndpoint(makeEndpointUrn("stripe-connect", "getProtectedPaymentByClientReference")))!,
            ),
        ).toBe("system");
        const preparedPayment = await sources.getEndpoint(makeEndpointUrn("commerce", "prepareProtectedPayment"));
        const createdPayment = await sources.getEndpoint(makeEndpointUrn("stripe-connect", "createProtectedPayment"));
        const sellerPayout = await sources.getEndpoint(
            makeEndpointUrn("stripe-connect", "configureSellerPayoutSchedule"),
        );
        expect(preparedPayment?.access).toEqual({ mode: "system" });
        expect(preparedPayment?.output?.[0]?.body?.properties?.sellerId?.semantic?.authority).toBe("cms");
        expect(createdPayment?.input?.body?.properties?.sellerUserId?.semantic?.authority).toBe("cms");
        expect(sellerPayout?.input?.body?.properties?.userId?.semantic?.authority).toBe("cms");

        const installedFunctions = await functions.getAllFunctions();
        expect(installedFunctions.map((fn) => fn.id).sort()).toEqual([
            "applyPlatformPayoutLiabilityDecrease",
            "createPaymentForOrder",
            "createProtectedOrder",
            "dispatchDueProtectedSettlements",
            "dispatchPendingPaymentCancellations",
            "dispatchPendingProtectedRefunds",
            "executeAuthorizedRefund",
            "executeAuthorizedSettlementRelease",
            "executeProviderPaymentCancellation",
            "getPaymentForOrder",
            "getPaymentLegalRequirements",
            "getSellerSaleEnrollment",
            "getStripePaymentClientConfig",
            "processDueOrderDeadlines",
            "reconcileProtectedPaymentSystems",
            "refreshPaymentForOrder",
            "submitSellerOfferPrice",
        ]);
        for (const fn of installedFunctions) {
            expect(await validateFunction(fn, { sources })).toEqual([]);
        }
        expect(JSON.stringify(installedFunctions)).not.toContain("debitNegativeBalances");

        const installedTriggers = await triggers.getAllTriggers();
        expect(installedTriggers.map((trigger) => trigger.id).sort()).toEqual([
            "execute-authorized-settlement-release",
            "execute-buyer-cancellation-refund",
            "execute-buyer-payment-cancellation",
            "execute-claim-resolution-refund",
            "execute-requested-order-refund",
            "execute-reviewed-cancellation-refund",
            "execute-reviewed-order-refund",
            "execute-reviewed-payment-cancellation",
            "execute-seller-cancellation-refund",
            "execute-seller-payment-cancellation",
            "schedule-dispatch-commerce-notifications",
            "schedule-dispatch-due-protected-settlements",
            "schedule-dispatch-pending-payment-cancellations",
            "schedule-dispatch-pending-protected-refunds",
            "schedule-process-due-order-deadlines",
            "schedule-reconcile-protected-payment-systems",
        ]);
        for (const trigger of installedTriggers) {
            expect(validateTrigger(trigger)).toEqual([]);
            if (trigger.function) {
                expect(await functions.getFunction(trigger.function.id)).not.toBeNull();
            }
            if (trigger.event.kind === "endpoint") {
                expect(
                    await sources.getEndpoint(
                        makeEndpointUrn(trigger.event.source ?? "", trigger.event.endpoint ?? ""),
                    ),
                ).not.toBeNull();
            }
        }
        expect(
            installedTriggers
                .filter((trigger) => trigger.event.kind === "schedule" && !!trigger.function)
                .map((trigger) => ({
                    id: trigger.id,
                    intervalMs: trigger.event.kind === "schedule" ? trigger.event.intervalMs : 0,
                    initialDelayMs: trigger.event.kind === "schedule" ? trigger.event.initialDelayMs : 0,
                    functionId: trigger.function?.id,
                    body: trigger.function?.body,
                })),
        ).toEqual([
            {
                id: "schedule-reconcile-protected-payment-systems",
                intervalMs: 15_000,
                initialDelayMs: 5_000,
                functionId: "reconcileProtectedPaymentSystems",
                body: { runKey: "$schedule.runKey", limit: 5 },
            },
            {
                id: "schedule-process-due-order-deadlines",
                intervalMs: 60_000,
                initialDelayMs: 10_000,
                functionId: "processDueOrderDeadlines",
                body: { runKey: "$schedule.runKey", limit: 5 },
            },
            {
                id: "schedule-dispatch-pending-payment-cancellations",
                intervalMs: 60_000,
                initialDelayMs: 15_000,
                functionId: "dispatchPendingPaymentCancellations",
                body: { runKey: "$schedule.runKey", limit: 5 },
            },
            {
                id: "schedule-dispatch-pending-protected-refunds",
                intervalMs: 60_000,
                initialDelayMs: 20_000,
                functionId: "dispatchPendingProtectedRefunds",
                body: { runKey: "$schedule.runKey", limit: 5 },
            },
            {
                id: "schedule-dispatch-due-protected-settlements",
                intervalMs: 60_000,
                initialDelayMs: 35_000,
                functionId: "dispatchDueProtectedSettlements",
                body: { runKey: "$schedule.runKey", limit: 5 },
            },
        ]);

        const installedDashboards = await dashboards.getAllDashboards();
        expect(installedDashboards.map((dashboard) => dashboard.id).sort()).toEqual([
            "commerce-configuration",
            "commerce-metadata",
            "commerce-offers",
            "commerce-orders",
            "commerce-products",
            "commerce-sellers",
            "commerce-stripe-payments-operations",
            "commerce-taxonomy",
            "commerce-workflow",
        ]);
        for (const dashboard of installedDashboards) {
            const source = await sources.getSource(makeSourceUrn(dashboard.source));
            expect(source).not.toBeNull();
            expect(validateDashboard(dashboard, { source })).toEqual([]);
            await assertDashboardEndpointRefs(dashboard, sources);
        }
        expect(await dashboards.getDashboard("stripe-connect-dashboard")).toBeNull();
        expect(await dashboards.getDashboardsForSource("stripe-connect")).toEqual([]);

        const operationsDashboard = await dashboards.getDashboard("commerce-stripe-payments-operations");
        if (!operationsDashboard) {
            throw new Error("protected operations dashboard not installed");
        }
        const operationRefs = collectEndpointRefs(operationsDashboard).map(
            (ref) => `${ref.sourceId ?? operationsDashboard.source}:${ref.endpoint}`,
        );
        expect(operationRefs).not.toContain("stripe-connect:createProtectedPayment");
        expect(operationRefs).not.toContain("stripe-connect:requestSettlementRelease");
        expect(operationRefs).not.toContain("stripe-connect:requestProtectedRefund");
        expect(operationRefs).toEqual(
            expect.arrayContaining([
                "commerce:protectedPayments",
                "commerce:claims",
                "commerce:refundRequests",
                "stripe-connect:listProviderPayments",
                "stripe-connect:listStripeDisputes",
                "stripe-connect:listProviderExceptions",
            ]),
        );

        await assertImportedAccessGrants(sources, functions, roles);
        expect(
            (await roles.get(USER_ROLE))?.grants.some(
                (grant) => grant.permission === makeEndpointUrn("commerce", "prepareProtectedPayment"),
            ),
        ).toBe(false);
        expect((await sources.getEndpoint(makeEndpointUrn("commerce", "reviewOrderRefund")))?.access).toEqual({
            mode: "admin",
        });
        expect((await sources.getEndpoint(makeEndpointUrn("commerce", "resolveOrderClaim")))?.access).toEqual({
            mode: "admin",
        });
        expect(
            (await sources.getEndpoint(makeEndpointUrn("stripe-connect", "submitStripeDisputeEvidence")))?.access,
        ).toEqual({ mode: "admin" });

        const expectedBlocIds = definitions
            .flatMap((definition) =>
                (definition.artifacts ?? [])
                    .filter(
                        (artifact): artifact is Extract<typeof artifact, { type: "bloc" }> => artifact.type === "bloc",
                    )
                    .map((artifact) => artifact.bloc.tag),
            )
            .sort();
        expect((await blocs.getBlocsList()).map((bloc) => bloc.id).sort()).toEqual(expectedBlocIds);
        for (const blocId of expectedBlocIds) {
            expect(await blocs.getBlocViewJS(blocId)).not.toBeNull();
        }

        const persistedInstallations = await Promise.all(INTEGRATION_KINDS.map((kind) => installations.get(kind)));
        const persistedJson = JSON.stringify(persistedInstallations);
        expect(persistedJson).not.toContain("sk_test_combined_install");
        expect(persistedJson).not.toContain("whsec_test_combined_install");
    }, 60_000);
});

function afterInstallationResponse(request: Request): Response {
    if (request.url.includes("/cms-stripe-connect/configuration/marketplace-terms")) {
        return Response.json({
            mode: "legacy",
            version: SELLER_TERMS_VERSION,
            hash: SELLER_TERMS_HASH,
        });
    }
    if (request.url.includes("/cms-stripe-connect/payments/seller-capabilities")) {
        return Response.json({
            readySellerCmsUserIds: [],
            snapshot: "seller-capabilities:test-empty",
            snapshotAt: "2026-07-23T12:00:00.000Z",
        });
    }
    if (request.url.includes("/cms-commerce/system/seller/sale-capability/activate")) {
        return Response.json({
            capabilityKey: "protected_payment",
            sellerKind: "user",
            enabled: true,
            readyCount: 0,
            notReadyCount: 0,
        });
    }
    if (request.url.includes("/cms-commerce/system/buyer-legal-documents/sync")) {
        return Response.json({ enabled: false, documents: [] });
    }
    return Response.json({ error: `unexpected after-installation request: ${request.url}` }, { status: 500 });
}

async function loadDefinitions(): Promise<IntegrationDefinition[]> {
    const repository = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
    return await Promise.all(
        INTEGRATION_KINDS.map(async (kind) => {
            const definition = await repository.get(kind);
            if (!definition) {
                throw new Error(`${kind} definition not found`);
            }
            return definition;
        }),
    );
}

async function install(
    kind: (typeof INTEGRATION_KINDS)[number],
    answers: Record<string, IntegrationAnswerValue>,
    definitions: IntegrationDefinition[],
    deps: IntegrationImportDeps,
    installations: InMemoryIntegrationInstallationRepository,
) {
    return await runIntegrationInstallation({
        mode: "create",
        deps,
        installations,
        siteIntegrations: definitions,
        dto: { kind, answers, options: {} },
    });
}

function repositoryBackedBlocImporter(repository: InMemoryCmsRepository) {
    return {
        async importBloc(artifact: IntegrationBlocArtifact, options: { force?: boolean }) {
            const previous = await repository.getBlocViewJS(artifact.tag);
            const bloc = await prepare_bloc(
                new File([artifact.viewJS], `${artifact.tag}.view.ts`, { type: "text/typescript" }),
                artifact.editorJS
                    ? new File([artifact.editorJS], `${artifact.tag}.editor.ts`, { type: "text/typescript" })
                    : null,
                artifact.name,
                artifact.group ?? "",
                artifact.description ?? "",
                artifact.tag,
                artifact.source,
                undefined,
                {
                    native: isNativeBlocTag(artifact.tag),
                    ...(artifact.viewPath ? { viewPath: artifact.viewPath } : {}),
                },
            );
            if (previous !== null && options.force) {
                await repository.replaceBloc(bloc);
            } else {
                await repository.createBloc(bloc);
            }
            return { id: bloc.id, action: previous === null ? ("created" as const) : ("updated" as const) };
        },
    };
}

async function assertImportedAccessGrants(
    sources: InMemorySourceRepository,
    functions: InMemoryFunctionRepository,
    roles: InMemoryRolesRepository,
): Promise<void> {
    const publicExpected = new Set<string>();
    const userExpected = new Set<string>();
    const deniedToBuiltIns = new Set<string>();
    for (const source of await sources.getAllSources()) {
        for (const endpoint of source.endpoints) {
            const mode = sourceEndpointAccessMode(endpoint);
            if (mode === "public") {
                publicExpected.add(endpoint.urn);
            } else if (mode === "auth") {
                userExpected.add(endpoint.urn);
            } else {
                deniedToBuiltIns.add(endpoint.urn);
            }
        }
    }
    for (const fn of await functions.getAllFunctions()) {
        const permission = functionEndpointUrn(fn.id);
        const mode = fn.access?.mode ?? "admin";
        if (mode === "public") {
            publicExpected.add(permission);
        } else if (mode === "auth") {
            userExpected.add(permission);
        } else {
            deniedToBuiltIns.add(permission);
        }
    }

    const publicActual = new Set((await roles.get(PUBLIC_ROLE))?.grants.map((grant) => grant.permission) ?? []);
    const userActual = new Set((await roles.get(USER_ROLE))?.grants.map((grant) => grant.permission) ?? []);
    expect([...publicActual].sort()).toEqual([...publicExpected].sort());
    expect([...userActual].sort()).toEqual([...userExpected].sort());
    for (const permission of deniedToBuiltIns) {
        expect(publicActual.has(permission)).toBe(false);
        expect(userActual.has(permission)).toBe(false);
    }
}

type DashboardEndpointRefLike = {
    endpoint: string;
    sourceId?: string;
    params?: Record<string, unknown>;
    body?: Record<string, unknown>;
};

function collectEndpointRefs(value: unknown, refs: DashboardEndpointRefLike[] = []): DashboardEndpointRefLike[] {
    if (Array.isArray(value)) {
        for (const item of value) {
            collectEndpointRefs(item, refs);
        }
        return refs;
    }
    if (!value || typeof value !== "object") {
        return refs;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.endpoint === "string") {
        refs.push(record as DashboardEndpointRefLike);
    }
    for (const child of Object.values(record)) {
        collectEndpointRefs(child, refs);
    }
    return refs;
}

async function assertDashboardEndpointRefs(dashboard: Dashboard, sources: InMemorySourceRepository): Promise<void> {
    for (const ref of collectEndpointRefs(dashboard)) {
        const sourceId = ref.sourceId ?? dashboard.source;
        const endpoint = await sources.getEndpoint(makeEndpointUrn(sourceId, ref.endpoint));
        if (!endpoint) {
            throw new Error(`${dashboard.id} references missing endpoint ${sourceId}:${ref.endpoint}`);
        }
        assertDashboardEndpointParams(dashboard.id, endpoint, ref.params);
        assertDashboardEndpointBody(dashboard.id, endpoint, ref.body);
    }
}

function assertDashboardEndpointParams(
    dashboardId: string,
    endpoint: SourceEndpoint,
    params: Record<string, unknown> | undefined,
): void {
    if (!params) {
        return;
    }
    const declared = new Set((endpoint.input?.params ?? []).map((param) => param.name));
    for (const name of Object.keys(params)) {
        if (!declared.has(name)) {
            throw new Error(`${dashboardId} passes undeclared ${endpoint.urn} param ${name}`);
        }
    }
}

function assertDashboardEndpointBody(
    dashboardId: string,
    endpoint: SourceEndpoint,
    body: Record<string, unknown> | undefined,
): void {
    if (!body) {
        return;
    }
    const shape = endpoint.input?.body;
    if (!shape) {
        throw new Error(`${dashboardId} passes a body to ${endpoint.urn} without a body contract`);
    }
    for (const path of Object.keys(body)) {
        if (!shapeHasPath(shape, path)) {
            throw new Error(`${dashboardId} passes undeclared ${endpoint.urn} body path ${path}`);
        }
    }
}

function shapeHasPath(shape: DataShape, path: string): boolean {
    let current: DataShape | undefined = shape;
    for (const part of path.split(".").filter(Boolean)) {
        if (current?.type !== "object") {
            return false;
        }
        current = current.properties?.[part];
    }
    return current !== undefined;
}
