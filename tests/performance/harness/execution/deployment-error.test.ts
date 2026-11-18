import { expect, test } from "bun:test";
import { DeploymentPreparationError } from "../../../integration/instance/containers/deployment";

test("deployment errors retain private startup evidence without exposing it in ordinary diagnostic reports", () => {
    const error = new DeploymentPreparationError(
        "provider",
        "private-bootstrap-credential",
        new Error("private-cause"),
    );
    expect(error.message).toContain("provider");
    expect(error.diagnostics).toBe("private-bootstrap-credential");
    expect(String(error)).not.toContain("private");
    expect(JSON.stringify(error)).not.toContain("private");
});
