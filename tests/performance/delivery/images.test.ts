import { expect, test } from "bun:test";
import { assertCandidateImage } from "./images";
test("delivery budgets reject stale images and incorrect component metadata", () => {
    const valid = [
        {
            Config: {
                Labels: {
                    "io.ulvia.component": "provider",
                    "io.ulvia.stack-api": "1",
                    "org.opencontainers.image.revision": "candidate",
                },
            },
        },
    ];
    expect(() => assertCandidateImage(valid, "provider", "candidate")).not.toThrow();
    for (const [value, component, revision] of [
        [valid, "edge", "candidate"],
        [valid, "provider", "old"],
        [[], "provider", "candidate"],
        [{}, "provider", "candidate"],
    ] as const) {
        expect(() => assertCandidateImage(value, component, revision)).toThrow("candidate");
    }
});
