import { expect, test } from "bun:test";
import {
    assertImageVersion,
    officialImageReference,
    parseOfficialImageInspection,
    pinnedOfficialImageReference,
} from "../../../src/runtime/stack/orchestration/images";

test("official image metadata resolves a mutable tag to an immutable digest", () => {
    const digest = `sha256:${"a".repeat(64)}`;
    const image = parseOfficialImageInspection(
        JSON.stringify([
            {
                RepoDigests: [`cyaxis/ulvia-edge@${digest}`],
                Config: {
                    Labels: {
                        "io.ulvia.component": "edge",
                        "io.ulvia.stack-api": "1",
                        "org.opencontainers.image.version": "0.0.1-beta",
                    },
                },
            },
        ]),
        "edge",
        "0.0.1-beta",
    );

    expect(officialImageReference(image.component, image.version)).toBe("docker.io/cyaxis/ulvia-edge:0.0.1-beta");
    expect(pinnedOfficialImageReference(image)).toBe(`docker.io/cyaxis/ulvia-edge@${digest}`);
    expect(image.digest).toBe(digest);
});

test("official image metadata rejects component, API, version, and digest mismatches", () => {
    const metadata = (labels: Record<string, string>, digests: string[] = [`image@sha256:${"b".repeat(64)}`]) =>
        JSON.stringify([{ RepoDigests: digests, Config: { Labels: labels } }]);
    const validLabels = {
        "io.ulvia.component": "provider",
        "io.ulvia.stack-api": "1",
        "org.opencontainers.image.version": "1.2.3",
    };

    expect(() => parseOfficialImageInspection(metadata(validLabels), "edge", "1.2.3")).toThrow(
        /not the official Ulvia edge/,
    );
    expect(() =>
        parseOfficialImageInspection(metadata({ ...validLabels, "io.ulvia.stack-api": "2" }), "provider", "1.2.3"),
    ).toThrow(/unsupported stack API/);
    expect(() =>
        parseOfficialImageInspection(
            metadata({ ...validLabels, "org.opencontainers.image.version": "1.2.4" }),
            "provider",
            "1.2.3",
        ),
    ).toThrow(/does not match/);
    expect(() => parseOfficialImageInspection(metadata(validLabels, []), "provider", "1.2.3")).toThrow(
        /no immutable repository digest/,
    );
});

test("official references only accept exact semantic versions", () => {
    expect(officialImageReference("repository", "1.2.3-rc.1")).toBe(
        "docker.io/cyaxis/ulvia-official-repository:1.2.3-rc.1",
    );
    expect(() => assertImageVersion("latest")).toThrow(/Invalid Ulvia image version/);
    expect(() => assertImageVersion("1.2")).toThrow(/Invalid Ulvia image version/);
    expect(() => assertImageVersion("1.2.3@sha256:bad")).toThrow(/Invalid Ulvia image version/);
});
