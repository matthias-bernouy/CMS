import { expect, test } from "bun:test";
import { isolationSession } from "./isolation";

test("isolation checks lazily authenticate the secondary administrator once and never reuse a publisher session", async () => {
    const actor = { email: "administrator@performance.test", password: "Controlled fixture password" };
    let calls = 0;
    const session = isolationSession(
        "http://site.localhost:1234",
        "http://preview.localhost:1234",
        actor,
        async (origin, administrator) => {
            calls++;
            expect(origin).toBe("http://preview.localhost:1234");
            expect(administrator).toEqual(actor);
            return { cookie: "secondary=administrator", accountId: "secondary-administrator" };
        },
    );
    expect(calls).toBe(0);
    const [first, second] = await Promise.all([session(), session()]);
    expect(calls).toBe(1);
    expect(first).toBe(second);
    expect(first).toEqual({
        origin: "http://preview.localhost:1234",
        cookie: "secondary=administrator",
        token: "",
        tools: [],
    });
    expect(await session()).toBe(first);
});

test("isolation sessions refuse equal or production origins and keep failed login diagnostics bounded", async () => {
    const actor = { email: "administrator@performance.test", password: "Private fixture password" };
    let calls = 0;
    const login = async () => {
        calls++;
        throw Error("Private fixture password and remote diagnostics");
    };
    expect(() => isolationSession("http://localhost:1", "http://localhost:1", actor, login)).toThrow("distinct");
    expect(() => isolationSession("http://localhost:1", "https://ulvia.fr", actor, login)).toThrow("loopback");
    expect(calls).toBe(0);
    const session = isolationSession("http://localhost:1", "http://preview.localhost:1", actor, login);
    await expect(session()).rejects.toThrow("isolation-administrator-login-failed");
    await expect(session()).rejects.toThrow("isolation-administrator-login-failed");
    expect(calls).toBe(1);
});
