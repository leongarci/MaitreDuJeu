import { SessionView } from "@/components/session/SessionView";

export default async function PlayPage({
  params,
}: PageProps<"/campaign/[id]/play">) {
  const { id } = await params;
  return <SessionView campaignId={id} />;
}
