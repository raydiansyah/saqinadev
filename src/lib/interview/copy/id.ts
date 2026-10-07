import type { EngineCopy } from "./types";

const joinList = (items: string[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} dan ${items.at(-1)}`;

export const id: EngineCopy = {
  options: {
    projectType: {
      "school-website": {
        label: "Website Sekolah",
        description: "Pendaftaran, berita, guru dan program",
      },
      "company-profile": {
        label: "Company Profile",
        description: "Layanan, kredibilitas dan kontak",
      },
      pos: { label: "POS / Kasir", description: "Penjualan, struk dan stok di kasir" },
      marketplace: { label: "Marketplace", description: "Banyak penjual, banyak pembeli" },
      saas: { label: "SaaS", description: "Software berlangganan untuk tim atau bisnis" },
      "internal-dashboard": {
        label: "Dashboard Internal",
        description: "Alat yang hanya dipakai tim Anda",
      },
      "mobile-backend": {
        label: "Backend Aplikasi Mobile",
        description: "API, autentikasi dan data untuk aplikasi",
      },
      "ai-application": { label: "Aplikasi AI", description: "Model yang mengolah input pengguna" },
      portfolio: { label: "Portofolio", description: "Karya Anda, ditampilkan dengan baik" },
      booking: { label: "Sistem Booking", description: "Slot, jadwal dan reservasi" },
      ecommerce: { label: "E-commerce", description: "Katalog, keranjang dan checkout" },
      "learning-platform": {
        label: "Platform Pembelajaran",
        description: "Kursus, progres dan penilaian",
      },
      custom: { label: "Lainnya", description: "Sesuatu yang lain. Jelaskan di bawah." },
    },
    audience: {
      public: { label: "Pengunjung umum" },
      customers: { label: "Pelanggan" },
      employees: { label: "Karyawan" },
      students: { label: "Siswa" },
      teachers: { label: "Guru" },
      administrators: { label: "Administrator" },
      "business-owners": { label: "Pemilik bisnis" },
      developers: { label: "Developer" },
      "multiple-roles": { label: "Beberapa peran" },
      other: { label: "Lainnya" },
    },
    feature: {
      auth: { label: "Autentikasi" },
      dashboard: { label: "Dashboard" },
      crud: { label: "CRUD" },
      search: { label: "Pencarian" },
      filter: { label: "Filter" },
      payment: { label: "Pembayaran" },
      chat: { label: "Chat" },
      notification: { label: "Notifikasi" },
      "file-upload": { label: "Unggah File" },
      reports: { label: "Laporan" },
      analytics: { label: "Analitik" },
      ai: { label: "AI" },
      maps: { label: "Peta" },
      booking: { label: "Booking" },
      inventory: { label: "Inventaris" },
      pos: { label: "POS" },
      "multi-tenant": { label: "Multi-tenant" },
      rbac: { label: "Peran & Hak Akses" },
      api: { label: "API" },
      integration: { label: "Integrasi" },
    },
    projectState: {
      new: { label: "Proyek baru", description: "Belum ada apa pun" },
      existing: { label: "Proyek yang sudah ada", description: "Ada codebase untuk dilanjutkan" },
      migration: {
        label: "Migrasi / bangun ulang",
        description: "Mengganti atau memindahkan sistem lama",
      },
      unsure: { label: "Belum yakin" },
    },
    techPreference: {
      recommend: {
        label: "Rekomendasikan untuk saya",
        description: "Pilih stack yang cocok dengan brief",
      },
      own: {
        label: "Saya punya stack sendiri",
        description: "Beri tahu apa yang sudah Anda pakai",
      },
      unknown: { label: "Belum tahu", description: "Kami jelaskan alasan rekomendasinya" },
    },
    stackLayer: {
      frontend: { label: "Frontend", placeholder: "mis. Next.js, Vue, SvelteKit" },
      backend: { label: "Backend", placeholder: "mis. Laravel, NestJS, Go" },
      database: { label: "Database", placeholder: "mis. PostgreSQL, MySQL" },
      auth: { label: "Autentikasi", placeholder: "mis. Supabase Auth, Clerk" },
      hosting: { label: "Hosting", placeholder: "mis. Vercel, VPS, AWS" },
      other: { label: "Lainnya", placeholder: "Hal lain yang perlu kami ikuti" },
    },
    databaseNeed: {
      yes: { label: "Ya" },
      no: { label: "Tidak" },
      unsure: { label: "Belum yakin" },
    },
    databaseChoice: {
      recommend: { label: "Rekomendasikan" },
      supabase: { label: "Supabase" },
      postgresql: { label: "PostgreSQL" },
      mysql: { label: "MySQL" },
      other: { label: "Lainnya" },
      existing: { label: "Database yang sudah ada" },
    },
    developmentMode: {
      saqina: {
        label: "Bangun di Saqina Dev",
        description:
          "Biarkan Saqina Dev membuat, menampilkan preview, mengelola dan men-deploy proyek Anda.",
      },
      external: {
        label: "Pakai Agent Sendiri",
        description:
          "Buat PRD, rencana dan instruksi agent untuk Claude, Codex, Cursor, Kiro, Hermes, Antigravity, OpenClaw atau agent lain.",
      },
      unsure: {
        label: "Belum yakin",
        description: "Kami rekomendasikan berdasarkan jawaban Anda.",
      },
    },
    agent: {
      claude: { label: "Claude" },
      codex: { label: "Codex" },
      cursor: { label: "Cursor" },
      kiro: { label: "Kiro" },
      hermes: { label: "Hermes" },
      antigravity: { label: "Antigravity" },
      openclaw: { label: "OpenClaw" },
      other: { label: "Lainnya", description: "Agent apa pun yang membaca instruksi Markdown" },
      unsure: { label: "Belum yakin", description: "Kami sarankan satu untuk proyek ini" },
    },
    deployment: {
      "saqina-vercel": {
        label: "Saqina Dev / Vercel",
        description: "Preview dan produksi di *.saqina.dev",
      },
      "existing-vercel": {
        label: "Vercel yang sudah ada",
        description: "Hubungkan akun Vercel yang sudah Anda pakai",
      },
      other: { label: "Hosting lain" },
      "self-hosted": { label: "Self-hosted", description: "Server atau VPS milik Anda" },
      unsure: { label: "Belum yakin" },
    },
    versioning: {
      yes: { label: "Ya", description: "Rilis diberi tag MAJOR.MINOR.PATCH" },
      no: { label: "Tidak" },
      unsure: { label: "Belum yakin" },
    },
  },

  steps: {
    project: {
      title: "Apa yang ingin Anda bangun?",
      hint: "Satu kalimat sudah cukup. Pilih contoh jika mirip.",
      required: "Pilih jenis proyek atau jelaskan ide Anda dalam satu kalimat.",
    },
    audience: {
      title: "Siapa yang akan memakai sistem ini?",
      hint: "Pilih semua kelompok yang sesuai.",
      required: "Pilih minimal satu kelompok.",
    },
    objective: {
      title: "Sistem ini harus membantu pengguna mencapai apa?",
      hint: "Satu atau dua kalimat tentang hasilnya, bukan fiturnya.",
      required: "Tulis tujuan singkat (beberapa kata) atau pilih salah satu saran.",
    },
    features: {
      title: "Fitur apa yang sudah pasti Anda butuhkan?",
      hint: 'Hanya yang Anda yakini. Anda juga boleh menjawab "Belum tahu".',
      required: 'Pilih minimal satu fitur, atau pilih "Belum tahu".',
    },
    existing: {
      title: "Ini proyek baru atau proyek yang sudah ada?",
      required: "Pilih satu opsi.",
    },
    technology: {
      title: "Apakah Anda sudah punya teknologi pilihan?",
      hint: "Tidak ada yang dipaksakan. Setiap rekomendasi selalu disertai alasannya.",
      required: "Pilih satu opsi. Jika punya stack sendiri, isi minimal satu kolom.",
    },
    database: {
      title: "Apakah proyek Anda butuh database?",
      required: "Pilih satu opsi. Jika butuh database, pilih yang mana.",
    },
    development: {
      title: "Di mana Anda ingin membangun proyek ini?",
      required: "Pilih tempat membangun.",
    },
    agent: {
      title: "Agent apa yang Anda pakai?",
      hint: "PRD dan rencana tetap netral terhadap agent. Pilihan ini hanya membentuk instruksi agent.",
      required: 'Pilih agent, atau "Belum yakin".',
    },
    deployment: { title: "Di mana Anda ingin men-deploy?", required: "Pilih target deployment." },
    versioning: {
      title: "Apakah proyek ini perlu semantic versioning?",
      hint: "Rilis diberi nomor MAJOR.MINOR.PATCH, misalnya v1.2.0.",
      required: "Pilih satu opsi.",
    },
    landing: {
      title: "Konsep landing page",
      hint: "Berdasarkan jawaban Anda. Pakai rekomendasi atau pilih kombinasi sendiri.",
      required: "",
    },
    review: { title: "Proyek Anda mulai terbentuk.", required: "" },
  },

  groups: {
    Project: "Proyek",
    Audience: "Pengguna",
    Features: "Fitur",
    Technology: "Teknologi",
    Development: "Pengembangan",
    Deployment: "Deployment",
    "Landing Page": "Landing Page",
    Review: "Tinjau",
  },

  objectiveSuggestions: {
    "school-website": [
      "Membantu orang tua menemukan program dan mendaftar secara online.",
      "Membuat siswa dan orang tua selalu tahu berita dan jadwal.",
    ],
    "company-profile": [
      "Menjelaskan layanan kami dengan jelas dan mengubah pengunjung jadi permintaan kontak.",
      "Membangun kepercayaan calon klien lewat karya kami sebelumnya.",
    ],
    pos: [
      "Mempercepat transaksi kasir dan menjaga stok tetap akurat di setiap shift.",
      "Memberi pemilik laporan penjualan harian tanpa menghitung manual.",
    ],
    marketplace: [
      "Membantu penjual independen menampilkan produk dan menjangkau lebih banyak pembeli.",
      "Membantu pembeli membandingkan penawaran dan membayar dengan aman di satu tempat.",
    ],
    saas: [
      "Membantu tim mengelola pekerjaan di satu tempat dan membayar bulanan.",
      "Menggantikan proses manual yang sekarang dikerjakan pelanggan di spreadsheet.",
    ],
    "internal-dashboard": [
      "Menggantikan spreadsheet agar tim bekerja dari satu sumber data.",
      "Memberi manajer gambaran operasional secara langsung tanpa meminta laporan.",
    ],
    "mobile-backend": [
      "Menyediakan akun, data dan notifikasi yang aman untuk aplikasi mobile kami.",
    ],
    "ai-application": [
      "Mengubah dokumen yang diunggah pengguna menjadi hasil yang jelas dan siap dipakai.",
      "Menjawab pertanyaan pelanggan dari basis pengetahuan kami sendiri.",
    ],
    portfolio: ["Menampilkan karya terbaik saya dan mendapat tawaran proyek baru."],
    booking: [
      "Membiarkan klien memesan dan mengubah jadwal tanpa menelepon kami.",
      "Mengurangi klien yang tidak datang dengan pengingat dan uang muka.",
    ],
    ecommerce: [
      "Menjual produk kami secara online dengan checkout yang sederhana dan cepat.",
      "Meningkatkan pembelian ulang dari pelanggan yang sudah ada.",
    ],
    "learning-platform": [
      "Menyampaikan kursus secara online dan memantau progres setiap peserta.",
      "Membantu guru menerbitkan materi dan menilai siswa di satu tempat.",
    ],
    custom: ["Jelaskan masalah utama yang harus diselesaikan sistem ini untuk penggunanya."],
  },

  concepts: {
    "cinematic-scroll": {
      name: "Cinematic Scroll Storytelling",
      summary: "Adegan layar penuh yang terbuka saat pengunjung menggulir.",
    },
    "product-led": {
      name: "Product-Led Storytelling",
      summary: "Produk itu sendiri yang bercerita, layar demi layar.",
    },
    "file-to-result": {
      name: "File-to-Result Transformation",
      summary: "Menunjukkan input masuk dan hasil jadi keluar.",
    },
    "pinned-stage": {
      name: "Pinned Product Stage",
      summary: "Satu tampilan produk tetap diam sementara penjelasannya berganti.",
    },
    "feature-choreography": {
      name: "Feature Choreography",
      summary: "Fitur diperkenalkan berurutan, mengikuti pemakaian nyata.",
    },
    "interactive-demo": {
      name: "Interactive Demo Landing Page",
      summary: "Pengunjung mencoba sebagian produk sebelum mendaftar.",
    },
    "product-3d": {
      name: "3D Product Showcase",
      summary: "Model 3D, hanya bila bentuk dan ruang menjelaskan produk.",
    },
    "horizontal-rail": {
      name: "Horizontal Story Rail",
      summary: "Urutan menyamping untuk langkah, linimasa atau koleksi.",
    },
    "layered-parallax": {
      name: "Layered Parallax Experience",
      summary: "Kedalaman lewat lapisan yang bergerak dengan kecepatan berbeda.",
    },
    "before-after": {
      name: "Before-and-After Reveal",
      summary: "Perbandingan langsung antara kondisi lama dan yang sudah diperbaiki.",
    },
    "guided-narrative": {
      name: "Guided Narrative / Scrollytelling",
      summary: "Cerita tertulis dengan visual yang berubah di setiap bab.",
    },
    "dashboard-journey": {
      name: "Dashboard Journey",
      summary: "Menelusuri aplikasi seperti pengguna nyata di hari pertama.",
    },
    "data-viz-narrative": {
      name: "Data Visualization Narrative",
      summary: "Grafik dan angka yang menjelaskan temuan produk.",
    },
    "system-map": {
      name: "System Map / Ecosystem Story",
      summary: "Bagaimana produk terhubung dengan alat dan orang di sekitarnya.",
    },
    "conversion-minimal": {
      name: "Conversion-Focused Minimal Landing Page",
      summary: "Singkat, cepat dan dibangun untuk satu aksi.",
    },
    "adaptive-motion": {
      name: "Adaptive Responsive Motion System",
      summary: "Animasi yang berubah bentuk antara desktop dan mobile.",
    },
    "motion-system": {
      name: "Motion System",
      summary: "Rangkaian transisi konsisten yang mengekspresikan brand.",
    },
    "performance-seo": {
      name: "Landing Page Performance and SEO Foundation",
      summary: "Render cepat, struktur mudah di-crawl dan metadata rapi lebih dulu.",
    },
  },

  categories: {
    story: "Cerita",
    interaction: "Interaksi",
    spatial: "Ruang / Visual",
    system: "Produk / Sistem",
    conversion: "Konversi",
    foundation: "Motion / Fondasi",
  },

  profiles: {
    "restaurant-pos": {
      label: "POS Restoran",
      users: ["Pemilik", "Manajer", "Kasir"],
      core: ["Penjualan", "Inventaris", "Laporan"],
    },
    "school-management": {
      label: "Platform Manajemen Sekolah",
      users: ["Admin", "Guru", "Siswa", "Orang tua"],
      core: ["Absensi", "Nilai", "Jadwal", "Laporan"],
    },
    "clinic-booking": {
      label: "Booking Klinik",
      users: ["Pasien", "Staf", "Admin"],
      core: ["Booking", "Pengingat", "Jadwal"],
    },
    "retail-pos": {
      label: "POS Toko",
      users: ["Pemilik", "Kasir"],
      core: ["Penjualan", "Stok", "Struk"],
    },
    marketplace: {
      label: "Marketplace",
      users: ["Pembeli", "Penjual", "Admin"],
      core: ["Listing", "Checkout", "Pencairan dana"],
    },
    learning: {
      label: "Platform Pembelajaran",
      users: ["Siswa", "Guru", "Admin"],
      core: ["Kursus", "Progres", "Kuis"],
    },
    "school-website": {
      label: "Website Sekolah",
      users: ["Orang tua", "Siswa", "Staf"],
      core: ["Pendaftaran", "Program", "Berita"],
    },
    "online-store": {
      label: "Toko Online",
      users: ["Pelanggan", "Admin"],
      core: ["Katalog", "Keranjang", "Checkout"],
    },
    "ai-tool": {
      label: "Aplikasi AI",
      users: ["Pengguna", "Admin"],
      core: ["Unggah", "Pemrosesan", "Hasil"],
    },
    portfolio: {
      label: "Portofolio",
      users: ["Pengunjung", "Klien"],
      core: ["Proyek", "Tentang", "Kontak"],
    },
    "company-website": {
      label: "Website Perusahaan",
      users: ["Pengunjung", "Calon klien"],
      core: ["Layanan", "Studi kasus", "Kontak"],
    },
    "internal-tool": {
      label: "Dashboard Internal",
      users: ["Staf", "Manajer"],
      core: ["Data", "Persetujuan", "Laporan"],
    },
    saas: {
      label: "Platform SaaS",
      users: ["Admin tim", "Anggota tim"],
      core: ["Workspace", "Dashboard", "Tagihan"],
    },
  },

  complexity: {
    names: { low: "rendah", medium: "sedang", high: "tinggi" },
    simple: "Halaman konten tanpa akun atau data yang disimpan.",
    high: (features) => `Mencakup ${features}, dan masing-masing menambah pekerjaan yang nyata.`,
    medium: "Aplikasi dengan data tersimpan dan beberapa fitur inti.",
    low: "Fitur sedikit dengan perubahan data yang kecil.",
  },

  joinList,

  insights: {
    typeNoun: {
      "company-profile": "company profile biasa",
      "school-website": "website sekolah",
      portfolio: "portofolio",
    },
    businessApp: "Aplikasi Web Manajemen Bisnis",
    portal: {
      "school-website": "Website Sekolah + Portal Akademik",
      portfolio: "Portofolio + Area Klien",
    },
    webAppFallback: "Website + Aplikasi Web",
    modules: {
      website: "Website Perusahaan",
      employeePortal: "Portal Karyawan",
      customerPortal: "Portal Pelanggan",
      inventory: "Inventaris",
      payment: "Pembayaran",
      booking: "Booking",
      pos: "POS",
    },
    appFeatures: {
      titleBusiness: (noun) => `Ini terdengar lebih besar dari ${noun}`,
      titleWeb: "Ini lebih dekat ke aplikasi web",
      messageBusiness: (features, structure, modules) =>
        `Anda meminta ${features}. Jenis proyek yang disarankan: ${structure}. Modul yang mungkin: ${modules}. Lanjutkan dengan struktur ini?`,
      messageWeb: (noun, features, structure) =>
        `Anda menyebut ${noun}, tetapi juga meminta ${features}. Itu lebih dekat ke aplikasi web bisnis. Struktur yang disarankan: ${structure}.`,
      use: (structure) => `Pakai "${structure}"`,
      keep: "Tetap dengan struktur saya",
    },
    multiTenant: {
      title: "Multi-tenant kemungkinan berlebihan",
      message:
        "Multi-tenant berarti beberapa organisasi berbagi satu sistem dengan data yang terpisah. Untuk situs satu organisasi, peran dan hak akses memenuhi kebutuhan yang sama dengan kerja jauh lebih sedikit.",
      replace: "Ganti dengan Peran & Hak Akses",
      keep: "Tetap multi-tenant",
    },
    noDatabase: {
      title: "Fitur ini butuh tempat menyimpan data",
      message: (what) =>
        `Anda memilih tanpa database, padahal ${what} tidak bisa berjalan tanpa penyimpanan permanen.`,
      coreRecords: "data inti sistem seperti ini",
      add: "Tambahkan database (rekomendasikan)",
      keep: "Tetap tanpa database",
    },
    paymentNoAuth: {
      title: "Pembayaran tanpa akun",
      message:
        "Pembayaran tanpa autentikasi bisa untuk checkout tamu, tetapi refund, struk dan riwayat pesanan biasanya butuh akun.",
      add: "Tambahkan Autentikasi",
      keep: "Checkout tamu sudah cukup",
    },
    existingInSaqina: {
      title: "Anda sudah punya kode",
      message:
        "Mengimpor repository yang sudah ada ke builder Saqina sedang direncanakan tetapi belum tersedia. Agent Anda sendiri bisa mengerjakan codebase yang ada sekarang, dengan Saqina Dev menyimpan rencananya.",
      switch: "Ganti ke agent sendiri",
      keep: "Tetap Bangun di Saqina Dev",
    },
  },

  landing: {
    why: {
      saas: "Produk SaaS dibeli karena alur kerjanya, jadi pengunjung perlu merasakan dashboard sebelum mendaftar.",
      "internal-dashboard":
        "Penggunanya internal, jadi halaman cukup menunjukkan cara dashboard dipakai.",
      "learning-platform":
        "Siswa dan guru yakin setelah melihat seperti apa materi dan progresnya.",
      "ai-application":
        "Produk AI paling cepat dipahami dengan melihat input berubah menjadi hasil.",
      portfolio: "Portofolio menjual kualitas karya, yang butuh ruang dan tempo.",
      "company-profile":
        "Jasa profesional harus menjelaskan dirinya dengan cepat, mudah ditemukan di pencarian dan mengarah ke satu aksi kontak.",
      "school-website":
        "Orang tua dan siswa mencari program dan pendaftaran, sering dari ponsel, dan datang dari mesin pencari.",
      pos: "Sistem kasir dinilai dari secepat apa transaksi berjalan, jadi halaman perlu menelusuri transaksi nyata.",
      marketplace:
        "Marketplace butuh listing yang cepat dimuat dan terindeks di pencarian, dengan jalan pendek ke aksi pertama.",
      ecommerce:
        "Toko online berkonversi karena cepat dan jelas, dan halaman produk sangat bergantung pada pencarian.",
      booking:
        "Halaman ini ada agar pengunjung memilih slot, jadi alur booking itu sendiri yang harus memimpin.",
      "mobile-backend": "Backend dijelaskan lewat apa saja yang terhubung dengannya.",
      custom:
        "Dengan brief yang masih terbuka, halaman fokus yang cepat dimuat adalah dasar paling aman untuk iterasi.",
    },
    businessApp:
      "Aplikasi bisnis dipilih karena alur kerja hariannya, jadi pengunjung perlu melihat alur itu berjalan.",
    integration:
      "Produk ini terhubung ke sistem lain, jadi peta sistem menunjukkan nilainya lebih baik dari tangkapan layar.",
    physical:
      "Ini benda fisik, jadi tampilan 3D menjelaskan bentuknya lebih baik dari foto atau teks.",
    override: (suggested, first) =>
      `Anda memilih kombinasi ini. Saran kami adalah ${suggested}. ${first}`,
  },

  recommend: {
    customProject: "Proyek Kustom",
    newProject: "Proyek baru",
    development: {
      chosenSaqina: "Anda memilih membuat, menampilkan preview dan men-deploy di dalam Saqina Dev.",
      chosenExternal:
        "Anda memilih tetap coding dengan agent sendiri. Saqina Dev menyimpan PRD, rencana dan progres.",
      existingCode:
        "Anda sudah punya kode. Agent yang bekerja di repository Anda bisa mengubahnya langsung.",
      large:
        "Cakupannya besar. Agent coding di lingkungan Anda sendiri memberi kendali penuh atas codebase saat proyek tumbuh.",
      small:
        "Proyek baru seukuran ini paling cepat dibuat, di-preview dan di-deploy di satu tempat.",
    },
    agent: {
      chosen: "Instruksi dibuat untuk agent ini. PRD dan rencana tetap netral terhadap agent.",
      existingCode:
        "Agent terminal yang membaca seluruh repository cocok untuk kode yang sudah ada. Agent lain tetap bisa memakai paket yang sama.",
      newProject:
        "Agent berbasis editor memungkinkan Anda meninjau setiap perubahan langsung saat proyek terbentuk. Agent lain tetap bisa memakai paket yang sama.",
    },
    stack: {
      own: "Stack Anda dipakai apa adanya.",
      simple: "Halaman statis cepat dirender, mudah terindeks dan hampir tanpa biaya hosting.",
      app: "Satu codebase TypeScript untuk UI dan server, dengan Postgres terkelola sehingga tidak ada server database yang harus dijalankan.",
      layers: {
        frontend: "Frontend",
        styling: "Styling",
        content: "Konten",
        api: "API",
        database: "Database",
        auth: "Autentikasi",
        ai: "AI",
      },
      staticPages: "Next.js (halaman statis)",
      markdown: "Markdown / MDX",
      apiValue: "Next.js Route Handlers + TypeScript",
      aiValue: "Lapisan model yang tidak terikat penyedia",
    },
    database: {
      notRequired: "Tidak diperlukan",
      notRequiredReason:
        "Konten disimpan di file, jadi tidak ada yang perlu disimpan antar kunjungan.",
      existing: "Database yang sudah ada (dihubungkan nanti)",
      yourChoice: "Pilihan Anda.",
      notYet: "Belum diperlukan",
      notYetReason:
        "Tidak ada fitur dalam daftar Anda yang butuh data tersimpan. Bisa ditambahkan nanti.",
      recommended: "Supabase (PostgreSQL)",
      recommendedReason:
        "Data relasional dengan autentikasi dan penyimpanan file, dan tetap Postgres biasa di baliknya jika Anda pindah.",
    },
    deployment: {
      defaultTarget: "Saqina Dev / Vercel",
      viaVercel: "Preview deployment untuk setiap perubahan dan produksi di subdomain saqina.dev.",
      otherHost: "Saqina Dev menyiapkan catatan build dan environment untuk host Anda.",
      connectVercel: "Hubungkan Vercel",
      createVercel: "Buat proyek Vercel",
      preview: "Deploy preview",
      production: "Deploy produksi",
      customDomain: "Domain sendiri",
      build: "Build",
      env: "Environment variables",
      deployHost: "Deploy ke host Anda",
    },
    versioning: {
      consumers:
        "Aplikasi dan integrasi memanggil API ini, jadi mereka perlu tahu kapan rilis mengubah perilaku.",
      releases: "Fitur akan dirilis bertahap; nomor versi membuat setiap rilis mudah dilacak.",
      small: "Cakupannya kecil. Rilis bertanggal sudah cukup untuk sekarang.",
    },
    integrations: { mcp: "Sinkronisasi progres via MCP", customDomain: "Domain sendiri" },
  },

  brief: {
    intro: "> Brief proyek dari interview Saqina Dev. Silakan diedit.",
    objective: "Tujuan",
    notSpecified: "_Belum diisi._",
    audience: "Pengguna",
    features: "Fitur",
    suggested: "disarankan",
    complexity: "Kompleksitas",
    development: "Pengembangan",
    status: "Status",
    mode: "Mode",
    modeSaqina: "Bangun di Saqina Dev",
    modeAgent: "Agent sendiri",
    agent: "Agent",
    chosen: "dipilih",
    recommended: "direkomendasikan",
    stack: "Stack",
    dataDeploy: "Data dan deployment",
    database: "Database",
    deployment: "Deployment",
    pipeline: "Alur",
    versioning: "Semantic versioning",
    yes: "ya",
    no: "tidak",
    landing: "Landing page",
    primary: "Utama",
    supporting: "Pendukung",
    integrations: "Integrasi berikutnya",
    none: "Tidak ada",
  },
};
