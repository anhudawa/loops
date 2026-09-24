import type { Metadata } from "next";
import HomeClient from "./_components/HomeClient";
import { pageMeta } from "@/lib/site-meta";

export const metadata: Metadata = {
  ...pageMeta({
    path: "/",
    title: "LOOPS — Routes Worth Riding",
    description: "Road cycling loops on quiet roads — tell it where and how long, get a loop. Free. Built by riders, for riders.",
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
