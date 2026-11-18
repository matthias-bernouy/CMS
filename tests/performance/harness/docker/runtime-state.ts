import { docker } from "../../../integration/instance/docker";
import type { Finding } from "../../capabilities/types";
import type { MeasuredStack } from "./collect";
import { memoryEvidence } from "./memory";

type Role = "provider" | "edge" | "mongo";

export function runtimeStateFinding(role: Role, value: unknown): Finding[] {
    const row = value as Record<string, unknown> | null;
    const statuses = ["running", "exited", "created", "restarting", "paused", "dead", "removing"];
    if (
        !row ||
        typeof row.Running !== "boolean" ||
        typeof row.OOMKilled !== "boolean" ||
        !Number.isSafeInteger(row.ExitCode) ||
        Number(row.ExitCode) < 0 ||
        typeof row.Status !== "string" ||
        !statuses.includes(row.Status)
    ) {
        return [{ code: "assessment-runtime-state-unavailable", message: `${role} lifecycle evidence is invalid` }];
    }
    return row.Running && row.Status === "running" && !row.OOMKilled
        ? []
        : [
              {
                  code: "assessment-runtime-exited",
                  message: `${role} is ${row.Status}; exitCode=${row.ExitCode}; OOMKilled=${row.OOMKilled}`,
              },
          ];
}

/** Read only fixed lifecycle fields before the owned containers are destroyed; never retain their environment. */
export async function runtimeStateFindings(stack: MeasuredStack): Promise<Finding[]> {
    if (
        !/^ulvia-mcp-[a-f0-9]{8}$/u.test(stack.id) ||
        stack.providerName !== `${stack.id}-provider` ||
        stack.edgeName !== `${stack.id}-edge`
    ) {
        return [
            {
                code: "assessment-runtime-state-unavailable",
                message: "Lifecycle inspection requires an exact disposable stack",
            },
        ];
    }
    const roles = ["provider", "edge", "mongo"] as const;
    const results = await Promise.allSettled(
        roles.map(async (role) => {
            const result = await docker(["inspect", "--format", "{{json .State}}", `${stack.id}-${role}`]);
            const state = JSON.parse(result.stdout);
            const findings = runtimeStateFinding(role, state);
            if (state?.OOMKilled === true && findings.some((finding) => finding.code === "assessment-runtime-exited")) {
                const memory = await memoryEvidence(`${stack.id}-${role}`);
                return findings.map((finding) => ({ ...finding, message: `${finding.message}; ${memory}` }));
            }
            return findings;
        }),
    );
    return results.flatMap((result, index) =>
        result.status === "fulfilled"
            ? result.value
            : [
                  {
                      code: "assessment-runtime-state-unavailable",
                      message: `${roles[index]} lifecycle evidence could not be read`,
                  },
              ],
    );
}
