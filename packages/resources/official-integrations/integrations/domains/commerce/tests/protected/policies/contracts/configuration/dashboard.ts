import { expect, test } from "bun:test";
import { commerceDefinitionWithDeferredDashboards } from "../../../../catalog/support/deferredDashboards";

export function registerPolicyDashboardTest(): void {
    test("publishes protected C2C revisions from the admin settings dashboard with CAS and typed controls", async () => {
        const definition = await commerceDefinitionWithDeferredDashboards<any>();
        const source = definition.artifacts.find((artifact: any) => artifact.type === "source").source;
        const dashboard = definition.artifacts.find(
            (artifact: any) => artifact.dashboard?.id === "{{answers.id}}-configuration",
        ).dashboard;
        const settingsTabs = dashboard.views.find((view: any) => view.id === "settingsTabs");
        const detail = settingsTabs.tabs
            .flatMap((tab: any) => tab.children)
            .find((view: any) => view.id === "protectedC2cPolicySettings");
        const action = detail.actions.find((candidate: any) => candidate.id === "publishProtectedC2cPolicyRevision");
        const endpoint = source.endpoints.find((candidate: any) => candidate.endpointId === "createC2cPolicyRevision");
        const fields = detail.main.flatMap((section: any) => section.fields);
        const fieldById = Object.fromEntries(fields.map((field: any) => [field.id, field]));

        expect(detail.source).toEqual({ endpoint: "c2cPolicies" });
        expect(detail.title.path).toBe("activePolicy.name");
        expect(action).toMatchObject({
            label: "Publish new protected C2C policy revision",
            confirm: expect.stringContaining("new protected C2C financial policy revision"),
            endpoint: {
                endpoint: "createC2cPolicyRevision",
                body: { expectedSettingsVersion: "$resource.settings.version" },
            },
        });
        expect(Object.keys(action.endpoint.body).sort()).toEqual(
            endpoint.body.required
                .concat([
                    "buyerFeeMinimumAmount",
                    "buyerFeeMaximumAmount",
                    "sellerFeeMinimumAmount",
                    "sellerFeeMaximumAmount",
                    "subsidyReason",
                    "subsidyMaximumDeficitAmount",
                ])
                .sort(),
        );
        expect(JSON.stringify(action.endpoint.body)).not.toMatch(/PolicyId|activeC2c/i);
        expect(fieldById.costEstimatesConfigured).toMatchObject({ type: "checkbox" });
        expect(fieldById.subsidyOverride).toMatchObject({ type: "checkbox" });
        for (const id of [
            "buyerFeeRateBps",
            "sellerFeeRateBps",
            "sellerReserveRateBps",
            "claimRatioReviewBps",
            "chargebackRatioReviewBps",
        ]) {
            expect(fieldById[id]).toMatchObject({ type: "number", min: 0, step: 1 });
        }
        expect(fieldById.buyerFeeBasis.options.map((item: any) => item.value)).toEqual([
            "merchandise",
            "merchandise_and_shipping",
        ]);
        expect(fieldById.buyerFeeRefundPolicy.options.map((item: any) => item.value)).toEqual([
            "always",
            "never",
            "proportional",
            "resolution_defined",
        ]);
        expect(fieldById.sellerFeeRefundPolicy.options.map((item: any) => item.value)).toEqual(["never"]);
    });
}
