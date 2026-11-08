import { expect, test } from "bun:test";
import { runCli } from "../../../src/cli";

test("profile selection and profile upgrades are removed, without a network discovery alias", async () => {
    const options = { environment: { ULVIA_DATA_DIR: "/tmp/ulvia-no-profile-discovery" }, log: () => undefined };
    await expect(runCli(["instance", "create", "registry", "--profile", "repository@1.0.0"], options)).rejects.toThrow(
        "Usage",
    );
    await expect(runCli(["instance", "upgrade-profile", "registry", "repository@1.1.0"], options)).rejects.toThrow(
        "Usage",
    );
});
