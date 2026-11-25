/** System fonts and inline CSS keep error documents independent of asset delivery. */
export const ERROR_DOCUMENT_STYLE = `
:root{color-scheme:light;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0f0f0e;background:#fff;font-synthesis:none}
*{box-sizing:border-box}body{margin:0;min-height:100vh;min-height:100svh;display:flex;flex-direction:column;padding:0 clamp(24px,5vw,72px)}
.shell{width:100%;max-width:1120px;margin-inline:auto}a{color:inherit}a:focus-visible{outline:3px solid #f4511e;outline-offset:6px}
.header{display:flex;align-items:center;justify-content:space-between;gap:24px;padding-block:28px;border-bottom:1px solid #e6e6e2}
.brand{font-size:32px;font-weight:800;letter-spacing:-1.8px;text-decoration:none;line-height:1}.brand::after{content:".";color:#f4511e}
.label{font-size:11px;font-weight:650;letter-spacing:1.6px;text-transform:uppercase;color:#64645f;line-height:1.5}
main{flex:1;display:grid;grid-template-columns:1.15fr 1fr;align-items:center;gap:72px;padding-block:80px}
.eyebrow{display:flex;align-items:center;gap:10px;margin:0 0 24px}.eyebrow::before{content:"";width:7px;height:7px;background:#f4511e;flex:none}
h1{max-width:540px;margin:0;font-size:clamp(40px,5.2vw,64px);line-height:1.05;font-weight:750;letter-spacing:-.055em}
.description{max-width:430px;margin:24px 0 32px;color:#54544f;font-size:17px;line-height:1.7;text-wrap:pretty}
.action{display:inline-flex;align-items:stretch;background:#0f0f0e;color:#fff;text-decoration:none;border:1px solid #0f0f0e;font-size:14px;font-weight:650}
.action-text{padding:18px 24px}.arrow{display:grid;place-items:center;width:56px;border-left:1px solid #454540;font-size:23px;line-height:1}.action:hover{background:#30302c}
.code-panel{position:relative;display:grid;place-items:center;min-height:330px;align-self:center;border:1px solid #e6e6e2;background-color:#f8f8f5;background-image:linear-gradient(#e9e9e466 1px,transparent 1px),linear-gradient(90deg,#e9e9e466 1px,transparent 1px);background-size:32px 32px;overflow:hidden}
.code{position:relative;z-index:1;color:#f4511e;font-size:clamp(128px,17vw,220px);font-weight:750;letter-spacing:-.085em;line-height:1;padding-right:.085em;font-variant-numeric:tabular-nums}
.panel-caption{position:absolute;bottom:20px;left:24px;right:24px;display:flex;align-items:center;justify-content:space-between;gap:12px}.panel-caption::after{content:"";height:1px;width:44px;background:#f4511e}
footer{display:flex;justify-content:space-between;align-items:center;gap:24px;padding-block:24px;border-top:1px solid #e6e6e2;color:#64645f;font-size:12px;line-height:1.5}footer a{text-underline-offset:4px}
@media(max-width:700px){.header{padding-block:24px}.header>.label{max-width:128px;text-align:right}main{grid-template-columns:1fr;gap:40px;padding-block:48px}.code-panel{min-height:210px}.code{font-size:150px}.description{font-size:16px;margin-block:20px 28px}h1{font-size:44px}.eyebrow{margin-bottom:18px}.panel-caption{bottom:16px}footer{align-items:flex-start;font-size:11px}}
@media(prefers-reduced-motion:no-preference){.action{transition:background-color .15s ease}}
`;
