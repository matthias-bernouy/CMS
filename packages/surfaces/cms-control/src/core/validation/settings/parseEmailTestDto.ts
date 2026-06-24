import InvalidParam from "cms-control/errors/Http/InvalidParam";
import type { AuthEmailKind } from "@bernouy/cms-auth";

export type EmailTestDto = {
    to:   string;
    kind: AuthEmailKind;
};

export function parseEmailTestDto(body: Record<string, unknown>): EmailTestDto {
    const to = body.to;
    if (typeof to !== "string") throw new InvalidParam("to", "expected a string.");
    const email = to.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new InvalidParam("to", "expected an email address.");
    }

    const kind = body.kind;
    if (kind !== "email_verification" && kind !== "password_reset") {
        throw new InvalidParam("kind", "expected email_verification or password_reset.");
    }

    return { to: email, kind };
}
