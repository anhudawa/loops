import { redirect } from "next/navigation";

// /routes (typed, or a shared link trimmed to it) is the route library,
// which lives on the home page — the nav's "Routes" link goes there too.
// Temporary (307) so a real list page can take this path later.
export default function RoutesIndex() {
  redirect("/");
}
