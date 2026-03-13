// Strava requires authentication for all activity data.
// URL import is not possible without OAuth.
// Users should export GPX/FIT from Strava and upload the file directly.

export function validateStravaUrl(url: string): boolean {
  return /strava\.com\/(activities|routes)\/\d+/.test(url);
}

export function getStravaExportError(): string {
  return "Strava requires you to be logged in, so we can't import directly. To add this route:\n\n1. Open the activity on Strava\n2. Click the three dots (···) menu\n3. Select \"Export GPX\" or \"Export Original\"\n4. Upload the downloaded file here";
}
