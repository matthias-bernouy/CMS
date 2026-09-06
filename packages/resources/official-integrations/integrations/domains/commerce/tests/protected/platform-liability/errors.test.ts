import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    expectSingleRpc,
    installCommerceTestEnvironment,
    requestCommerce,
    setRestResponder,
} from "../../harness";

installCommerceTestEnvironment();

describe("platform liability error boundaries", () => {
    const localCases = [
        {
            name: "checks the CMS key before the request body",
            path: "/system/platform-payout-liability/pending",
            options: { authenticated: false, body: {} },
            status: 401,
            error: "invalid CMS API key",
        },
        {
            name: "checks the admin role before decrease inputs",
            path: "/admin/platform-payout-liability/authorize-decrease",
            options: { userRole: "user", body: {} },
            status: 403,
            error: "CMS admin role is required",
        },
        {
            name: "checks the expected revision before admin identity and reason",
            path: "/admin/platform-payout-liability/authorize-decrease",
            options: { body: {} },
            status: 400,
            error: "expectedLiabilityRevision is required",
        },
        {
            name: "checks admin identity before the decrease reason",
            path: "/admin/platform-payout-liability/authorize-decrease",
            options: { body: { expectedLiabilityRevision: 7 } },
            status: 401,
            error: "missing CMS user id",
        },
        {
            name: "checks the decrease reason after trusted admin identity",
            path: "/admin/platform-payout-liability/authorize-decrease",
            options: { userId: "admin-5", body: { expectedLiabilityRevision: 7 } },
            status: 400,
            error: "reason is required",
        },
        {
            name: "checks liability revision before applied amount",
            path: "/system/platform-payout-liability/applied",
            options: { body: {} },
            status: 400,
            error: "liabilityRevision is required",
        },
        {
            name: "checks applied amount after a valid liability revision",
            path: "/system/platform-payout-liability/applied",
            options: { body: { liabilityRevision: 7 } },
            status: 400,
            error: "appliedMinimumAmount is required",
        },
        {
            name: "requires a pending run key before reaching PostgreSQL",
            path: "/system/platform-payout-liability/pending",
            options: { body: { runKey: "  " } },
            status: 400,
            error: "runKey is required",
        },
        {
            name: "checks order id before buyer identity",
            path: "/me/order/payment/prepare",
            options: { body: {} },
            status: 400,
            error: "orderId is required",
        },
        {
            name: "checks buyer identity after a valid order id",
            path: "/me/order/payment/prepare",
            options: { body: { orderId: 42 } },
            status: 401,
            error: "missing CMS user id",
        },
    ] as const;

    for (const scenario of localCases) {
        test(scenario.name, async () => {
            const response = await requestCommerce(scenario.path, scenario.options);

            expect(response.status).toBe(scenario.status);
            expect(await response.json()).toEqual({ error: scenario.error });
            expect(capturedFetches()).toEqual([]);
        });
    }

    const upstreamCases = [
        {
            name: "maps refresh configuration failures through the current 422 boundary",
            path: "/system/platform-payout-liability/refresh",
            body: { reason: "reconcile" },
            rpc: "refresh_platform_payout_liability",
            message: "configuration: platform payout liability control is unavailable",
            upstreamStatus: 400,
            status: 422,
            error: "configuration: platform payout liability control is unavailable",
        },
        {
            name: "maps a stale decrease revision to conflict",
            path: "/admin/platform-payout-liability/authorize-decrease",
            body: { expectedLiabilityRevision: 6, reason: "reviewed" },
            rpc: "authorize_platform_payout_liability_decrease",
            message: "conflict: stale platform payout liability revision",
            upstreamStatus: 400,
            status: 409,
            error: "stale platform payout liability revision",
            userId: "admin-5",
        },
        {
            name: "maps a mismatched decrease authority to forbidden",
            path: "/system/platform-payout-liability/applied",
            body: { liabilityRevision: 7, appliedMinimumAmount: 1_800 },
            rpc: "record_platform_payout_liability_applied",
            message: "forbidden: exact Admin decrease authorization does not match",
            upstreamStatus: 400,
            status: 403,
            error: "exact Admin decrease authorization does not match",
        },
        {
            name: "maps a missing protected order to not found",
            path: "/me/order/payment/prepare",
            body: { orderId: 42 },
            rpc: "get_buyer_consent_context",
            message: "not_found: order",
            upstreamStatus: 400,
            status: 404,
            error: "order",
            userId: "buyer-17",
        },
        {
            name: "maps an unexpected pending failure to bad gateway",
            path: "/system/platform-payout-liability/pending",
            body: { runKey: "run-7" },
            rpc: "pending_platform_payout_liability_authorizations",
            message: "database connection was interrupted",
            upstreamStatus: 500,
            status: 502,
            error: "database connection was interrupted",
        },
    ] as const;

    for (const scenario of upstreamCases) {
        test(scenario.name, async () => {
            setRestResponder(() => Response.json({ message: scenario.message }, { status: scenario.upstreamStatus }));

            const response = await requestCommerce(scenario.path, {
                body: scenario.body,
                userId: "userId" in scenario ? scenario.userId : undefined,
            });

            expect(response.status).toBe(scenario.status);
            expect(await response.json()).toEqual({ error: scenario.error });
            expectSingleRpc(scenario.rpc);
        });
    }
});
