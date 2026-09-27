import { connection } from "next/server";
import { Workspace } from "@/components/workspace";
import { demoMatches } from "@/lib/speaker/demo";

export default async function Matches() {
  await connection();
  const demo = process.env.SPEAKER_DEMO === "1";
  return <Workspace initialMatches={demo ? demoMatches() : []} demo={demo} />;
}
