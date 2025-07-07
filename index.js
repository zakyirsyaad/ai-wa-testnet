const { Client, LocalAuth } = require("whatsapp-web.js");
const express = require("express");
const qrcode = require("qrcode-terminal");
const { generateText } = require("ai");
const { openai } = require("@ai-sdk/openai");
const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const {
  chunkText,
  generateEmbeddings,
  saveEmbeddingsToDb,
  findRelevantContent,
} = require("./embedding-helper");
const { nanoid } = require("nanoid");
const moment = require("moment");
moment.locale("id");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  throw new Error("Supabase URL and Anon Key must be provided in .env file");
}
const supabase = createClient(supabaseUrl, supabaseKey);

const activeImages = {};

app.use(express.json());

const openAiCompletion = async (
  messageHistory,
  modelName = "gpt-4o-mini",
  systemPrompt = null
) => {
  try {
    const result = await generateText({
      model: openai(modelName),
      maxTokens: 1024,
      system:
        systemPrompt ||
        "You are a helpful AI assistant integrated with WhatsApp. Provide clear, concise, and helpful responses. You remember the context of the conversation, including the last image sent. You were created by Zaky Iryad Rais.",
      messages: messageHistory,
    });
    return result.text;
  } catch (error) {
    console.error("Error in AI completion:", error.message || "Unknown error");
    return "Sorry, I encountered an error while processing your request.";
  }
};

const client = new Client({
  authStrategy: new LocalAuth({ clientId: "testnet-ai-wa" }),
  puppeteer: {
    args: ["--no-sandbox"],
  },
});

client.once("ready", () => {
  console.log("Client is ready!");
});

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

// Helper untuk retry dengan delay jika rate limit
async function safeGenerateText(params, maxRetry = 3, delayMs = 3000) {
  for (let i = 0; i < maxRetry; i++) {
    try {
      return await generateText(params);
    } catch (err) {
      if (err.message && err.message.includes("rate limit")) {
        if (i < maxRetry - 1) {
          await new Promise((res) => setTimeout(res, delayMs));
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }
  }
}

// Update detectIntent pakai gpt-3.5-turbo dan retry
async function detectIntent(message) {
  const prompt = `
Tentukan intent dari kalimat berikut: "${message}".
Pilihan intent: profil, list, hapus, hapus_semua, feedback, tanya, reminder, lain.
Jika intent hapus, ekstrak keywordnya. Jika feedback, ekstrak positif/negatif. Jawab dalam format JSON: { intent: '...', keyword: '...', feedback: '...' }
`;
  const { text } = await safeGenerateText({
    model: openai("gpt-3.5-turbo"),
    maxTokens: 128,
    system: "Kamu adalah asisten yang mendeteksi intent user.",
    messages: [{ role: "user", content: prompt }],
  });
  try {
    return JSON.parse(text);
  } catch {
    return { intent: "lain" };
  }
}

// Update extractUserFact pakai gpt-3.5-turbo dan retry
async function extractUserFact(text) {
  const prompt = `
Kalimat berikut adalah pesan dari user:
"${text}"

Jika kalimat ini mengandung fakta unik tentang user (misal: preferensi, kebiasaan, hobi, alergi, dsb), ekstrak faktanya dalam satu kalimat. Abaikan kalimat sapaan, basa-basi, niat membantu, atau info generik. Jika tidak ada fakta unik, jawab: null.
`;
  const { text: result } = await safeGenerateText({
    model: openai("gpt-3.5-turbo"),
    maxTokens: 128,
    system: "Kamu adalah asisten yang mengekstrak fakta user dari pesan.",
    messages: [{ role: "user", content: prompt }],
  });
  return result.trim() === "null" ? null : result.trim();
}

// Fungsi untuk ekstrak info reminder dari pesan user (pakai LLM)
async function extractReminderInfo(text) {
  const prompt = `
Kalimat berikut adalah permintaan reminder dari user:
"${text}"

Ekstrak waktu, tanggal, dan deskripsi jadwal. Jawab dalam format JSON:
{ remind_at: "YYYY-MM-DDTHH:mm:ss+07:00", description: "..." }
Jika tidak ada info reminder, jawab: null
`;
  const { text: result } = await generateText({
    model: openai("gpt-3.5-turbo"),
    maxTokens: 256,
    system:
      "Kamu adalah asisten yang mengekstrak info reminder dari pesan user.",
    messages: [{ role: "user", content: prompt }],
  });
  try {
    const parsed = JSON.parse(result);
    if (parsed && parsed.remind_at && parsed.description) {
      return parsed;
    }
  } catch {
    // parsing gagal
  }
  return null;
}

// Handler profil user
async function handleProfileRequest(chatId) {
  const { data: facts } = await supabase
    .from("embeddings")
    .select("content")
    .eq("user_id", chatId);
  if (!facts || facts.length === 0) {
    return "Saya belum punya cukup info tentang kamu.";
  }
  const prompt = `
Buat ringkasan profil user berdasarkan fakta berikut:
${facts.map((f) => "- " + f.content).join("\n")}
Jawab dalam 2-3 kalimat.
`;
  const { text: result } = await generateText({
    model: openai("gpt-4o-mini"),
    maxTokens: 256,
    system: "Kamu adalah asisten yang merangkum profil user.",
    messages: [{ role: "user", content: prompt }],
  });
  return result;
}

// Handler list pengetahuan
async function handleListKnowledge(chatId) {
  const { data: facts } = await supabase
    .from("embeddings")
    .select("id, content")
    .eq("user_id", chatId)
    .limit(20);
  if (!facts || facts.length === 0) {
    return "Knowledge base kamu masih kosong.";
  }
  return (
    "Pengetahuan kamu:\n" +
    facts.map((f, i) => `${i + 1}. ${f.content}`).join("\n")
  );
}

// Handler hapus pengetahuan
async function handleDeleteKnowledge(chatId, keyword) {
  const { data: facts } = await supabase
    .from("embeddings")
    .select("id, content")
    .eq("user_id", chatId);
  const toDelete = facts.filter((f) =>
    f.content.toLowerCase().includes(keyword.toLowerCase())
  );
  if (toDelete.length === 0)
    return `Tidak ada info yang cocok dengan "${keyword}".`;
  for (const f of toDelete) {
    await supabase.from("embeddings").delete().eq("id", f.id);
  }
  return `Berhasil menghapus ${toDelete.length} pengetahuan tentang "${keyword}".`;
}

// Handler hapus semua pengetahuan
async function handleDeleteAllKnowledge(chatId) {
  await supabase.from("embeddings").delete().eq("user_id", chatId);
  return "Semua data kamu sudah dihapus.";
}

// Handler feedback (opsional: simpan ke DB/log)
async function handleFeedback(chatId, feedback) {
  // Simpan feedback ke DB/log jika ingin
  return feedback === "positif"
    ? "Terima kasih atas feedback positifnya!"
    : "Terima kasih atas feedback, saya akan berusaha lebih baik.";
}

// Fungsi cosine similarity
function cosineSimilarity(a, b) {
  let dot = 0.0,
    normA = 0.0,
    normB = 0.0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

client.on("message_create", async (message) => {
  const messageBody = (message.body || "").trim();
  const chatId = message.from;

  // Hanya proses chat pribadi, abaikan group
  if (!chatId.endsWith("@c.us")) {
    return;
  }

  try {
    // Fetch user and their state first
    let { data: user, error: userError } = await supabase
      .from("users")
      .select("id, chat_history, conversation_state")
      .eq("id", chatId)
      .single();

    // Create user if they don't exist
    if (userError && userError.code === "PGRST116") {
      const { data: newUser, error: newUserError } = await supabase
        .from("users")
        .insert([{ id: chatId, chat_history: [] }])
        .select("id, chat_history, conversation_state")
        .single();
      if (newUserError)
        throw new Error(`Error creating user: ${newUserError.message}`);
      user = newUser;
      console.log(`New user created: ${user.id}`);
    } else if (userError) {
      throw new Error(`Error fetching user: ${userError.message}`);
    }

    // Simpan pesan ke chat_history
    const dbHistory = user.chat_history || [];
    const newDbHistory = [...dbHistory, { role: "user", content: messageBody }];
    await supabase
      .from("users")
      .update({ chat_history: newDbHistory })
      .eq("id", chatId);

    // Intent detection
    const intentResult = await detectIntent(messageBody);
    if (intentResult.intent === "profil") {
      const response = await handleProfileRequest(chatId);
      await client.sendMessage(chatId, response);
      return;
    }
    if (intentResult.intent === "list") {
      const response = await handleListKnowledge(chatId);
      await client.sendMessage(chatId, response);
      return;
    }
    if (intentResult.intent === "hapus" && intentResult.keyword) {
      const response = await handleDeleteKnowledge(
        chatId,
        intentResult.keyword
      );
      await client.sendMessage(chatId, response);
      return;
    }
    if (intentResult.intent === "hapus_semua") {
      const response = await handleDeleteAllKnowledge(chatId);
      await client.sendMessage(chatId, response);
      return;
    }
    if (intentResult.intent === "feedback" && intentResult.feedback) {
      const response = await handleFeedback(chatId, intentResult.feedback);
      await client.sendMessage(chatId, response);
      return;
    }
    if (intentResult.intent === "ask_time") {
      const jamSekarang = moment().format("LT");
      await client.sendMessage(chatId, `Sekarang jam ${jamSekarang}.`);
      return;
    }
    // Reminder intent tetap jalan seperti sebelumnya (sudah ada extractReminderInfo)

    // Hanya ekstrak dan simpan fakta jika intent simpan/profil/tanya
    if (["simpan", "profil", "tanya"].includes(intentResult.intent)) {
      const info = await extractUserFact(messageBody);
      if (info) {
        // Cek similarity sebelum simpan
        const newEmbeddingArr = await generateEmbeddings([info]);
        const newEmbedding = newEmbeddingArr[0].embedding;
        const { data: existingEmbeddings } = await supabase
          .from("embeddings")
          .select("embedding, content")
          .eq("user_id", chatId);
        let isDuplicate = false;
        if (existingEmbeddings && existingEmbeddings.length > 0) {
          for (const e of existingEmbeddings) {
            const similarity = cosineSimilarity(newEmbedding, e.embedding);
            if (similarity > 0.9) {
              isDuplicate = true;
              break;
            }
          }
        }
        if (!isDuplicate) {
          const chunks = chunkText(info);
          const embeddings = await generateEmbeddings(chunks);
          await saveEmbeddingsToDb(chatId, embeddings);
          console.log(`Fakta user disimpan: ${info}`);
        } else {
          console.log(`Fakta user diabaikan (mirip/duplikat): ${info}`);
        }
      }
    }

    // Ekstrak dan simpan reminder jika ada
    const reminder = await extractReminderInfo(messageBody);
    if (reminder) {
      const id = nanoid();
      await supabase.from("reminders").insert([
        {
          id,
          user_id: chatId,
          remind_at: reminder.remind_at,
          description: reminder.description,
          is_sent: false,
        },
      ]);
      // Format waktu ke bahasa Indonesia untuk response user
      const remindAtLocal = moment(reminder.remind_at).format("LLLL");
      await client.sendMessage(
        chatId,
        `✅ Reminder disimpan! Saya akan mengingatkan kamu pada ${remindAtLocal}.`
      );
      if (intentResult.intent === "reminder") {
        return;
      }
    }

    // Lanjutkan ke handleAiChat seperti biasa
    await handleAiChat(message, user, intentResult.intent);
  } catch (error) {
    console.error("An error occurred:", error.message);
    await client.sendMessage(
      chatId,
      "Maaf, terjadi kesalahan. Silakan coba lagi."
    );
  }
});

// Update handleAiChat untuk explainability dan context injection
async function handleAiChat(message, user, userIntent) {
  const messageBody = message.body.trim();
  const chatId = user.id;
  const hasMedia = message.hasMedia;

  const dbHistory = user.chat_history || [];
  const formattedHistory = dbHistory.map((msg) => ({
    role: msg.role,
    content: [{ type: "text", text: msg.content }],
  }));

  const newUserMessageParts = [];
  let userMessageForDb = { role: "user", content: messageBody };

  if (hasMedia) {
    const media = await message.downloadMedia();
    if (media && media.mimetype.startsWith("image/")) {
      const imageBuffer = Buffer.from(media.data, "base64");
      activeImages[chatId] = imageBuffer;
      newUserMessageParts.push({ type: "image", image: imageBuffer });
      userMessageForDb.content = `${messageBody} [Image Sent]`;
    }
  } else if (activeImages[chatId]) {
    newUserMessageParts.push({ type: "image", image: activeImages[chatId] });
  }

  newUserMessageParts.push({ type: "text", text: messageBody });

  // Inject tanggal, jam, gaya, dan bahasa ke systemPrompt
  const today = new Date();
  const tanggalHariIni = today.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const jamSekarang = today.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  // Deteksi gaya dan bahasa (sederhana, bisa dioptimasi)
  const isFormal = /anda|bapak|ibu|saya|kami/i.test(messageBody);
  const gaya = isFormal ? "formal" : "santai";
  const isEnglish = /\b(the|and|you|your|what|how|can|please)\b/i.test(
    messageBody
  );
  const bahasa = isEnglish ? "English" : "Indonesia";
  let systemPrompt = `You are a helpful AI assistant. Hari ini adalah tanggal ${tanggalHariIni} dan jam sekarang ${jamSekarang}. Gaya komunikasi user: ${gaya}. Jawab dalam bahasa ${bahasa}.\n\nSaya (AI) bisa mengatur dan mengirimkan pengingat (reminder) secara otomatis ke user pada waktu yang diminta.`;

  // Cek knowledge base
  let context = "";
  try {
    const relevant = await findRelevantContent(chatId, messageBody);
    if (relevant && relevant.length > 0) {
      context = relevant.map((r) => r.content).join("\n");
      systemPrompt += `\n\nInformasi tentang user:\n${context}`;
    }
  } catch (e) {
    console.error("Error searching knowledge base:", e.message);
  }

  // Explainability jika knowledge base digunakan
  if (context) {
    systemPrompt +=
      "\n\nSaya menjawab berdasarkan info yang kamu pernah sampaikan.";
  }

  const aiMessages = [
    ...formattedHistory,
    { role: "user", content: newUserMessageParts },
  ];
  const response = await openAiCompletion(
    aiMessages,
    "gpt-4o-mini",
    systemPrompt
  );

  if (response) {
    if (!hasMedia && messageBody.toLowerCase().includes("lupakan gambar")) {
      delete activeImages[chatId];
      console.log(`Active image for ${chatId} has been forgotten.`);
    }

    const newDbHistory = [
      ...dbHistory,
      userMessageForDb,
      { role: "assistant", content: response },
    ];

    await supabase
      .from("users")
      .update({
        chat_history: newDbHistory,
        conversation_state: user.conversation_state,
      })
      .eq("id", user.id);

    // Tawarkan feedback setelah jawaban
    await client.sendMessage(chatId, response);
  }
}

// Update reminderScheduler agar waktu reminder juga diformat ke bahasa Indonesia
async function reminderScheduler() {
  setInterval(async () => {
    const nowUtc = moment().utc().format();
    const { data: reminders } = await supabase
      .from("reminders")
      .select("*")
      .eq("is_sent", false)
      .lte("remind_at", nowUtc);
    if (reminders && reminders.length > 0) {
      for (const reminder of reminders) {
        const remindAtLocal = moment(reminder.remind_at).format("LLLL");
        await client.sendMessage(
          reminder.user_id,
          `⏰ Reminder: ${reminder.description}\nWaktu: ${remindAtLocal}`
        );
        await supabase
          .from("reminders")
          .update({ is_sent: true })
          .eq("id", reminder.id);
      }
    }
  }, 60 * 1000);
}

client.initialize();

// Jalankan scheduler reminder saat bot start
reminderScheduler();

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
