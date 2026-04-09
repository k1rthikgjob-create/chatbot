require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

// ================= DB =================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ================= SESSION =================
const sessions = {};

const VERIFY_TOKEN = "my_verify_token_123";
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// ================= WEBHOOK VERIFY =================
app.get('/webhook', (req, res) => {
  if (
    req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === VERIFY_TOKEN
  ) {
    return res.status(200).send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});

// ================= SEND MESSAGE =================
async function sendMessage(to, message) {
  await axios.post(
    `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      text: { body: message }
    },
    {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// ================= RECEIVE MESSAGE =================
app.post('/webhook', async (req, res) => {
  try {
    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const from = message.from;
    const incomingMsg = message.text?.body?.trim();

    if (!sessions[from]) {
      sessions[from] = { step: 0, data: {} };
    }

    const user = sessions[from];

    // ===== FLOW =====
    if (incomingMsg?.toLowerCase() === 'hi') {
      user.step = 1;
      await sendMessage(from, "👋 Welcome to Job Bot\n\nEnter your Name:");
      return res.sendStatus(200);
    }

    if (user.step === 1) {
      user.data.name = incomingMsg;
      user.step = 2;
      await sendMessage(from, "📧 Enter Email:");
      return res.sendStatus(200);
    }

    if (user.step === 2) {
      user.data.email = incomingMsg;
      user.step = 3;
      await sendMessage(from, "📱 Enter Phone:");
      return res.sendStatus(200);
    }

    if (user.step === 3) {
      user.data.phone = incomingMsg;
      user.step = 4;
      await sendMessage(from, "💼 Enter Position:");
      return res.sendStatus(200);
    }

    if (user.step === 4) {
      user.data.position = incomingMsg;
      user.step = 5;
      await sendMessage(from, "📊 Experience (years):");
      return res.sendStatus(200);
    }

    if (user.step === 5) {
      user.data.experience = incomingMsg;

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

      await sendMessage(from, "✅ Application Submitted!");
      return res.sendStatus(200);
    }

    await sendMessage(from, "Type HI to start");
    res.sendStatus(200);

  } catch (err) {
    console.error("❌ ERROR:", err.message);
    res.sendStatus(500);
  }
});

// ================= SERVER =================
app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running");
});
