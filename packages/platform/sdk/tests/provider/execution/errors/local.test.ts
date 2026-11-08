import { expect, test } from "bun:test";
import { capabilityError, z } from "@bernouy/ulvia-sdk";
import { executeCapability } from "@bernouy/ulvia-sdk/local";
import { context, errorFeature, MissingNote, read } from "./fixture";

test("local feature execution maps business errors with their exact owner and private original cause", async () => {
    const cause = new MissingNote("private-note-token");
    const services = {
        notes: {
            read: async () => {
                throw cause;
            },
        },
    };
    const feature = errorFeature();
    await expect(executeCapability(feature, "read", { input: { id: "one" }, services, context })).rejects.toMatchObject(
        { capability: read, code: "MISSING", output: { message: "Note is absent." }, cause },
    );
    await expect(executeCapability(read, { input: { id: "one" }, services, context })).rejects.toBe(cause);
});

test("local feature policies do not reclassify validation failures or explicit capability failures", async () => {
    let calls = 0;
    let reads = 0;
    const feature = errorFeature(() => {
        calls++;
        return { code: "UNAVAILABLE", output: { message: "Mapped" } };
    });
    await expect(
        executeCapability(feature, "read", {
            input: { id: 42 },
            services: {
                notes: {
                    read: async () => {
                        reads++;
                        return "one";
                    },
                },
            },
            context,
        }),
    ).rejects.toBeInstanceOf(z.ZodError);
    expect(reads).toBe(0);
    const explicit = capabilityError(read, "MISSING", { message: "Explicit" });
    await expect(
        executeCapability(feature, "read", {
            input: { id: "one" },
            services: {
                notes: {
                    read: async () => {
                        throw explicit;
                    },
                },
            },
            context,
        }),
    ).rejects.toBe(explicit);
    await expect(
        executeCapability(feature, "read", {
            input: { id: "one" },
            services: { notes: { read: async () => 42 as never } },
            context,
        }),
    ).rejects.toBeInstanceOf(z.ZodError);
    expect(calls).toBe(0);
});

test("unmapped local service exceptions retain their identity and do not acquire a declared error code", async () => {
    const failure = new Error("private-unmapped-token");
    const feature = errorFeature(() => undefined);
    await expect(
        executeCapability(feature, "read", {
            input: { id: "one" },
            services: {
                notes: {
                    read: async () => {
                        throw failure;
                    },
                },
            },
            context,
        }),
    ).rejects.toBe(failure);
});
