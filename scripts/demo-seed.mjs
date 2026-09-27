export const demoPassword = "DemoVolleyball123!";
export async function seedDemo({ db, addUser }) {
  for (const [email, name, role, status] of [
    ["admin@demo.test", "Alex Speaker", "admin", "approved"],
    ["user@demo.test", "Robin Speaker", "user", "approved"],
    ["disabled@demo.test", "Deaktivert bruker", "admin", "disabled"],
  ]) {
    const user = await addUser({
      email,
      password: demoPassword,
      user_metadata: { full_name: name },
    });
    await db.query("update public.profiles set role=$2,account_status=$3 where id=$1", [
      user.id,
      role,
      status,
    ]);
  }
}
