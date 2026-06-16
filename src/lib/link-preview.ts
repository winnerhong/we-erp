// 상품 링크 → Open Graph 메타 추출(상품명·이미지·가격). 서버 전용, 베스트에포트.
// 일부 쇼핑몰은 봇 차단/JS 렌더라 실패할 수 있음 → 그때는 수기 입력.

export interface LinkPreview {
  title: string | null;
  image: string | null;
  price: number | null;
}

function metaContent(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  if (!/^https?:\/\//i.test(url)) {
    return { title: null, image: null, price: null };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let html = "";
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; WeERP/1.0; +https://example.com) AppleWebKit/537.36",
        Accept: "text/html",
      },
    });
    html = await res.text();
  } catch {
    return { title: null, image: null, price: null };
  } finally {
    clearTimeout(timer);
  }

  // 너무 큰 응답은 앞부분(head)만
  html = html.slice(0, 500_000);

  const ogProp = (p: string) => [
    new RegExp(`<meta[^>]+property=["']${p}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${p}["']`, "i"),
  ];
  const metaName = (n: string) => [
    new RegExp(`<meta[^>]+name=["']${n}["'][^>]+content=["']([^"']+)["']`, "i"),
  ];

  const title =
    metaContent(html, ogProp("og:title")) ??
    metaContent(html, [/<title[^>]*>([^<]+)<\/title>/i]);

  const image = metaContent(html, ogProp("og:image"));

  const priceRaw = metaContent(html, [
    ...ogProp("product:price:amount"),
    ...ogProp("og:price:amount"),
    ...metaName("price"),
  ]);
  const price = priceRaw ? Number(priceRaw.replace(/[^\d.]/g, "")) || null : null;

  return {
    title: title ? title.replace(/\s+/g, " ").trim() : null,
    image,
    price,
  };
}
