import { assertCondition } from "../queries/types";

/** Bounded MIME reader for the controlled Nodemailer fixtures, including wrapped quoted-printable action links. */
export function capturedMessage(raw: string) {
    assertCondition(Buffer.byteLength(raw) <= 4 * 1024 ** 2);
    const bodies = new Map<string, string>();
    const headers = (value: string) =>
        Object.fromEntries(
            value
                .replace(/\r\n[ \t]+/gu, " ")
                .split("\r\n")
                .map((line) => {
                    const colon = line.indexOf(":");
                    assertCondition(colon > 0);
                    return [line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim()];
                }),
        );
    const entity = (value: string, depth: number) => {
        assertCondition(depth <= 3);
        const split = value.indexOf("\r\n\r\n");
        assertCondition(split >= 0 && split <= 16384);
        const fields = headers(value.slice(0, split));
        const body = value.slice(split + 4);
        const type = fields["content-type"] ?? "text/plain";
        if (type.startsWith("multipart/")) {
            const boundary = /boundary=(?:"([^"\r\n]+)"|([^;\s]+))/iu.exec(type);
            assertCondition(boundary);
            const parts = body.split(`--${boundary[1] ?? boundary[2]}`);
            assertCondition(parts.length >= 3 && parts.length <= 8 && parts.at(-1)!.startsWith("--"));
            for (const part of parts.slice(1, -1)) {
                assertCondition(part.startsWith("\r\n") && part.endsWith("\r\n"));
                entity(part.slice(2, -2), depth + 1);
            }
            return fields;
        }
        const mime = type.split(";", 1)[0]!.toLowerCase();
        assertCondition(["text/plain", "text/html"].includes(mime) && !bodies.has(mime));
        const encoding = (fields["content-transfer-encoding"] ?? "7bit").toLowerCase();
        assertCondition(["base64", "quoted-printable", "7bit", "8bit"].includes(encoding));
        const decoded =
            encoding === "base64"
                ? Buffer.from(body.replace(/\s/gu, ""), "base64").toString("utf8")
                : encoding === "quoted-printable"
                  ? Buffer.from(
                        body
                            .replace(/=\r\n/gu, "")
                            .replace(/=([a-f0-9]{2})/giu, (_all, hex: string) =>
                                String.fromCharCode(Number.parseInt(hex, 16)),
                            ),
                        "latin1",
                    ).toString("utf8")
                  : body;
        bodies.set(mime, decoded.replace(/\r\n/gu, "\n"));
        return fields;
    };
    const fields = entity(raw, 0);
    assertCondition(bodies.has("text/plain"));
    return { headers: fields, text: bodies.get("text/plain")!, html: bodies.get("text/html") };
}

export function recoveryToken(raw: string, origin: string, path: "/confirm-email" | "/reset-password") {
    const decoded = capturedMessage(raw);
    const urls = decoded.text.match(/https?:\/\/[^\s<>"']+/gu) ?? [];
    const candidates = urls
        .map((value) => new URL(value))
        .filter((url) => url.origin === origin && url.pathname === path);
    assertCondition(candidates.length === 1);
    const url = candidates[0]!;
    const token = url.searchParams.get("ulvia--mossa--auth-token");
    assertCondition(!url.hash && url.searchParams.size === 1 && token && /^auth_[a-zA-Z0-9_-]{43}$/u.test(token));
    return token;
}
