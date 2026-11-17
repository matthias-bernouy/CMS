import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { distributionFixture } from "./fixture";

export async function runBuild(args: string[], failImages = false) {
    const version = args[1] && /^1\.2\.3(?:-beta\.1)?$/u.test(args[1]) ? args[1] : "1.2.3";
    const f = await distributionFixture(version);
    const root = f.root;
    const log = join(root, "commands.log");
    try {
        await mkdir(join(root, "bin"));
        await cp(
            join(f.destination, "repository"),
            join(root, "packages/runtimes/ulvia-cli/dist/bootstrap/repository"),
            { recursive: true },
        );
        await cp(join(f.destination, "cli"), join(root, "fixture-cli"), { recursive: true });
        const stub = `#!/bin/sh
printf '%s' "\${0##*/}" >> "$ULVIA_TEST_BUILD_LOG"
printf '\\t%s' "$@" >> "$ULVIA_TEST_BUILD_LOG"
printf '\\n' >> "$ULVIA_TEST_BUILD_LOG"
case "\${0##*/}" in
  git) printf '%s' "$ULVIA_TEST_REVISION" ;;
  docker)
    case "$*" in
      *ulvia-edge*) component=edge; character=a ;;
      *) component=provider; character=b ;;
    esac
    id=$(printf '%064s' '' | tr ' ' "$character")
    printf '[{"Id":"sha256:%s","Config":{"Labels":{"io.ulvia.component":"%s","io.ulvia.stack-api":"1","io.ulvia.hosting-api":"1","org.opencontainers.image.version":"%s","org.opencontainers.image.revision":"%s"}}}]' "$id" "$component" "$ULVIA_TEST_VERSION" "$ULVIA_TEST_REVISION"
    ;;
  bun)
    case "$*" in
      'run infra/images/build.ts build '*)
        if [ "$ULVIA_TEST_FAIL_IMAGES" = 1 ]; then exit 7; fi ;;
      'run infra/cli/build.ts build '*)
        mkdir -p "artifacts/distributions/$ULVIA_TEST_VERSION/cli"
        cp fixture-cli/* "artifacts/distributions/$ULVIA_TEST_VERSION/cli/" ;;
    esac
    ;;
esac
`;
        for (const name of ["bun", "git", "docker"]) {
            await writeFile(join(root, "bin", name), stub, { mode: 0o755 });
        }
        const child = Bun.spawn([process.execPath, resolve(import.meta.dir, "../../../build.ts"), ...args], {
            cwd: root,
            env: {
                ...process.env,
                PATH: `${join(root, "bin")}:${process.env.PATH}`,
                ULVIA_TEST_BUILD_LOG: log,
                ULVIA_TEST_FAIL_IMAGES: failImages ? "1" : "0",
                ULVIA_TEST_REVISION: f.revision,
                ULVIA_TEST_VERSION: version,
            },
            stdout: "pipe",
            stderr: "pipe",
        });
        const [status, stdout, stderr] = await Promise.all([
            child.exited,
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
        ]);
        const content = await readFile(log, "utf8").catch((error) => {
            if (error.code === "ENOENT") {
                return "";
            }
            throw error;
        });
        const commands = content
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => line.split("\t"));
        const receipt = await readFile(join(f.destination, "cli", `cyaxis-ulvia-${version}.json`), "utf8")
            .then(JSON.parse)
            .catch(() => null);
        return { status, stdout, stderr, commands, receipt };
    } finally {
        await f.close();
    }
}
