import { jsonResponse } from "../../../http";
import type { JsonRecord } from "../../../types";
import type { StripeConnectMock } from "../../stripe-connect";

export async function handlePlatformPayoutRoutes(
    mock: StripeConnectMock,
    request: Request,
    url: URL,
    method: string,
    table: string,
): Promise<Response | null> {
    if (table === "rpc/claim_platform_payout_protection" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const control = mock.tables.platform_payout_controls[0]!;
        const required = Number(body.p_required_minimum_amount);
        const revision = Number(body.p_liability_revision);
        if (revision < Number(control.liability_revision)) {
            return jsonResponse({ message: "conflict: stale Commerce platform payout liability revision" }, 400);
        }
        if (revision === Number(control.liability_revision) && required !== Number(control.required_minimum_amount)) {
            return jsonResponse({ message: "conflict: Commerce revision changed amount" }, 400);
        }
        if (revision > Number(control.liability_revision)) {
            mock.update(control, {
                required_minimum_amount: required,
                liability_revision: revision,
                decrease_authorization_id:
                    required < Number(control.provider_minimum_amount) ? body.p_decrease_authorization_id : null,
            });
        } else if (required < Number(control.provider_minimum_amount)) {
            if (!control.decrease_authorization_id && body.p_decrease_authorization_id) {
                mock.update(control, {
                    decrease_authorization_id: body.p_decrease_authorization_id,
                });
            } else if (control.decrease_authorization_id !== body.p_decrease_authorization_id) {
                return jsonResponse({ message: "forbidden: Admin decrease authorization mismatch" }, 400);
            }
        }
        const claimed = !control.claim_owner || control.claim_owner === body.p_owner;
        if (claimed) {
            mock.update(control, {
                claim_owner: body.p_owner,
                claimed_at: new Date().toISOString(),
            });
        }
        return jsonResponse({ claimed, control });
    }
    if (table === "rpc/complete_platform_payout_protection" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const control = mock.tables.platform_payout_controls[0]!;
        if (control.claim_owner !== body.p_owner) {
            return jsonResponse({ accepted: false, needsReapply: false, control });
        }
        const applied = Number(body.p_applied_minimum_amount);
        const needsReapply =
            body.p_succeeded === true &&
            (applied < Number(control.required_minimum_amount) ||
                (control.decrease_authorization_id !== null && applied !== Number(control.required_minimum_amount)));
        mock.update(
            control,
            body.p_succeeded === true
                ? {
                      provider_minimum_amount: applied,
                      decrease_authorization_id: needsReapply ? control.decrease_authorization_id : null,
                      claim_owner: needsReapply ? body.p_owner : null,
                      claimed_at: needsReapply ? new Date().toISOString() : null,
                      last_error: null,
                      last_provider_sync_at: new Date().toISOString(),
                  }
                : {
                      claim_owner: null,
                      claimed_at: null,
                      last_error: body.p_error,
                  },
        );
        return jsonResponse({
            accepted: true,
            needsReapply,
            revisionChanged: Number(control.liability_revision) !== Number(body.p_expected_liability_revision),
            control,
        });
    }
    return null;
}
