const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

class UserPreferences {
  constructor() {
    this.aiTypes = {
      copywriter: {
        name: "Copywriter AI",
        description:
          "AI yang membantu menulis konten kreatif, copywriting, dan marketing",
        systemPrompt:
          "Anda adalah copywriter profesional yang ahli dalam menulis konten yang menarik, persuasif, dan SEO-friendly. Anda memahami psikologi konsumen dan teknik copywriting yang efektif.",
        focusAreas: ["content-writing", "marketing", "seo", "social-media"],
        examples: [
          "Tulis headline yang menarik untuk produk skincare",
          "Buat copy untuk Instagram post tentang fitness",
          "Tulis email marketing yang konversi tinggi",
        ],
      },
      "personal-assistant": {
        name: "Personal Assistant AI",
        description:
          "AI yang membantu mengatur jadwal, tugas, dan produktivitas sehari-hari",
        systemPrompt:
          "Anda adalah personal assistant yang sangat terorganisir dan efisien. Anda membantu mengatur jadwal, mengingatkan tugas, dan memberikan saran produktivitas yang praktis.",
        focusAreas: [
          "productivity",
          "scheduling",
          "task-management",
          "organization",
        ],
        examples: [
          "Buat jadwal harian yang produktif",
          "Ingatkan saya tentang meeting besok",
          "Bantu prioritaskan tugas-tugas saya",
        ],
      },
      "health-coach": {
        name: "Health Coach AI",
        description: "AI yang membantu mencapai tujuan kesehatan dan kebugaran",
        systemPrompt:
          "Anda adalah health coach yang memahami nutrisi, fitness, dan wellness. Anda memberikan saran kesehatan yang personal berdasarkan data aktivitas dan preferensi user.",
        focusAreas: ["fitness", "nutrition", "wellness", "mental-health"],
        examples: [
          "Buat program latihan sesuai level saya",
          "Saran menu makanan sehat untuk minggu ini",
          "Tips untuk tidur yang lebih berkualitas",
        ],
      },
      "business-advisor": {
        name: "Business Advisor AI",
        description:
          "AI yang membantu strategi bisnis, analisis pasar, dan pengembangan usaha",
        systemPrompt:
          "Anda adalah business advisor yang berpengalaman dalam strategi bisnis, analisis pasar, dan pengembangan usaha. Anda memberikan insight yang berharga untuk pertumbuhan bisnis.",
        focusAreas: ["strategy", "marketing", "finance", "growth"],
        examples: [
          "Analisis kompetitor untuk bisnis saya",
          "Strategi marketing untuk produk baru",
          "Tips meningkatkan revenue bisnis",
        ],
      },
      "language-tutor": {
        name: "Language Tutor AI",
        description:
          "AI yang membantu belajar bahasa asing dengan metode yang efektif",
        systemPrompt:
          "Anda adalah tutor bahasa yang sabar dan efektif. Anda menggunakan metode pembelajaran yang menyenangkan dan praktis untuk membantu user menguasai bahasa baru.",
        focusAreas: ["grammar", "vocabulary", "conversation", "pronunciation"],
        examples: [
          "Latihan percakapan bahasa Inggris",
          "Jelaskan grammar yang sulit",
          "Buat kuis vocabulary untuk saya",
        ],
      },
      "creative-writer": {
        name: "Creative Writer AI",
        description:
          "AI yang membantu menulis cerita, puisi, dan konten kreatif",
        systemPrompt:
          "Anda adalah creative writer yang imajinatif dan berbakat. Anda membantu menciptakan cerita yang menarik, puisi yang indah, dan konten kreatif yang memukau.",
        focusAreas: ["storytelling", "poetry", "creative-writing", "narrative"],
        examples: [
          "Bantu saya menulis cerita pendek",
          "Tulis puisi tentang tema tertentu",
          "Buat karakter untuk novel saya",
        ],
      },
      "tech-mentor": {
        name: "Tech Mentor AI",
        description:
          "AI yang membantu belajar programming, teknologi, dan digital skills",
        systemPrompt:
          "Anda adalah tech mentor yang berpengalaman dalam programming dan teknologi. Anda menjelaskan konsep teknis dengan cara yang mudah dipahami dan memberikan guidance praktis.",
        focusAreas: ["programming", "web-development", "data-science", "ai-ml"],
        examples: [
          "Jelaskan konsep React hooks",
          "Bantu debug kode JavaScript saya",
          "Tips belajar Python untuk pemula",
        ],
      },
      "finance-advisor": {
        name: "Finance Advisor AI",
        description:
          "AI yang membantu perencanaan keuangan, investasi, dan pengelolaan uang",
        systemPrompt:
          "Anda adalah financial advisor yang memahami perencanaan keuangan, investasi, dan pengelolaan uang yang bijak. Anda memberikan saran keuangan yang bertanggung jawab.",
        focusAreas: ["budgeting", "investing", "saving", "financial-planning"],
        examples: [
          "Buat rencana keuangan bulanan",
          "Saran investasi untuk pemula",
          "Tips menghemat uang dengan efektif",
        ],
      },
    };
  }

  // Get available AI types
  getAvailableAITypes() {
    return this.aiTypes;
  }

  // Get AI type details
  getAITypeDetails(type) {
    return this.aiTypes[type] || null;
  }

  // Set user's AI preference
  async setUserAIPreference(userId, aiType) {
    try {
      const aiDetails = this.getAITypeDetails(aiType);
      if (!aiDetails) {
        throw new Error("AI type not found");
      }

      const { data, error } = await supabase.from("user_preferences").upsert(
        {
          user_id: userId,
          ai_type: aiType,
          ai_name: aiDetails.name,
          ai_description: aiDetails.description,
          focus_areas: aiDetails.focusAreas,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id",
        }
      );

      if (error)
        throw new Error(`Error setting AI preference: ${error.message}`);

      return { success: true, aiDetails };
    } catch (error) {
      console.error("Error setting AI preference:", error);
      throw error;
    }
  }

  // Get user's AI preference
  async getUserAIPreference(userId) {
    try {
      const { data, error } = await supabase
        .from("user_preferences")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (error && error.code !== "PGRST116") {
        throw new Error(`Error fetching AI preference: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error("Error getting AI preference:", error);
      return null;
    }
  }

  // Create personalized system prompt based on AI type and user data
  async createPersonalizedSystemPrompt(userId, aiType) {
    const aiDetails = this.getAITypeDetails(aiType);
    const userPref = await this.getUserAIPreference(userId);

    let basePrompt = aiDetails.systemPrompt;

    // Add user-specific context
    if (userPref) {
      basePrompt += `\n\nUser Profile:
      - AI Type: ${aiDetails.name}
      - Focus Areas: ${aiDetails.focusAreas.join(", ")}
      - Communication Style: ${userPref.communication_style || "formal"}
      - Preferred Language: ${userPref.preferred_language || "id"}`;
    }

    // Add conversation context if available
    const { data: user } = await supabase
      .from("users")
      .select("chat_history")
      .eq("id", userId)
      .single();

    if (user && user.chat_history && user.chat_history.length > 0) {
      const recentConversations = user.chat_history.slice(-3); // Last 3 conversations
      basePrompt += `\n\nRecent Conversations:
      ${recentConversations
        .map((msg) => `- ${msg.role}: ${msg.content.substring(0, 100)}...`)
        .join("\n")}`;
    }

    return basePrompt;
  }

  // Get example prompts for AI type
  getExamplePrompts(aiType) {
    const aiDetails = this.getAITypeDetails(aiType);
    return aiDetails ? aiDetails.examples : [];
  }

  // Update user communication preferences
  async updateCommunicationPreferences(userId, preferences) {
    try {
      const { data, error } = await supabase
        .from("user_preferences")
        .update({
          communication_style: preferences.communication_style,
          preferred_language: preferences.preferred_language,
          training_frequency: preferences.training_frequency,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (error)
        throw new Error(`Error updating preferences: ${error.message}`);
      return { success: true };
    } catch (error) {
      console.error("Error updating communication preferences:", error);
      throw error;
    }
  }
}

module.exports = UserPreferences;
