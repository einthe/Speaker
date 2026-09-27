import { requireUser } from "@/server/auth";
import { Workspace } from "@/components/workspace";
import { demoMatches } from "@/lib/speaker/demo";

export default async function Matches() {
  await requireUser();
  const demo = process.env.SPEAKER_DEMO === "1";
  return <Workspace initialMatches={demo ? demoMatches() : []} demo={demo} />;
}
