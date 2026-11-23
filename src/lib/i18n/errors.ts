import { DEFAULT_LOCALE, MESSAGES, type Locale, type MessageKey } from "./messages";

const ERROR_TRANSLATIONS_ID: Record<string, string> = {
  // Generic & Auth
  "Unauthorized.": "Tidak memiliki akses.",
  "Unauthorized": "Tidak memiliki akses.",
  "Forbidden.": "Akses ditolak.",
  "Forbidden": "Akses ditolak.",
  "Rate limit exceeded.": "Batas permintaan terlampaui. Coba lagi sebentar.",
  "An unexpected error occurred.": "Terjadi kesalahan yang tidak terduga.",
  "Invalid email or password.": "Email atau kata sandi salah.",
  "Session expired. Please sign in again.": "Sesi telah berakhir. Silakan masuk kembali.",
  "Your recovery session has expired. Request a new reset link.":
    "Sesi pemulihan Anda telah berakhir. Minta tautan atur ulang baru.",
  "Unable to sign in.": "Tidak dapat masuk.",
  "Unable to create account.": "Tidak dapat membuat akun.",
  "Unable to send reset email.": "Tidak dapat mengirim email atur ulang.",
  "Unable to update password.": "Tidak dapat memperbarui kata sandi.",

  // Auth & Profile Validation
  "Enter a valid email address.": "Masukkan alamat email yang valid.",
  "Full name is too long.": "Nama lengkap terlalu panjang.",
  "Full name must be at least 2 characters.": "Nama lengkap minimal 2 karakter.",
  "Include at least one number.": "Sertakan minimal satu angka.",
  "Include at least one uppercase letter.": "Sertakan minimal satu huruf kapital.",
  "Locale is required.": "Bahasa wajib dipilih.",
  "Password is required.": "Kata sandi wajib diisi.",
  "Password must be at least 8 characters.": "Kata sandi minimal 8 karakter.",
  "Passwords do not match.": "Kata sandi tidak cocok.",
  "Timezone is required.": "Zona waktu wajib dipilih.",

  // Membership & Permissions
  "Active membership not found.": "Keanggotaan aktif tidak ditemukan.",
  "Active membership required.": "Diperlukan keanggotaan aktif.",
  "Membership not found.": "Keanggotaan tidak ditemukan.",
  "Not authorized.": "Tidak diizinkan.",
  "Unable to verify permissions.": "Tidak dapat memverifikasi izin.",
  "You are not an active member of this family.": "Anda bukan anggota aktif keluarga ini.",
  "A pending invitation already exists for this email.":
    "Undangan yang masih tertunda sudah ada untuk email ini.",
  "Invalid invitation reference.": "Referensi undangan tidak valid.",
  "Invalid member reference.": "Referensi anggota tidak valid.",
  "Invalid ownership transfer target.": "Target pengalihan kepemilikan tidak valid.",
  "Invalid role update.": "Pembaruan peran tidak valid.",
  "Invalid status update.": "Pembaruan status tidak valid.",
  "Not authorized to invite members.": "Tidak diizinkan mengundang anggota.",
  "Role not found.": "Peran tidak ditemukan.",
  "Selected role does not exist.": "Peran yang dipilih tidak ada.",

  // Onboarding
  "Description must be 500 characters or fewer.": "Deskripsi maksimal 500 karakter.",
  "Enter a valid invitation token.": "Masukkan token undangan yang valid.",
  "Family name must be 100 characters or fewer.": "Nama keluarga maksimal 100 karakter.",
  "Family name must be at least 2 characters.": "Nama keluarga minimal 2 karakter.",
  "Photo is too large (max ~400 KB).": "Foto terlalu besar (maks ~400 KB).",
  "Select a timezone.": "Pilih zona waktu.",
  "Select a valid 3-letter currency.": "Pilih kode mata uang 3 huruf yang valid.",

  // Settings
  "Confirmation name does not match the family name.":
    "Nama konfirmasi tidak cocok dengan nama keluarga.",
  "Family workspace not found.": "Ruang kerja keluarga tidak ditemukan.",
  "Invalid permission override.": "Pengaturan izin khusus tidak valid.",
  "Invalid personal preferences.": "Preferensi pribadi tidak valid.",
  "Invalid privacy settings.": "Pengaturan privasi tidak valid.",
  "Enter the family name to confirm.": "Masukkan nama keluarga untuk konfirmasi.",

  // Calendar
  "Invalid RSVP input.": "Input RSVP tidak valid.",
  "Event title is required.": "Judul acara wajib diisi.",

  // Tasks & Chores
  "Invalid attachment metadata.": "Metadata lampiran tidak valid.",
  "Invalid subtask.": "Subtugas tidak valid.",
  "Comment cannot be empty.": "Komentar tidak boleh kosong.",
  "Task title is required.": "Judul tugas wajib diisi.",
  "Invalid challenge.": "Tantangan tidak valid.",
  "Invalid chore submission.": "Pengiriman pekerjaan tidak valid.",
  "Invalid review request.": "Permintaan tinjauan tidak valid.",
  "Chore title is required.": "Judul pekerjaan wajib diisi.",
  "Reward title is required.": "Judul hadiah wajib diisi.",

  // Shopping
  "Invalid check toggle.": "Status centang tidak valid.",
  "Invalid quantity.": "Jumlah tidak valid.",
  "Invalid template.": "Templat tidak valid.",
  "Shopping list not found.": "Daftar belanja tidak ditemukan.",
  "Template has no items.": "Templat tidak memiliki item.",
  "You do not have permission to delete shopping lists.":
    "Anda tidak memiliki izin untuk menghapus daftar belanja.",
  "You do not have permission to edit shopping lists.":
    "Anda tidak memiliki izin untuk mengedit daftar belanja.",
  "Item name is required.": "Nama item wajib diisi.",
  "List name is required.": "Nama daftar wajib diisi.",
  "Invalid shopping item.": "Item belanja tidak valid.",

  // Noticeboard
  "Announcement not found.": "Pengumuman tidak ditemukan.",
  "Not authorized to delete announcements.": "Tidak diizinkan menghapus pengumuman.",
  "Not authorized to edit announcements.": "Tidak diizinkan mengedit pengumuman.",
  "Only adult household members can create polls.":
    "Hanya anggota dewasa yang dapat membuat jajak pendapat.",
  "Only adult household members can publish announcements.":
    "Hanya anggota dewasa yang dapat menerbitkan pengumuman.",
  "Only the author or a family admin can delete this announcement.":
    "Hanya penulis atau admin keluarga yang dapat menghapus pengumuman ini.",
  "Only the author or a family admin can edit this announcement.":
    "Hanya penulis atau admin keluarga yang dapat mengedit pengumuman ini.",
  "Add at least 2 options.": "Tambahkan minimal 2 pilihan.",
  "Announcement message is required.": "Pesan pengumuman wajib diisi.",
  "Maximum 8 options.": "Maksimal 8 pilihan.",
  "Question is required.": "Pertanyaan wajib diisi.",
  "Select at least one option.": "Pilih minimal satu pilihan.",
  "Title is required.": "Judul wajib diisi.",

  // Chat
  "Attachment does not belong to this conversation.":
    "Lampiran bukan milik percakapan ini.",
  "Conversation not found or access denied.":
    "Percakapan tidak ditemukan atau akses ditolak.",
  "Enter a conversation title (2-100 chars).":
    "Masukkan judul percakapan (2-100 karakter).",
  "Invalid reaction.": "Reaksi tidak valid.",
  "Missing chat permission.": "Izin obrolan tidak mencukupi.",
  "Missing permission for this conversation type.":
    "Izin tidak mencukupi untuk jenis percakapan ini.",
  "Select another active family member.": "Pilih anggota keluarga aktif lainnya.",
  "Write a message or attach a file.": "Tulis pesan atau lampirkan berkas.",
  "You do not have permission to access this conversation.":
    "Anda tidak memiliki izin untuk mengakses percakapan ini.",
  "Message cannot be empty.": "Pesan tidak boleh kosong.",
  "Unsupported attachment type. Allowed: JPEG, PNG, WebP, GIF, PDF, or TXT.":
    "Jenis lampiran tidak didukung. Diizinkan: JPEG, PNG, WebP, GIF, PDF, atau TXT.",
  "Attachment size must be between 1 byte and 10 MB.":
    "Ukuran lampiran harus antara 1 byte dan 10 MB.",
  "You do not have permission to delete this message.":
    "Anda tidak memiliki izin untuk menghapus pesan ini.",
  "You do not have permission to pin messages.":
    "Anda tidak memiliki izin untuk menyematkan pesan.",

  // Finance
  "Cannot record transactions on an archived account. Restore it first.":
    "Tidak dapat mencatat transaksi pada akun yang diarsipkan. Pulihkan terlebih dahulu.",
  "Finance account not found.": "Akun keuangan tidak ditemukan.",
  "Account name is required.": "Nama akun wajib diisi.",
  "Description or merchant is required.": "Deskripsi atau merchant wajib diisi.",

  // Child Development
  "Attachment not found.": "Lampiran tidak ditemukan.",
  "Child profile not found in this family.": "Profil anak tidak ditemukan di keluarga ini.",
  "Invalid attachment identifier.": "Pengenal lampiran tidak valid.",
  "Select a file to upload.": "Pilih berkas untuk diunggah.",
  "Child name is required.": "Nama anak wajib diisi.",
  "Height must be at least 20 cm.": "Tinggi minimal 20 cm.",
  "Valid birth date required.": "Tanggal lahir yang valid wajib diisi.",
  "Weight must be at least 0.5 kg.": "Berat minimal 0,5 kg.",

  // Habits & Memories
  "Habit not found.": "Kebiasaan tidak ditemukan.",
  "Not authorized to edit this habit.": "Tidak diizinkan mengedit kebiasaan ini.",
  "Only authorized adults can launch family challenges.":
    "Hanya anggota dewasa berwenang yang dapat memulai tantangan keluarga.",
  "Album not found.": "Album tidak ditemukan.",
  "Memory media not found.": "Media kenangan tidak ditemukan.",
  "Memory not found.": "Kenangan tidak ditemukan.",
  "Not authorized to delete this memory.": "Tidak diizinkan menghapus kenangan ini.",
  "Not authorized to edit this memory.": "Tidak diizinkan mengedit kenangan ini.",
  "Not authorized to update album sharing.": "Tidak diizinkan memperbarui berbagi album.",
  "Select a photo or video to upload.": "Pilih foto atau video untuk diunggah.",
  "You do not have permission to view this memory.":
    "Anda tidak memiliki izin untuk melihat kenangan ini.",
  "Album title is required.": "Judul album wajib diisi.",

  // Notifications
  "Invalid notification identifier.": "Pengenal notifikasi tidak valid.",
  "Notification not found or not owned by you.":
    "Notifikasi tidak ditemukan atau bukan milik Anda.",
  "Invalid push subscription.": "Langganan push tidak valid.",
  "Invalid preferences.": "Preferensi tidak valid.",
  "Recipient member not found.": "Anggota penerima tidak ditemukan.",
  "Recipient does not belong to this family.": "Penerima bukan anggota keluarga ini.",
  "Recipient membership is not active.": "Keanggotaan penerima tidak aktif.",

  // AI Assistant
  "Enter a message.": "Masukkan pesan.",
  "Invalid prompt.": "Prompt tidak valid.",
  "Could not start chat.": "Tidak dapat memulai obrolan.",
  "Conversation not found.": "Percakapan tidak ditemukan.",
  "Unable to verify AI rate limit.": "Tidak dapat memverifikasi batas penggunaan AI.",

  // Household & Documents
  "Invalid adjustment.": "Penyesuaian tidak valid.",
  "Invalid home asset.": "Aset rumah tidak valid.",
  "Invalid inventory item.": "Item inventaris tidak valid.",
  "Invalid maintenance task.": "Tugas perawatan tidak valid.",
  "Invalid meal plan.": "Rencana makan tidak valid.",
  "Invalid recipe.": "Resep tidak valid.",
  "Invalid service provider.": "Penyedia layanan tidak valid.",
  "Item not found.": "Item tidak ditemukan.",
  "No ingredients to add.": "Tidak ada bahan untuk ditambahkan.",
  "Document not found or access denied.": "Dokumen tidak ditemukan atau akses ditolak.",
  "Document not found.": "Dokumen tidak ditemukan.",

  // Safety
  "Content is required.": "Konten wajib diisi.",
  "Enter your area or status.": "Masukkan lokasi atau status Anda.",
  "Name is required.": "Nama wajib diisi.",
  "Phone number is required.": "Nomor telepon wajib diisi.",
  "Select at least one family member to share with.":
    "Pilih minimal satu anggota keluarga untuk berbagi.",

  // AI
  "AI assistant request failed.": "Permintaan asisten AI gagal.",
  "Hourly AI request limit reached. Please try again shortly.":
    "Batas permintaan AI per jam tercapai. Silakan coba lagi sebentar.",
  "No pending action found.": "Tidak ada tindakan tertunda yang ditemukan.",
  "Restricted action cannot be executed by AI.":
    "Tindakan terbatas tidak dapat dijalankan oleh AI.",
};

export function translateError(
  locale: Locale,
  errorOrCode?: string | null,
  fallbackKey?: MessageKey
): string {
  if (!errorOrCode) {
    if (fallbackKey) {
      return MESSAGES[locale]?.[fallbackKey] ?? MESSAGES[DEFAULT_LOCALE][fallbackKey];
    }
    return locale === "id"
      ? "Terjadi kesalahan yang tidak terduga."
      : "An unexpected error occurred.";
  }

  // Direct MessageKey match
  if (errorOrCode in MESSAGES[DEFAULT_LOCALE]) {
    const key = errorOrCode as MessageKey;
    return MESSAGES[locale]?.[key] ?? MESSAGES[DEFAULT_LOCALE][key];
  }

  if (locale === "en") {
    return errorOrCode;
  }

  // Exact Indonesian translation match
  if (errorOrCode in ERROR_TRANSLATIONS_ID) {
    return ERROR_TRANSLATIONS_ID[errorOrCode];
  }

  // Dynamic permission prefix
  if (errorOrCode.startsWith("Missing permission: ")) {
    const perm = errorOrCode.slice("Missing permission: ".length);
    return `Izin tidak mencukupi: ${perm}`;
  }

  if (errorOrCode.startsWith("Failed to ")) {
    return `Gagal memproses permintaan (${errorOrCode}).`;
  }

  return errorOrCode;
}
