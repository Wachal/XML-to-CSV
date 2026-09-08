import type { MetadataRoute } from "next";

/**
 * robots.txt: wszystko zablokowane poza botami OpenAI.
 *
 * Cztery agenty z dokumentacji OpenAI (developers.openai.com/api/docs/bots):
 *   OAI-AdsBot     - sprawdza materiały reklamowe, czyli ścieżka feedu produktowego
 *   OAI-SearchBot  - indeksuje na potrzeby wyszukiwania w ChatGPT
 *   ChatGPT-User   - wchodzi na stronę, gdy użytkownik wklei link w rozmowie
 *   GPTBot         - zbiera dane do trenowania modeli
 *
 * GPTBot nie jest potrzebny, żeby feed działał. Zostaje wpuszczony tylko po to,
 * by żadna ścieżka po stronie OpenAI nie odbiła się o blokadę. Usunięcie jego
 * sekcji nic nie psuje, jeśli katalog nie ma trafiać do danych treningowych.
 *
 * Sekcje nazwane mają pierwszeństwo przed `*`, więc kolejność nie ma znaczenia,
 * ale wielkość liter w nazwach musi być dokładnie taka jak w dokumentacji.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "OAI-AdsBot", allow: "/" },
      { userAgent: "OAI-SearchBot", allow: "/" },
      { userAgent: "ChatGPT-User", allow: "/" },
      { userAgent: "GPTBot", allow: "/" },
      { userAgent: "*", disallow: "/" },
    ],
  };
}
