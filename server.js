require('dotenv').config();

const express = require('express');
const twilio = require('twilio');
const { Pool } = require('pg');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ================= DB =================
const pool = new Pool({
  host: "caboose.proxy.rlwy.net",
  port: 39328,
  user: "postgres",
  password: process.env.PGPASSWORD, // ✅ from Railway
  database: "railway",
  ssl: { rejectUnauthorized: false },
});

// ✅ CHECK DB CONNECTION
(async () => {
  try {
    await pool.query('SELECT 1');
    console.log("✅ Connected to PostgreSQL");
  } catch (err) {
    console.error("❌ DB Connection Failed:", err.message);
  }
})();

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

    if (incomingMsg.toLowerCase() === 'hi') {
      user.step = 1;
      return reply(res, twiml,
        "👋 Welcome to Job Bot\n\nEnter your Name:");
    }

    if (user.step === 1) {
      user.data.name = incomingMsg;
      user.step = 2;
      return reply(res, twiml, "📧 Enter Email:");
    }

    if (user.step === 2) {
      user.data.email = incomingMsg;
      user.step = 3;
      return reply(res, twiml, "📱 Enter Phone:");
    }

    if (user.step === 3) {
      user.data.phone = incomingMsg;
      user.step = 4;
      return reply(res, twiml, "💼 Enter Position:");
    }

    if (user.step === 4) {
      user.data.position = incomingMsg;
      user.step = 5;
      return reply(res, twiml, "📊 Experience (years):");
    }

    if (user.step === 5) {
      user.data.experience = incomingMsg;

      console.log("📡 Saving to DB:", user.data);

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
        "✅ Application Submitted!");
    }

    return reply(res, twiml, "Type HI to start");

  } catch (error) {
    console.error("❌ ERROR:", error.message);
    return reply(res, twiml, "⚠️ Error occurred");
  }
});

// ================= SERVER =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
