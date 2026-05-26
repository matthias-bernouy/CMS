import type { Hub } from "src/exports/Hub";
import { z } from "src/core/schemas/zodInit";
import { successEnvelope } from "src/core/schemas/envelopes";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";

const IssuerInfoSchema = z.object({
    iss:           z.string(),
    jwksUrl:       z.string(),
    metadocUrl:    z.string(),
    /** Snippet to paste into a tenant-provisioner's `allowlist` config so it
     *  trusts the hub as control-plane. Helps the operator with the trust
     *  setup that must be done BEFORE importing the TP (cf. D7). */
    allowlistEntry: z.object({
        iss:  z.string(),
        role: z.literal("control-plane"),
    }),
}).openapi("IssuerInfo");

export const meta: ApiOperationMeta = {
    summary:     "Hub-issuer metadata + allowlist snippet",
    description: "Returns the hub's iss URL, JWKS URL, metadoc URL, and a ready-to-copy allowlist entry the operator pastes into each TP's config before importing it.",
    operationId: "getHubIssuer",
    tags:        ["issuer"],
    responses: {
        200: { description: "Issuer info", schema: successEnvelope(IssuerInfoSchema) },
    },
};

export default async function handle(_req: Request, hub: Hub): Promise<Response> {
    const iss = hub.config.issuer.baseUrl.replace(/\/$/, "");
    return Response.json({
        ok: true,
        data: {
            iss,
            jwksUrl:    `${iss}/jwks.json`,
            metadocUrl: `${iss}/.well-known/oauth-authorization-server`,
            allowlistEntry: { iss, role: "control-plane" },
        },
    });
}
