import type { MetadataRoute } from "next";

/**
 * Private office workspace — there is no public surface to index (every route
 * redirects unauthenticated visitors to /login). Tell crawlers to stay out so
 * the login page never lands in search results. Served publicly: /robots.txt is
 * excluded from the auth gate in proxy.ts.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
