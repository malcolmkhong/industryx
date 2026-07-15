import { runActionCommand } from "@/lib/game/actions/server/actionCommandRunner";

export function POST(request: Request) {
  return runActionCommand(request, "remove_research_from_queue");
}
