import { NextRequest, NextResponse } from "next/server";
import {
  getUserBySession,
  addFavourite,
  removeFavourite,
  isFavourited,
  getFavouriteCount,
  migrateDb,
} from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: routeId } = await params;
  await migrateDb();

  const sessionToken = request.cookies.get("session")?.value;
  let favourited = false;

  if (sessionToken) {
    const user = await getUserBySession(sessionToken);
    if (user) {
      favourited = await isFavourited(routeId, user.id);
    }
  }

  const count = await getFavouriteCount(routeId);
  return NextResponse.json({ favourited, count });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: routeId } = await params;

  const sessionToken = request.cookies.get("session")?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const user = await getUserBySession(sessionToken);
  if (!user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  await migrateDb();

  // Toggle: if already favourited, remove; otherwise add
  const alreadyFav = await isFavourited(routeId, user.id);
  if (alreadyFav) {
    await removeFavourite(routeId, user.id);
  } else {
    await addFavourite(uuidv4(), routeId, user.id);
  }

  const favourited = !alreadyFav;
  const count = await getFavouriteCount(routeId);

  return NextResponse.json({ favourited, count });
}
