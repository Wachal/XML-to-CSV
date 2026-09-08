/**
 * Wspólna obsługa tras /products.csv i /products.txt.
 */
import { gzipSync } from "node:zlib";
import {
  cacheSeconds,
  convert,
  fetchFeed,
  fillDescriptionEnabled,
  feedUrl,
} from "./feed";

type Format = "csv" | "txt";

const FORMATS: Record<Format, { delimiter: string; filename: string; downloadType: string }> = {
  csv: {
    delimiter: ",",
    filename: "products.csv",
    downloadType: "text/csv; charset=utf-8",
  },
  txt: {
    delimiter: "\t",
    filename: "products.txt",
    downloadType: "text/tab-separated-values; charset=utf-8",
  },
};

/**
 * Domyślnie oddajemy `text/plain`, bo przeglądarka pokazuje taki typ w oknie,
 * a `text/csv` zawsze ląduje na dysku jako pobrany plik. Treść jest w obu
 * przypadkach ta sama, a konsumenci feedu (ChatGPT, Google) rozpoznają format
 * po rozszerzeniu w adresie.
 *
 * `?dl=1` wymusza pobranie z właściwym typem MIME. Parametr wchodzi do klucza
 * bufora, więc obie wersje buforują się osobno i nie trzeba nagłówka `Vary`.
 */
const PREVIEW_TYPE = "text/plain; charset=utf-8";

function wantsDownload(request: Request): boolean {
  const params = new URL(request.url).searchParams;
  const raw = params.get("dl") ?? params.get("download") ?? "";
  return ["1", "true", "yes", "tak"].includes(raw.toLowerCase());
}

export async function serveFeed(request: Request, format: Format): Promise<Response> {
  const { delimiter, filename, downloadType } = FORMATS[format];
  const startedAt = Date.now();

  let result;
  try {
    const xml = await fetchFeed(feedUrl());
    result = convert(xml, { delimiter, fillDescription: fillDescriptionEnabled() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(`feed niedostępny: ${message}\n`, {
      status: 502,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const download = wantsDownload(request);
  const raw = Buffer.from(result.body, "utf-8");
  // gzip, gdy klient go akceptuje: ~10x mniejsza odpowiedź, spory zapas pod limit 4,5 MB Vercela
  const gzip = (request.headers.get("accept-encoding") ?? "").toLowerCase().includes("gzip");
  const body = gzip ? gzipSync(raw, { level: 6 }) : raw;

  const seconds = cacheSeconds();
  const headers = new Headers({
    "Content-Type": download ? downloadType : PREVIEW_TYPE,
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
    "Content-Length": String(body.byteLength),
    "Vary": "Accept-Encoding",
    // przeglądarka i ChatGPT: zawsze pytają; krawędź Vercela: trzyma `seconds`,
    // a po wygaśnięciu podaje stare i odświeża w tle
    "Cache-Control": `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds}`,
    "X-Feed-Items": String(result.items),
    "X-Feed-Filled-Descriptions": String(result.filledDescriptions),
    "X-Feed-Generated": new Date().toISOString(),
    "X-Feed-Build-Ms": String(Date.now() - startedAt),
  });
  if (gzip) headers.set("Content-Encoding", "gzip");

  return new Response(new Uint8Array(body), { status: 200, headers });
}
