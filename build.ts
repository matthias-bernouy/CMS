import { rm } from "node:fs/promises";

async function build() {
    try {
        // 1. Nettoyage du dossier dist (équivalent de rm -rf)
        await rm("dist", { recursive: true, force: true });
        console.log("Cleaning dist...");

        // 2. Type Checking (Bun ne vérifie pas les types, il faut tsc)
        console.log("Type checking...");
        const proc = Bun.spawn(["tsc"], {
            stdout: "inherit",
            stderr: "inherit",
        });
        
        const exitCode = await proc.exited;
        if (exitCode !== 0) {
            console.error("❌ Type checking failed");
            process.exit(1);
        }

        // 3. Bundling avec Bun
        console.log("Building...");
        const result = await Bun.build({
            entrypoints: ["src/index.ts"],
            outdir: "dist",
            target: "bun",
        });

        if (!result.success) {
            console.error("❌ Build failed", result.logs);
            return;
        }

        console.log("✅ Build complete!");
    } catch (e) {
        console.error("Build process error:", e);
    }
}

build();