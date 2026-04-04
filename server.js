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
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Railway
  },
});

// ================= SESSION STORE =================
const sessions = {};

// ================= WEBHOOK =================
app.post('/webhook', async (req, res) => {
  const incomingMsg = (req.body.Body || '').trim();
  const from = req.body.From;
  const mediaUrl = req.body.MediaUrl0;

  console.log("📩 Incoming:", incomingMsg, from);

  const twiml = new twilio.twiml.MessagingResponse();

  if (!sessions[from]) {
    sessions[from] = { step: 0, data: {} };
  }

  const user = sessions[from];

  try {

    // STEP 0: START
    if (incomingMsg.toLowerCase() === 'hi') {
      user.step = 1;
      return sendResponse(twiml, res, "👋 Welcome to Job Application Bot\n\nEnter your full name:");
    }

    // STEP 1: NAME
    if (user.step === 1) {
      user.data.name = incomingMsg;
      user.step = 2;
      return sendResponse(twiml, res, "📧 Enter your email:");
    }

    // STEP 2: EMAIL
    if (user.step === 2) {
      user.data.email = incomingMsg;
      user.step = 3;
      return sendResponse(twiml, res, "📱 Enter your phone number:");
    }

    // STEP 3: PHONE
    if (user.step === 3) {
      user.data.phone = incomingMsg;
      user.step = 4;
      return sendResponse(twiml, res, "💼 Enter position you are applying for:");
    }

    // STEP 4: POSITION
    if (user.step === 4) {
      user.data.position = incomingMsg;
      user.step = 5;
      return sendResponse(twiml, res, "📊 Enter your experience (in years):");
    }

    // STEP 5: EXPERIENCE
    if (user.step === 5) {
      user.data.experience = incomingMsg;
      user.step = 6;
      return sendResponse(twiml, res, "📎 Upload your resume (PDF/DOC):");
    }

    // STEP 6: RESUME UPLOAD
    if (user.step === 6 && mediaUrl) {

      const response = await axios({
        method: 'GET',
        url: mediaUrl,
        responseType: 'arraybuffer',
        auth: {
          username: process.env.TWILIO_ACCOUNT_SID,
          password: process.env.TWILIO_AUTH_TOKEN
        }
      });

      const fileBuffer = response.data;

      // Save file as Base64 (better for Railway)
      const resumeBase64 = fileBuffer.toString('base64');

      await pool.query(
        `INSERT INTO candidates 
        (name, email, phone, position, experience, resume_url)
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          user.data.name,
          user.data.email,
          user.data.phone,
          user.data.position,
          user.data.experience,
          resumeBase64
        ]
      );

      delete sessions[from];

      return sendResponse(twiml, res, "✅ Application submitted successfully!");
    }

    return sendResponse(twiml, res, "❗ Type 'hi' to start application");

  } catch (error) {
    console.error("❌ ERROR:", error);
    return sendResponse(twiml, res, "❌ Something went wrong. Try again.");
  }
});

// Helper function
function sendResponse(twiml, res, message) {
  twiml.message(message);
  res.set('Content-Type', 'text/xml');
  return res.send(twiml.toString());
}

// ================= SERVER =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
