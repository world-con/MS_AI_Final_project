import type { Metadata } from "next";
import OpsExperience from "@/components/site/OpsExperience";

export const metadata: Metadata = {
  title: "상황판",
};

export default function DashboardPage() {
  return <OpsExperience />;
}

