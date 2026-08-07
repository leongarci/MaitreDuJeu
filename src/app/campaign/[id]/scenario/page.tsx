import { ScenarioEditor } from "@/components/scenario/ScenarioEditor";

export default async function ScenarioPage({
  params,
}: PageProps<"/campaign/[id]/scenario">) {
  const { id } = await params;
  return (
    <ScenarioEditor
      campaignId={id}
      nextHref={`/campaign/new?resume=${id}`}
    />
  );
}
