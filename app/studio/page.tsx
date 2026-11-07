import type { Metadata } from "next";
import Studio from "./studio";

export const metadata: Metadata = {
  title: "Studio · Understudy",
  description: "The formats working right now, remade as AI ads.",
};

export default function StudioPage() {
  return <Studio />;
}
