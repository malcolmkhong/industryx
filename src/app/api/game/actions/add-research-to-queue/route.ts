import { runActionCommand } from "@/lib/game/actions/server/actionCommandRunner";

export function POST(request: Request) {
  return runActionCommand(request, "add_research_to_queue");
}
