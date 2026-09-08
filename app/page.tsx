import { convert, fetchFeed, feedUrl, fillDescriptionEnabled, cacheSeconds } from "@/lib/feed";

export const revalidate = 3600;

const nf = new Intl.NumberFormat("pl-PL");

async function stats() {
  try {
    const xml = await fetchFeed(feedUrl());
    const result = convert(xml, { fillDescription: fillDescriptionEnabled() });
    return {
      ok: true as const,
      items: result.items,
      filled: result.filledDescriptions,
      columns: result.columns.length,
      bytes: Buffer.byteLength(result.body, "utf-8"),
    };
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : String(error) };
  }
}

export default async function Page() {
  const data = await stats();
  const generated = new Date().toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" });

  return (
    <main>
      <h1>Feed produktowy Lidia Kalita</h1>
      <p className="lede">
        Feed IDOSell w formacie XML, konwertowany na bieżąco do CSV i TSV, które czyta ChatGPT.
      </p>

      {data.ok ? (
        <p className="badge ok">Feed działa</p>
      ) : (
        <p className="badge bad">Feed niedostępny: {data.message}</p>
      )}

      <div className="files">
        <a className="file" href="/products.csv">
          <code>/products.csv</code>
          <span>rozdzielany przecinkiem</span>
        </a>
        <a className="file" href="/products.txt">
          <code>/products.txt</code>
          <span>rozdzielany tabulatorem</span>
        </a>
      </div>

      {data.ok && (
        <table>
          <tbody>
            <tr>
              <th>Warianty produktów</th>
              <td>{nf.format(data.items)}</td>
            </tr>
            <tr>
              <th>Kolumny</th>
              <td>{data.columns}</td>
            </tr>
            <tr>
              <th>Opisy uzupełnione automatycznie</th>
              <td>{nf.format(data.filled)}</td>
            </tr>
            <tr>
              <th>Rozmiar pliku CSV</th>
              <td>{nf.format(Math.round(data.bytes / 1024))} KB</td>
            </tr>
            <tr>
              <th>Sprawdzono</th>
              <td>{generated}</td>
            </tr>
          </tbody>
        </table>
      )}

      <p className="note">
        Pliki powstają na żądanie i są buforowane przez {Math.round(cacheSeconds() / 60)} min na
        krawędzi Vercela, więc IDOSell odpytywany jest najwyżej raz na tyle samo czasu. Nagłówki{" "}
        <code>X-Feed-Items</code> i <code>X-Feed-Generated</code> pokazują, ile wierszy ma odpowiedź i
        kiedy powstała.
      </p>
    </main>
  );
}
