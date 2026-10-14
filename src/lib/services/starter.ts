import type { ServiceCategory, ServiceIcon } from "@/lib/domain/services";

/**
 * Starter catalog: five private drafts the Owner reviews and edits. The wording only states
 * what each kind of service generally covers; it promises no features, hardware support,
 * timelines or prices. Everything is hidden until the Owner publishes it.
 */

interface Starter {
  slug: string;
  name: string;
  category: ServiceCategory;
  icon: ServiceIcon;
  en: {
    title: string;
    short: string;
    description: string;
    problems: string[];
    capabilities: string[];
    useCases: string[];
  };
  id: {
    title: string;
    short: string;
    description: string;
    problems: string[];
    capabilities: string[];
    useCases: string[];
  };
  requirements?: { en: string[]; id: string[] };
}

const STARTERS: Starter[] = [
  {
    slug: "ai-daily-assistant",
    name: "AI Daily Assistant",
    category: "daily",
    icon: "assistant",
    en: {
      title: "AI Daily Assistant",
      short: "AI help for everyday tasks, scheduling and keeping information organized.",
      description:
        "An assistant set up around how you work each day: planning, reminders, drafting messages and finding information. The scope is agreed with you before anything is built.",
      problems: [
        "Tasks and information spread across chats, notes and calendars",
        "Repetitive daily admin that takes time",
      ],
      capabilities: [
        "Task and schedule support",
        "Drafting and summarizing messages",
        "Organizing notes and information",
      ],
      useCases: ["Personal productivity", "Executive support", "Small team coordination"],
    },
    id: {
      title: "AI Daily Assistant",
      short: "Bantuan AI untuk tugas harian, penjadwalan, dan merapikan informasi.",
      description:
        "Asisten yang disiapkan sesuai cara Anda bekerja tiap hari: perencanaan, pengingat, menyusun pesan, dan mencari informasi. Ruang lingkupnya disepakati bersama sebelum apa pun dikerjakan.",
      problems: [
        "Tugas dan informasi tersebar di chat, catatan, dan kalender",
        "Pekerjaan administrasi harian yang berulang",
      ],
      capabilities: [
        "Dukungan tugas dan jadwal",
        "Menyusun dan merangkum pesan",
        "Merapikan catatan dan informasi",
      ],
      useCases: ["Produktivitas pribadi", "Dukungan eksekutif", "Koordinasi tim kecil"],
    },
  },
  {
    slug: "ai-business-assistant",
    name: "AI Business Assistant",
    category: "business",
    icon: "business",
    en: {
      title: "AI Business Assistant",
      short: "AI support for business operations, workflows, reporting and business information.",
      description:
        "Support for the routine parts of running a business: answering internal questions from your own information, preparing reports and streamlining repeated workflows. Integrations depend on the tools you already use.",
      problems: [
        "Business information that is hard to find",
        "Manual, repeated reporting and follow-ups",
      ],
      capabilities: [
        "Question answering over your business information",
        "Report and summary preparation",
        "Workflow support",
      ],
      useCases: ["Operations support", "Management reporting", "Customer follow-up preparation"],
    },
    id: {
      title: "AI Business Assistant",
      short: "Dukungan AI untuk operasional bisnis, alur kerja, pelaporan, dan informasi bisnis.",
      description:
        "Dukungan untuk bagian rutin dalam menjalankan bisnis: menjawab pertanyaan internal dari informasi Anda sendiri, menyiapkan laporan, dan merapikan alur kerja yang berulang. Integrasi bergantung pada tools yang Anda pakai.",
      problems: [
        "Informasi bisnis yang sulit dicari",
        "Pelaporan dan tindak lanjut manual yang berulang",
      ],
      capabilities: [
        "Menjawab pertanyaan dari informasi bisnis Anda",
        "Menyiapkan laporan dan ringkasan",
        "Dukungan alur kerja",
      ],
      useCases: [
        "Dukungan operasional",
        "Laporan untuk manajemen",
        "Persiapan tindak lanjut pelanggan",
      ],
    },
  },
  {
    slug: "ai-marketing-assistant",
    name: "AI Marketing Assistant",
    category: "marketing",
    icon: "marketing",
    en: {
      title: "AI Marketing Assistant",
      short: "AI help for content planning, marketing workflows and campaign preparation.",
      description:
        "Assistance for planning content, preparing campaigns and analyzing marketing information. Output is a draft for your team to review before anything is published.",
      problems: [
        "Content planning takes more time than expected",
        "Campaign preparation is inconsistent",
      ],
      capabilities: [
        "Content planning and drafting",
        "Campaign preparation support",
        "Marketing information analysis",
      ],
      useCases: ["Social media planning", "Campaign briefs", "Content calendars"],
    },
    id: {
      title: "AI Marketing Assistant",
      short: "Bantuan AI untuk perencanaan konten, alur kerja marketing, dan persiapan kampanye.",
      description:
        "Bantuan untuk merencanakan konten, menyiapkan kampanye, dan menganalisis informasi marketing. Hasilnya berupa draft yang ditinjau tim Anda sebelum dipublikasikan.",
      problems: [
        "Perencanaan konten memakan waktu lebih banyak dari perkiraan",
        "Persiapan kampanye belum konsisten",
      ],
      capabilities: [
        "Perencanaan dan penyusunan konten",
        "Dukungan persiapan kampanye",
        "Analisis informasi marketing",
      ],
      useCases: ["Perencanaan media sosial", "Brief kampanye", "Kalender konten"],
    },
  },
  {
    slug: "ai-cctv-solutions",
    name: "AI CCTV Solutions",
    category: "cctv",
    icon: "camera",
    en: {
      title: "AI CCTV Solutions",
      short: "AI video analytics and CCTV integrations, scoped to your cameras and infrastructure.",
      description:
        "Video analytics and integrations for CCTV setups. What is possible depends on the cameras, network, processing hardware and the scope agreed with you, so every project starts with an assessment.",
      problems: ["Footage that nobody has time to review", "Difficulty finding specific events"],
      capabilities: [
        "Assessment of existing camera setups",
        "Video analytics integration, per agreed scope",
      ],
      useCases: ["Site monitoring", "Retail and office environments"],
    },
    id: {
      title: "AI CCTV Solutions",
      short:
        "Analitik video AI dan integrasi CCTV, disesuaikan dengan kamera dan infrastruktur Anda.",
      description:
        "Analitik video dan integrasi untuk sistem CCTV. Apa yang mungkin dilakukan bergantung pada kamera, jaringan, perangkat pemrosesan, dan ruang lingkup yang disepakati, sehingga setiap proyek diawali dengan asesmen.",
      problems: ["Rekaman yang tidak sempat ditinjau", "Sulit menemukan kejadian tertentu"],
      capabilities: [
        "Asesmen sistem kamera yang ada",
        "Integrasi analitik video, sesuai ruang lingkup yang disepakati",
      ],
      useCases: ["Pemantauan lokasi", "Lingkungan ritel dan kantor"],
    },
    requirements: {
      en: [
        "Compatible cameras and a stable network",
        "Processing hardware suited to the agreed scope",
      ],
      id: [
        "Kamera yang kompatibel dan jaringan yang stabil",
        "Perangkat pemrosesan sesuai ruang lingkup yang disepakati",
      ],
    },
  },
  {
    slug: "custom-ai-solutions",
    name: "Custom AI Solutions",
    category: "custom",
    icon: "puzzle",
    en: {
      title: "Custom AI Solutions",
      short:
        "Tailored AI integrations and automation for needs that do not fit a standard service.",
      description:
        "For needs outside the standard services: tell us what you are trying to achieve and we will discuss whether and how AI can help, then define the scope together before work starts.",
      problems: [
        "A specific process that no off-the-shelf tool fits",
        "Unclear where AI would actually help",
      ],
      capabilities: [
        "Requirement discovery",
        "Custom integrations and automation, per agreed scope",
      ],
      useCases: ["Internal tools", "Process automation", "Integration with existing systems"],
    },
    id: {
      title: "Custom AI Solutions",
      short: "Integrasi dan otomasi AI sesuai kebutuhan yang tidak masuk layanan standar.",
      description:
        "Untuk kebutuhan di luar layanan standar: ceritakan tujuan Anda, lalu kita bahas apakah dan bagaimana AI bisa membantu, kemudian ruang lingkup ditetapkan bersama sebelum pekerjaan dimulai.",
      problems: [
        "Proses spesifik yang tidak cocok dengan tools yang ada",
        "Belum jelas di mana AI benar-benar membantu",
      ],
      capabilities: [
        "Penggalian kebutuhan",
        "Integrasi dan otomasi khusus, sesuai ruang lingkup yang disepakati",
      ],
      useCases: ["Tools internal", "Otomasi proses", "Integrasi dengan sistem yang sudah ada"],
    },
  },
];

const L = <T>(en: T, id: T) => ({ en, id });

/** Inputs for `serviceInput`: private drafts, price hidden, "contact for pricing". */
export const STARTER_SERVICES = STARTERS.map((s) => ({
  slug: s.slug,
  internalName: s.name,
  category: s.category,
  icon: s.icon,
  imageUrl: "",
  title: L(s.en.title, s.id.title),
  shortDescription: L(s.en.short, s.id.short),
  description: L(s.en.description, s.id.description),
  timeline: L("", ""),
  priceLabel: L("", ""),
  ctaLabel: L("", ""),
  metaTitle: L("", ""),
  metaDescription: L("", ""),
  problems: L(s.en.problems, s.id.problems),
  capabilities: L(s.en.capabilities, s.id.capabilities),
  useCases: L(s.en.useCases, s.id.useCases),
  included: L<string[]>([], []),
  excluded: L<string[]>([], []),
  requirements: L(s.requirements?.en ?? [], s.requirements?.id ?? []),
  steps: L<{ title: string; body: string }[]>([], []),
  faqs: L<{ q: string; a: string }[]>([], []),
  relatedIds: [] as string[],
  pricingType: "contact" as const,
  priceAmount: null,
  currency: "IDR" as const,
  showPrice: false,
  ctaType: s.category === "custom" ? ("consultation" as const) : ("discuss" as const),
  isPublished: false,
  isPublic: true,
  isComingSoon: false,
  isFeatured: false,
  displayOrder: 0,
}));
