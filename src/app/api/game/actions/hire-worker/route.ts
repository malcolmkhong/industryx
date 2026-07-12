import { runActionCommand } from "@/lib/game/actions/server/actionCommandRunner";

export function POST(request: Request) {
  return runActionCommand(request, "hire_worker");
}
