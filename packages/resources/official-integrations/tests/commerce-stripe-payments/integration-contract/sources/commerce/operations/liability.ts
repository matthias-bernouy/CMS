import { makeEndpointUrn, type Source } from "@bernouy/cms-sources";
import { commerceCommand as command, commerceQuery as query } from "./helpers";

export function commerceLiabilityEndpoints(): Source["endpoints"] {
    return [
        {
            ...command("authorizePlatformPayoutLiabilityDecrease", {
                expectedLiabilityRevision: { type: "number" },
                reason: { type: "string" },
            }),
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            liabilityRevision: { type: "number" },
                            requiredMinimumAmount: { type: "number" },
                            decreaseAuthorizationId: { type: "string", nullable: true },
                            changeDirection: { type: "string" },
                        },
                    },
                },
            ],
        },
        {
            ...command("recordPlatformPayoutLiabilityApplied", {
                liabilityRevision: { type: "number" },
                appliedMinimumAmount: { type: "number" },
                decreaseAuthorizationId: { type: "string", nullable: true },
            }),
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            accepted: { type: "boolean" },
                            needsReapply: { type: "boolean" },
                        },
                    },
                },
            ],
        },
        {
            ...command("pendingPlatformPayoutLiabilityAuthorizations", { runKey: { type: "string" } }),
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            runKey: { type: "string" },
                            control: { type: "object" },
                            authorizations: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        liabilityRevision: { type: "number" },
                                        requiredMinimumAmount: { type: "number" },
                                        decreaseAuthorizationId: { type: "string", nullable: true },
                                        changeDirection: { type: "string" },
                                    },
                                },
                            },
                        },
                    },
                },
            ],
        },
        query("listCommerceExceptions", ["status", "limit", "offset"]),
    ];
}
