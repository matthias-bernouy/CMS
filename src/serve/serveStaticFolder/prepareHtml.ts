import type { Runner } from "@bernouy/socle";
import replaceBasePath from "./replaceBasePath";

export default async function prepareHtml(path: string, runner: Runner, template: string){

    let temp = template as unknown as string;

    const content = replaceBasePath(await Bun.file(path).text(), runner.basePath);

    temp = replaceBasePath(temp, runner.basePath);

    temp = temp.replace("{{CONTENT}}", content)

    return temp;

}
