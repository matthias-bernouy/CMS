import { cmsUserId } from "../core/auth.ts";
import { HttpError } from "../core/errors.ts";
import { one } from "../core/rest.ts";
import type { PartnerAccount } from "../core/types.ts";

export type PartnerCapability = "clients.manage" | "proposals.manage" | "proposals.publish" | "proposals.share";

export async function requirePartner(request: Request, capability?: PartnerCapability): Promise<PartnerAccount> {
    const actor = cmsUserId(request);
    const account = await one(
        "partner_accounts",
        { cms_user_id: actor, status: "active" },
        "id,cms_user_id,display_name",
    );
    if (!account) {
        throw new HttpError(403, "active sales partner account required");
    }
    if (capability) {
        const grant = await one("partner_capabilities", {
            partner_account_id: Number(account.id),
            capability,
        });
        if (!grant) {
            throw new HttpError(403, `partner capability required: ${capability}`);
        }
    }
    return {
        id: Number(account.id),
        cmsUserId: String(account.cms_user_id),
        displayName: String(account.display_name),
    };
}
