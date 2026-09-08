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

const FORMATS: Record<Format, { delimiter: string; contentType: string; filename: string }> = {
  csv: { delimiter: ",", contentType: "text/csv; charset=utf-8", filename: "products.csv" },
  txt: { delimiter: "\t", contentType: "text/plain; charset=utf-8", filename: "products.txt" },
};

export async function serveFeed(request: Request, format: Format): Promise<Response> {
  const { delimiter, contentType, filename } = FORMATS[format];
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

  const raw = Buffer.from(result.body, "utf-8");
  // gzip, gdy klient go akceptuje: ~10x mniejsza odpowiedź, spory zapas pod limit 4,5 MB Vercela
  const wantsGzip = (request.headers.get("accept-encoding") ?? "").toLowerCase().includes("gzip");
  const body = wantsGzip ? gzipSync(raw, { level: 6 }) : raw;

  const seconds = cacheSeconds();
  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Disposition": `inline; filename="${filename}"`,
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
  if (wantsGzip) headers.set("Content-Encoding", "gzip");

  return new Response(new Uint8Array(body), { status: 200, headers });
}
