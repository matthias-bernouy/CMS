import { activeEnv } from "../../runtime/environment";
import type { StripeConnectHarness } from "../../runtime/harness";
import {
    sourceJson,
    sourceJsonWithRole,
    sourceJsonWithUser,
    sourceRequestWithRole,
    sourceRequestWithUser,
} from "../../runtime/source-requests";

export type CreateStripeConnectHarness = () => Promise<StripeConnectHarness>;

export function createBoundaryHarnesses(createHarness: CreateStripeConnectHarness) {
    const dashboard = async () => {
        const harness = await createHarness();
        return {
            rest: harness.rest,
            request: async (
                userId: string,
                role: string | undefined,
                endpoint: string,
                params: Record<string, string> = {},
            ) => await sourceRequestWithRole(harness, userId, role, endpoint, params),
        };
    };
    const paymentProjection = async () => {
        const harness = await createHarness();
        return {
            rest: harness.rest,
            request: async (userId: string, endpoint: string, params: Record<string, string> = {}) =>
                await sourceRequestWithUser(harness, userId, endpoint, params),
            submit: async (userId: string, endpoint: string, body: unknown, params: Record<string, string> = {}) =>
                await sourceJsonWithUser(harness, userId, endpoint, body, params),
        };
    };
    const paymentCancellation = async () => {
        const harness = await createHarness();
        return {
            rest: harness.rest,
            submit: async (userId: string, endpoint: string, body: unknown, params: Record<string, string> = {}) =>
                await sourceJsonWithUser(harness, userId, endpoint, body, params),
        };
    };
    const reconciliation = async () => {
        const harness = await createHarness();
        return {
            rest: harness.rest,
            run: async (runKey: string, limit = 50) =>
                await sourceJson(harness, "runProviderReconciliation", { runKey, limit }),
            submit: async (userId: string, endpoint: string, body: unknown, params: Record<string, string> = {}) =>
                await sourceJsonWithUser(harness, userId, endpoint, body, params),
        };
    };
    const providerBoundary = async () => {
        const harness = await createHarness();
        return {
            apiKey: activeEnv.CMS_STRIPE_CONNECT_API_KEY ?? "",
            rest: harness.rest,
            edgeRequest: async (request: Request) => await harness.edgeRequest(request),
            request: async (
                userId: string,
                role: string | undefined,
                endpoint: string,
                params: Record<string, string> = {},
            ) => await sourceRequestWithRole(harness, userId, role, endpoint, params),
            submit: async (userId: string, role: string | undefined, endpoint: string, body: unknown) =>
                await sourceJsonWithRole(harness, userId, role, endpoint, body),
        };
    };
    const repository = async () => {
        const harness = await createHarness();
        return {
            rest: harness.rest,
            submit: async (userId: string, role: string | undefined, endpoint: string, body: unknown) =>
                await sourceJsonWithRole(harness, userId, role, endpoint, body),
        };
    };
    const routing = async () => {
        const harness = await createHarness();
        return {
            apiKey: activeEnv.CMS_STRIPE_CONNECT_API_KEY ?? "",
            rest: harness.rest,
            edgeRequest: async (request: Request) => await harness.edgeRequest(request),
            providerRequestCount: () => harness.rest.stripeRequests.length,
            request: async (
                userId: string,
                role: string | undefined,
                endpoint: string,
                params: Record<string, string> = {},
            ) => await sourceRequestWithRole(harness, userId, role, endpoint, params),
            submit: async (userId: string, role: string | undefined, endpoint: string, body: unknown) =>
                await sourceJsonWithRole(harness, userId, role, endpoint, body),
        };
    };
    const account = async () => {
        const harness = await createHarness();
        return {
            apiKey: activeEnv.CMS_STRIPE_CONNECT_API_KEY ?? "",
            rest: harness.rest,
            edgeRequest: async (request: Request) => await harness.edgeRequest(request),
            submit: async (userId: string, role: string | undefined, endpoint: string, body: unknown) =>
                await sourceJsonWithRole(harness, userId, role, endpoint, body),
        };
    };

    return {
        account,
        dashboard,
        paymentCancellation,
        paymentProjection,
        providerBoundary,
        reconciliation,
        repository,
        routing,
    };
}

export type BoundaryHarnesses = ReturnType<typeof createBoundaryHarnesses>;
