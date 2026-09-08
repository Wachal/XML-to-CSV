import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Twarda blokada botów, które notorycznie ignorują robots.txt.
 *
 * Zasada jest celowo odwrotna niż przy liście dozwolonych: blokujemy wyłącznie
 * agentów wypisanych z nazwiska. Nieznany klient zawsze przechodzi, więc żadna
 * zmiana po stronie OpenAI nie jest w stanie uciąć feedu. Wyszukiwarki, które
 * respektują robots.txt (Google, Bing, Yandex), odpadają już na tamtym poziomie
 * i nie ma potrzeby zwracać im 403.
 */
const OPENAI = /OAI-AdsBot|OAI-SearchBot|ChatGPT-User|GPTBot/i;

const BLOCKED = new RegExp(
  [
    // narzędzia SEO i masowe indeksery
    "AhrefsBot", "SemrushBot", "MJ12bot", "DotBot", "BLEXBot", "DataForSeoBot",
    "Barkrowler", "SerpstatBot", "ZoominfoBot", "Screaming Frog", "PetalBot",
    "SeekportBot", "MegaIndex", "Sogou", "linkdexbot",
    // roboty AI spoza OpenAI
    "CCBot", "ClaudeBot", "Claude-Web", "anthropic-ai", "PerplexityBot",
    "Perplexity-User", "Bytespider", "Amazonbot", "Applebot-Extended",
    "meta-externalagent", "FacebookBot", "cohere-ai", "Diffbot", "ImagesiftBot",
    "Omgilibot", "Timpibot", "YouBot", "Google-Extended", "Meltwater",
    // pospolite skrobaczki
    "Scrapy", "HeadlessChrome", "python-urllib", "Go-http-client", "Java/",
  ].join("|"),
  "i",
);

export function middleware(request: NextRequest) {
  const agent = request.headers.get("user-agent") ?? "";

  if (!OPENAI.test(agent) && BLOCKED.test(agent)) {
    return new NextResponse("Zautomatyzowany dostęp do tego adresu jest wyłączony.\n", {
      status: 403,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  // pomijamy zasoby budowane przez Next.js, resztę sprawdzamy
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
