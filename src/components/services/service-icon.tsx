import {
  Camera,
  ChartColumn,
  FileText,
  Megaphone,
  MessageSquareText,
  MessagesSquare,
  Puzzle,
  ShieldCheck,
  Store,
  Zap,
} from "lucide-react";
import type { ComponentType } from "react";
import type { ServiceIcon as IconKey } from "@/lib/domain/services";

const ICONS: Record<IconKey, ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  assistant: MessageSquareText,
  business: Store,
  marketing: Megaphone,
  camera: Camera,
  puzzle: Puzzle,
  chat: MessagesSquare,
  chart: ChartColumn,
  bolt: Zap,
  shield: ShieldCheck,
  document: FileText,
};

/** Decorative icon for a service. Unknown keys fall back to the puzzle piece. */
export function ServiceIcon({ name, className }: { name: IconKey; className?: string }) {
  const Icon = ICONS[name] ?? Puzzle;
  return <Icon aria-hidden={true} className={className} />;
}
