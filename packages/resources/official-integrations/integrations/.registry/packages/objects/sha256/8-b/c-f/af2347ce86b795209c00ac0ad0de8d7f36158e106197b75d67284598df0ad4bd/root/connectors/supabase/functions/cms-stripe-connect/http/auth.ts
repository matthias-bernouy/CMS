import { requiredEnv } from "../shared/runtime.ts";
import { safeEqual } from "../shared/crypto.ts";
import { HttpError } from "./errors.ts";

export function requireCmsRequest(request: Request, options: { requireUser?: boolean } = {}): { userId: string } {
    const expected = requiredEnv("CMS_STRIPE_CONNECT_API_KEY");
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
    if (!token || !safeEqual(token, expected)) {
        throw new HttpError(401, "invalid CMS API key");
    }

    const requireUser = options.requireUser ?? true;
    const userId = request.headers.get("x-cms-user-id")?.trim() || request.headers.get("x-user-id")?.trim() || "";
    if (requireUser && !userId) {
        throw new HttpError(401, "missing x-user-id");
    }
    if (userId.length > 200) {
        throw new HttpError(400, "x-user-id is too long");
    }
    return { userId };
}

export function requireDashboardAdmin(request: Request): { userId: string; actorKind: "admin" } {
    const { userId } = requireCmsRequest(request);
    const role = request.headers.get("x-cms-user-role")?.trim() ?? "";
    if (role !== "admin") {
        throw new HttpError(403, "the CMS admin role is required");
    }
    return { userId, actorKind: "admin" };
}
