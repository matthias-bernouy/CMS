import { join } from "node:path";
import { writeFileSync } from "node:fs";

export function documentationChildren(root: string, workspace: string) {
    const children: { name: string; child: ReturnType<typeof Bun.spawn> }[] = [];
    const outcomes = new Map<
        ReturnType<typeof Bun.spawn>,
        {
            name: string;
            exitCode: number;
            signal: ReturnType<typeof Bun.spawn>["signalCode"];
            nativeCrash: boolean;
            diagnostic?: string;
        }
    >();
    const stop = async (child: ReturnType<typeof Bun.spawn>) => {
        if (outcomes.has(child)) {
            return;
        }
        child.kill("SIGTERM");
        const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
        const exitCode = await child.exited;
        clearTimeout(timer);
        const name = children.find((entry) => entry.child === child)!.name;
        const errors = Bun.file(join(root, `${name}.errors.log`));
        const text = (await errors.exists()) ? await errors.text() : "";
        const nativeCrash = /panic:|Bun has crashed|C\+\+ exception/u.test(text);
        outcomes.set(child, {
            name,
            exitCode,
            signal: child.signalCode,
            nativeCrash,
            ...(exitCode !== 0 || nativeCrash ? { diagnostic: text.slice(-2000) } : {}),
        });
    };
    return {
        start(name: string, args: string[], environment: Record<string, string> = {}) {
            // Bun preserves a reused subprocess sink when the next child writes nothing.
            writeFileSync(join(root, `${name}.log`), "");
            writeFileSync(join(root, `${name}.errors.log`), "");
            const child = Bun.spawn(args, {
                cwd: workspace,
                env: { ...process.env, ...environment },
                stdout: Bun.file(join(root, `${name}.log`)),
                stderr: Bun.file(join(root, `${name}.errors.log`)),
            });
            children.push({ name, child });
            return child;
        },
        stop,
        async close() {
            for (const { child } of children.toReversed()) {
                await stop(child);
            }
        },
        outcomes: () => [...outcomes.values()],
    };
}
