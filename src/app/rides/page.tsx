import type { Metadata } from "next";
import MyRidesClient from "./MyRidesClient";

export const metadata: Metadata = {
  title: "My rides | LOOPS",
  robots: { index: false, follow: false },
};

export default function MyRidesPage() {
  return <MyRidesClient />;
}
