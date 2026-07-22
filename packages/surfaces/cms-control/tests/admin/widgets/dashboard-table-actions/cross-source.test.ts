import { afterEach, describe, expect, test } from "bun:test";
import type { DashboardDto } from "@bernouy/cms-dashboards";
import type { DashboardSourceGroup } from "../../../../src/components/admin/Resources/Dashboards/types";
import { executeDashboardAction } from "../../../../src/components/admin/Resources/Dashboards/runtime/actions";
import { tableActionGroup } from "./tableFixtures";
import { resetDashboardActionTest } from "./testSetup";

afterEach(resetDashboardActionTest);

describe("dashboard table actions", () => {
    test("uses the declared method for a cross-source action", async () => {
        const requests: Request[] = [];
        globalThis.fetch = (async (input, init) => {
            const request = new Request(input, init);
            requests.push(request);
            return Response.json({ status: "staged" });
        }) as typeof fetch;
        const commerce = tableActionGroup();
        const stripe: DashboardSourceGroup = {
            source: {
                urn: "urn:stripe-connect",
                id: "stripe-connect",
                name: "Stripe",
                endpointCount: 1,
                dashboardCount: 0,
                readonly: false,
            },
            endpoints: [
                {
                    endpointId: "stageStripeDisputeEvidence",
                    method: "POST",
                    targetUrl: "https://stripe.test/disputes/evidence",
                    params: [],
                },
            ],
            dashboards: [],
        };
        const composed: DashboardDto = {
            id: "payments-disputes",
            source: "newsletter",
            views: [
                {
                    widget: "w-detail",
                    id: "disputeDetail",
                    source: { sourceId: "stripe-connect", endpoint: "getStripeDispute" },
                    actions: [
                        {
                            id: "stageEvidence",
                            label: "Stage evidence",
                            endpoint: {
                                sourceId: "stripe-connect",
                                endpoint: "stageStripeDisputeEvidence",
                                body: { disputeId: "$resource.id" },
                            },
                        },
                    ],
                    main: [{ id: "state", title: "State", fields: [] }],
                },
            ],
        };

        await executeDashboardAction(
            commerce,
            composed,
            { collection: "disputeDetail", row: "dp_123" },
            "stageEvidence",
            {},
            { id: "dp_123" },
            [commerce, stripe],
        );

        expect(requests[0]?.method).toBe("POST");
        expect(requests[0]?.url).toBe("http://localhost:4999/.cms/sources/stripe-connect/stageStripeDisputeEvidence");
        expect(await requests[0]?.json()).toEqual({ disputeId: "dp_123" });
    });
});
