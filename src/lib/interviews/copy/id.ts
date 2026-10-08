import type { ProjectCopy } from "./types";

export const id: ProjectCopy = {
  platforms: { web: "Web", mobile: "Aplikasi mobile", desktop: "Aplikasi desktop" },
  authMethods: { email: "Email + kata sandi", google: "Google", none: "Tanpa login" },
  timelines: {
    weeks: "Beberapa minggu",
    months: "Beberapa bulan",
    flexible: "Fleksibel",
    unsure: "Belum tahu",
  },
  followUps: {
    sellerAccounts: {
      question: "Apakah penjual perlu akun sendiri?",
      requirement: "Penjual login ke akun sendiri untuk mengelola produk dan pesanan.",
      no: "Penjual tidak punya akun sendiri; produk dikelola terpusat.",
    },
    buyerAccounts: {
      question: "Apakah pembeli perlu akun?",
      requirement: "Pembeli membuat akun untuk memesan dan melacak pembelian.",
      no: "Pembeli dapat membeli tanpa membuat akun.",
    },
    inPlatformPayments: {
      question: "Apakah pembayaran terjadi di dalam platform?",
      requirement: "Pembeli membayar di dalam platform melalui penyedia pembayaran.",
      no: "Pembayaran terjadi di luar platform.",
    },
    commission: {
      question: "Apakah platform mengambil komisi per penjualan?",
      requirement: "Platform mencatat komisi dari setiap penjualan yang selesai.",
      no: "Platform tidak mengambil komisi penjualan.",
    },
    tableManagement: {
      question: "Apakah pesanan terhubung ke meja?",
      requirement: "Pesanan terhubung ke meja sehingga staf tahu pesanan tiap meja.",
      no: "Pesanan tidak terhubung ke meja.",
    },
    multiOutlet: {
      question: "Apakah ada lebih dari satu outlet?",
      requirement: "Sistem mendukung beberapa outlet dengan penjualan dan stok terpisah.",
      no: "Sistem melayani satu outlet.",
    },
    stockTracking: {
      question: "Apakah stok berkurang otomatis setiap penjualan?",
      requirement: "Stok berkurang otomatis saat item terjual.",
      no: "Stok tidak dilacak per penjualan.",
    },
    onlinePayments: {
      question: "Apakah pelanggan membayar online?",
      requirement: "Pelanggan membayar online melalui penyedia pembayaran.",
      no: "Pelanggan tidak membayar online.",
    },
    staffSchedules: {
      question: "Apakah setiap staf punya jadwal sendiri?",
      requirement: "Setiap staf punya jadwal yang membatasi slot yang bisa dipesan.",
      no: "Pemesanan memakai satu jadwal bersama.",
    },
    reminders: {
      question: "Apakah pelanggan mendapat pengingat booking?",
      requirement: "Pelanggan menerima pengingat sebelum jadwal booking.",
      no: "Tidak ada pengingat booking.",
    },
    deposits: {
      question: "Apakah booking memerlukan uang muka?",
      requirement: "Uang muka ditagih untuk mengonfirmasi booking.",
      no: "Booking dikonfirmasi tanpa uang muka.",
    },
    orgWorkspaces: {
      question: "Apakah pelanggan bekerja dalam organisasi terpisah?",
      requirement: "Setiap organisasi pelanggan punya workspace dan data sendiri.",
      no: "Semua pengguna berbagi satu workspace.",
    },
    subscriptionBilling: {
      question: "Apakah produk dijual berlangganan?",
      requirement: "Pelanggan membayar langganan berulang.",
      no: "Produk tidak dijual berlangganan.",
    },
    freeTrial: {
      question: "Apakah ada masa uji coba gratis?",
      requirement: "Pelanggan baru memulai dengan masa uji coba gratis.",
      no: "Tidak ada uji coba gratis.",
    },
    certificates: {
      question: "Apakah peserta mendapat sertifikat?",
      requirement: "Peserta mendapat sertifikat setelah menyelesaikan kursus.",
      no: "Tidak ada sertifikat.",
    },
    assessments: {
      question: "Apakah ada kuis atau penilaian?",
      requirement: "Kursus memiliki kuis atau penilaian dengan hasil yang tercatat.",
      no: "Kursus tidak memiliki penilaian.",
    },
    paidCourses: {
      question: "Apakah ada kursus berbayar?",
      requirement: "Sebagian kursus memerlukan pembayaran sebelum diakses.",
      no: "Semua kursus gratis diakses.",
    },
    shipping: {
      question: "Apakah pesanan perlu pengiriman?",
      requirement: "Pesanan mencatat alamat, ongkos dan status pengiriman.",
      no: "Pesanan tidak perlu pengiriman.",
    },
    variants: {
      question: "Apakah produk punya varian seperti ukuran atau warna?",
      requirement: "Produk dapat memiliki varian dengan stok dan harga sendiri.",
      no: "Produk tidak punya varian.",
    },
    guestCheckout: {
      question: "Bisakah pelanggan checkout tanpa akun?",
      requirement: "Pelanggan dapat checkout sebagai tamu.",
      no: "Pelanggan perlu akun untuk checkout.",
    },
  },
  groups: {
    overview: "Ringkasan",
    users_roles: "Pengguna dan peran",
    features: "Fitur",
    business_rules: "Aturan bisnis",
    integrations: "Integrasi",
    authentication: "Autentikasi",
    data: "Data",
    ux: "UX / UI",
    infrastructure: "Infrastruktur",
    constraints: "Batasan",
    open_questions: "Pertanyaan terbuka",
    assumptions: "Asumsi",
  },
  featureDescriptions: {
    auth: "Pengguna login ke akun pribadi.",
    dashboard: "Pengguna yang login melihat dashboard berisi informasi yang mereka kelola.",
    crud: "Pengguna membuat, melihat, mengubah dan menghapus data inti.",
    search: "Pengguna dapat mencari konten atau data utama.",
    filter: "Daftar dapat difilter berdasarkan atribut penting.",
    payment: "Pembayaran diproses melalui penyedia pembayaran.",
    chat: "Pengguna dapat saling berkirim pesan di dalam produk.",
    notification: "Pengguna diberi tahu tentang kejadian yang perlu perhatian mereka.",
    "file-upload": "Pengguna dapat mengunggah file dan melampirkannya ke data.",
    reports: "Pengguna dapat melihat laporan ringkasan aktivitas dari waktu ke waktu.",
    analytics: "Tim dapat melihat bagaimana produk digunakan.",
    ai: "Model AI mengerjakan sebagian pekerjaan dari input pengguna.",
    maps: "Lokasi ditampilkan dan dipilih di peta.",
    booking: "Pelanggan memesan slot waktu yang tersedia.",
    inventory: "Stok dilacak per item.",
    pos: "Staf mencatat penjualan di kasir dan mencetak struk.",
    "multi-tenant": "Data setiap organisasi pelanggan terpisah dari yang lain.",
    rbac: "Akses ditentukan oleh peran pengguna.",
    api: "Sistem lain dapat membaca dan menulis data melalui API.",
    integration: "Produk bertukar data dengan layanan eksternal.",
  },
  requirement: {
    overviewTitle: "Tujuan utama",
    overview: (name, objective) => `${name}: ${objective}`,
    audienceTitle: (audience) => `${audience} menggunakan produk`,
    audience: (audience) => `${audience} adalah kelompok pengguna utama.`,
    roleTitle: (role) => `Peran: ${role}`,
    role: (role) => `${role} memiliki hak akses tersendiri. Disarankan dari tipe proyek Anda.`,
    signInTitle: "Metode login",
    signIn: (methods) => `Pengguna login dengan ${methods}.`,
    noSignIn: "Produk tidak mewajibkan pengguna login.",
    platformTitle: "Platform",
    platform: (platforms) => `Produk berjalan sebagai: ${platforms}.`,
    databaseTitle: "Penyimpanan data",
    database: (value) => `Penyimpanan data: ${value}.`,
    deploymentTitle: "Deployment",
    deployment: (value) => `Produk di-deploy ke ${value}.`,
    constraintsTitle: "Batasan",
    timelineTitle: "Timeline",
    timeline: (value) => `Perkiraan timeline: ${value}.`,
    existingTitle: "Sistem yang sudah ada",
    existing: (state) => `${state}: pekerjaan melanjutkan atau menggantikan sistem yang ada.`,
  },
  open: {
    objective: {
      title: "Tujuan belum ditentukan",
      message: "Apa yang ingin dicapai produk belum dijelaskan.",
    },
    audience: {
      title: "Pengguna belum ditentukan",
      message: "Siapa pengguna produk belum dikonfirmasi.",
    },
    features: { title: "Fitur belum ditentukan", message: "Belum ada fitur inti yang dipilih." },
    featuresUnknown: {
      title: "Fitur inti masih terbuka",
      message: "Anda belum yakin soal fitur; rencana memakai set umum untuk tipe ini.",
    },
    payment: {
      title: "Integrasi pembayaran belum ditentukan",
      message:
        "Proyek jenis ini biasanya menerima pembayaran, tapi cara pembayarannya belum dikonfirmasi.",
    },
    signIn: {
      title: "Metode login belum ditentukan",
      message: "Akun diperlukan, tapi cara pengguna login belum dipilih.",
    },
    platform: {
      title: "Platform belum dikonfirmasi",
      message: "Web, mobile atau desktop belum dikonfirmasi.",
    },
    database: {
      title: "Penyimpanan data belum diputuskan",
      message: "Perlu tidaknya dan di mana data disimpan belum diputuskan.",
    },
    deployment: {
      title: "Target deployment belum diputuskan",
      message: "Tempat produk dijalankan belum diputuskan.",
    },
    build: {
      title: "Cara membangun belum diputuskan",
      message: "Membangun di Saqina Dev atau dengan agent sendiri belum diputuskan.",
    },
    timeline: { title: "Timeline belum ditentukan", message: "Belum ada perkiraan timeline." },
  },
  openFollowUp: (question) => ({
    title: question,
    message: "Belum dijawab. Ini memengaruhi cakupan dan model data.",
  }),
  assumption: {
    projectType: (type, from) =>
      `Kami menyimpulkan tipe proyek "${type}" dari deskripsi Anda: "${from}".`,
    features: (features) => `Kami menyimpulkan fitur ini dari deskripsi Anda: ${features}.`,
    audience: (audience) =>
      `Kami menyimpulkan kelompok pengguna ini dari deskripsi Anda: ${audience}.`,
    rbacTitle: "Akses berbasis peran",
    rbac: "Kami menyimpulkan aplikasi Anda perlu akses berbasis peran karena Anda menyebut pemilik dan staf atau beberapa jenis pengguna.",
    platformWebTitle: "Aplikasi web",
    platformWeb: "Berdasarkan jawaban Anda, aplikasi web tampaknya paling mungkin.",
  },
  conflicts: {
    platformDeploy: {
      title: "Platform dan deployment tidak cocok",
      message: (deployment) =>
        `Anda memilih platform hanya mobile, tapi memilih ${deployment} untuk deployment, yang menjalankan aplikasi web. Mana yang benar?`,
      options: { mobile: "Mobile", web: "Web", both: "Keduanya" },
    },
    paymentFollowUp: {
      title: "Jawaban pembayaran tidak cocok",
      message:
        "Pembayaran dipilih sebagai fitur, tapi Anda juga menjawab pembayaran tidak terjadi online atau di dalam produk.",
      options: { keep: "Pembayaran terjadi di produk", remove: "Hapus fitur pembayaran" },
    },
    noDatabase: {
      title: "Fitur memerlukan data tersimpan",
      message:
        "Anda menjawab tidak perlu database, tapi beberapa fitur yang dipilih tidak bisa berjalan tanpa data tersimpan.",
      options: { add: "Tambahkan database", keep: "Tetap tanpa database" },
    },
    authNone: {
      title: "Jawaban login tidak cocok",
      message: "Anda memilih tanpa login, tapi memilih fitur yang memerlukan akun pengguna.",
      options: { keep: "Pengguna login", remove: "Hapus fitur akun" },
    },
    existingSaqina: {
      title: "Kode yang ada dan cara membangun",
      message:
        "Anda punya kode yang sudah ada, tapi memilih membangun di Saqina Dev yang memulai proyek baru. Mana yang kita rencanakan?",
      options: {
        external: "Pakai agent sendiri pada kode yang ada",
        saqina: "Mulai baru di Saqina Dev",
      },
    },
  },
  risks: {
    payment: "Pembayaran memerlukan penyedia bersertifikat, penanganan webhook dan rekonsiliasi.",
    "multi-tenant": "Isolasi data antar organisasi harus ditegakkan di setiap query.",
    ai: "Kualitas dan biaya output AI perlu dibatasi dan dipantau.",
    chat: "Pesan real-time menambah pekerjaan infrastruktur dan moderasi.",
    maps: "Penyedia peta menambah biaya pemakaian dan batas API.",
    integration: "Integrasi eksternal bergantung pada ketersediaan dan perubahan API pihak ketiga.",
    existing: "Bekerja dengan kode yang ada perlu audit sebelum perubahan direncanakan.",
    unknowns: (n) => `${n} pertanyaan masih terbuka; cakupan bisa berubah setelah dijawab.`,
  },
  recommendation: {
    labels: {
      application: "Aplikasi",
      database: "Database",
      deployment: "Deployment",
      authentication: "Autentikasi",
      architecture: "Arsitektur",
      build_strategy: "Strategi build",
      landing: "Konsep landing",
    },
    application: {
      simple:
        "Situs konten membutuhkan halaman statis yang cepat dan SEO yang baik, bukan server aplikasi.",
      api: "Proyek Anda adalah backend untuk aplikasi, jadi layanan API menjadi intinya.",
      app: "Proyek Anda memerlukan dashboard ber-login, halaman yang dirender server untuk SEO dan logika server dalam satu codebase.",
      own: "Anda memilih stack ini.",
    },
    auth: {
      none: "Tanpa login",
      noneReason: "Anda menjawab pengguna tidak perlu login.",
      chosen: (methods) => methods,
      chosenReason: "Anda memilih metode login ini.",
      recommended: "Google + Email",
      recommendedReason:
        "Akun diperlukan. Google mempermudah pendaftaran; email melayani pengguna tanpa Google.",
    },
    architecture: {
      staticSite: "Situs statis dengan file konten",
      staticReason: "Halaman jarang berubah dan tidak memerlukan data per pengguna.",
      api: "Layanan API dengan database relasional",
      apiReason: "Klien berkomunikasi dengan backend hanya melalui API.",
      modular: "Modular monolith dengan modul domain yang jelas",
      modularReason:
        "Beberapa fitur berat dan banyak peran butuh batas modul yang tegas tanpa biaya microservices.",
      fullStack: "Aplikasi web full-stack dengan database relasional",
      fullStackReason:
        "Satu codebase untuk halaman, logika server dan data menjaga proyek seukuran ini tetap sederhana.",
    },
    buildStrategy: {
      saqina: "Bangun di Saqina Dev",
      external: (agent) => `Pakai agent sendiri (${agent})`,
    },
    userOverride: "Anda mengubah rekomendasi ini.",
  },
};
