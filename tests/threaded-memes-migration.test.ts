import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";

it("migrates existing comment memes with their authors and dates, without changing direct reactions or sending notifications", async () => {
  const db = new PGlite();
  try {
    await db.exec(readFileSync("tests/fixtures/supabase-schema.sql", "utf8"));
    const migration = "202609240003_threaded_meme_replies.sql";
    for (const file of readdirSync("supabase/migrations")
      .filter((file) => file.endsWith(".sql") && file < migration)
      .sort())
      await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    const author = randomUUID(),
      member = randomUUID(),
      post = randomUUID(),
      comment = randomUUID(),
      deleted = randomUUID(),
      meme = randomUUID(),
      hiddenMeme = randomUUID();
    for (const id of [author, member]) {
      await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)", [
        id,
        `${id}@example.test`,
        JSON.stringify({ full_name: id === author ? "Author" : "Member" }),
      ]);
      await db.query(
        "update profiles set base_role='player',account_status='approved' where id=$1",
        [id],
      );
    }
    await db.query(
      "insert into posts(id,author_user_id,author_name_snapshot,base_role_snapshot,post_type,title,body) values($1,$2,'Author','player','normal','Post','Body')",
      [post, author],
    );
    await db.query(
      "insert into discussion_comments(id,post_id,author_user_id,author_name_snapshot,body) values($1,$2,$3,'Author','Reply')",
      [comment, post, author],
    );
    await db.query(
      "insert into discussion_comments(id,post_id,author_user_id,author_name_snapshot,body,deleted_at) values($1,$2,$3,'Author','',now())",
      [deleted, post, author],
    );
    await db.query(
      "insert into comment_meme_reactions(id,comment_id,author_user_id,author_name_snapshot,giphy_id,created_at) values($1,$2,$3,'Member','HistoricGif','2026-09-24T12:00:00Z'),($4,$5,$3,'Member','HiddenGif','2026-09-24T12:00:00Z')",
      [meme, comment, member, hiddenMeme, deleted],
    );
    await db.query(
      "insert into meme_reactions(post_id,author_user_id,author_name_snapshot,giphy_id) values($1,$2,'Member','DirectGif')",
      [post, member],
    );
    await db.exec("update notification_rules set enabled=true,email_enabled=true");
    await db.exec(readFileSync(`supabase/migrations/${migration}`, "utf8"));
    const rows = await db.query<{
      id: string;
      parent_id: string;
      giphy_id: string | null;
      deleted_at: string | null;
      author_name_snapshot: string;
      created: string;
    }>(
      "select id,parent_id,giphy_id,deleted_at,author_name_snapshot,(created_at at time zone 'UTC')::text as created from discussion_comments where id in ($1,$2)",
      [meme, hiddenMeme],
    );
    expect(rows.rows.find((r) => r.id === meme)).toMatchObject({
      parent_id: comment,
      giphy_id: "HistoricGif",
      author_name_snapshot: "Member",
      created: "2026-09-24 12:00:00",
      deleted_at: null,
    });
    expect(rows.rows.find((r) => r.id === hiddenMeme)).toMatchObject({
      parent_id: deleted,
      giphy_id: null,
    });
    expect(rows.rows.find((r) => r.id === hiddenMeme)?.deleted_at).not.toBeNull();
    expect((await db.query("select * from comment_meme_reactions")).rows).toHaveLength(0);
    expect((await db.query("select giphy_id from meme_reactions")).rows).toEqual([
      { giphy_id: "DirectGif" },
    ]);
    expect((await db.query("select * from notifications")).rows).toHaveLength(0);
    expect((await db.query("select * from notification_email_queue")).rows).toHaveLength(0);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [author]);
    await db.exec("set role authenticated");
    await db.query("select save_comment($1::jsonb)", [
      JSON.stringify({
        target_type: "post",
        target_id: post,
        id: randomUUID(),
        parent_id: meme,
        body: "Reply to migrated meme",
        expected_version: null,
      }),
    ]);
    await db.exec("reset role");
    expect((await db.query("select user_id from notifications")).rows).toEqual([
      { user_id: member },
    ]);
  } finally {
    await db.close();
  }
});
