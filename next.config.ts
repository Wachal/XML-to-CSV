import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Kompresję odpowiedzi robimy sami w trasach feedu (gzip zależny od Accept-Encoding),
  // a na Vercelu i tak zajmuje się nią sieć brzegowa. Wyłączone, żeby nie pakować dwa razy.
  compress: false,

  // feed nie ma trafiać do wyników wyszukiwania ani do archiwów
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
    ];
  },
};

export default nextConfig;
