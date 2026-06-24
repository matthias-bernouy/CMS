import InvalidParam from "cms-control/errors/Http/InvalidParam";

export type EmailTestDto = {
    to: string;
};

export function parseEmailTestDto(body: Record<string, unknown>): EmailTestDto {
    const to = body.to;
    if (typeof to !== "string") throw new InvalidParam("to", "expected a string.");
    const email = to.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new InvalidParam("to", "expected an email address.");
    }
    return { to: email };
}
