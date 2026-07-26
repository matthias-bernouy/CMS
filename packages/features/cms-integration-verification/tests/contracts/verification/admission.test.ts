import { describe, expect, test } from "bun:test";
import {
    identifyAdmissionInputSnapshot,
    parseAdmissionInputSnapshot,
    validateAdmissionInputSnapshot,
    validateAdmissionInputSnapshotForPolicy,
} from "../../../src/exports/index";
import { DIGEST_A, DIGEST_B } from "../fixtures";
import { admissionSnapshot, policySnapshot } from "./controlFixtures";

describe("admission input snapshot", () => {
    test("canonically binds the exact candidate and all transitive admission inputs", async () => {
        const admission = await admissionSnapshot();
        const shuffled = {
            ...admission,
            suites: admission.suites.toReversed(),
            reviewedBaselines: admission.reviewedBaselines.toReversed(),
            dependencies: admission.dependencies.toReversed(),
            activeContracts: admission.activeContracts.toReversed(),
        };
        const first = await identifyAdmissionInputSnapshot(admission);
        const second = await identifyAdmissionInputSnapshot(shuffled);

        expect(first.digest).toBe(second.digest);
        expect(first.canonicalBytes).toEqual(second.canonicalBytes);
        expect(first.snapshot.suites.map((suite) => suite.suiteId)).toEqual([
            "implementation",
            "platform-install",
            "public-contract",
        ]);
    });

    test("joins the snapshot to the exact policy digest, selected runner, and platform suite plan", async () => {
        const policy = await policySnapshot();
        const admission = await admissionSnapshot(policy);
        await expect(validateAdmissionInputSnapshotForPolicy(admission, policy)).resolves.toMatchObject({
            snapshot: { candidate: { candidateId: "candidate-1" } },
        });

        await expect(
            validateAdmissionInputSnapshotForPolicy({ ...admission, policyDigest: DIGEST_A }, policy),
        ).rejects.toThrow(/does not identify the supplied policy/);
        await expect(
            validateAdmissionInputSnapshotForPolicy(
                {
                    ...admission,
                    selectedRunner: { ...admission.selectedRunner, imageDigest: `sha256:${DIGEST_B}` },
                },
                policy,
            ),
        ).rejects.toThrow(/exact runner approved by policy/);
        await expect(
            validateAdmissionInputSnapshotForPolicy(
                { ...admission, suites: admission.suites.filter((suite) => suite.source !== "platform") },
                policy,
            ),
        ).rejects.toThrow(/platform suites/);
    });

    test("requires an exact suite plan for every active inherited contract", async () => {
        const admission = await admissionSnapshot();
        expect(() =>
            validateAdmissionInputSnapshot({
                ...admission,
                suites: admission.suites.map((suite) =>
                    suite.source === "author-contract" ? { ...suite, contentDigest: DIGEST_A } : suite,
                ),
            }),
        ).toThrow(/does not bind active contract/);
        expect(() =>
            validateAdmissionInputSnapshot({
                ...admission,
                suites: admission.suites.filter((suite) => suite.source !== "author-contract"),
            }),
        ).toThrow(/every and only active author contract/);
    });

    test("rejects malformed digests, duplicate suites, and unknown fields", async () => {
        const admission = await admissionSnapshot();
        expect(() =>
            validateAdmissionInputSnapshot({
                ...admission,
                candidate: { ...admission.candidate, candidateDigest: "not-a-digest" },
            }),
        ).toThrow(/lowercase SHA-256/);
        expect(() =>
            validateAdmissionInputSnapshot({
                ...admission,
                suites: [...admission.suites, admission.suites[0]],
            }),
        ).toThrow(/duplicate/);
        expect(() => validateAdmissionInputSnapshot({ ...admission, trusted: true })).toThrow(
            /trusted.*not an allowed field/,
        );
    });

    test("rejects duplicate wire properties before semantic validation", async () => {
        const admission = await admissionSnapshot();
        const source = JSON.stringify(admission).replace(
            '"candidateId":"candidate-1"',
            '"candidateId":"candidate-1","candidateId":"candidate-2"',
        );
        expect(() => parseAdmissionInputSnapshot(source)).toThrow(/duplicate property/);
    });
});
