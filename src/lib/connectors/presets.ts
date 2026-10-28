/**
 * Ready-made connectors. Each one is a remote MCP server reached over streamable HTTP with a
 * Bearer key (checked against the vendors' READMEs, October 2026). The key is stored encrypted;
 * the endpoint here never carries it.
 */
export interface ConnectorPreset {
  id: "firecrawl" | "exa" | "context7";
  name: string;
  endpoint: string;
  /** Some servers answer without a key, with lower limits. */
  keyRequired: boolean;
  docsUrl: string;
}

export const CONNECTOR_PRESETS: readonly ConnectorPreset[] = [
  {
    id: "firecrawl",
    name: "Firecrawl",
    endpoint: "https://mcp.firecrawl.dev/v2/mcp",
    keyRequired: true,
    docsUrl: "https://github.com/firecrawl/firecrawl-mcp-server",
  },
  {
    id: "exa",
    name: "Exa",
    endpoint: "https://mcp.exa.ai/mcp",
    keyRequired: false,
    docsUrl: "https://github.com/exa-labs/exa-mcp-server",
  },
  {
    id: "context7",
    name: "Context7",
    endpoint: "https://mcp.context7.com/mcp",
    keyRequired: false,
    docsUrl: "https://github.com/upstash/context7",
  },
];

export const CONNECTOR_PRESET_IDS = CONNECTOR_PRESETS.map((p) => p.id) as [
  ConnectorPreset["id"],
  ...ConnectorPreset["id"][],
];

export const presetById = (id: string) => CONNECTOR_PRESETS.find((p) => p.id === id);

/** `{apiKey}` in a `url_key` endpoint is replaced by the secret only at call time. */
export const URL_KEY_PLACEHOLDER = "{apiKey}";

export function endpointWithKey(endpoint: string, secret: string): string {
  return endpoint.split(URL_KEY_PLACEHOLDER).join(encodeURIComponent(secret));
}
