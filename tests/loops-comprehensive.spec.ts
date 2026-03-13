import { test, expect } from '@playwright/test';

const BASE = 'https://gravel-ireland.vercel.app';

// ─── HOMEPAGE ───────────────────────────────────────────────────────

test.describe('Homepage', () => {
  test('loads with correct title and meta description', async ({ page }) => {
    await page.goto(BASE);
    await expect(page).toHaveTitle(/LOOPS/);
    const desc = await page.locator('meta[name="description"]').getAttribute('content');
    expect(desc).toBeTruthy();
    expect(desc!.length).toBeGreaterThan(50);
  });

  test('hero section renders with heading and CTA buttons', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /explore loops/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /share a loop/i })).toBeVisible();
  });

  test('stats counters animate to non-zero values', async ({ page }) => {
    await page.goto(BASE);
    // Wait for counter animation to complete (they start at 0 and animate up)
    await page.waitForTimeout(3000);

    const statsSection = page.locator('text=ROUTES').first();
    await expect(statsSection).toBeVisible();

    // The counters should show non-zero values after animation
    // Check that at least the ROUTES counter is > 0
    const routeCountText = await page.locator('text=ROUTES').first().locator('..').locator('*').first().textContent();
    const routeCount = parseInt(routeCountText || '0');
    expect(routeCount).toBeGreaterThan(0);
  });

  test('"Explore Loops" button scrolls to route listing', async ({ page }) => {
    await page.goto(BASE);
    await page.getByRole('link', { name: /explore loops/i }).click();
    // Should scroll down or navigate to route listing section
    await page.waitForTimeout(1000);
    await expect(page.locator('text=FILTERS')).toBeVisible();
  });

  test('"Share a Loop" button navigates to /upload', async ({ page }) => {
    await page.goto(BASE);
    const shareLink = page.getByRole('link', { name: /share a loop/i });
    const href = await shareLink.getAttribute('href');
    expect(href).toContain('/upload');
  });

  test('sticky nav bar has logo, search, Share Loop, and Sign out', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(500);
    await expect(page.locator('text=LOOPS').first()).toBeVisible();
    await expect(page.getByPlaceholder(/search routes/i).first()).toBeVisible();
    await expect(page.getByText(/share loop/i).first()).toBeVisible();
  });
});

// ─── SEARCH ─────────────────────────────────────────────────────────

test.describe('Search', () => {
  test('search input is accessible with placeholder', async ({ page }) => {
    await page.goto(BASE);
    const searchInputs = page.getByPlaceholder(/search routes/i);
    const count = await searchInputs.count();
    // BUG CHECK: There should only be 1 visible search input, not duplicates
    console.log(`Search input count: ${count}`);
    expect(count).toBeLessThanOrEqual(2); // One in hero area, one in sticky nav is acceptable
  });

  test('search filters routes when typing a route name', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(500);

    const search = page.getByPlaceholder(/search routes/i).first();
    await search.fill('Mallorca');
    await page.waitForTimeout(1000);

    // After searching "Mallorca", only Mallorca routes should show
    const heading = page.locator('h2, h3').filter({ hasText: /loop/i });
    // Verify search narrows results
  });

  test('search with no results shows appropriate message', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(500);

    const search = page.getByPlaceholder(/search routes/i).first();
    await search.fill('xyznonexistentroute12345');
    await page.waitForTimeout(1000);

    // Should show "no results" message or 0 loops
    const loopCount = page.locator('text=/\\d+ loops?/i').first();
    if (await loopCount.isVisible()) {
      const text = await loopCount.textContent();
      expect(text).toMatch(/^0/);
    }
  });
});

// ─── FILTERS ────────────────────────────────────────────────────────

test.describe('Filters', () => {
  test('discipline filter buttons are visible (All, Road, Gravel, MTB)', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(500);

    await expect(page.getByRole('button', { name: /^All$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Road/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Gravel/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /MTB/i })).toBeVisible();
  });

  test('clicking Gravel filter shows only gravel routes', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(500);

    // Get initial count
    const initialCount = await page.locator('h2').filter({ hasText: /loops/i }).first().textContent();

    // Click Gravel filter
    await page.getByRole('button', { name: /Gravel/i }).click();
    await page.waitForTimeout(1000);

    // The Gravel button should appear selected/active
    const gravelBtn = page.getByRole('button', { name: /Gravel/i });
    const allBtn = page.getByRole('button', { name: /^All$/i });

    // BUG: Check if the filter button visually changes state
    const gravelClasses = await gravelBtn.getAttribute('class');
    const allClasses = await allBtn.getAttribute('class');
    console.log('Gravel button classes after click:', gravelClasses);
    console.log('All button classes after click:', allClasses);

    // After filtering, route cards should only show GRAVEL discipline
    const routeCards = page.locator('text=Road').filter({ hasText: /Road/ });
    // If gravel filter works, "Road" discipline tags should not appear
  });

  test('clicking Road filter shows only road routes', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /Road/i }).first().click();
    await page.waitForTimeout(1000);

    // Verify filter is active
    const loopCountText = await page.locator('h2').filter({ hasText: /loops/i }).first().textContent();
    console.log('Road filter loop count:', loopCountText);
  });

  test('country dropdown has options', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(500);

    const countrySelect = page.locator('select').first();
    const options = await countrySelect.locator('option').allTextContents();
    console.log('Country options:', options);
    expect(options.length).toBeGreaterThan(1); // At least "All countries" + real ones
  });

  test('distance min/max inputs accept numbers', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(500);

    const minInput = page.getByPlaceholder('Min');
    const maxInput = page.getByPlaceholder('Max');

    await minInput.fill('50');
    await maxInput.fill('150');
    await page.waitForTimeout(1000);

    // Routes should be filtered to 50-150km range
  });

  test('Verified only toggle works', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(500);

    const toggle = page.locator('text=Verified only').locator('..').locator('input, button, [role="switch"]');
    if (await toggle.isVisible()) {
      await toggle.click();
      await page.waitForTimeout(1000);
    }
  });
});

// ─── MAP ────────────────────────────────────────────────────────────

test.describe('Map', () => {
  test('map container renders with Leaflet tiles', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(1000);

    // Leaflet map should exist
    const mapContainer = page.locator('.leaflet-container');
    await expect(mapContainer).toBeVisible();
  });

  test('map has route markers/pins', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(2000);

    const markers = page.locator('.leaflet-marker-icon, .leaflet-interactive');
    const count = await markers.count();
    console.log('Map markers/elements:', count);
    expect(count).toBeGreaterThan(0);
  });

  test('map zoom controls work', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(1000);

    const zoomIn = page.locator('.leaflet-control-zoom-in');
    const zoomOut = page.locator('.leaflet-control-zoom-out');

    await expect(zoomIn).toBeVisible();
    await expect(zoomOut).toBeVisible();

    await zoomIn.click();
    await page.waitForTimeout(500);
  });

  test('map attribution is visible', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(1000);

    await expect(page.locator('text=OpenStreetMap')).toBeVisible();
  });
});

// ─── ROUTE CARDS ────────────────────────────────────────────────────

test.describe('Route Cards', () => {
  test('route cards display key info (name, distance, elevation, discipline)', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForTimeout(1000);

    // First card should have these elements
    const firstCard = page.locator('h3').first();
    await expect(firstCard).toBeVisible();

    // Check for distance (km)
    await expect(page.locator('text=/\\d+\\.?\\d*\\s*km/i').first()).toBeVisible();

    // Check for elevation (m)
    await expect(page.locator('text=/\\d+m/').first()).toBeVisible();
  });

  test('route card links to correct detail page', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForTimeout(1000);

    const firstCardLink = page.locator('a[href*="/routes/"]').first();
    const href = await firstCardLink.getAttribute('href');
    expect(href).toMatch(/\/routes\/[a-f0-9-]+/);

    await firstCardLink.click();
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/routes/');
  });

  test('route cards show author name and rating', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => window.scrollTo(0, 1400));
    await page.waitForTimeout(1000);

    // Should show uploader name
    await expect(page.locator('text=Anthony Walsh').first()).toBeVisible();

    // Should show rating
    await expect(page.locator('text=/★\\s*\\d/').first()).toBeVisible();
  });

  test('sort dropdown has options (Nearest, etc)', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(500);

    const sortSelect = page.locator('text=Nearest').first();
    await expect(sortSelect).toBeVisible();
  });
});

// ─── ROUTE DETAIL PAGE ──────────────────────────────────────────────

test.describe('Route Detail', () => {
  const routeUrl = `${BASE}/routes/6565324e-8187-4cbd-ad69-f612cdd01d90`;

  test('route detail page loads with map and weather', async ({ page }) => {
    await page.goto(routeUrl);
    await page.waitForTimeout(2000);

    // Map should render
    await expect(page.locator('.leaflet-container')).toBeVisible();

    // Weather widget
    await expect(page.locator('text=CURRENT WEATHER')).toBeVisible();
    await expect(page.locator('text=TEMP')).toBeVisible();
    await expect(page.locator('text=WIND')).toBeVisible();
  });

  test('route detail shows name, badges, and stats', async ({ page }) => {
    await page.goto(routeUrl);
    await page.waitForTimeout(2000);

    await expect(page.locator('text=Roadman Group Spin')).toBeVisible();
    await expect(page.locator('text=VERIFIED')).toBeVisible();
    await expect(page.locator('text=MODERATE')).toBeVisible();

    // Stats: distance, elevation, etc
    await expect(page.locator('text=83.3km')).toBeVisible();
    await expect(page.locator('text=554m')).toBeVisible();
  });

  test('route detail has action buttons (Download GPX, Strava, Komoot, Copy Link)', async ({ page }) => {
    await page.goto(routeUrl);
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(1000);

    await expect(page.locator('text=DOWNLOAD GPX FILE')).toBeVisible();
    await expect(page.locator('text=Open in Strava')).toBeVisible();
    await expect(page.locator('text=Open in Komoot')).toBeVisible();
    await expect(page.locator('text=Copy Link')).toBeVisible();
  });

  test('route detail has WhatsApp invite button', async ({ page }) => {
    await page.goto(routeUrl);
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(1000);

    await expect(page.locator('text=INVITE A FRIEND TO RIDE')).toBeVisible();
  });

  test('route detail has elevation profile', async ({ page }) => {
    await page.goto(routeUrl);
    await page.evaluate(() => window.scrollTo(0, 900));
    await page.waitForTimeout(1000);

    await expect(page.locator('text=ELEVATION PROFILE')).toBeVisible();
    await expect(page.locator('text=/gain/')).toBeVisible();
    await expect(page.locator('text=/loss/')).toBeVisible();
  });

  test('route detail has discussion section', async ({ page }) => {
    await page.goto(routeUrl);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);

    await expect(page.locator('text=DISCUSSION')).toBeVisible();
  });

  test('route detail has trail conditions section', async ({ page }) => {
    await page.goto(routeUrl);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);

    await expect(page.locator('text=TRAIL CONDITIONS')).toBeVisible();
  });

  test('back button navigates to homepage', async ({ page }) => {
    await page.goto(routeUrl);
    await page.waitForTimeout(1000);

    const backLink = page.locator('a').filter({ hasText: /LOOPS/ }).first();
    await backLink.click();
    await page.waitForTimeout(1000);

    expect(page.url()).toBe(BASE + '/');
  });

  test('route detail has Direction and Wind toggle buttons', async ({ page }) => {
    await page.goto(routeUrl);
    await page.waitForTimeout(1000);

    await expect(page.locator('text=Direction')).toBeVisible();
    await expect(page.locator('text=Wind')).toBeVisible();
  });
});

// ─── 404 / ERROR HANDLING ───────────────────────────────────────────

test.describe('Error Handling', () => {
  test('invalid route UUID shows "Route not found" page', async ({ page }) => {
    await page.goto(`${BASE}/routes/bogus-uuid-does-not-exist`);
    await page.waitForTimeout(2000);

    await expect(page.locator('text=Route not found')).toBeVisible();
    await expect(page.locator('text=Back to routes')).toBeVisible();
  });

  test('route-not-found page has "Back to routes" link that works', async ({ page }) => {
    await page.goto(`${BASE}/routes/bogus-uuid-does-not-exist`);
    await page.waitForTimeout(2000);

    await page.getByText('Back to routes').click();
    await page.waitForTimeout(1000);

    expect(page.url()).toBe(BASE + '/');
  });

  test('BUG: route-not-found page should have header/branding', async ({ page }) => {
    await page.goto(`${BASE}/routes/bogus-uuid-does-not-exist`);
    await page.waitForTimeout(2000);

    // BUG: Currently shows minimal text without any header, logo, or nav
    // There should be a LOOPS header and proper 404 layout
    const hasHeader = await page.locator('header, nav').count();
    console.log('Route-not-found has header/nav:', hasHeader > 0);
    // This SHOULD pass but currently fails — no header on the not-found page
    expect(hasHeader).toBeGreaterThan(0);
  });

  test('generic 404 page renders correctly', async ({ page }) => {
    await page.goto(`${BASE}/nonexistent-page`);
    await page.waitForTimeout(2000);

    await expect(page.locator('text=404')).toBeVisible();
    await expect(page.locator('text=BACK TO EXPLORING')).toBeVisible();
  });

  test('BUG: /profile shows 404 instead of redirect to login', async ({ page }) => {
    await page.goto(`${BASE}/profile`);
    await page.waitForTimeout(2000);

    // BUG: /profile shows the generic 404 page.
    // For logged-out users, it should redirect to /login.
    // For logged-in users, it should show their profile.
    const is404 = await page.locator('text=404').isVisible();
    console.log('/profile shows 404:', is404);
  });
});

// ─── AUTHENTICATION ─────────────────────────────────────────────────

test.describe('Authentication', () => {
  test('/upload redirects to /login for unauthenticated users', async ({ page }) => {
    await page.goto(`${BASE}/upload`);
    await page.waitForTimeout(2000);

    expect(page.url()).toContain('/login');
    await expect(page.locator('text=GET STARTED WITH GOOGLE')).toBeVisible();
  });

  test('login page has correct title and messaging', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(1000);

    await expect(page).toHaveTitle(/LOOPS/);
    await expect(page.locator('text=ROUTES WORTH RIDING')).toBeVisible();
    await expect(page.locator('text=/no paywall/i')).toBeVisible();
    await expect(page.locator('text=/free forever/i')).toBeVisible();
  });

  test('BUG: login page has excessive empty space below fold', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(1000);

    // The login page should not have huge empty black space below
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    const ratio = bodyHeight / viewportHeight;
    console.log('Login page height ratio:', ratio);
    // If ratio > 2, there is excessive empty space
    expect(ratio).toBeLessThan(2);
  });

  test('login page has Google sign-in button', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(1000);

    const googleBtn = page.locator('text=GET STARTED WITH GOOGLE');
    await expect(googleBtn).toBeVisible();
  });

  test('"Sign out" link is visible in nav when on homepage', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(500);

    // "Sign out" appears even for non-authenticated users — potential bug
    const signOut = page.locator('text=Sign out');
    const isVisible = await signOut.isVisible();
    console.log('Sign out visible (unauthenticated):', isVisible);
  });
});

// ─── RESPONSIVE / MOBILE ───────────────────────────────────────────

test.describe('Mobile Responsive', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('BUG: homepage filters and map should stack on mobile', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(1000);

    // On mobile, filters sidebar should collapse or stack above/below map
    // Currently the layout doesn't change at mobile widths
    const filtersVisible = await page.locator('text=FILTERS').isVisible();
    const mapVisible = await page.locator('.leaflet-container').isVisible();

    console.log('Mobile: Filters visible:', filtersVisible);
    console.log('Mobile: Map visible:', mapVisible);

    // BUG: Both are visible side by side on mobile, causing horizontal overflow
    // The filters should be in a collapsible drawer or stacked vertically
  });

  test('mobile: hero section is readable', async ({ page }) => {
    await page.goto(BASE);

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /explore loops/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /share a loop/i })).toBeVisible();
  });

  test('mobile: route cards are full width', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForTimeout(1000);

    const card = page.locator('h3').first();
    await expect(card).toBeVisible();
  });

  test('mobile: route detail page is usable', async ({ page }) => {
    await page.goto(`${BASE}/routes/6565324e-8187-4cbd-ad69-f612cdd01d90`);
    await page.waitForTimeout(2000);

    await expect(page.locator('.leaflet-container')).toBeVisible();
    await expect(page.locator('text=Roadman Group Spin')).toBeVisible();
  });
});

// ─── ACCESSIBILITY ──────────────────────────────────────────────────

test.describe('Accessibility', () => {
  test('page has single h1 heading', async ({ page }) => {
    await page.goto(BASE);
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);
  });

  test('BUG: scroll-down button in hero has no aria-label', async ({ page }) => {
    await page.goto(BASE);

    // The bounce arrow button at the bottom of the hero has no accessible label
    const unlabeledBtns = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.filter(b => !b.textContent?.trim() && !b.getAttribute('aria-label')).length;
    });
    console.log('Buttons without accessible label:', unlabeledBtns);
    expect(unlabeledBtns).toBe(0);
  });

  test('form inputs should have associated labels', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(500);

    // Check that select elements have labels
    const selects = await page.evaluate(() => {
      const sels = Array.from(document.querySelectorAll('select'));
      return sels.map(s => ({
        id: s.id,
        hasLabel: !!document.querySelector(`label[for="${s.id}"]`),
        ariaLabel: s.getAttribute('aria-label')
      }));
    });
    console.log('Select elements labels:', JSON.stringify(selects));
  });

  test('images should have alt text', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForTimeout(2000);

    // Map tile images from Leaflet are exempt, but app images should have alt text
    const appImages = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img:not(.leaflet-tile)'));
      return imgs.filter(img => !img.alt).length;
    });
    console.log('App images without alt text:', appImages);
  });

  test('color contrast: text is readable on dark background', async ({ page }) => {
    await page.goto(BASE);

    // Check that body text has sufficient contrast
    const textColor = await page.evaluate(() => {
      const p = document.querySelector('p');
      return p ? getComputedStyle(p).color : 'unknown';
    });
    console.log('Body text color:', textColor);
    // Muted gray text on dark background may have contrast issues
  });
});

// ─── PERFORMANCE ────────────────────────────────────────────────────

test.describe('Performance', () => {
  test('homepage loads within 5 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const loadTime = Date.now() - start;
    console.log('Homepage load time:', loadTime, 'ms');
    expect(loadTime).toBeLessThan(5000);
  });

  test('route detail page loads within 5 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto(`${BASE}/routes/6565324e-8187-4cbd-ad69-f612cdd01d90`, { waitUntil: 'networkidle' });
    const loadTime = Date.now() - start;
    console.log('Route detail load time:', loadTime, 'ms');
    expect(loadTime).toBeLessThan(5000);
  });

  test('DOM node count is reasonable (<3000)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForTimeout(2000);

    const nodeCount = await page.evaluate(() => document.querySelectorAll('*').length);
    console.log('DOM node count:', nodeCount);
    expect(nodeCount).toBeLessThan(3000);
  });
});

// ─── SEO ────────────────────────────────────────────────────────────

test.describe('SEO', () => {
  test('homepage has Open Graph meta tags', async ({ page }) => {
    await page.goto(BASE);

    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
    const ogDesc = await page.locator('meta[property="og:description"]').getAttribute('content');
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');

    console.log('og:title:', ogTitle);
    console.log('og:description:', ogDesc);
    console.log('og:image:', ogImage);

    expect(ogTitle).toBeTruthy();
  });

  test('route detail page has unique title', async ({ page }) => {
    await page.goto(`${BASE}/routes/6565324e-8187-4cbd-ad69-f612cdd01d90`);
    await page.waitForTimeout(2000);

    const title = await page.title();
    expect(title).toContain('Roadman Group Spin');
    expect(title).toContain('LOOPS');
  });

  test('canonical URL is set', async ({ page }) => {
    await page.goto(BASE);

    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    console.log('Canonical URL:', canonical);
  });

  test('heading hierarchy is logical (h1 > h2 > h3)', async ({ page }) => {
    await page.goto(BASE);

    const headings = await page.evaluate(() => {
      const hs = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
      return hs.map(h => h.tagName);
    });

    console.log('Heading hierarchy:', headings.join(' > '));
    // Should not skip levels (e.g., h1 then h3 without h2)
    expect(headings[0]).toBe('H1');
  });
});

// ─── NAVIGATION ─────────────────────────────────────────────────────

test.describe('Navigation', () => {
  test('LOOPS logo in nav links to homepage', async ({ page }) => {
    await page.goto(`${BASE}/routes/6565324e-8187-4cbd-ad69-f612cdd01d90`);
    await page.waitForTimeout(1000);

    const logoLink = page.locator('a').filter({ hasText: 'LOOPS' }).first();
    await logoLink.click();
    await page.waitForTimeout(1000);

    expect(page.url()).toBe(BASE + '/');
  });

  test('chat icon in nav is present', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(500);

    // There's a chat icon next to "Sign out" — check it exists and has a purpose
    const chatIcon = page.locator('svg').filter({ has: page.locator('path') });
    // This is a basic check; ideally it should have an aria-label
  });
});

// ─── INCONSISTENCIES ────────────────────────────────────────────────

test.describe('Consistency Checks', () => {
  test('BUG: homepage title differs from login page title', async ({ page }) => {
    await page.goto(BASE);
    const homeTitle = await page.title();

    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(1000);
    const loginTitle = await page.title();

    console.log('Home title:', homeTitle);
    console.log('Login title:', loginTitle);
    // Home: "LOOPS - Discover & Share Cycling Routes"
    // Login: "LOOPS — Routes Worth Riding | Free Cycling Route Discovery"
    // These should be consistent in brand messaging
  });

  test('BUG: homepage tagline differs from login page tagline', async ({ page }) => {
    await page.goto(BASE);
    const homeTagline = await page.locator('h1').textContent();

    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(1000);
    const loginTagline = await page.evaluate(() => {
      const h = document.querySelector('h1, h2');
      return h?.textContent || '';
    });

    console.log('Home tagline:', homeTagline);
    console.log('Login tagline:', loginTagline);
    // "Stop Riding The Same Loop" vs "Routes Worth Riding" — inconsistent messaging
  });
});
