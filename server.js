require('dotenv').config();

const express = require('express');
const twilio = require('twilio');
const { Pool } = require('pg');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ================= DB =================


const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
});


// ================= SESSION STORE =================
const sessions = {};

// ================= HELPER FUNCTION =================
function reply(res, twiml, message) {
  twiml.message(message);
  res.set('Content-Type', 'text/xml');
  return res.send(twiml.toString());
}

// ================= WEBHOOK =================
app.post('/webhook', async (req, res) => {

  const incomingMsg = (req.body.Body || '').trim();
  const from = req.body.From;

  const twiml = new twilio.twiml.MessagingResponse();

  if (!sessions[from]) {
    sessions[from] = { step: 0, data: {} };
  }

  const user = sessions[from];

  try {

    // STEP 0: START
    if (incomingMsg.toLowerCase() === 'hi') {
      user.step = 1;
      return reply(res, twiml,
        "👋 *Welcome to Job Application Bot*\n\nLet's get started!\n\n🧑 Enter your *Full Name*:");
    }

    // STEP 1: NAME
    if (user.step === 1) {
      user.data.name = incomingMsg;
      user.step = 2;
      return reply(res, twiml,
        "📧 Enter your *Email Address*:");
    }

    // STEP 2: EMAIL
    if (user.step === 2) {
      user.data.email = incomingMsg;
      user.step = 3;
      return reply(res, twiml,
        "📱 Enter your *Phone Number*:");
    }

    // STEP 3: PHONE
    if (user.step === 3) {
      user.data.phone = incomingMsg;
      user.step = 4;
      return reply(res, twiml,
        "💼 Enter the *Position* you're applying for:");
    }

    // STEP 4: POSITION
    if (user.step === 4) {
      user.data.position = incomingMsg;
      user.step = 5;
      return reply(res, twiml,
        "📊 Enter your *Experience (in years)*:");
    }

    // STEP 5: EXPERIENCE → SAVE TO DB
    if (user.step === 5) {
      user.data.experience = incomingMsg;

      // ✅ STORE IN DATABASE
      await pool.query(
        `INSERT INTO candidates 
        (name, email, phone, position, experience)
        VALUES ($1,$2,$3,$4,$5)`,
        [
          user.data.name,
          user.data.email,
          user.data.phone,
          user.data.position,
          user.data.experience
        ]
      );

      delete sessions[from];

      return reply(res, twiml,
        "🎉 *Application Submitted Successfully!*\n\n✅ Our team will contact you soon.\n\nThank you 🙌");
    }

    // DEFAULT
    return reply(res, twiml,
      "❗ Type *HI* to start your job application");

  } catch (error) {
    console.error("❌ ERROR:", error);
    return reply(res, twiml,
      "⚠️ Something went wrong. Please try again.");
  }
});

// ================= HEALTH CHECK =================
app.get('/', (req, res) => {
  res.send("🚀 Chatbot is running...");
});
pool.connect()
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch(err => console.error("❌ DB Connection Failed:", err.message));
// ================= SERVER =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
