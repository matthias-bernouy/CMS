import { expect, test } from "bun:test";
import { observedSmtp } from "./smtp/evidence";
import { dependencyEvidence } from "./dependencies";
import type { SmtpControl } from "./smtp/client";
import type { Observation } from "../clients/types";

test("SMTP evidence requires actual acknowledged exchanges and preserves failed auxiliary collection attempts", async () => {
    const target = `ulvia/cms.emailer.smtp@1.0.0#sha256:${"a".repeat(64)}:emailer.send`;
    const observation: Observation = {
        traceId: "root",
        durationMs: 25,
        requestBytes: 200,
        responseBytes: 13,
        status: 200,
        validated: true,
        completed: true,
        streamConsumed: true,
    };
    const control: SmtpControl = {
        async counts() {
            return { requests: 0, requestBytes: 0, responseBytes: 0 };
        },
        async mailbox() {
            return { messages: [], counts: await this.counts("") };
        },
        async remove() {},
    };
    let calls = 0;
    const measured = await observedSmtp(
        {
            ...control,
            async counts() {
                return ++calls === 1
                    ? { requests: 2, requestBytes: 200, responseBytes: 200 }
                    : { requests: 3, requestBytes: 700, responseBytes: 500 };
            },
        },
        "recipient@performance.test",
        async () => observation,
    );
    expect(measured.dependencies).toEqual([
        { service: "smtp", requests: 1, requestBytes: 500, responseBytes: 300, complete: true },
    ]);
    expect(dependencyEvidence(target, measured.dependencies).complete).toBe(true);
    expect(dependencyEvidence(target).complete).toBe(false);
    expect(
        dependencyEvidence(target, [
            { service: "dns", requests: 1, requestBytes: 100, responseBytes: 100, complete: true },
        ]).complete,
    ).toBe(false);
    const untouched = await observedSmtp(control, "recipient@performance.test", async () => observation);
    expect(dependencyEvidence(target, untouched.dependencies).complete).toBe(false);
    calls = 0;
    const failed = await observedSmtp(
        {
            ...control,
            async counts() {
                if (++calls === 2) {
                    throw new Error("private fixture error");
                }
                return { requests: 0, requestBytes: 0, responseBytes: 0 };
            },
        },
        "recipient@performance.test",
        async () => observation,
    );
    expect(failed.traceId).toBe("root");
    expect(failed.status).toBe(200);
    expect(failed.requestBytes).toBe(200);
    expect(failed.validated).toBe(false);
    expect(failed.failure).toBe("dependency-evidence-incomplete");
    expect(JSON.stringify(failed)).not.toContain("private fixture error");
    for (const capability of ["request-email-verification", "request-password-reset"]) {
        const access = `ulvia/cms.access@1.0.0#sha256:${"b".repeat(64)}:${capability}`;
        expect(dependencyEvidence(access).complete).toBe(false);
        expect(dependencyEvidence(access, measured.dependencies).complete).toBe(true);
    }
});
