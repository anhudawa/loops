import { NextRequest, NextResponse } from "next/server";
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
import { toPublicRoutes } from "@/lib/public-route";

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

    const sessionToken = request.cookies.get("session")?.value;
    const viewer = sessionToken ? await getUserBySession(sessionToken) : undefined;
    const isOwner = viewer?.id === id;

    const [stats, routes, totalKm, followers, following, activity, uploadedRoutes, downloadedRoutes, favouritedRoutes, communityScore, loopRating] = await Promise.all([
      getUserStats(id),
      getUserRoutes(id),
      getUserTotalKm(id),
      getFollowerCount(id),
      getFollowingCount(id),
      getUserActivityFeed(id, 1, 20),
      getUserUploadedRoutes(id),
      isOwner ? getUserDownloads(id) : Promise.resolve([]),
      isOwner ? getUserFavourites(id) : Promise.resolve([]),
      getCommunityScore(id),
      getUserLoopRating(id),
    ]);

    // Check if current viewer is following this user
    let viewerFollowing = false;
    if (viewer && !isOwner) {
      viewerFollowing = await isFollowing(viewer.id, id);
    }

    return NextResponse.json({
      id: user.id,
      name: user.name,
      bio: user.bio,
      location: user.location,
      avatar_url: user.avatar_url,
      created_at: user.created_at,
      stats,
      routes: toPublicRoutes(routes),
      totalKm,
      followers,
      following,
      activity,
      viewerFollowing,
      uploadedRoutes: toPublicRoutes(uploadedRoutes),
      downloadedRoutes: toPublicRoutes(downloadedRoutes),
      favouritedRoutes: toPublicRoutes(favouritedRoutes),
      communityScore,
      loopRating,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
