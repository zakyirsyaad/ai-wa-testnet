const { Client, LocalAuth } = require("whatsapp-web.js");
const express = require("express");
const qrcode = require("qrcode-terminal");
const { generateText } = require("ai");
const { openai } = require("@ai-sdk/openai");
const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  throw new Error("Supabase URL and Anon Key must be provided in .env file");
}
const supabase = createClient(supabaseUrl, supabaseKey);

// In-memory store for the last active image per user
const activeImages = {};

app.use(express.json());

const openAiCompletion = async (messageHistory) => {
  try {
    const result = await generateText({
      model: openai("gpt-4o"),
      maxTokens: 1024,
      system: "You are a helpful AI assistant integrated with WhatsApp. Provide clear, concise, and helpful responses. You remember the context of the conversation, including the last image sent. You were created by Zaky Iryad Rais.",
      messages: messageHistory,
    });
    return result.text;
  } catch (error) {
    console.error("Error in AI completion:", error.message || "Unknown error");
    return "Sorry, I encountered an error while processing your request.";
  }
};

// Helper function to parse activity details from a string
const parseDetails = (detailsString) => {
  const details = {};
  detailsString.split(",").forEach((part) => {
    const [key, ...valueParts] = part.trim().split(" ");
    const value = valueParts.join(" ");
    if (key && value) {
      details[key.trim()] = value.trim();
    }
  });
  return details;
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

// Main message handler
client.on("message_create", async (message) => {
  const messageBody = (message.body || "").trim();
  const chatId = message.from;

  try {
    // Fetch user and their state first
    let { data: user, error: userError } = await supabase.from("users").select("id, chat_history, conversation_state").eq("id", chatId).single();

    // Create user if they don't exist
    if (userError && userError.code === "PGRST116") {
      const { data: newUser, error: newUserError } = await supabase
        .from("users")
        .insert([{ id: chatId, chat_history: [] }])
        .select("id, chat_history, conversation_state")
        .single();
      if (newUserError) throw new Error(`Error creating user: ${newUserError.message}`);
      user = newUser;
      console.log(`New user created: ${user.id}`);
    } else if (userError) {
      throw new Error(`Error fetching user: ${userError.message}`);
    }

    // --- ROUTER: Check conversation state ---
    if (user.conversation_state?.type === "awaiting_daily_archive_confirmation") {
      return await handleDailyArchiveConfirmation(message, user);
    }

    // --- Daily Proactive Check (runs only if state is normal) ---
    const today = new Date().setHours(0, 0, 0, 0);
    const lastPrompted = new Date(user.conversation_state?.prompted_at || 0).setHours(0, 0, 0, 0);

    if (today > lastPrompted) {
      const { count, error: logError } = await supabase.from("activity_logs").select("id", { count: "exact", head: true }).eq("user_id", chatId).eq("is_archived", false);

      if (logError) throw new Error(`Error checking for unarchived logs: ${logError.message}`);

      if (count && count > 0) {
        // Check count directly
        return await promptForDailyArchive(message, user);
      }
    }

    // --- Normal message processing ---
    if (messageBody.toLowerCase().startsWith("jek, catat")) {
      await handleLogActivity(message, user);
    } else if (messageBody.toLowerCase().startsWith("jek")) {
      await handleAiChat(message, user);
    }
  } catch (error) {
    console.error("An error occurred:", error.message);
    await client.sendMessage(chatId, "Maaf, terjadi kesalahan. Silakan coba lagi.");
  }
});

// --- State-specific handlers ---

async function promptForDailyArchive(message, user) {
  const chatId = user.id;
  console.log(`User ${chatId} has unarchived logs. Prompting for daily archive.`);

  const newState = { type: "awaiting_daily_archive_confirmation", prompted_at: new Date().toISOString() };
  await supabase.from("users").update({ conversation_state: newState }).eq("id", chatId);

  await client.sendMessage(chatId, "Selamat pagi. Saya melihat ada beberapa aktivitas dari hari sebelumnya yang belum diarsipkan. Apakah Anda ingin mengarsipkan rekam medis Anda sekarang?");
  // We don't process the original message, we wait for the next one.
}

async function handleDailyArchiveConfirmation(message, user) {
  const messageBody = message.body.trim().toLowerCase();
  const chatId = user.id;

  if (["ya", "yes", "ok", "y"].includes(messageBody)) {
    await client.sendMessage(chatId, "Baik, memulai proses arsip... ⏳");

    const { data: logs, error: fetchError } = await supabase.from("activity_logs").select("id, activity_type, details, activity_at").eq("user_id", chatId).eq("is_archived", false);

    if (fetchError) throw new Error(`Error fetching logs: ${fetchError.message}`);
    if (!logs || logs.length === 0) {
      await client.sendMessage(chatId, "Tidak ada data baru untuk diarsipkan.");
    } else {
      console.log(`[SIMULASI] Data JSON siap untuk diunggah ke Pinata:`);
      console.log(JSON.stringify(logs, null, 2));
      console.log(`[SIMULASI] Upload ke Pinata berhasil. CID: QmSimulasi...`);
      console.log(`[SIMULASI] Menulis CID ke Smart Contract...`);

      const logIds = logs.map((l) => l.id);
      await supabase.from("activity_logs").update({ is_archived: true }).in("id", logIds);

      await client.sendMessage(chatId, `✅ Berhasil. Rekam medis Anda telah diarsipkan secara permanen.`);
    }
  } else {
    await client.sendMessage(chatId, "Baik, data tidak diarsipkan saat ini. Saya akan mengingatkan Anda lagi besok.");
  }

  // Reset conversation state, but keep the prompted_at time to prevent re-prompting today
  const newState = { prompted_at: user.conversation_state.prompted_at };
  await supabase.from("users").update({ conversation_state: newState }).eq("id", chatId);
}

async function handleLogActivity(message, user) {
  const messageBody = message.body.trim();
  const chatId = user.id;

  const command = messageBody.substring("jek, catat".length).trim();
  const [activity_type, detailsString] = command.split(":");

  if (!activity_type || !detailsString) {
    return await client.sendMessage(chatId, "Format salah. Gunakan: jek, catat [aktivitas]: [detail1] [nilai1], [detail2] [nilai2]");
  }

  const details = parseDetails(detailsString);

  await supabase.from("activity_logs").insert([
    {
      user_id: chatId,
      activity_type: activity_type.trim(),
      details: details,
    },
  ]);

  await client.sendMessage(chatId, `✅ Aktivitas '${activity_type.trim()}' berhasil dicatat.`);
}

async function handleAiChat(message, user) {
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

  const aiMessages = [...formattedHistory, { role: "user", content: newUserMessageParts }];
  const response = await openAiCompletion(aiMessages);

  if (response) {
    if (!hasMedia && messageBody.toLowerCase().includes("lupakan gambar")) {
      delete activeImages[chatId];
      console.log(`Active image for ${chatId} has been forgotten.`);
    }

    const newDbHistory = [...dbHistory, userMessageForDb, { role: "assistant", content: response }];

    await supabase.from("users").update({ chat_history: newDbHistory, conversation_state: user.conversation_state }).eq("id", user.id);

    await client.sendMessage(chatId, response);
  }
}

// Start the client
client.initialize();

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
