# 🤖 WhatsApp AI Assistant - Personalized Training System

Sistem AI WhatsApp yang bisa dikustomisasi sesuai keinginan user. User bisa memilih jenis AI assistant yang mereka inginkan, dari copywriter hingga business advisor.

## 🚀 Fitur Utama

### 1. **Multi-AI Types**

- **Copywriter AI**: Membantu menulis konten kreatif dan marketing
- **Personal Assistant AI**: Mengatur jadwal dan produktivitas
- **Health Coach AI**: Saran kesehatan dan kebugaran
- **Business Advisor AI**: Strategi bisnis dan analisis pasar
- **Language Tutor AI**: Belajar bahasa asing
- **Creative Writer AI**: Menulis cerita dan puisi
- **Tech Mentor AI**: Programming dan teknologi
- **Finance Advisor AI**: Perencanaan keuangan

### 2. **Personalized Training**

- Fine-tuning model berdasarkan data user
- Training otomatis setiap 7 hari
- Training manual dengan command `jek, train`

### 3. **Conversation-Based Training**

- Training berdasarkan riwayat percakapan
- Analisis kualitas percakapan otomatis
- Deteksi persetujuan user secara natural
- Update preferensi komunikasi otomatis

## 📋 Cara Penggunaan

### **Setup Awal**

1. **Install Dependencies**

```bash
npm install
```

2. **Setup Database**

```sql
-- Jalankan file database-schema.sql di Supabase SQL Editor
```

3. **Environment Variables**

```env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
OPENAI_API_KEY=your_openai_key
```

4. **Start Bot**

```bash
npm start
```

### **Commands untuk User**

#### **1. Pilih AI Assistant**

```
jek, pilih ai                    # Lihat semua pilihan AI
jek, pilih ai copywriter         # Pilih AI Copywriter
jek, pilih ai personal-assistant # Pilih AI Personal Assistant
jek, pilih ai health-coach       # Pilih AI Health Coach
jek, pilih ai business-advisor   # Pilih AI Business Advisor
jek, pilih ai language-tutor     # Pilih AI Language Tutor
jek, pilih ai creative-writer    # Pilih AI Creative Writer
jek, pilih ai tech-mentor        # Pilih AI Tech Mentor
jek, pilih ai finance-advisor    # Pilih AI Finance Advisor
```

#### **2. Cek Konfigurasi AI**

```
jek, ai saya                    # Lihat AI assistant yang dipilih
```

#### **3. Training Personal**

```
jek, train                      # Mulai personalized training
```

#### **4. Chat dengan AI**

```
jek [pertanyaan Anda]           # Chat dengan AI yang dipilih
```

## 🏗️ Arsitektur Sistem

### **File Structure**

```
├── index.js                    # Main bot file
├── personalized-training.js     # Training system
├── user-preferences.js         # AI type management
├── training-scheduler.js       # Auto training scheduler
├── database-schema.sql         # Database schema
└── package.json               # Dependencies
```

### **Database Schema**

#### **users table**

- `id`: User ID (WhatsApp number)
- `chat_history`: Array of chat messages
- `conversation_state`: Current conversation state
- `personalized_model_id`: Fine-tuned model ID
- `fine_tune_job_id`: Training job ID
- `is_training`: Training status
- `training_data_size`: Number of data points

#### **user_preferences table**

- `user_id`: User ID
- `ai_type`: Selected AI type
- `ai_name`: AI name
- `ai_description`: AI description
- `focus_areas`: Array of focus areas
- `communication_style`: Formal/casual
- `preferred_language`: Language preference

#### **training_sessions table**

- `id`: Session ID
- `user_id`: User ID
- `job_id`: Training job ID
- `model_id`: Fine-tuned model ID
- `training_data_size`: Number of conversations
- `status`: Training status
- `created_at`: Session creation time
- `completed_at`: Session completion time

## 🎯 Contoh Penggunaan

### **User A - Copywriter**

```
User: jek, pilih ai copywriter
Bot: ✅ AI Assistant berhasil dipilih!
     Copywriter AI
     AI yang membantu menulis konten kreatif, copywriting, dan marketing

User: jek Buat headline untuk produk skincare
Bot: [AI memberikan headline yang menarik berdasarkan riwayat percakapan]

User: jek Tulis copy untuk Instagram post
Bot: [AI memberikan copy yang persuasif dan sesuai dengan gaya user]
```

### **User B - Business Advisor**

```
User: jek, pilih ai business-advisor
Bot: ✅ AI Assistant berhasil dipilih!
     Business Advisor AI
     AI yang membantu strategi bisnis, analisis pasar, dan pengembangan usaha

User: jek Strategi untuk pitch ke investor
Bot: [AI memberikan strategi bisnis berdasarkan riwayat percakapan]

User: jek Analisis kompetitor untuk bisnis saya
Bot: [AI memberikan analisis yang mendalam dan personal]
```

## 🔧 Customization

### **Menambah AI Type Baru**

1. **Update user-preferences.js**

```javascript
"new-ai-type": {
  name: "New AI Name",
  description: "AI description",
  systemPrompt: "Custom system prompt",
  focusAreas: ["area1", "area2"],
  examples: [
    "Contoh pertanyaan 1",
    "Contoh pertanyaan 2"
  ]
}
```

2. **Update personalized-training.js**

```javascript
case "new-ai-type":
  advicePrompt = "Custom prompt";
  adviceResponse = this.generateNewAIAdvice(userData.activities);
  break;
```

3. **Add advice generation method**

```javascript
generateNewAIAdvice(activities) {
  // Custom advice logic
  return "Custom advice based on activities";
}
```

### **Training Configuration**

#### **Environment Variables**

```env
TRAINING_MIN_DATA_POINTS=10        # Minimum data untuk training
TRAINING_FREQUENCY_HOURS=168       # Frekuensi auto training (7 hari)
TRAINING_CHECK_INTERVAL_MINUTES=30 # Interval cek status training
```

#### **Training Triggers**

- **Manual**: `jek, train`
- **Auto**: Setiap 7 hari jika ada percakapan berkualitas
- **Data Threshold**: Minimal 10 percakapan
- **Quality Check**: Analisis kualitas percakapan otomatis
- **Consent Detection**: Deteksi persetujuan user secara natural

## 📊 Monitoring & Analytics

### **Training Metrics**

- Training status per user
- Data points collected
- Model performance
- User satisfaction

### **Logs**

```bash
# Training started
🔄 Auto-triggering training for user 1234567890

# Training completed
✅ Training completed for user 1234567890. Model: ft:gpt-3.5-turbo:user:personal-1234567890

# Training failed
❌ Training failed for user 1234567890
```

## 🚀 Deployment

### **Production Checklist**

- [ ] Set environment variables
- [ ] Run database migrations
- [ ] Test all AI types
- [ ] Monitor training jobs
- [ ] Set up error logging
- [ ] Configure auto-scaling

### **Performance Optimization**

- Cache user preferences
- Batch training jobs
- Optimize database queries
- Monitor API rate limits

## 🔒 Security & Privacy

### **Data Protection**

- User data encrypted in database
- Training data anonymized
- API keys secured
- Regular security audits

### **Privacy Features**

- User can delete their data
- Training data not shared
- Model personalization isolated
- GDPR compliance ready

## 🤝 Contributing

1. Fork repository
2. Create feature branch
3. Add new AI types or features
4. Test thoroughly
5. Submit pull request

## 📞 Support

Untuk pertanyaan atau bantuan:

- Email: support@yourdomain.com
- WhatsApp: +1234567890
- Documentation: [Link to docs]

---

**Dibuat dengan ❤️ oleh Zaky Iryad Rais**
