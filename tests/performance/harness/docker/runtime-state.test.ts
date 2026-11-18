import { expect, test } from "bun:test";
import { runtimeStateFinding, runtimeStateFindings } from "./runtime-state";

test("runtime lifecycle reports distinguish a confirmed OOM from an unexplained signal exit without retaining private fields", () => {
    const state = { Running: false, Status: "exited", ExitCode: 137, OOMKilled: true, Error: "private credential" };
    expect(runtimeStateFinding("provider", state)).toEqual([
        { code: "assessment-runtime-exited", message: "provider is exited; exitCode=137; OOMKilled=true" },
    ]);
    const signal = runtimeStateFinding("provider", { ...state, OOMKilled: false });
    expect(signal[0]!.message).toContain("OOMKilled=false");
    expect(JSON.stringify(signal)).not.toContain("private");
    expect(
        runtimeStateFinding("provider", { Running: true, Status: "running", ExitCode: 0, OOMKilled: true })[0]!.code,
    ).toBe("assessment-runtime-exited");
    expect(runtimeStateFinding("mongo", { Running: true, Status: "running", ExitCode: 0, OOMKilled: false })).toEqual(
        [],
    );
    for (const value of [
        null,
        {},
        { ...state, ExitCode: -1 },
        { ...state, OOMKilled: undefined },
        { ...state, Status: "private" },
    ]) {
        expect(runtimeStateFinding("provider", value)[0]!.code).toBe("assessment-runtime-state-unavailable");
    }
});

test("lifecycle inspection refuses foreign container scopes before calling Docker", async () => {
    const result = await runtimeStateFindings({
        id: "production",
        providerName: "production-provider",
        edgeName: "production-edge",
    });
    expect(result[0]!.code).toBe("assessment-runtime-state-unavailable");
});
