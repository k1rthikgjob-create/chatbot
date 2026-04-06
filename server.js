require('dotenv').config();

const express = require('express');
const twilio = require('twilio');
const { Pool } = require('pg');
const axios = require('axios');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ================= DB =================
const pool = new Pool({
  host: "caboose.proxy.rlwy.net",
  port: 39328,
  user: "postgres",
  password: process.env.PGPASSWORD,
  database: "railway",
  ssl: { rejectUnauthorized: false },
});

// ================= DB CHECK =================
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

// ================= HELPER =================
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

  // INIT SESSION
  if (!sessions[from]) {
    sessions[from] = { step: 0, data: {} };
  }

  const user = sessions[from];

  try {

    // 🔄 RESTART COMMAND
    if (incomingMsg.toLowerCase() === 'restart') {
      sessions[from] = { step: 1, data: {} };
      return reply(res, twiml, "🔄 Restarted\n\nEnter your Name:");
    }

    // 🚀 START (ONLY IF NOT STARTED)
    if (
      (incomingMsg.toLowerCase() === 'hi' || incomingMsg.toLowerCase() === 'start')
      && user.step === 0
    ) {
      user.step = 1;
      return reply(res, twiml,
        "👋 Welcome to Job Bot\n\nEnter your Name:");
    }

    // ❌ BLOCK RANDOM "HI" DURING FLOW
    if (incomingMsg.toLowerCase() === 'hi' && user.step !== 0) {
      return reply(res, twiml, "⚠️ You are already in the application process. Type 'restart' to begin again.");
    }

    // ================= FLOW =================

    // NAME
    if (user.step === 1) {
      user.data.name = incomingMsg;
      user.step = 2;
      return reply(res, twiml, "📧 Enter Email:");
    }

    // EMAIL
    if (user.step === 2) {
      user.data.email = incomingMsg;
      user.step = 3;
      return reply(res, twiml, "📱 Enter Phone:");
    }

    // PHONE
    if (user.step === 3) {
      user.data.phone = incomingMsg;
      user.step = 4;
      return reply(res, twiml, "💼 Enter Position:");
    }

    // POSITION
    if (user.step === 4) {
      user.data.position = incomingMsg;
      user.step = 5;
      return reply(res, twiml, "📊 Experience (years):");
    }

    // EXPERIENCE → ASK RESUME
    if (user.step === 5) {
      user.data.experience = incomingMsg;
      user.step = 6;
      return reply(res, twiml, "📎 Please upload your resume (PDF)");
    }

    // RESUME UPLOAD
    if (user.step === 6) {

      const mediaUrl = req.body.MediaUrl0;

      if (!mediaUrl) {
        return reply(res, twiml, "⚠️ Please upload your resume file (PDF)");
      }

      // DOWNLOAD FILE FROM TWILIO
      const response = await axios.get(mediaUrl, {
        responseType: 'arraybuffer',
        auth: {
          username: process.env.TWILIO_ACCOUNT_SID,
          password: process.env.TWILIO_AUTH_TOKEN
        }
      });

      const fileBuffer = response.data;

      console.log("📡 Saving to DB:", user.data);

      const result = await pool.query(
        `INSERT INTO candidates 
        (name, email, phone, position, experience, resume)
        VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING id`,
        [
          user.data.name,
          user.data.email,
          user.data.phone,
          user.data.position,
          user.data.experience,
          fileBuffer
        ]
      );

      const applicationId = result.rows[0].id;

      delete sessions[from];

      return reply(res, twiml,
        `✅ Application Submitted!\n\n🆔 Application ID: ${applicationId}\n\n📥 Download Resume:\n${req.protocol}://${req.get('host')}/resume/${applicationId}`);
    }

    // DEFAULT
    return reply(res, twiml,
      "⚠️ Please follow the steps.\n\nType 'HI' to start or 'restart' to begin again.");

  } catch (error) {
    console.error("❌ ERROR:", error.message);
    return reply(res, twiml, "⚠️ Something went wrong. Try again.");
  }
});

// ================= RESUME DOWNLOAD =================
app.get('/resume/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT resume FROM candidates WHERE id=$1',
      [id]
    );

    if (!result.rows.length || !result.rows[0].resume) {
      return res.status(404).send('Resume not found');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=resume_${id}.pdf`);

    res.send(result.rows[0].resume);

  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching resume');
  }
});

// ================= SERVER =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
