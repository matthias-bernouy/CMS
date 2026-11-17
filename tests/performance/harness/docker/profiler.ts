import { docker } from "../../../integration/instance/docker";

export type ProfileMetrics = Readonly<{
    traceId: string;
    spanId?: string;
    operations: number;
    documentsExamined: number;
    keysExamined: number;
    documentsReturned: number;
}>;

export async function startProfiler(stackId: string): Promise<readonly string[]> {
    const result = await docker([
        "exec",
        `${stackId}-mongo`,
        "mongosh",
        "--quiet",
        "--eval",
        `
        const databases = db.adminCommand({listDatabases:1}).databases.map(x=>x.name).filter(x=>!["admin","config","local"].includes(x));
        for(const name of databases){
            const target=db.getSiblingDB(name);target.setProfilingLevel(0);target.system.profile.drop();
            target.createCollection("system.profile",{capped:true,size:67108864});
            target.setProfilingLevel(2,{filter:{$or:[{"command.comment.ulviaPerformanceTrace":{$exists:true}},{"originatingCommand.comment.ulviaPerformanceTrace":{$exists:true}}]}});
        }
        print(JSON.stringify(databases));
    `,
    ]);
    const names: unknown = JSON.parse(result.stdout.trim());
    if (!Array.isArray(names) || !names.length || names.some((name) => typeof name !== "string")) {
        throw new Error("No application database is profiled");
    }
    return names;
}

export async function readProfile(stackId: string, traceIds: readonly string[]): Promise<ProfileMetrics[]> {
    if (!traceIds.length || traceIds.length > 1000 || traceIds.some((id) => !/^[a-zA-Z0-9-]{1,128}$/u.test(id))) {
        throw new Error("Invalid profiler trace selection");
    }
    const result = await docker([
        "exec",
        `${stackId}-mongo`,
        "mongosh",
        "--quiet",
        "--eval",
        `
        const ids=${JSON.stringify(traceIds)};const rows=[];
        for(const info of db.adminCommand({listDatabases:1}).databases.filter(x=>!["admin","config","local"].includes(x.name))){
            const target=db.getSiblingDB(info.name);
            const result=target.system.profile.aggregate([
                {$match:{$or:[{"command.comment.ulviaPerformanceTrace":{$in:ids}},{"originatingCommand.comment.ulviaPerformanceTrace":{$in:ids}}]}},
                {$group:{_id:{traceId:{$ifNull:["$command.comment.ulviaPerformanceTrace","$originatingCommand.comment.ulviaPerformanceTrace"]},spanId:{$ifNull:["$command.comment.spanId","$originatingCommand.comment.spanId"]}},operations:{$sum:1},documentsExamined:{$sum:{$ifNull:["$docsExamined",0]}},keysExamined:{$sum:{$ifNull:["$keysExamined",0]}},documentsReturned:{$sum:{$ifNull:["$nreturned",0]}}}}
            ]).toArray();
            for(const row of result)rows.push({traceId:row._id.traceId,spanId:row._id.spanId,operations:row.operations,documentsExamined:row.documentsExamined,keysExamined:row.keysExamined,documentsReturned:row.documentsReturned});
        }
        print(JSON.stringify(rows));
    `,
    ]);
    return JSON.parse(result.stdout.trim()) as ProfileMetrics[];
}
