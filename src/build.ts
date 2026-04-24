export async function buildUIComponents(path: string): Promise<string> {

  const result = await Bun.build({
    entrypoints: [path],
    target: "browser",
    format: "iife",
    minify: true,
  });

  return await result.outputs[0]?.text() || "";

}