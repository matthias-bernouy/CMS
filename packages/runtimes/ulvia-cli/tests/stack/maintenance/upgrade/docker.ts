#!/usr/bin/env bun
import { writeFile } from "node:fs/promises";
/** Test transport: all Docker responses are real; only local candidate acquisition and a crash barrier are intercepted. */
export const upgradeDockerPath = import.meta.path;
if (import.meta.main) {
    const args = Bun.argv.slice(2),
        real = process.env.ULVIA_UPGRADE_REAL_DOCKER!;
    if (
        (args[0] === "pull" && args[1] === process.env.ULVIA_UPGRADE_LOCAL_PROVIDER) ||
        (args[0] === "pull" && args[1] === process.env.ULVIA_UPGRADE_LOCAL_EDGE)
    ) {
        const child = Bun.spawn([real, "image", "inspect", args[1]!], { stdout: "ignore", stderr: "inherit" });
        process.exit(await child.exited);
    }
    const child = Bun.spawn([real, ...args], {
        env: process.env,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
    });
    const code = await child.exited;
    const backup = process.env.ULVIA_UPGRADE_BACKUP_BARRIER;
    const coldCopy = args[0] === "run" && args.includes("-e") && JSON.parse(args.at(-1)!).mode === "create";
    const barrier = coldCopy ? backup : process.env.ULVIA_UPGRADE_PROXY_BARRIER;
    const up = args.indexOf("up");
    if (
        code === 0 &&
        barrier &&
        (coldCopy || (up >= 0 && args.slice(up).includes("--no-deps") && args.at(-1) === "proxy"))
    ) {
        await writeFile(`${barrier}.ready`, "ready");
        const deadline = Date.now() + 60000;
        while (!(await Bun.file(`${barrier}.release`).exists())) {
            if (Date.now() > deadline) {
                process.exit(70);
            }
            await Bun.sleep(10);
        }
    }
    process.exit(code);
}
