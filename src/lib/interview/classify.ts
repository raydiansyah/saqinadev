import type { AudienceId, FeatureId, ProjectTypeId } from "./options";
import type { Classification } from "./types";

/**
 * Keyword-based reading of free text, English and Indonesian. Deliberately conservative:
 * the result is only ever shown as a suggestion the user must accept, never written into
 * answers silently.
 */

const TYPE_KEYWORDS: [ProjectTypeId, RegExp][] = [
  [
    "learning-platform",
    /\b(school management|student information|academic system|school portal|sistem informasi sekolah|manajemen sekolah|sistem akademik)\b/,
  ],
  [
    "school-website",
    /\b(school|sekolah|academy|akademi|kindergarten|paud|university|universitas|campus|kampus)\b/,
  ],
  [
    "learning-platform",
    /\b(lms|course|courses|kursus|e-?learning|learning platform|lesson|pelajaran|quiz|kuis)\b/,
  ],
  [
    "pos",
    /\b(pos|point of sale|cashier|kasir|checkout counter|restaurant|restoran|rumah makan|cafe|kafe|coffee shop|kedai|warung)\b/,
  ],
  ["marketplace", /\b(marketplace|multi-?vendor|sellers? and buyers?|penjual dan pembeli)\b/],
  [
    "ecommerce",
    /\b(e-?commerce|online (shop|store)|webshop|toko online|jualan online|cart|keranjang)\b/,
  ],
  ["booking", /\b(booking|reservation|reservasi|appointment|janji temu|schedule a|reserve)\b/],
  [
    "mobile-backend",
    /\b(mobile app backend|api for (my|an?) (mobile )?app|backend for (my|an?) app|backend aplikasi mobile)\b/,
  ],
  ["ai-application", /\b(ai|llm|chatbot|gpt|machine learning|summari[sz]e|meringkas)\b/],
  [
    "internal-dashboard",
    /\b(internal|back ?office|admin panel|internal tool|dashboard for (my|our) team|dashboard tim)\b/,
  ],
  ["portfolio", /\b(portfolio|portofolio|personal site|situs pribadi|my work|showcase my)\b/],
  [
    "company-profile",
    /\b(company profile|company website|corporate site|profil perusahaan|website perusahaan)\b/,
  ],
  ["saas", /\b(saas|subscription|langganan|multi-?tenant|b2b software)\b/],
];

const FEATURE_KEYWORDS: [FeatureId, RegExp][] = [
  [
    "auth",
    /\b(login|log in|sign ?in|sign ?up|account|akun|register|registrasi|auth|authentication|autentikasi)\b/,
  ],
  ["dashboard", /\bdashboard\b/],
  [
    "payment",
    /\b(payment|pembayaran|bayar|pay|checkout|invoice|tagihan|stripe|midtrans|xendit|billing)\b/,
  ],
  ["chat", /\b(chat|obrolan|messag(e|ing)|pesan|inbox)\b/],
  ["notification", /\b(notify|notifications?|notifikasi|reminder|pengingat|email alerts?)\b/],
  ["file-upload", /\b(upload|unggah|attachment|lampiran|documents?|dokumen)\b/],
  ["reports", /\b(reports?|laporan)\b/],
  ["analytics", /\b(analytics|analitik|metrics|metrik|insights)\b/],
  ["ai", /\b(ai|llm|gpt|chatbot|machine learning)\b/],
  ["maps", /\b(maps?|peta|location|lokasi|gps|geolocation)\b/],
  ["booking", /\b(booking|reservation|reservasi|appointment|janji temu)\b/],
  ["inventory", /\b(inventory|inventaris|stock|stok|warehouse|gudang)\b/],
  ["pos", /\b(pos|cashier|kasir)\b/],
  ["multi-tenant", /\b(multi-?tenant|organi[sz]ations|organisasi|workspaces)\b/],
  [
    "rbac",
    /\b(roles?|peran|hak akses|permissions?|rbac|employee management|staff management|manajemen karyawan|manajemen pegawai)\b/,
  ],
  ["api", /\b(api|rest|graphql|webhooks?)\b/],
  ["integration", /\b(integrate|integrations?|integrasi|connect to|sync with|sinkronisasi)\b/],
  ["search", /\b(search|pencarian)\b/],
];

const AUDIENCE_KEYWORDS: [AudienceId, RegExp][] = [
  ["students", /\b(students?|siswa|murid|mahasiswa)\b/],
  ["teachers", /\b(teachers?|guru|instructors?|lecturers?|dosen)\b/],
  ["customers", /\b(customers?|pelanggan|clients?|klien|buyers?|pembeli|patients?|pasien)\b/],
  ["employees", /\b(employees?|karyawan|pegawai|staff|staf|team members?)\b/],
  ["administrators", /\b(admins?|administrators?)\b/],
  ["business-owners", /\b(owners?|pemilik|merchants?|sellers?|penjual)\b/],
  ["developers", /\b(developers?|pengembang)\b/],
  ["public", /\b(public|publik|umum|visitors?|pengunjung|anyone)\b/],
];

const PHYSICAL_SIGNALS =
  /\b(hardware|perangkat keras|device|vehicle|kendaraan|car|mobil|motorcycle|drone|robotics?|iot|furniture|furnitur|mebel|architecture|arsitektur|building|bangunan|real estate|properti|interior|3d model|physical product|produk fisik|machine|mesin)\b/;

function matchAll<T>(text: string, table: [T, RegExp][]): T[] {
  return table.filter(([, re]) => re.test(text)).map(([id]) => id);
}

export function classify(input: string): Classification {
  const text = input.toLowerCase();
  if (text.trim().length === 0) return { features: [], audience: [], physical: false };

  // The first matching type wins; order in TYPE_KEYWORDS goes from specific to generic.
  const projectType = TYPE_KEYWORDS.find(([, re]) => re.test(text))?.[0];

  return {
    projectType,
    features: matchAll(text, FEATURE_KEYWORDS),
    audience: matchAll(text, AUDIENCE_KEYWORDS),
    physical: PHYSICAL_SIGNALS.test(text),
  };
}
