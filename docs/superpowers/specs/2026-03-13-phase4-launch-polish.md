# Phase 4: Launch Polish — Detailed Plan

**Date**: 2026-03-13
**Status**: Ready for execution
**Prerequisite**: Phases 1-3 complete on dev branch

---

## 4.1 Auth Flow Verification & Hardening

**Google OAuth (verify end-to-end):**
- Test: login page → Google consent → callback → session → redirect to home
- Test: user cancels Google consent → friendly error on `/login?error=google_failed`
- Test: banned user login → clear message, not silent redirect
- Add fallback UI if Google API unreachable (timeout 10s, show "Google is temporarily unavailable")

**Session edge cases:**
- Handle 401 from `/api/auth` GET gracefully in AuthProvider — clear stale state, redirect to login
- Don't show broken UI when session cookie expires mid-session
- AuthProvider: if user fetch fails, set user to null (not stuck in loading)

**Cleanup:**
- Remove magic link references from UI if no magic link flow is implemented
- Or stub it as "Coming soon" if keeping in UI

---

## 4.2 Mobile UX Pass

**Touch interactions (currently broken):**
- `StarRating.tsx`: uses `onMouseEnter/Leave` — add `onTouchStart/End` so rating works on phones
- `Comments.tsx`: hover states don't work on touch — use focus/active states instead
- Filter drawer: ensure tap-on-backdrop closes drawer

**Touch targets (must be 44x44px minimum):**
- Favorite button (heart icon)
- Follow button
- Comment delete button
- Chat/messages icon in nav
- Individual stars in StarRating

**Map on mobile:**
- Verify pinch-to-zoom on 25vh map
- Verify markers are tappable
- Test marker tap → route detail navigation

**End-to-end mobile tests:**
- Upload flow: file picker → form fill → submit (on phone)
- Route detail: scroll all sections, no horizontal overflow
- GPX download: file saves correctly on mobile
- Strava/Komoot links: open native apps if installed
- Safe-area insets on notched devices

---

## 4.3 Admin Tools Polish

**Search & filtering (missing from admin tables):**
- Users tab: search by email or name
- Routes tab: search by route name
- Comments tab: search by text content

**Moderation:**
- Add "last active" timestamp to users list
- Add route approval state (pending/approved/hidden) for future user-submitted routes
- Show route name in comments list (for context when moderating)

**Navigation:**
- Ensure admin link in main nav for admin users
- "Back to site" link from admin dashboard

---

## 4.4 Footer & Legal Pages

All footer links currently `href="#"`. Create minimal pages:

- `/about` — What LOOPS is, who it's for, the mission (1-2 paragraphs)
- `/privacy` — Basic privacy policy: data collected, cookies, Google OAuth, Vercel hosting
- `/terms` — Basic terms: user-generated content rules, acceptable use
- `/feedback` — Simple contact form or link to email/GitHub issues

Update `Footer.tsx` links to point to real routes. Keep pages minimal — a paragraph each is fine for club launch.

---

## 4.5 Empty States & Error UI

**Empty states needed:**
- PhotoGallery with no photos: "No photos yet. Be the first to share one."
- Comments with no comments: "No comments yet. Start the conversation."
- ConditionReports with no reports: "No condition reports yet."
- Route list with 0 filter results: "No routes match your filters. Try broadening your search."

**Error UI needed:**
- Comments fetch fails: "Couldn't load comments. Try refreshing."
- StarRating submit fails: revert optimistic update + show toast
- PhotoGallery image load fails: show placeholder
- Weather API fails: "Weather unavailable" instead of blank/broken

---

## 4.6 Loading States

- Upload form: progress indicator during file upload + processing (not just disabled button)
- Route detail: skeleton while data loads
- Admin tables: loading state while fetching
- Skeleton cards: add CSS shimmer animation (currently static)

---

## 4.7 Quick Wins (batch together)

- Verify OG meta tags: share route link on WhatsApp/iMessage, check preview renders
- Test Strava/Komoot deep links on mobile
- Clean up any remaining console.logs
- Verify canonical URLs render correctly on deployed site

---

## Execution Order

| # | Task | Effort | Impact | Why this order |
|---|------|--------|--------|----------------|
| 1 | 4.2 Mobile touch fixes | Medium | High | Phones are primary device for cycling club |
| 2 | 4.5 Empty states & error UI | Low | High | Prevents confusion on empty/broken states |
| 3 | 4.1 Auth verification & hardening | Medium | High | Login is first user interaction |
| 4 | 4.4 Footer & legal pages | Low | Medium | Looks professional, builds trust |
| 5 | 4.6 Loading states | Low | Medium | Polish feel |
| 6 | 4.3 Admin tools polish | Medium | Low | Only you use admin at launch |
| 7 | 4.7 Quick wins | Low | Medium | Batch cleanup |

## Success Criteria

Phase 4 complete when:
- Star rating works on touch devices
- All touch targets are 44x44px minimum
- Auth flow handles all error states gracefully
- Footer links go to real pages
- No empty/broken states visible in normal user flows
- Upload and GPX download work on mobile
