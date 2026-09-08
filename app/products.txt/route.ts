import { serveFeed } from "@/lib/serve";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  return serveFeed(request, "txt");
}
