import { describe, test, expect } from "bun:test";
import { SignedCookieCodec } from "@bernouy/cms-auth";

const key = new TextEncoder().encode("test-secret-key-at-least-16-bytes");
const codec = () => new SignedCookieCodec(key);

describe("SignedCookieCodec", () => {
    test("roundtrips a signed payload with an exp claim", async () => {
        const c = codec();
        const token = await c.sign({ kind: "session", sub: "local:u1" }, 60);
        const body = await c.verify<{ kind: "session"; sub: string }>(token);
        expect(body?.kind).toBe("session");
        expect(body?.sub).toBe("local:u1");
        expect(typeof body?.exp).toBe("number");
    });

    test("rejects expired tokens", async () => {
        const token = await codec().sign({ kind: "session", sub: "local:u1" }, -1);
        expect(await codec().verify(token)).toBeNull();
    });

    test("rejects malformed tokens without throwing", async () => {
        const c = codec();
        expect(await c.verify("not-a-cookie")).toBeNull();
        expect(await c.verify("a.@@@")).toBeNull();
        expect(await c.verify("..")).toBeNull();
    });

    test("rejects a token whose signed payload was changed", async () => {
        const c = codec();
        const token = await c.sign({ kind: "session", sub: "local:u1" }, 60);
        const [data, sig] = token.split(".");
        const decoded = JSON.parse(new TextDecoder().decode(base64urlDecode(data!))) as Record<string, unknown>;
        const tampered = base64urlEncode(new TextEncoder().encode(JSON.stringify({ ...decoded, sub: "local:u2" })));
        expect(await c.verify(`${tampered}.${sig}`)).toBeNull();
    });

    test("rejects keys shorter than 16 bytes", () => {
        expect(() => new SignedCookieCodec(new TextEncoder().encode("too-short"))).toThrow(/key must be >= 16 bytes/);
    });
});

function base64urlEncode(bytes: Uint8Array): string {
    let bin = "";
    for (const b of bytes) {
        bin += String.fromCharCode(b);
    }
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(value: string): Uint8Array {
    const std = value.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(std + "=".repeat((4 - (std.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
        out[i] = bin.charCodeAt(i);
    }
    return out;
}
