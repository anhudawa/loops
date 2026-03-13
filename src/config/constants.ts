// ──── File size limits ────
export const MAX_ROUTE_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 MB
export const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2 MB

// ──── Character limits ────
export const MAX_COMMENT_LENGTH = 2000;
export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_CONDITION_NOTE_LENGTH = 500;
export const MAX_BIO_LENGTH = 500;
export const MAX_ROUTE_NAME_LENGTH = 200;
export const MAX_LOCATION_LENGTH = 200;
export const MAX_USER_NAME_LENGTH = 100;
export const MAX_ROUTE_DESCRIPTION_LENGTH = 5000;

// ──── Pagination ────
export const ROUTES_PER_PAGE = 20;
export const COMMENTS_PER_PAGE = 10;
export const CONDITIONS_PER_PAGE = 10;

// ──── Valid enums ────
export const DIFFICULTIES = ["easy", "moderate", "hard", "expert"] as const;
export const DISCIPLINES = ["road", "gravel", "mtb"] as const;
export const CONDITION_STATUSES = ["good", "fair", "poor", "closed"] as const;
export const VALID_ROUTE_EXTENSIONS = [".gpx", ".fit", ".tcx"] as const;

// ──── Rate limits (per minute) ────
export const RATE_LIMIT_AUTH = 5;
export const RATE_LIMIT_UPLOAD = 3;
export const RATE_LIMIT_WRITE = 10;
export const RATE_LIMIT_READ = 60;
