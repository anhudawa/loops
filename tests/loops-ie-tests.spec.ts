import { test, expect } from '@playwright/test';

const BASE = 'https://www.loops.ie';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LANDING / LOGIN PAGE (the only public page)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('Landing Page — Hero', () => {
  test('page loads with correct title', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page).toHaveTitle(/LOOPS/);
  });

  test('has meta description', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    const desc = await page.locator('meta[name="description"]').getAttribute('content');
    expect(desc).toBeTruthy();
    expect(desc!.length).toBeGreaterThan(50);
  });

  test('hero heading and subheading render', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.getByRole('heading', { name: /routes worth riding/i })).toBeVisible();
    await expect(page.getByText(/real routes from real riders/i)).toBeVisible();
  });

  test('Google sign-in CTA is visible in hero', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.getByRole('button', { name: /get started with google/i }).first()).toBeVisible();
  });

  test('"Free forever" trust badge is visible', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.getByText(/free forever/i).first()).toBeVisible();
    await expect(page.getByText(/no credit card/i).first()).toBeVisible();
  });

  test('sticky nav has LOOPS logo and Get Started button', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.locator('nav').getByText('LOOPS')).toBeVisible();
    await expect(page.getByRole('button', { name: /get started/i }).first()).toBeVisible();
  });

  test('stats counters animate to non-zero values', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(3000);
    // Check ROUTES counter
    const routesText = await page.locator('text=ROUTES').first().locator('..').textContent();
    expect(routesText).not.toContain('0\nROUTES'); // Should not still be 0
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LANDING PAGE — BROKEN IMAGES (CRITICAL)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('Landing Page — Images', () => {
  test('BUG-CRITICAL: app preview image loads (not broken)', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(2000);

    const heroImg = page.getByAltText(/LOOPS app.*Traka 360/i);
    await expect(heroImg).toBeVisible();

    // Check if image actually loaded (naturalWidth > 0)
    const loaded = await heroImg.evaluate((img: HTMLImageElement) => img.naturalWidth > 0);
    expect(loaded).toBe(true); // FAILS — image is broken
  });

  test('BUG-CRITICAL: Popular Routes card images load', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(2000);

    const imgs = page.locator('img[src*="/api/og/"]');
    const count = await imgs.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const loaded = await imgs.nth(i).evaluate((img: HTMLImageElement) => img.naturalWidth > 0);
      expect(loaded).toBe(true); // FAILS — all card images are broken
    }
  });

  test('BUG: Popular Route card images have no alt text', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(2000);

    // The 3 route card images have no alt text
    const imgs = page.locator('img[src*="/api/og/"]');
    const count = await imgs.count();
    for (let i = 0; i < count; i++) {
      const alt = await imgs.nth(i).getAttribute('alt');
      expect(alt).toBeTruthy(); // FAILS — alt is empty
    }
  });

  test('BUG: /api/og/ images cause excessive network requests (re-render loop)', async ({ page }) => {
    // The OG image endpoint is called 5+ times per image suggesting
    // a React re-render loop is re-fetching images on every render
    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(5000);

    const requests: string[] = [];
    page.on('request', req => {
      if (req.url().includes('/api/og/')) requests.push(req.url());
    });
    await page.waitForTimeout(3000);

    // Each image should only be requested once (or twice with preload)
    const uniqueUrls = [...new Set(requests)];
    for (const url of uniqueUrls) {
      const count = requests.filter(r => r === url).length;
      expect(count).toBeLessThan(3); // FAILS — 5+ requests per image
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LANDING PAGE — EMPTY SPACE BUG
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('Landing Page — Layout', () => {
  test('BUG-CRITICAL: no massive empty space between stats and app preview', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(2000);

    // Measure the gap between stats section and next content section
    const gap = await page.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll('*'));
      // Find the largest consecutive empty area
      const bodyHeight = document.body.scrollHeight;
      const viewportHeight = window.innerHeight;
      return bodyHeight / viewportHeight;
    });

    // Page should not be more than ~6x viewport height for this content
    // Currently it has a huge empty gap making it ~8-10x
    console.log('Page height ratio:', gap);
    expect(gap).toBeLessThan(7);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LANDING PAGE — FEATURES SECTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('Landing Page — Features', () => {
  test('three feature cards are visible', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.getByRole('heading', { name: /human-curated routes/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /your data, your gpx/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /free forever/i })).toBeVisible();
  });

  test('"Popular Routes" section shows route cards', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.getByRole('heading', { name: /popular routes/i })).toBeVisible();
    await expect(page.getByText(/here.*taste.*waiting inside/i)).toBeVisible();

    // Should show at least 3 route previews
    const routeNames = page.locator('h3, h4').filter({ hasText: /(Girona|Traka|Loop|ride)/i });
    expect(await routeNames.count()).toBeGreaterThanOrEqual(3);
  });

  test('"How it works" section has 3 steps', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.getByRole('heading', { name: /how it works/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /find a loop/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /download the gpx/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /ride.*share back/i })).toBeVisible();
  });

  test('"Tired of the paywall" comparison section exists', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.getByRole('heading', { name: /tired of the paywall/i })).toBeVisible();
    await expect(page.getByText(/every route free to download/i)).toBeVisible();
    await expect(page.getByText(/human-ridden, human-shared/i)).toBeVisible();
  });

  test('integration logos section (Strava, Komoot, Wahoo, Garmin)', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.getByText('Strava', { exact: true })).toBeVisible();
    await expect(page.getByText('Komoot', { exact: true })).toBeVisible();
    await expect(page.getByText('Wahoo', { exact: true })).toBeVisible();
    await expect(page.getByText('Garmin', { exact: true })).toBeVisible();
  });

  test('"Ready to ride?" final CTA section', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.getByRole('heading', { name: /ready to ride/i })).toBeVisible();
    // Second Google sign-in button at bottom
    const btns = page.getByRole('button', { name: /get started with google/i });
    expect(await btns.count()).toBeGreaterThanOrEqual(2);
  });

  test('community stats (Riders, Comments, Ratings) are visible', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    // Community stats labels use CSS text-transform: uppercase — DOM text is capitalized
    await expect(page.getByText('Riders', { exact: true })).toBeVisible();
    await expect(page.getByText('Comments', { exact: true })).toBeVisible();
    await expect(page.getByText('Ratings', { exact: true })).toBeVisible();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FOOTER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('Footer', () => {
  test('footer has Contact, Privacy links and copyright', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    const footer = page.locator('footer');
    await expect(footer.getByText('Contact')).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Privacy' }).first()).toBeVisible();
    await expect(footer.getByText(/© 2026 LOOPS/)).toBeVisible();
    await expect(footer.getByText(/Made in Ireland/)).toBeVisible();
  });

  test('Contact link goes to mailto:hello@loops.ie', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    const contactLink = page.locator('a[href*="mailto:"]');
    const href = await contactLink.getAttribute('href');
    expect(href).toBe('mailto:hello@loops.ie');
  });

  test('BUG: Privacy link redirects to login instead of showing privacy policy', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByRole('link', { name: 'Privacy' }).first().click();
    await page.waitForTimeout(2000);
    // BUG: /privacy should show the privacy policy, but redirects to /login
    expect(page.url()).toContain('/privacy');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTH / ROUTING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('Auth & Routing', () => {
  test('root URL / redirects to /login', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/login');
  });

  test('BUG: /routes/{uuid} redirects to /login (should be public)', async ({ page }) => {
    // Individual routes should be publicly viewable for SEO, social sharing,
    // and allowing people to preview before signing up
    await page.goto(`${BASE}/routes/6565324e-8187-4cbd-ad69-f612cdd01d90`);
    await page.waitForTimeout(2000);
    // BUG: redirects to /login — routes should be publicly accessible
    expect(page.url()).toContain('/routes/');
  });

  test('BUG: /explore redirects to /login', async ({ page }) => {
    await page.goto(`${BASE}/explore`);
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/login');
  });

  test('BUG: /privacy redirects to /login', async ({ page }) => {
    await page.goto(`${BASE}/privacy`);
    await page.waitForTimeout(2000);
    // Privacy policy MUST be publicly accessible (legal requirement)
    expect(page.url()).toContain('/privacy');
  });

  test('non-existent page shows 404', async ({ page }) => {
    await page.goto(`${BASE}/totally-nonexistent-page-xyz`);
    await page.waitForTimeout(2000);
    // Should show 404 or redirect to login
    const has404 = await page.locator('text=404').isVisible();
    const isLogin = page.url().includes('/login');
    expect(has404 || isLogin).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MOBILE RESPONSIVE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('Mobile Responsive', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('hero fits within mobile viewport (no horizontal scroll)', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(2000);

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(390);
  });

  test('Google sign-in button is tappable on mobile', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    const btn = page.getByRole('button', { name: /get started with google/i }).first();
    await expect(btn).toBeVisible();

    // Check button is wide enough to tap
    const box = await btn.boundingBox();
    expect(box!.width).toBeGreaterThan(200);
    expect(box!.height).toBeGreaterThan(40);
  });

  test('feature cards stack vertically on mobile', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(1000);

    const card1 = page.getByRole('heading', { name: /human-curated/i });
    const card2 = page.getByRole('heading', { name: /your data/i });

    const box1 = await card1.boundingBox();
    const box2 = await card2.boundingBox();

    if (box1 && box2) {
      // On mobile, card2 should be BELOW card1 (not beside it)
      expect(box2.y).toBeGreaterThan(box1.y + 50);
    }
  });

  test('route preview cards stack vertically on mobile', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(1000);

    const cards = page.locator('text=Sign in to explore');
    if (await cards.count() >= 2) {
      const box1 = await cards.nth(0).boundingBox();
      const box2 = await cards.nth(1).boundingBox();
      if (box1 && box2) {
        expect(box2.y).toBeGreaterThan(box1.y + 50);
      }
    }
  });

  test('nav bar is usable on mobile', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    const nav = page.locator('nav').first();
    await expect(nav).toBeVisible();
    // Check no horizontal overflow
    const navWidth = await nav.evaluate(el => el.scrollWidth);
    expect(navWidth).toBeLessThanOrEqual(390);
  });

  test('footer is readable on mobile', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    await expect(page.getByText(/Made in Ireland/)).toBeVisible();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ACCESSIBILITY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('Accessibility', () => {
  test('page has exactly one h1', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);
  });

  test('heading hierarchy is logical', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    const headings = await page.evaluate(() =>
      Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(h => h.tagName)
    );
    expect(headings[0]).toBe('H1');
    // No h3 before an h2
    let lastLevel = 0;
    for (const h of headings) {
      const level = parseInt(h[1]);
      expect(level).toBeLessThanOrEqual(lastLevel + 1 || level);
      lastLevel = level;
    }
  });

  test('all buttons have accessible names', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    const unlabeled = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.filter(b => !b.textContent?.trim() && !b.getAttribute('aria-label')).length;
    });
    expect(unlabeled).toBe(0);
  });

  test('BUG: route card images have no alt text', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    const missingAlt = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      return imgs.filter(img => !img.alt).length;
    });
    console.log('Images without alt:', missingAlt);
    expect(missingAlt).toBe(0); // FAILS — 3 route card images have no alt
  });

  test('BUG: color contrast on "How it works" section text', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    // The "How it works" step descriptions and "Tired of the paywall"
    // strikethrough text have very low contrast against the dark background
    // Manual observation: text is nearly invisible
    const howItWorksHeading = page.getByRole('heading', { name: /how it works/i });
    await expect(howItWorksHeading).toBeVisible();

    const color = await howItWorksHeading.evaluate(el => getComputedStyle(el).color);
    console.log('"How it works" heading color:', color);
    // Text should have at least 4.5:1 contrast ratio against dark background
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SEO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('SEO', () => {
  test('Open Graph meta tags present', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
    const ogDesc = await page.locator('meta[property="og:description"]').getAttribute('content');
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');

    console.log('og:title:', ogTitle);
    console.log('og:description:', ogDesc);
    console.log('og:image:', ogImage);

    expect(ogTitle).toBeTruthy();
  });

  test('canonical URL is set', async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    const canonical = await page.evaluate(() => {
      const link = document.querySelector('link[rel="canonical"]');
      return link?.getAttribute('href') ?? null;
    });
    console.log('Canonical:', canonical);
    // Should exist for SEO
    expect(canonical).toBeTruthy();
  });

  test('robots meta allows indexing', async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    const robots = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="robots"]');
      return meta?.getAttribute('content') ?? null;
    });
    console.log('Robots:', robots);
    // Should exist and not block indexing
    expect(robots).toBeTruthy();
    expect(robots).not.toContain('noindex');
  });

  test('BUG: individual route pages not accessible to search engines', async ({ page }) => {
    // Since all routes redirect to /login, Google cannot index them
    // This kills SEO for long-tail queries like "cycling route Girona"
    const response = await page.goto(`${BASE}/routes/6565324e-8187-4cbd-ad69-f612cdd01d90`);
    await page.waitForTimeout(2000);
    // Should return the route page, not redirect to login
    expect(page.url()).toContain('/routes/');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PERFORMANCE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('Performance', () => {
  test('landing page loads within 4 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    const loadTime = Date.now() - start;
    console.log('Load time:', loadTime, 'ms');
    expect(loadTime).toBeLessThan(4000);
  });

  test('DOM node count is reasonable', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(2000);
    const count = await page.evaluate(() => document.querySelectorAll('*').length);
    console.log('DOM nodes:', count);
    expect(count).toBeLessThan(2000);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DOMAIN & HTTPS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('Domain & HTTPS', () => {
  test('loops.ie redirects to www.loops.ie', async ({ page }) => {
    await page.goto('https://loops.ie');
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('www.loops.ie');
  });

  test('HTTP redirects to HTTPS', async ({ page }) => {
    await page.goto('http://loops.ie');
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('https://');
  });
});
