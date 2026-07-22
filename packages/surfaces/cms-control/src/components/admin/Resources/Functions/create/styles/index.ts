import controls from "./controls.css" with { type: "text" };
import layout from "./layout.css" with { type: "text" };
import mapping from "./mapping.css" with { type: "text" };
import steps from "./steps.css" with { type: "text" };

export default [layout, mapping, controls, steps].join("\n") as unknown as string;
