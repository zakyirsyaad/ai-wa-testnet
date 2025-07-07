// Helper untuk chunking, generate embedding, dan similarity search dengan AI SDK
// Pastikan sudah install: ai, @ai-sdk/openai

const { nanoid } = require("nanoid");
const { createClient } = require("@supabase/supabase-js");
const { embed, embedMany } = require("ai");
const { openai } = require("@ai-sdk/openai");
const dotenv = require("dotenv");

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Model embedding OpenAI
const embeddingModel = openai.embedding("text-embedding-ada-002");

/**
 * Memecah teks panjang menjadi array chunk (per kalimat)
 * @param {string} input
 * @returns {string[]}
 */
function chunkText(input) {
  return input
    .trim()
    .split(".")
    .filter((i) => i !== "");
}

/**
 * Generate embeddings untuk array chunk
 * @param {string[]} chunks
 * @returns {Promise<Array<{ content: string, embedding: number[] }>>}
 */
async function generateEmbeddings(chunks) {
  if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
    return [];
  }
  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: chunks,
  });
  return embeddings.map((e, i) => ({ content: chunks[i], embedding: e }));
}

/**
 * Simpan embeddings ke tabel Supabase
 * @param {string} userId
 * @param {Array<{ content: string, embedding: number[] }>} embeddings
 */
async function saveEmbeddingsToDb(userId, embeddings) {
  for (const { content, embedding } of embeddings) {
    await supabase.from("embeddings").insert([
      {
        id: nanoid(),
        user_id: userId,
        content,
        embedding,
      },
    ]);
  }
}

/**
 * Cari chunk paling relevan dari knowledge base user
 * @param {string} userId
 * @param {string} query
 * @returns {Promise<Array<{ content: string, similarity: number }>>}
 */
async function findRelevantContent(userId, query) {
  if (!query || !query.trim()) {
    return [];
  }
  // 1. Generate embedding untuk query
  const { embedding } = await embed({
    model: embeddingModel,
    value: query,
  });
  // 2. Query ke Supabase pakai cosine similarity (pastikan extension vector aktif)
  const { data } = await supabase.rpc("match_embeddings", {
    query_embedding: embedding,
    match_threshold: 0.75,
    match_count: 3,
    user_id: userId,
  });
  return data; // array of { content, similarity }
}

module.exports = {
  chunkText,
  generateEmbeddings,
  saveEmbeddingsToDb,
  findRelevantContent,
};
