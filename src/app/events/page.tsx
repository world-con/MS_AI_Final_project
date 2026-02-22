import type { Metadata } from "next";
import OpsExperience from "@/components/site/OpsExperience";

export const metadata: Metadata = {
  title: "알림 관리",
};

export default function EventsPage() {
  return <OpsExperience />;
}
