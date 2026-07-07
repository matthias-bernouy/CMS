import base from "./base.css" with { type: "text" };
import browser from "./browser.css" with { type: "text" };
import detail from "./detail.css" with { type: "text" };
import setup from "./setup.css" with { type: "text" };
import responsive from "./responsive.css" with { type: "text" };

export default [base, browser, detail, setup, responsive].join("\n");
