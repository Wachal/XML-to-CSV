import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Kompresję odpowiedzi robimy sami w trasach feedu (gzip zależny od Accept-Encoding),
  // a na Vercelu i tak zajmuje się nią sieć brzegowa. Wyłączone, żeby nie pakować dwa razy.
  compress: false,
};

export default nextConfig;
