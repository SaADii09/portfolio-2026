import type { MetadataRoute } from "next";
import { siteUrl, SITE_LAST_UPDATED } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      lastModified: SITE_LAST_UPDATED,
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
