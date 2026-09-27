import { connection } from "next/server";
import { Workspace } from "@/components/workspace";
import { demoMatches } from "@/lib/speaker/demo";
import { loadVolleyLiveMatches } from "@/server/volleylive";

export default async function Matches() {
  await connection();
  const demo = process.env.SPEAKER_DEMO === "1";
  const live = !demo && process.env.SPEAKER_MATCH_SOURCE !== "manual";
  const result = live ? await loadVolleyLiveMatches() : { matches: demo ? demoMatches() : [] };
  return (
    <Workspace
      initialMatches={result.matches}
      demo={demo}
      live={live}
      sourceWarning={result.warning}
    />
  );
}
