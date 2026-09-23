import type { Metadata } from "next";
import HomeClient from "./_components/HomeClient";
import { pageMeta } from "@/lib/site-meta";

export const metadata: Metadata = {
  ...pageMeta({
    path: "/",
    title: "LOOPS — Routes Worth Riding",
    description: "Discover and share the best gravel, road & MTB loops worldwide. Built by riders, for riders.",
  }),
};
import HomeSeoContent from "./_components/HomeSeoContent";

export default function HomePage() {
  return (
    <>
      <HomeClient />
      <HomeSeoContent />
    </>
  );
}
