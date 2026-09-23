import { NextRequest, NextResponse } from "next/server";
import { publicRoute } from "@/lib/public-route";
import { SOCIAL_FEATURES_ENABLED } from "@/config/constants";
import {
  getUserById,
  getUserStats,
  getUserRoutes,
  getUserTotalKm,
  getFollowerCount,
  getFollowingCount,
  getFollowers,
  getFollowing,
  isFollowing,
  getUserBySession,
  getUserActivityFeed,
  getUserUploadedRoutes,
  getUserDownloads,
  getUserFavourites,
  getCommunityScore,
  getUserLoopRating,
} from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getUserById(id);

    if (!user) {
      return apiError("User not found", "NOT_FOUND", 404);
    }

    // (No migrateDb here — this is a hot read path and the schema already
    //  exists; running migrations per request added ~5-6s to every profile
    //  load. Migrations still run, memoised, on write paths.)

    // Optional: return followers/following lists
    const include = request.nextUrl.searchParams.get("include");
    if (include === "followers") {
      const list = await getFollowers(id);
      return NextResponse.json({ users: list.map((u) => ({ id: u.id, name: u.name, avatar_url: u.avatar_url })) });
    }
    if (include === "following") {
      const list = await getFollowing(id);
      return NextResponse.json({ users: list.map((u) => ({ id: u.id, name: u.name, avatar_url: u.avatar_url })) });
    }

    const [stats, routes, totalKm, followers, following, activity, uploadedRoutes, downloadedRoutes, favouritedRoutes, communityScore, loopRating] = await Promise.all([
      getUserStats(id),
      getUserRoutes(id),
      getUserTotalKm(id),
      getFollowerCount(id),
      getFollowingCount(id),
      getUserActivityFeed(id, 1, 20),
      getUserUploadedRoutes(id),
      getUserDownloads(id),
      getUserFavourites(id),
      getCommunityScore(id),
      getUserLoopRating(id),
    ]);

    // Check if current viewer is following this user
    let viewerFollowing = false;
    let isSelf = false;
    const sessionToken = request.cookies.get("session")?.value;
    if (sessionToken) {
      const viewer = await getUserBySession(sessionToken).catch(() => null);
      if (viewer && viewer.id !== id) {
        viewerFollowing = await isFollowing(viewer.id, id);
      }
      isSelf = !!viewer && (viewer.id === id || viewer.role === "admin");
    }

    // Email, role, speed, downloads and favourites are PRIVATE: only the
    // user themselves (or an admin) sees them. This endpoint used to return
    // them to anyone holding a user id — and every public route carries its
    // creator's id.
    // Ratings and community scores are social features, hidden for launch:
    // only the user themselves (or an admin) sees them while the flag is off.
    const showSocial = SOCIAL_FEATURES_ENABLED || isSelf;
    const { routesRated: _routesRated, ...statsWithoutRatings } = stats;
    void _routesRated;

    return NextResponse.json({
      id: user.id,
      name: user.name,
      bio: user.bio,
      location: user.location,
      avatar_url: user.avatar_url,
      created_at: user.created_at,
      stats: showSocial ? stats : statsWithoutRatings,
      routes: routes.map((r) => publicRoute(r as unknown as Record<string, unknown>)),
      totalKm,
      followers,
      following,
      activity,
      viewerFollowing,
      uploadedRoutes: uploadedRoutes.map((r) => publicRoute(r as unknown as Record<string, unknown>)),
      ...(showSocial ? { communityScore, loopRating } : {}),
      ...(isSelf
        ? {
            email: user.email,
            role: user.role,
            downloadedRoutes,
            favouritedRoutes,
            avg_speed_kmh: user.avg_speed_kmh ?? 25,
          }
        : {}),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
