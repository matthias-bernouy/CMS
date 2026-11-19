import { expect, test } from "bun:test";
import { oauthPreparation } from "./preparation";
import { oauthSuccess } from "./protocol";
import { prepareOAuth } from "./cases";
import { inventoryFixture } from "../../../fixtures/inventory";
import { ClientFailure } from "../../../harness/clients/failure";
import type { ScenarioClient } from "../../../harness/clients/session";
import type { OAuthLease } from "./fixture";
import type { QueryEnvironment } from "../../queries/execute";

const response = (value: unknown, validated = true) => ({
    observation: { validated },
    output: { resultJson: JSON.stringify(value) },
});

test("lifecycle preparation shares bounded native-window waits across calls and never extends the policy", async () => {
    let clock = 0;
    let calls = 0;
    const sleeps: number[] = [];
    const prepare = oauthPreparation(
        async (milliseconds) => {
            sleeps.push(milliseconds);
            clock += milliseconds;
        },
        () => clock,
    );
    const send = async () =>
        response(++calls % 2 ? { error: "temporarily_unavailable", status: 429 } : { client_id: "owned" });
    for (let window = 0; window < 5; window++) {
        expect(await prepare("register-mcp-client", send)).toEqual({ client_id: "owned" });
    }
    expect(clock).toBe(300250);
    expect(sleeps.every((milliseconds) => milliseconds > 0 && milliseconds <= 10000)).toBe(true);
    await expect(prepare("register-mcp-client", send)).rejects.toThrow("oauth-lifecycle-window-budget");
    expect(calls).toBe(11);
});

test("preparation retries only numeric429 temporarily_unavailable, once per call", async () => {
    for (const refusal of [
        { error: "access_denied", status: 403 },
        { error: "temporarily_unavailable", status: 503 },
        { error: "temporarily_unavailable", status: "429" },
        { error: "invalid_request", status: 429 },
    ]) {
        let calls = 0;
        const prepare = oauthPreparation(async () => {
            throw Error("Unexpected sleep");
        });
        await expect(
            prepare("prepare-mcp-authorization", async () => {
                calls++;
                return response(refusal);
            }),
        ).rejects.toThrow("oauth-lifecycle-preparation-refused");
        expect(calls).toBe(1);
    }
    let calls = 0;
    let clock = 0;
    const prepare = oauthPreparation(
        async (milliseconds) => {
            clock += milliseconds;
        },
        () => clock,
    );
    await expect(
        prepare("register-mcp-client", async () => {
            calls++;
            return response({ error: "temporarily_unavailable", status: 429 });
        }),
    ).rejects.toThrow("oauth-lifecycle-preparation-refused-temporarily_unavailable-429");
    expect(calls).toBe(2);
    expect(clock).toBe(60050);
});

test("preparation refuses invalid envelopes and expired deadlines before another attempt", async () => {
    let clock = 0;
    let calls = 0;
    const prepare = oauthPreparation(
        async () => {
            throw Error("Unexpected sleep");
        },
        () => clock,
    );
    const send = async () => {
        calls++;
        return response({}, false);
    };
    await expect(prepare("register-mcp-client", send)).rejects.toThrow("oauth-lifecycle-preparation-envelope");
    expect(calls).toBe(1);
    clock = 360001;
    await expect(prepare("register-mcp-client", send)).rejects.toThrow("oauth-lifecycle-preparation-deadline");
    expect(calls).toBe(1);
    await expect(prepare("exchange-mcp-token", send)).rejects.toThrow();
    expect(calls).toBe(1);
});

test("preparation does not start a window that exceeds its deadline", async () => {
    let clock = 0;
    let sleeps = 0;
    const prepare = oauthPreparation(
        async () => {
            sleeps++;
        },
        () => clock,
    );
    clock = 300000;
    await expect(
        prepare("register-mcp-client", async () => response({ error: "temporarily_unavailable", status: 429 })),
    ).rejects.toThrow("oauth-lifecycle-window-budget");
    expect(sleeps).toBe(0);
});

test("protocol diagnostics whitelist symbols and statuses without retaining tokens or arbitrary text", () => {
    const privateValue = "private-token-do-not-retain";
    for (const refusal of [
        { error: privateValue, status: privateValue, error_description: privateValue },
        { error: { token: privateValue }, status: 999, access_token: privateValue },
    ]) {
        expect(() => oauthSuccess(response(refusal).output)).toThrow("oauth-protocol-refused-unknown-unknown");
        try {
            oauthSuccess(response(refusal).output);
        } catch (error) {
            expect(String(error)).not.toContain(privateValue);
        }
    }
    expect(() => oauthSuccess(response({ error: "invalid_grant", status: 400 }).output)).toThrow(
        "oauth-protocol-refused-invalid_grant-400",
    );
});

test("lifecycle fixture failures release their lease and measured rate refusals are attempted once", async () => {
    const base = await inventoryFixture();
    const calls: string[] = [];
    let releases = 0;
    let refusal = { error: "access_denied", status: 403 };
    const client: ScenarioClient = async (_contract, capability, _binding, _input, assert = () => {}) => {
        calls.push(capability);
        const output = { resultJson: JSON.stringify(refusal) };
        try {
            await assert(output);
            return { observation: base.measurement, output };
        } catch (error) {
            if (!(error instanceof ClientFailure)) {
                throw error;
            }
            return { observation: { ...base.measurement, validated: false, failure: error.code }, output };
        }
    };
    const lease = {
        value: { client, session: { origin: "http://localhost:1234" } },
        release: () => {
            releases++;
        },
    } as OAuthLease;
    const environment = {} as QueryEnvironment;
    await expect(prepareOAuth(lease, "authorize-mcp-connection", environment)).rejects.toThrow(
        "oauth-lifecycle-preparation-refused-access_denied-403",
    );
    expect(calls).toEqual(["register-mcp-client"]);
    expect(releases).toBe(1);
    refusal = { error: "temporarily_unavailable", status: 429 };
    const sample = await prepareOAuth(lease, "register-mcp-client", environment);
    const result = await sample.send();
    expect(result.validated).toBe(false);
    expect(result.failure).toBe("oauth-protocol-refused-temporarily_unavailable-429");
    expect(calls).toEqual(["register-mcp-client", "register-mcp-client"]);
    await sample.close!();
    expect(releases).toBe(2);
});
