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
  migrateDb,
} from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getUserById(id);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await migrateDb();

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
  const sessionToken = request.cookies.get("session")?.value;
  if (sessionToken) {
    const viewer = await getUserBySession(sessionToken);
    if (viewer && viewer.id !== id) {
      viewerFollowing = await isFollowing(viewer.id, id);
    }
  }

  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    bio: user.bio,
    location: user.location,
    avatar_url: user.avatar_url,
    role: user.role,
    created_at: user.created_at,
    stats,
    routes,
    totalKm,
    followers,
    following,
    activity,
    viewerFollowing,
    uploadedRoutes,
    downloadedRoutes,
    favouritedRoutes,
    communityScore,
    loopRating,
  });
}
