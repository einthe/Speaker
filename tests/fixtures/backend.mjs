// Loopback-only test adapter. Real production SQL/RLS runs in PGlite; Auth and
// Storage HTTP are simulated. This is not a replacement for hosted Supabase E2E.
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "node:http";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

export async function startLocalBackend({
  port = 54329,
  serviceKey = "local-test-service-key-never-use-in-production",
  seed,
} = {}) {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new Error("The local backend cannot run in production or on Vercel.");
  }
  const db = new PGlite();
  await db.exec(readFileSync(new URL("./supabase-schema.sql", import.meta.url), "utf8"));
  for (const migration of readdirSync(new URL("../../supabase/migrations/", import.meta.url))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(
      readFileSync(new URL(`../../supabase/migrations/${migration}`, import.meta.url), "utf8"),
    );
  const columns = new Map();
  for (const row of (
    await db.query(
      "select table_name,column_name from information_schema.columns where table_schema='public'",
    )
  ).rows) {
    if (!columns.has(row.table_name)) columns.set(row.table_name, new Set());
    columns.get(row.table_name).add(row.column_name);
  }
  // Infer embedding direction/cardinality from the actual migration's constraints.
  // post_media is to-many; older fixtures used UNIQUE(post_id).
  const relations = (
    await db.query(`select c.conname, c.conrelid::regclass::text as source,
 c.confrelid::regclass::text as target, a.attname as source_key, b.attname as target_key,
 exists(select 1 from pg_constraint u where u.conrelid=c.conrelid and u.contype in ('p','u') and u.conkey=c.conkey) as is_unique
 from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
 join pg_attribute b on b.attrelid=c.confrelid and b.attnum=c.confkey[1]
 join pg_namespace n on n.oid=c.connamespace where c.contype='f' and n.nspname='public'`)
  ).rows;
  const users = new Map(),
    sessions = new Map(),
    files = new Map(),
    failures = new Map();
  const identifier = (value) => {
    if (!/^[a-z_]+$/.test(value)) throw new Error("Invalid identifier");
    return `"${value}"`;
  };
  const userData = (entry) => ({
    id: entry.id,
    email: entry.email,
    aud: "authenticated",
    role: "authenticated",
    created_at: entry.created_at,
    updated_at: entry.created_at,
    email_confirmed_at: entry.created_at,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: entry.metadata,
    identities: [],
  });
  async function addUser(input) {
    if ([...users.values()].some((u) => u.email === input.email))
      throw new Error("User already exists");
    const user = {
      id: randomUUID(),
      email: input.email,
      password: input.password,
      metadata: input.user_metadata ?? input.data ?? {},
      created_at: new Date().toISOString(),
    };
    await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)", [
      user.id,
      user.email,
      JSON.stringify(user.metadata),
    ]);
    users.set(user.id, user);
    return user;
  }
  function session(user) {
    const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
    const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000), iss: `http://127.0.0.1:${port}/auth/v1` })}`;
    const access_token = `${unsigned}.${createHmac("sha256", serviceKey).update(unsigned).digest("base64url")}`;
    const refresh_token = randomUUID();
    sessions.set(access_token, user.id);
    sessions.set(refresh_token, user.id);
    return {
      access_token,
      refresh_token,
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer",
      user: userData(user),
    };
  }
  function splitSelection(value) {
    const fields = [];
    let depth = 0,
      start = 0;
    for (let i = 0; i < value.length; i++) {
      if (value[i] === "(") depth++;
      if (value[i] === ")") depth--;
      if (value[i] === "," && depth === 0) {
        fields.push(value.slice(start, i));
        start = i + 1;
      }
    }
    fields.push(value.slice(start));
    return fields.filter(Boolean);
  }
  async function embed(table, row, selection) {
    const result = {};
    for (const field of splitSelection(selection)) {
      if (field === "*") {
        Object.assign(result, row);
        continue;
      }
      if (!field.includes("(")) {
        result[field] = row[field];
        continue;
      }
      const open = field.indexOf("("),
        raw = field.slice(0, open),
        nested = field.slice(open + 1, -1);
      const [alias, spec] = raw.includes(":") ? raw.split(":") : [raw.split("!")[0], raw];
      const [target, hint] = spec.split("!");
      const matches = relations.flatMap((r) => {
        if (hint && r.conname !== hint) return [];
        if (r.source === table && r.target === target)
          return [{ source: r.source_key, target: r.target_key, one: true }];
        if (r.target === table && r.source === target)
          return [{ source: r.target_key, target: r.source_key, one: r.is_unique }];
        return [];
      });
      if (matches.length !== 1)
        throw new Error(`Ambiguous or missing relationship ${table}.${raw}`);
      const relation = matches[0];
      const rows =
        row[relation.source] == null
          ? []
          : (
              await db.query(
                `select to_jsonb(t) as row from public.${identifier(target)} t where ${identifier(relation.target)}=$1`,
                [row[relation.source]],
              )
            ).rows;
      const children = [];
      for (const child of rows) children.push(await embed(target, child.row, nested));
      result[alias] = relation.one ? (children[0] ?? null) : children;
    }
    return result;
  }
  function filters(table, params) {
    const clauses = [],
      args = [];
    for (const [key, value] of params) {
      if (key === "or") {
        const parts = value
          .slice(1, -1)
          .split(",")
          .map((part) => {
            const at = part.indexOf(".");
            const nested = filters(
              table,
              new URLSearchParams([[part.slice(0, at), part.slice(at + 1)]]),
            );
            const clause = nested.where
              .slice(7)
              .replace(/\$(\d+)/g, (_, n) => `$${args.length + Number(n)}`);
            args.push(...nested.args);
            if (!clause) throw new Error("Unsupported test OR filter");
            return clause;
          });
        clauses.push(`(${parts.join(" or ")})`);
        continue;
      }
      if (!columns.get(table)?.has(key)) continue;
      const column = identifier(key);
      if (value === "not.is.null") {
        clauses.push(`${column} is not null`);
        continue;
      }
      if (value === "is.null") {
        clauses.push(`${column} is null`);
        continue;
      }
      if (value.startsWith("in.(")) {
        const values = value.slice(4, -1).split(",");
        clauses.push(
          `${column} in (${values
            .map((v) => {
              args.push(v);
              return `$${args.length}`;
            })
            .join(",")})`,
        );
        continue;
      }
      const at = value.indexOf("."),
        op = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" }[value.slice(0, at)];
      if (!op) throw new Error("Unsupported test filter");
      args.push(value.slice(at + 1));
      clauses.push(`${column}${op}$${args.length}`);
    }
    return { where: clauses.length ? ` where ${clauses.join(" and ")}` : "", args };
  }
  function send(res, status, data, headers = {}) {
    res.writeHead(status, { "Content-Type": "application/json", ...headers });
    res.end(data === undefined ? undefined : JSON.stringify(data));
  }
  let queue = Promise.resolve();
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      queue = queue
        .then(async () => {
          const url = new URL(req.url, `http://127.0.0.1:${port}`),
            path = url.pathname;
          const bytes = Buffer.concat(chunks);
          const body =
            (req.headers["content-type"] ?? "").includes("application/json") && bytes.length
              ? JSON.parse(bytes.toString())
              : {};
          const token = (req.headers.authorization ?? "").replace(/^Bearer /i, "");
          const privileged = token === serviceKey;
          const actor = sessions.get(token);
          try {
            if (path === "/health") return send(res, 200, { ok: true });
            if (path === "/__test/fail" && privileged) {
              failures.set(body.operation, body.count ?? 1);
              return send(res, 200, {});
            }
            if (path === "/auth/v1/admin/users" && req.method === "POST" && privileged)
              return send(res, 200, userData(await addUser(body)));
            if (path === "/auth/v1/signup" && req.method === "POST")
              return send(res, 200, session(await addUser(body)));
            if (path === "/auth/v1/token") {
              const user =
                url.searchParams.get("grant_type") === "refresh_token"
                  ? users.get(sessions.get(body.refresh_token))
                  : [...users.values()].find(
                      (u) => u.email === body.email && u.password === body.password,
                    );
              return user
                ? send(res, 200, session(user))
                : send(res, 400, {
                    error: "invalid_grant",
                    error_description: "Invalid login credentials",
                  });
            }
            if (path === "/auth/v1/user") {
              if (!actor) return send(res, 401, { message: "Not authenticated" });
              const user = users.get(actor);
              if (req.method === "PUT" && body.password) user.password = body.password;
              return send(res, 200, userData(user));
            }
            if (path === "/auth/v1/logout") {
              sessions.delete(token);
              return send(res, 204);
            }
            if (path === "/auth/v1/recover") return send(res, 200, {});
            if (!privileged) {
              await db.exec(`set role ${actor ? "authenticated" : "anon"}`);
              await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor ?? ""]);
            }
            if (path.startsWith("/rest/v1/rpc/")) {
              const name = identifier(path.split("/").at(-1));
              if (name === '"admin_users"')
                return send(
                  res,
                  200,
                  (
                    await db.query(`select to_jsonb(t) as row from public.admin_users() t`)
                  ).rows.map((r) => r.row),
                );
              const isData = Object.hasOwn(body, "data");
              if (Object.keys(body).length === 0)
                return send(
                  res,
                  200,
                  (await db.query(`select public.${name}() as result`)).rows[0].result,
                );
              const argument = isData ? JSON.stringify(body.data) : body.target;
              return send(
                res,
                200,
                (
                  await db.query(
                    `select public.${name}($1::${isData ? "jsonb" : "uuid"}) as result`,
                    [argument],
                  )
                ).rows[0].result,
              );
            }
            if (path.startsWith("/rest/v1/")) {
              const table = path.split("/").at(-1);
              if (!columns.has(table)) return send(res, 404, {});
              const operation =
                table === "profiles" && url.searchParams.get("select")?.includes("player_profiles(")
                  ? "roster"
                  : table;
              if (failures.get(operation) > 0) {
                failures.set(operation, failures.get(operation) - 1);
                // Non-retryable query error: exercise the UI boundary, not SDK backoff.
                return send(res, 400, {
                  code: "TEST_QUERY_ERROR",
                  message: "Injected test failure",
                });
              }
              const { where, args } = filters(table, url.searchParams);
              if (req.method === "PATCH") {
                if (!privileged) throw new Error("Direct mutation not permitted");
                const assignments = Object.entries(body).map(([key, value]) => {
                  if (!columns.get(table).has(key)) throw new Error("Unknown column");
                  args.push(value);
                  return `${identifier(key)}=$${args.length}`;
                });
                await db.query(
                  `update public.${identifier(table)} set ${assignments.join(",")}${where}`,
                  args,
                );
                return send(res, 200, []);
              }
              if (req.method !== "GET") throw new Error("Unsupported test method");
              const order = url.searchParams.get("order");
              const ordered = order
                ? ` order by ${order
                    .split(",")
                    .map((part) => {
                      const [key, direction, ...nulls] = part.split(".");
                      if (!columns.get(table).has(key)) throw new Error("Unknown column");
                      return `${identifier(key)} ${direction === "desc" ? "desc" : "asc"}${nulls.includes("nullsfirst") ? " nulls first" : nulls.includes("nullslast") ? " nulls last" : ""}`;
                    })
                    .join(",")}`
                : "";
              const rows = (
                await db.query(
                  `select to_jsonb(t) as row from public.${identifier(table)} t${where}${ordered}`,
                  args,
                )
              ).rows;
              const offset = Number(url.searchParams.get("offset") ?? 0),
                limit = Number(url.searchParams.get("limit") ?? 1000);
              const output = [];
              for (const { row } of rows.slice(offset, offset + limit))
                output.push(await embed(table, row, url.searchParams.get("select") ?? "*"));
              const headers = {
                "Content-Range": `${offset}-${offset + output.length - 1}/${rows.length}`,
              };
              if ((req.headers.accept ?? "").includes("application/vnd.pgrst.object+json"))
                return output.length === 1
                  ? send(res, 200, output[0], headers)
                  : send(res, 406, { code: "PGRST116", message: "Expected one row" });
              return send(res, 200, output, headers);
            }
            if (path.startsWith("/storage/v1/object")) {
              if (!actor) return send(res, 403, {});
              const prefix = "/storage/v1/object/",
                infoPrefix = "/storage/v1/object/info/",
                authenticatedPrefix = "/storage/v1/object/authenticated/";
              const resource = decodeURIComponent(
                path.slice(
                  path.startsWith(infoPrefix)
                    ? infoPrefix.length
                    : path.startsWith(authenticatedPrefix)
                      ? authenticatedPrefix.length
                      : prefix.length,
                ),
              );
              const [bucket, ...parts] = resource.split("/");
              const name = parts.join("/");
              if (req.method === "POST") {
                if (failures.get("upload") > 0) {
                  failures.set("upload", failures.get("upload") - 1);
                  return send(res, 503, { error: "Storage unavailable" });
                }
                let data = bytes;
                if ((req.headers["content-type"] ?? "").includes("multipart/form-data")) {
                  const form = await new Request(url, {
                    method: "POST",
                    headers: req.headers,
                    body: bytes,
                  }).formData();
                  for (const value of form.values())
                    if (value instanceof File) data = Buffer.from(await value.arrayBuffer());
                }
                const result = await db.query(
                  "insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3) returning id",
                  [bucket, name, actor],
                );
                files.set(`${bucket}/${name}`, data);
                return send(res, 200, { Id: result.rows[0].id, Key: `${bucket}/${name}` });
              }
              if (req.method === "GET") {
                const rows = (
                  await db.query("select id from storage.objects where bucket_id=$1 and name=$2", [
                    bucket,
                    name,
                  ])
                ).rows;
                if (!rows.length || !files.has(`${bucket}/${name}`)) return send(res, 404, {});
                if (path.startsWith(infoPrefix)) {
                  const file = files.get(`${bucket}/${name}`);
                  return send(res, 200, {
                    id: rows[0].id,
                    version: createHash("sha256").update(file).digest("hex"),
                    name,
                    bucket_id: bucket,
                    size: file.length,
                  });
                }
                if (failures.get("download") > 0) {
                  failures.set("download", failures.get("download") - 1);
                  return send(res, 503, { error: "Storage download unavailable" });
                }
                res.writeHead(200, { "Content-Type": "image/webp" });
                return res.end(files.get(`${bucket}/${name}`));
              }
              if (req.method === "DELETE") {
                for (const name of body.prefixes ?? []) {
                  await db.query("delete from storage.objects where bucket_id=$1 and name=$2", [
                    bucket,
                    name,
                  ]);
                  files.delete(`${bucket}/${name}`);
                }
                return send(res, 200, []);
              }
            }
            send(res, 404, { message: "Test adapter endpoint not implemented" });
          } catch (error) {
            send(res, 400, { code: error.code ?? "TEST_ERROR", message: error.message });
          } finally {
            await db.exec("reset role");
          }
        })
        .catch(() => {
          if (!res.headersSent) send(res, 500, { message: "Test adapter failed" });
        });
    });
  });
  try {
    if (seed) await seed({ db, addUser, files });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
    port = server.address().port;
  } catch (error) {
    await db.close();
    throw error;
  }
  return {
    url: `http://127.0.0.1:${port}`,
    async close() {
      const closed = new Promise((resolve) => server.close(resolve));
      server.closeAllConnections();
      await closed;
      await queue;
      await db.close();
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const backend = await startLocalBackend();
  console.log(`Isolated SQL test adapter ready at ${backend.url}`);
  let stopping = false;
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, async () => {
      if (stopping) return;
      stopping = true;
      await backend.close();
      process.exit(0);
    });
}
