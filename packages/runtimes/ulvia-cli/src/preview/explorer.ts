import type { CollectionExampleFrame } from "@bernouy/cms-repository/collections/build";

export function exampleExplorer(frames: readonly CollectionExampleFrame[]): ReadonlyMap<string, Blob> {
    const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
    const options = frames
        .map(
            (frame, i) =>
                `<option value="${i}">${escape(frame.label)} — ${escape(frame.previewId)} (${frame.width} × ${frame.height})</option>`,
        )
        .join("");
    const data = JSON.stringify(frames).replaceAll("<", "\\u003c");
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Collection examples</title><link rel="stylesheet" href="explorer.css"><script src="explorer.js" defer></script></head>
<body><header><h1>Collection examples</h1><label>Example and frame <select id="example">${options}</select></label>
<button type="button" id="reset">Reset example</button><p id="description"></p></header>
<main><iframe id="frame" title="Interactive collection example" sandbox="allow-scripts"></iframe></main></body></html>`;
    const script = `const frames=${data};const select=document.getElementById("example");const frame=document.getElementById("frame");function show(){const item=frames[Number(select.value)];frame.width=String(item.width);frame.height=String(item.height);frame.src=item.path;document.getElementById("description").textContent=item.description;}select.addEventListener("change",show);document.getElementById("reset").addEventListener("click",show);show();`;
    const css = `html{color-scheme:light dark;font:16px/1.5 system-ui}body{margin:0;background:light-dark(#f1f3f5,#17191c);color:light-dark(#202328,#e4e6eb)}header{padding:20px}h1{font-size:20px;font-weight:500}label{display:inline-flex;flex-wrap:wrap;gap:8px;align-items:center}select,button{font:inherit;padding:8px;max-width:100%}main{padding:20px;overflow:auto}iframe{display:block;border:0;background:light-dark(#fff,#17191c)}`;
    return new Map([
        ["index.html", new Blob([html], { type: "text/html" })],
        ["explorer.js", new Blob([script], { type: "text/javascript" })],
        ["explorer.css", new Blob([css], { type: "text/css" })],
    ]);
}
