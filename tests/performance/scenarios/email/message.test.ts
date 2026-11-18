import { expect, test } from "bun:test";
import { capturedMessage, recoveryToken } from "./message";

test("mail oracles decode complete multipart and quoted-printable bodies and keep action tokens origin scoped", () => {
    const token = `auth_${"x".repeat(43)}`;
    const raw = [
        "Subject: Controlled recovery",
        "Content-Type: multipart/alternative; boundary=fixture",
        "",
        "--fixture",
        "Content-Type: text/plain; charset=utf-8",
        "Content-Transfer-Encoding: quoted-printable",
        "",
        "Bonjour =C3=A9",
        `http://site.localhost:4321/reset-password?ulvia--mossa--auth-token=3Dauth_=`,
        "x".repeat(43),
        "--fixture",
        "Content-Type: text/html",
        "Content-Transfer-Encoding: base64",
        "",
        Buffer.from("<p>Complete</p>").toString("base64"),
        "--fixture--",
        "",
    ].join("\r\n");
    const decoded = capturedMessage(raw);
    expect(decoded.text).toContain("Bonjour é");
    expect(decoded.html).toBe("<p>Complete</p>");
    expect(decoded.headers.subject).toBe("Controlled recovery");
    expect(recoveryToken(raw, "http://site.localhost:4321", "/reset-password")).toBe(token);
    expect(() => recoveryToken(raw, "http://another.localhost:4321", "/reset-password")).toThrow();
    expect(() => recoveryToken(raw, "http://site.localhost:4321", "/confirm-email")).toThrow();
    expect(() => capturedMessage(raw.replace("--fixture--", "truncated"))).toThrow();
    expect(() => capturedMessage("malformed")).toThrow();
});
