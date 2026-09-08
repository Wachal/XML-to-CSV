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


function LinkIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <path
        d="M6.5 9.5a2.75 2.75 0 0 0 4 .25l2-2a2.75 2.75 0 0 0-3.9-3.9l-1.1 1.1M9.5 6.5a2.75 2.75 0 0 0-4-.25l-2 2a2.75 2.75 0 0 0 3.9 3.9l1.1-1.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <path
        d="M8 1.5v8.5m0 0L4.75 6.75M8 10l3.25-3.25M2.5 12.5h11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FileRow({ path, hint }: { path: string; hint: string }) {
  const name = path.replace("/", "");
  return (
    <div className="file">
      <div className="file-info">
        <code>{path}</code>
        <span className="hint">{hint}</span>
      </div>
      <div className="file-actions">
        <a className="btn" href={path} aria-label={`Otwórz ${name} w przeglądarce`}>
          <LinkIcon />
          Link
        </a>
        <a
          className="btn"
          href={`${path}?dl=1`}
          download={name}
          aria-label={`Pobierz ${name} na dysk`}
        >
          <DownloadIcon />
          Pobierz
        </a>
      </div>
    </div>
  );
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
        <FileRow path="/products.csv" hint="rozdzielany przecinkiem" />
        <FileRow path="/products.txt" hint="rozdzielany tabulatorem" />
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
