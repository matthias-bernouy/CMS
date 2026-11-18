import { expect, test } from "bun:test";
import { assertDeliveryBody } from "./delivery";

test("delivery postconditions reject stale or missing content and require empty HEAD bodies", () => {
    const bytes = (text: string) => new TextEncoder().encode(text);
    expect(() => assertDeliveryBody(bytes("<p>current</p>"), "current", "GET", "stale")).not.toThrow();
    expect(() => assertDeliveryBody(bytes("<p>stale</p>"), "current", "GET", "stale")).toThrow();
    expect(() => assertDeliveryBody(bytes("current stale"), "current", "GET", "stale")).toThrow();
    expect(() => assertDeliveryBody(new Uint8Array(), "current", "GET")).toThrow();
    expect(() => assertDeliveryBody(new Uint8Array(), "current", "HEAD")).not.toThrow();
    expect(() => assertDeliveryBody(bytes("unexpected"), "current", "HEAD")).toThrow();
    expect(() => assertDeliveryBody("current", "current", "GET")).toThrow();
    expect(() => assertDeliveryBody(bytes("<p>current</p>"), "current", "GET", undefined, 1024)).toThrow();
});
