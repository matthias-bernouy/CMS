import { author, context, session, definitions, services } from "./sessionFixture";
import { expect, test } from "bun:test";
import { capabilityResponse, implementFeature, z } from "@bernouy/ulvia-sdk";
import { compileContract, compileProvider } from "@bernouy/ulvia-sdk/build";
import { executeCapability } from "@bernouy/ulvia-sdk/provider";
import { decodeSessionEffect, SESSION_EFFECT_HEADER } from "@bernouy/cms-gateway/protocol";
import { notesProviderDefinition } from "../../../../examples/provider";
import { unitProvider } from "../../support/runtime";

test("default SDK session effects stay outside public JSON and cookie policy stays with the Edge", async () => {
    const { feature } = definitions();
    const f = services();
    const build = await compileProvider({
        ...notesProviderDefinition("http://127.0.0.1:5103"),
        implementations: [implementFeature(feature)],
    });
    expect(f.counts).toEqual({ issues: 0, revokes: 0 });
    const runtime = unitProvider(build, f.ports);
    const login = await runtime.call(feature.contractId, "login", "/login", { method: "POST", body: "{}" });
    expect(login.status).toBe(200);
    expect(await login.json()).toEqual({ subjectId: "subject-a" });
    expect(login.headers.has("set-cookie")).toBe(false);
    expect(decodeSessionEffect(login.headers.get(SESSION_EFFECT_HEADER))).toEqual({
        type: "session",
        operation: "establish",
        ...session,
    });
    const logout = await runtime.call(feature.contractId, "logout", "/logout", { method: "POST", body: "{}" });
    expect(logout.status).toBe(200);
    expect(await logout.json()).toEqual({ cleared: true });
    expect(decodeSessionEffect(logout.headers.get(SESSION_EFFECT_HEADER))).toEqual({
        type: "session",
        operation: "clear",
    });
    expect(f.counts).toEqual({ issues: 1, revokes: 1 });
});

test("local JSON helpers refuse declared session effects before issuing or revoking credentials", async () => {
    const { feature, login, logout } = definitions();
    const f = services();
    for (const invoke of [
        () => executeCapability(feature, "login", { input: {}, services: f.ports, context }),
        () => executeCapability(login, { input: {}, services: f.ports, context }),
        () => executeCapability(feature, "logout", { input: {}, services: f.ports, context }),
        () => executeCapability(logout, { input: {}, services: f.ports, context }),
    ]) {
        await expect(invoke()).rejects.toThrow("response effects");
    }
    expect(f.counts).toEqual({ issues: 0, revokes: 0 });
});

test("an undeclared session effect is refused without forwarding its token or setting a cookie", async () => {
    const { feature } = definitions(false);
    const f = services();
    const build = await compileProvider({
        ...notesProviderDefinition("http://127.0.0.1:5103"),
        implementations: [implementFeature(feature)],
    });
    const response = await unitProvider(build, f.ports).call(feature.contractId, "login", "/login", {
        method: "POST",
    });
    expect(response.status).toBe(503);
    expect(response.headers.has(SESSION_EFFECT_HEADER)).toBe(false);
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(await response.text()).not.toContain(session.token);
});

test("local JSON helpers unwrap an effect-free typed response and still validate its body", async () => {
    const plain = author({
        ...definitions().login,
        id: "plain",
        responseEffects: [],
        execute: () => capabilityResponse({ subjectId: "subject-a" }),
    });
    expect(await executeCapability(plain, { input: {}, services: services().ports, context })).toEqual({
        subjectId: "subject-a",
    });
    const bad = { ...plain, execute: () => capabilityResponse({ subjectId: 42 }) } as unknown as typeof plain;
    await expect(executeCapability(bad, { input: {}, services: services().ports, context })).rejects.toBeInstanceOf(
        z.ZodError,
    );
});

test("the SDK retains the contract-language restriction on session response authority", async () => {
    const { feature } = definitions();
    await expect(
        compileContract({ ...feature, contractId: "example/sessions", publisherId: "example" }),
    ).rejects.toThrow("reserved to ulvia/cms.access");
});
