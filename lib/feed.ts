/**
 * Konwersja feedu IDOSell (Google Merchant RSS 2.0, XML) na CSV / TSV.
 *
 * Logika jest odwzorowana 1:1 z wersji w Pythonie (idosell_feed_to_csv.py):
 * te same kolumny w tej samej kolejności, te same separatory wartości wielokrotnych,
 * to samo czyszczenie białych znaków i ten sam zapasowy opis dla pustego `description`.
 * Dzięki temu plik z Vercela i plik z serwera są identyczne co do bajtu.
 */
import { XMLParser } from "fast-xml-parser";

export const DEFAULT_FEED_URL =
  "https://esklep.lidiakalita.pl/data/export/feed10001_1f09ee580133fa5e0ddea5b9.xml";

/** Kolejność kolumn; tagi spoza tej listy dopisują się na końcu automatycznie. */
const KNOWN_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ["id", "g:id"],
  ["item_group_id", "g:item_group_id"],
  ["title", "title"],
  ["description", "description"],
  ["link", "link"],
  ["image_link", "g:image_link"],
  ["additional_image_link", "g:additional_image_link"],
  ["price", "g:price"],
  ["sale_price", "g:sale_price"],
  ["availability", "g:availability"],
  ["condition", "g:condition"],
  ["brand", "g:brand"],
  ["gtin", "g:gtin"],
  ["mpn", "g:mpn"],
  ["color", "g:color"],
  ["size", "g:size"],
  ["product_type", "g:product_type"],
  ["shipping_weight", "g:shipping_weight"],
  ["display_ads_link", "g:display_ads_link"],
  ["adwords_grouping", "adwords_grouping"],
];

/** Wiele zdjęć rozdziela przecinek, wiele kolorów ukośnik - konwencja Google Merchant. */
const MULTI_SEPARATOR: Record<string, string> = {
  additional_image_link: ",",
  color: "/",
};
const DEFAULT_MULTI_SEPARATOR = ",";

export type FeedResult = {
  /** Gotowa treść pliku, UTF-8. */
  body: string;
  /** Liczba wariantów produktów (wierszy bez nagłówka). */
  items: number;
  /** Ile wierszy dostało zapasowy opis. */
  filledDescriptions: number;
  /** Nazwy kolumn w kolejności zapisu. */
  columns: string[];
};

const WS = /\s+/g;

function clean(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(WS, " ").trim();
}

function localName(tag: string): string {
  const i = tag.indexOf(":");
  return i === -1 ? tag : tag.slice(i + 1);
}

function toArray(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Wartości jednego tagu wyczyszczone i bez pustych. */
function valuesOf(item: Record<string, unknown>, tag: string): string[] {
  return toArray(item[tag]).map(clean).filter((v) => v !== "");
}

function firstOf(item: Record<string, unknown>, tag: string): string {
  return valuesOf(item, tag)[0] ?? "";
}

/**
 * Neutralny opis z danych, które w feedzie są zawsze:
 * tytuł, marka, kategoria, kolor, rozmiar. ChatGPT odrzuca wiersze bez opisu.
 */
export function fallbackDescription(item: Record<string, unknown>): string {
  const title = firstOf(item, "title");
  const brand = firstOf(item, "g:brand");
  const productType = firstOf(item, "g:product_type");
  const category = (productType.split(">").pop() ?? "").trim().toLowerCase();
  const color = valuesOf(item, "g:color").join("/");
  const size = firstOf(item, "g:size");

  const parts: string[] = [title];
  if (brand) parts.push(`marki ${brand}`);
  if (category) parts.push(`z kategorii ${category}`);

  const tail: string[] = [];
  if (color) tail.push(`kolor: ${color}`);
  if (size && size.toLowerCase() !== "uniwersalny") tail.push(`rozmiar: ${size}`);

  let text = parts.join(" ");
  if (tail.length) text += ", " + tail.join(", ");
  return text + ".";
}

/**
 * Jedno pole w konwencji modułu csv Pythona (QUOTE_MINIMAL):
 * cudzysłowy tylko wtedy, gdy w treści jest separator, cudzysłów albo znak końca wiersza.
 */
function encodeField(value: string, delimiter: string): string {
  if (
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return '"' + value.replaceAll('"', '""') + '"';
  }
  return value;
}

export type ConvertOptions = {
  /** Tabulator dla TSV, przecinek dla CSV. */
  delimiter?: string;
  /** Czy uzupełniać pusty opis (domyślnie tak). */
  fillDescription?: boolean;
};

export function convert(xml: string, options: ConvertOptions = {}): FeedResult {
  const delimiter = options.delimiter ?? ",";
  const fillDescription = options.fillDescription ?? true;

  const parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false, // wszystko zostaje tekstem: "0" nie staje się liczbą, GTIN nie traci zer
    trimValues: true,
    processEntities: true,
  });

  const parsed = parser.parse(xml) as Record<string, any>;
  const items = toArray(parsed?.rss?.channel?.item) as Record<string, unknown>[];
  if (items.length === 0) {
    throw new Error("feed bez <item> - odmawiam zwrócenia pustego pliku");
  }

  const knownTags = new Set(KNOWN_COLUMNS.map(([, tag]) => tag));
  const extraTags = [
    ...new Set(items.flatMap((item) => Object.keys(item).filter((t) => !knownTags.has(t)))),
  ].sort();
  const columns: Array<readonly [string, string]> = [
    ...KNOWN_COLUMNS,
    ...extraTags.map((tag) => [localName(tag), tag] as const),
  ];

  const lines: string[] = [
    columns.map(([name]) => encodeField(name, delimiter)).join(delimiter),
  ];

  let filledDescriptions = 0;
  for (const item of items) {
    let description: string[] | null = null;
    if (fillDescription && valuesOf(item, "description").length === 0) {
      description = [fallbackDescription(item)];
      filledDescriptions += 1;
    }
    const row = columns.map(([name, tag]) => {
      const values = tag === "description" && description ? description : valuesOf(item, tag);
      const separator = MULTI_SEPARATOR[name] ?? DEFAULT_MULTI_SEPARATOR;
      return encodeField(values.join(separator), delimiter);
    });
    lines.push(row.join(delimiter));
  }

  return {
    body: lines.join("\n") + "\n",
    items: items.length,
    filledDescriptions,
    columns: columns.map(([name]) => name),
  };
}

/** Pobiera feed z IDOSell. Zawsze świeżo - buforowaniem zajmuje się sieć brzegowa Vercela. */
export async function fetchFeed(url = feedUrl()): Promise<string> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "idosell-feed-nextjs/1.0" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) {
    throw new Error(`IDOSell odpowiedział ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  if (!text) throw new Error("pusta odpowiedź z IDOSell");
  return text;
}

export function feedUrl(): string {
  return process.env.FEED_URL || DEFAULT_FEED_URL;
}

export function cacheSeconds(): number {
  const raw = Number(process.env.CACHE_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 3600;
}

export function fillDescriptionEnabled(): boolean {
  return process.env.FILL_DESCRIPTION !== "0";
}
