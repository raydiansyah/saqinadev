import { ConnectorManager } from "@/components/platform/connector-manager";
import { requireActorPage } from "@/lib/auth/server";
import { listConnectors } from "@/lib/connectors/service";

export default async function ConnectorsPage() {
  const actor = await requireActorPage("/dashboard/ai/connectors");
  return <ConnectorManager connectors={await listConnectors(actor)} />;
}
