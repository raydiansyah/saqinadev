import { dayKey, formatTime } from "@/lib/format";
import type { MemoryView } from "@/lib/memory/service";
import type { MemoryDayGroup } from "./memory-feed";

const DAY_MS = 86_400_000;

/**
 * Groups memories (already newest first) into calendar days. Days are keyed in UTC, so the
 * date label is formatted in UTC as well to stay consistent with its key.
 */
export function groupMemoriesByDay(
  memories: MemoryView[],
  locale: string,
  labels: { today: string; yesterday: string },
  now: Date = new Date(),
): MemoryDayGroup[] {
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - DAY_MS));
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" });
  const groups: MemoryDayGroup[] = [];

  for (const m of memories) {
    const key = dayKey(m.createdAt);
    let group = groups.at(-1);
    if (!group || group.key !== key) {
      const label =
        key === today
          ? labels.today
          : key === yesterday
            ? labels.yesterday
            : dateFormat.format(m.createdAt);
      group = { key, label, items: [] };
      groups.push(group);
    }
    group.items.push({
      id: m.id,
      title: m.title,
      content: m.content,
      category: m.category,
      importance: m.importance,
      source: m.source,
      createdAt: m.createdAt.toISOString(),
      time: formatTime(m.createdAt, locale),
    });
  }
  return groups;
}
