import { HttpError } from "../../core/errors.ts";
import { one } from "../../core/rest.ts";

export async function requirePublicSeller(sellerId: string): Promise<void> {
    const [settings, seller] = await Promise.all([
        one("settings", { id: "default" }, "require_verified_seller"),
        one("sellers", { id: sellerId }, "verification_status"),
    ]);
    if (!settings) throw new HttpError(502, "commerce settings are unavailable");
    const status = String(seller?.verification_status ?? "");
    if (!seller || ["rejected", "suspended"].includes(status)
        || (settings.require_verified_seller === true && status !== "verified")) {
        throw new HttpError(404, "offer not found");
    }
}
