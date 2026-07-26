import type { AnonymousConstraintFinding } from "cms-integrations/default-implementation/supabase/sql/anonymousConstraintLint";

type AnonymousConstraintPattern = {
    label: string;
    sql: string;
    kinds: AnonymousConstraintFinding["kind"][];
    locations?: Array<{ line: number; column: number }>;
};

export const anonymousConstraintPatterns = [
    {
        label: "CREATE TABLE table CHECK",
        sql: "CREATE TABLE accounts (id bigint, CHECK (id > 0));",
        kinds: ["anonymous-check"],
    },
    {
        label: "CREATE TABLE table UNIQUE",
        sql: "create table accounts (email text, unique (email));",
        kinds: ["anonymous-unique"],
    },
    {
        label: "CREATE TABLE column CHECK",
        sql: "CREATE TABLE accounts (id bigint CHECK (id > 0));",
        kinds: ["anonymous-check"],
    },
    {
        label: "CREATE TABLE column UNIQUE",
        sql: "CREATE TABLE accounts (email text UNIQUE);",
        kinds: ["anonymous-unique"],
    },
    {
        label: "CREATE TABLE multiple anonymous constraints",
        sql: "CREATE TABLE accounts (id bigint CHECK (id > 0), email text UNIQUE, UNIQUE (id, email));",
        kinds: ["anonymous-check", "anonymous-unique", "anonymous-unique"],
    },
    {
        label: "CREATE TEMP TABLE",
        sql: "CREATE TEMP TABLE accounts (id bigint CHECK (id > 0));",
        kinds: ["anonymous-check"],
    },
    {
        label: "CREATE UNLOGGED TABLE IF NOT EXISTS with qualified quoted name",
        sql: 'CREATE UNLOGGED TABLE IF NOT EXISTS app."events" (email text UNIQUE);',
        kinds: ["anonymous-unique"],
    },
    {
        label: "comments between CREATE TABLE tokens",
        sql: "CREATE /* table keyword follows */ TABLE accounts (id bigint /* constraint */ CHECK (id > 0));",
        kinds: ["anonymous-check"],
    },
    {
        label: "multiline positions",
        sql: "CREATE TABLE accounts (\n  id integer,\n  email text UNIQUE,\n  CHECK (id > 0)\n);",
        kinds: ["anonymous-unique", "anonymous-check"],
        locations: [
            { line: 3, column: 14 },
            { line: 4, column: 3 },
        ],
    },
    {
        label: "nested CHECK expression",
        sql: "CREATE TABLE accounts (payload jsonb CHECK ((payload->>'kind') IN ('CHECK', 'UNIQUE')));",
        kinds: ["anonymous-check"],
    },
    {
        label: "UNIQUE NULLS NOT DISTINCT",
        sql: "CREATE TABLE accounts (email text, UNIQUE NULLS NOT DISTINCT (email));",
        kinds: ["anonymous-unique"],
    },
    {
        label: "column type parentheses before CHECK",
        sql: "CREATE TABLE prices (amount numeric(12, 2) CHECK (amount >= 0));",
        kinds: ["anonymous-check"],
    },
    {
        label: "quoted keywords inside an anonymous CHECK expression",
        sql: "CREATE TABLE rules (\"UNIQUE\" text, payload text CHECK (payload <> 'CHECK'));",
        kinds: ["anonymous-check"],
    },
    {
        label: "ALTER TABLE ADD CHECK",
        sql: "ALTER TABLE accounts ADD CHECK (id > 0);",
        kinds: ["anonymous-check"],
    },
    {
        label: "ALTER TABLE ADD UNIQUE",
        sql: "ALTER TABLE accounts ADD UNIQUE (email);",
        kinds: ["anonymous-unique"],
    },
    {
        label: "ALTER TABLE ADD COLUMN CHECK",
        sql: "ALTER TABLE accounts ADD COLUMN score integer CHECK (score >= 0);",
        kinds: ["anonymous-check"],
    },
    {
        label: "ALTER TABLE ADD COLUMN UNIQUE",
        sql: "ALTER TABLE accounts ADD COLUMN email text UNIQUE;",
        kinds: ["anonymous-unique"],
    },
    {
        label: "ALTER TABLE ADD COLUMN IF NOT EXISTS",
        sql: "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email text UNIQUE;",
        kinds: ["anonymous-unique"],
    },
    {
        label: "ALTER TABLE multiple ADD actions",
        sql: "ALTER TABLE accounts ADD COLUMN score integer CHECK (score >= 0), ADD UNIQUE (email);",
        kinds: ["anonymous-check", "anonymous-unique"],
    },
    {
        label: "ALTER TABLE IF EXISTS ONLY qualified relation",
        sql: "ALTER TABLE IF EXISTS ONLY app.accounts ADD COLUMN email text UNIQUE;",
        kinds: ["anonymous-unique"],
    },
    {
        label: "ALTER TABLE ADD UNIQUE USING INDEX",
        sql: "ALTER TABLE accounts ADD UNIQUE USING INDEX accounts_email_idx;",
        kinds: ["anonymous-unique"],
    },
    {
        label: "named CREATE TABLE table constraints",
        sql: "CREATE TABLE accounts (id bigint, CONSTRAINT accounts_id_check CHECK (id > 0), CONSTRAINT accounts_id_key UNIQUE (id));",
        kinds: [],
    },
    {
        label: "named CREATE TABLE column constraints",
        sql: 'CREATE TABLE accounts (id bigint CONSTRAINT "accounts id check" CHECK (id > 0), email text CONSTRAINT accounts_email_key UNIQUE);',
        kinds: [],
    },
    {
        label: "named ALTER TABLE constraints with comments",
        sql: "ALTER TABLE accounts ADD CONSTRAINT /* stable */ accounts_id_check CHECK (id > 0), ADD CONSTRAINT accounts_email_key UNIQUE (email);",
        kinds: [],
    },
    {
        label: "keywords in comments and strings",
        sql: "-- CREATE TABLE fake (id int UNIQUE);\nCREATE TABLE notes (value text DEFAULT 'CHECK (false), UNIQUE (value)', escaped text DEFAULT E'UNIQUE \\\' CHECK'); /* ALTER TABLE notes ADD CHECK (false); */",
        kinds: [],
    },
    {
        label: "keywords in dollar quotes and quoted identifiers",
        sql: 'DO $body_42$ BEGIN EXECUTE \'CREATE TABLE fake (id int UNIQUE)\'; END $body_42$; CREATE TABLE "CHECK" ("UNIQUE" text DEFAULT $$ALTER TABLE fake ADD CHECK (false)$$);',
        kinds: [],
    },
] satisfies AnonymousConstraintPattern[];
