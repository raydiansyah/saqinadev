import type { Priority } from "@/lib/domain/enums";
import type { ClassifierContext, IntentClassification, IntentEntities } from "./types";

/**
 * Deterministic, bilingual (Indonesian and English) intent rules. Order matters: the first
 * matching rule wins, so specific phrasings come before generic ones. Confidence is a fixed
 * estimate per rule, not a probability.
 */

const PRIORITY_WORDS: [RegExp, Priority][] = [
  [/\b(kritis|critical|urgent|mendesak|darurat)\b/, "critical"],
  [/\b(tinggi|high|penting)\b/, "high"],
  [/\b(sedang|medium|normal)\b/, "medium"],
  [/\b(rendah|low)\b/, "low"],
];

export function priorityIn(text: string): Priority | undefined {
  return PRIORITY_WORDS.find(([re]) => re.test(text))?.[1];
}

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Cleans a captured phrase: trims punctuation, quotes and filler words at the edges. */
function clean(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let text = raw
    // Priority is captured separately; keep it out of names.
    .replace(/\b(?:(?:with|dengan)\s+)?(?:(?:prioritas|priority)\s+\w+|\w+\s+priority)\b/gi, "")
    .replace(/^[\s"'“”:,-]+|[\s"'“”.!?,]+$/g, "");
  // Strip leading filler repeatedly ("untuk implementasi login" → "login").
  const filler =
    /^(untuk|for|to|tentang|about|yang|the|a|an|sebuah|fitur|feature|sistem|system|implementasi|implementation|of|kita|our|that|bahwa)\s+/i;
  while (filler.test(text)) text = text.replace(filler, "");
  text = text.trim();
  return text.length >= 2 ? text : undefined;
}

const THIS = /\b(ini|this|tersebut|that one)\b/;

interface Rule {
  test: RegExp;
  build: (text: string, match: RegExpMatchArray, ctx: ClassifierContext) => IntentClassification;
}

const result = (
  intent: IntentClassification["intent"],
  confidence: number,
  entities: IntentEntities = {},
): IntentClassification => ({ intent, confidence, entities });

const RULES: Rule[] = [
  {
    test: /\b(kirim|kirimkan|send|hand ?off|serahkan|teruskan|forward)\b.*\b(ke|to)\s+(codex|claude|cursor|kiro|hermes|antigravity|openclaw|[a-z][\w-]{1,30})\b/,
    build: (text, m) =>
      result("HANDOFF_AGENT", 0.9, {
        agent: m[3],
        target: THIS.test(text) ? "current" : undefined,
      }),
  },
  {
    test: /\b(analisa|analisis|analyze|analyse|cek|check|bandingkan|compare)\b.*\b(repo|repository|repositori|codebase|kode)\b|\b(mismatch|tidak cocok|beda)\b.*\b(repo|repository|stack)\b/,
    build: () => result("ANALYZE_REPOSITORY", 0.9),
  },
  {
    test: /\b(repo|repository|repositori|codebase|branch)\b/,
    build: () => result("ASK_REPOSITORY", 0.75),
  },
  {
    test: /\b(hapus|delete|remove|buang)\b.*\b(task|tasks|tugas)\b/,
    build: (text) =>
      result("DELETE_TASKS", 0.9, {
        target: /(belum (di)?mulai|not started|todo|backlog|unstarted)/.test(text)
          ? "all_not_started"
          : THIS.test(text)
            ? "current"
            : undefined,
      }),
  },
  {
    test: /\b(pecah|split|break|bagi)\b.*\b(subtask|sub-task|sub task|bagian|smaller|kecil)/,
    build: () => result("SPLIT_TASK", 0.9, { target: "current" }),
  },
  {
    test: /\b(tugaskan|assign|serahkan|delegasikan|delegate|hand (it )?off)\b/,
    build: (text) =>
      result("ASSIGN_AGENT", 0.85, { target: THIS.test(text) ? "current" : undefined }),
  },
  {
    test: /\b(jalankan|run|start|mulai)\b.*\bagent\b/,
    build: () => result("RUN_AGENT", 0.8, { target: "current" }),
  },
  {
    test: /\b(?:buat(?:kan)?|tambah(?:kan)?|bikin(?:kan)?|create|add|new)\s+(?:sebuah\s+|a\s+|new\s+)?(?:task|tugas)\b(.*)/,
    build: (text, m) =>
      result("CREATE_TASK", 0.9, { title: clean(m[1]), priority: priorityIn(text) }),
  },
  {
    test: /\b(prioritas|priority)\b/,
    build: (text) => result("UPDATE_TASK", 0.85, { priority: priorityIn(text), target: "current" }),
  },
  {
    test: /\b(tandai|mark|set)\b.*\b(selesai|done|complete|completed)\b|\bselesaikan task ini\b/,
    build: () => result("COMPLETE_TASK", 0.85, { target: "current" }),
  },
  {
    test: /\b(?:tambah(?:kan)?|add|buat(?:kan)?|create)\s+(?:role|peran)\s+(.+)/,
    build: (_t, m) => result("CREATE_REQUIREMENT", 0.9, { role: clean(m[1]) }),
  },
  {
    test: /\b(?:ingat|ingatlah|catat|remember|note that|keep in mind|simpan)\b(.*)/,
    build: (_t, m) => result("CREATE_MEMORY", 0.8, { description: clean(m[1]) }),
  },
  {
    test: /\b(?:kita putuskan|kami putuskan|we decided|we decide|decision:|keputusan:|putuskan)\b(.*)/,
    build: (_t, m) => result("CREATE_DECISION", 0.75, { description: clean(m[1]) }),
  },
  {
    test: /\b(?:kenapa|mengapa|why)\b.*\b(?:pilih|memilih|dipilih|pakai|memakai|gunakan|menggunakan|choose|chose|chosen|pick|use|using)\b\s*(.*)/,
    build: (_t, m) => result("ASK_DECISION", 0.9, { topic: clean(m[1]) }),
  },
  {
    test: /\bprd\b.*\b(konsisten|consistent|analisa|analisis|analyze|analyse|review|cek|check|lengkap|complete|masalah|issue)/,
    build: () => result("ANALYZE_PRD", 0.9),
  },
  {
    test: /\b(analisa|analisis|analyze|analyse|cek|check|review|tinjau)\b.*\b(task|tasks|tugas|blocked|terblokir)\b|\btask\b.*\b(blocked|terblokir|macet)\b/,
    build: (text) =>
      result("ANALYZE_TASKS", 0.85, {
        target: /(blocked|terblokir|macet)/.test(text) ? "blocked" : undefined,
      }),
  },
  {
    test: /\b(?:perbaiki|ubah|update|revisi|revise|fix|edit|ganti)\b.*\brequirement\b\s*(.*)/,
    build: (_t, m) => result("UPDATE_REQUIREMENT", 0.85, { topic: clean(m[1]) }),
  },
  {
    test: /\brequirement(s)?\b.*\b(ambigu|ambiguous|jelas|clear|analisa|analyze|cek|check|konflik|conflict|kurang|missing)/,
    build: () => result("ANALYZE_REQUIREMENTS", 0.85),
  },
  {
    test: /\b(?:siapkan|susun|buat(?:kan)?|prepare|create|draft|write)\b.*\b(?:rencana|plan)\b\s*(.*)/,
    build: (_t, m) => result("GENERATE_PLAN", 0.85, { feature: clean(m[1]) }),
  },
  {
    test: /\b(generate|buat(kan)?|tulis)\b.*\bprd\b/,
    build: () => result("GENERATE_PRD", 0.8),
  },
  {
    test: /\b(approval|persetujuan|menunggu review|pending)\b/,
    build: () => result("REQUEST_APPROVAL", 0.7),
  },
  {
    test: /\b(?:tambah(?:kan)?|add|buat(?:kan)?|bikin|build|implement(?:kan)?|create|dukung|support)\s+(?:fitur\s+|feature\s+|sistem\s+|system\s+|a\s+)?(.+)/,
    build: (_t, m) => result("ADD_FEATURE", 0.75, { feature: clean(m[1]) }),
  },
  {
    test: /\b(analisa|analisis|analyze|analyse|review|evaluasi|evaluate)\b.*\b(proyek|project)\b/,
    build: () => result("ANALYZE_PROJECT", 0.85),
  },
  {
    test: /\bprd\b/,
    build: () => result("ASK_PRD", 0.6),
  },
  {
    test: /\brequirement(s)?\b|\bkebutuhan\b/,
    build: () => result("ASK_REQUIREMENT", 0.6),
  },
  {
    test: /\b(memory|memori|ingatan)\b/,
    build: () => result("ASK_MEMORY", 0.6),
  },
  {
    test: /\b(keputusan|decision|decisions)\b/,
    build: () => result("ASK_DECISION", 0.6),
  },
];

/** Classifies with rules only. Never throws; falls back to a question or HELP. */
export function classifyWithRules(
  message: string,
  ctx: ClassifierContext = {},
): IntentClassification {
  const text = message.toLowerCase().replace(/\s+/g, " ").trim();
  for (const rule of RULES) {
    const match = text.match(rule.test);
    if (!match) continue;
    const out = rule.build(text, match, ctx);
    // Keep original casing for captured names ("PostgreSQL", "Google").
    for (const key of ["title", "role", "feature", "topic", "description", "agent"] as const) {
      const value = out.entities[key];
      if (!value) continue;
      const index = message.toLowerCase().indexOf(value.toLowerCase());
      const original = index >= 0 ? message.slice(index, index + value.length) : value;
      out.entities[key] = key === "title" || key === "feature" ? capitalize(original) : original;
    }
    return out;
  }
  if (ctx.entity?.type === "task") return result("ASK_TASK", 0.5, { target: "current" });
  if (/\?|^(apa|apakah|bagaimana|gimana|kapan|siapa|what|how|when|who|is|are|does|do)\b/.test(text))
    return result("ASK_PROJECT", 0.5);
  if (/\b(status|progress|progres|selanjutnya|next)\b/.test(text))
    return result("ASK_PROJECT", 0.6);
  return result("HELP", 0.3);
}
