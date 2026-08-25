import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/admin";
import {
  getBetaIntakeForUser,
  submitBetaApplication,
  type BetaApplicationType,
} from "@/lib/beta-intake";
import { BETA_PRIVACY_VERSION } from "@/config/beta";
import { apiError, handleApiError, stripHtml } from "@/lib/api-utils";
import { RIDE_SOURCE_PLATFORMS } from "@/config/route-policy";

const APPLICATION_TYPES = new Set(["rider", "contributor"]);
const RIDING_FREQUENCIES = new Set(["weekly", "two_to_three", "four_plus"]);
const SESSION_INTERESTS = new Set(["endurance", "tempo", "sweet_spot", "threshold"]);
const SOURCE_PLATFORMS = new Set<string>(RIDE_SOURCE_PLATFORMS.map((platform) => platform.value));

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;

    const intake = await getBetaIntakeForUser(auth.user.id);
    return NextResponse.json({
      ...intake,
      access: auth.user.role === "admin" || intake.membership?.status === "active",
      contributorAccess:
        auth.user.role === "admin" ||
        (intake.membership?.status === "active" && intake.membership.access_level === "contributor"),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return apiError("Invalid application", "INVALID_BODY", 400);

    const applicationType = body.applicationType;
    const ridingFrequency = body.ridingFrequency;
    const homeRegion = typeof body.homeRegion === "string" ? stripHtml(body.homeRegion).trim() : "";
    const clubName = typeof body.clubName === "string" && body.clubName.trim()
      ? stripHtml(body.clubName).trim()
      : null;
    const notes = typeof body.notes === "string" && body.notes.trim()
      ? stripHtml(body.notes).trim()
      : null;
    const sessionInterests = Array.isArray(body.sessionInterests)
      ? [...new Set(body.sessionInterests.filter((value): value is string => typeof value === "string"))]
      : [];
    const sourcePlatforms = Array.isArray(body.sourcePlatforms)
      ? [...new Set(body.sourcePlatforms.filter((value): value is string => typeof value === "string"))]
      : [];

    if (typeof applicationType !== "string" || !APPLICATION_TYPES.has(applicationType)) {
      return apiError("Choose rider or contributor access", "INVALID_APPLICATION_TYPE", 400);
    }
    if (homeRegion.length < 2 || homeRegion.length > 80) {
      return apiError("Enter a county or general Irish riding area", "INVALID_REGION", 400);
    }
    if (clubName && clubName.length > 120) {
      return apiError("Club or group name is too long", "INVALID_CLUB", 400);
    }
    if (typeof ridingFrequency !== "string" || !RIDING_FREQUENCIES.has(ridingFrequency)) {
      return apiError("Choose how often you ride", "INVALID_FREQUENCY", 400);
    }
    if (!sessionInterests.length || sessionInterests.some((value) => !SESSION_INTERESTS.has(value))) {
      return apiError("Choose at least one supported ride or session type", "INVALID_SESSIONS", 400);
    }
    if (sourcePlatforms.some((value) => !SOURCE_PLATFORMS.has(value))) {
      return apiError("Choose only supported recording sources", "INVALID_SOURCES", 400);
    }
    if (notes && notes.length > 1000) {
      return apiError("Application notes must be 1,000 characters or less", "INVALID_NOTES", 400);
    }
    if (body.contactConsent !== true || body.privacyVersion !== BETA_PRIVACY_VERSION) {
      return apiError("Accept the beta contact and privacy notice", "CONSENT_REQUIRED", 400);
    }

    const routesAvailable = applicationType === "contributor"
      ? Number(body.routesAvailable)
      : null;
    if (
      applicationType === "contributor" &&
      (!auth.user.name?.trim() || !Number.isInteger(routesAvailable) || routesAvailable! < 1 || routesAvailable! > 10)
    ) {
      return apiError(
        auth.user.name?.trim()
          ? "Choose how many recently ridden routes you can contribute"
          : "Add your real name to your profile before applying as a contributor",
        "INVALID_CONTRIBUTOR_APPLICATION",
        400
      );
    }
    if (applicationType === "contributor" && sourcePlatforms.length === 0) {
      return apiError("Choose at least one recording source", "SOURCE_REQUIRED", 400);
    }

    const application = await submitBetaApplication({
      userId: auth.user.id,
      applicationType: applicationType as BetaApplicationType,
      homeRegion,
      clubName,
      ridingFrequency: ridingFrequency as "weekly" | "two_to_three" | "four_plus",
      routesAvailable,
      sessionInterests,
      sourcePlatforms,
      notes,
      privacyVersion: BETA_PRIVACY_VERSION,
    });
    if (!application) {
      return apiError("This application can no longer be edited", "APPLICATION_LOCKED", 409);
    }
    return NextResponse.json({ application }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
