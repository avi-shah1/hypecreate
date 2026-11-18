import type { Metadata } from "next";
import { DEMO_MODE } from "@/lib/demo";
import Studio from "./studio";

export const metadata: Metadata = {
  title: "Studio · HypeCreate",
  description: "The formats working right now, remade as AI ads.",
};

export default function StudioPage() {
  return <Studio demo={DEMO_MODE} />;
}
