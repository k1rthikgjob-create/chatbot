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
    rejectUnauthorized: false,
  },
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

  console.log("FULL BODY:", req.body); // 🔍 debug

  const incomingMsg = (req.body.Body || '').trim();
  const from = req.body.From;

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
      return reply(res, twiml, "👋 Welcome to Job Application Bot\n\nEnter your full name:");
    }

    // STEP 1: NAME
    if (user.step === 1) {
      user.data.name = incomingMsg;
      user.step = 2;
      return reply(res, twiml, "📧 Enter your email:");
    }

    // STEP 2: EMAIL
    if (user.step === 2) {
      user.data.email = incomingMsg;
      user.step = 3;
      return reply(res, twiml, "📱 Enter your phone number:");
    }

    // STEP 3: PHONE
    if (user.step === 3) {
      user.data.phone = incomingMsg;
      user.step = 4;
      return reply(res, twiml, "💼 Enter position you are applying for:");
    }

    // STEP 4: POSITION
    if (user.step === 4) {
      user.data.position = incomingMsg;
      user.step = 5;
      return reply(res, twiml, "📊 Enter your experience (in years):");
    }

    // STEP 5: EXPERIENCE
    if (user.step === 5) {
      user.data.experience = incomingMsg;
      user.step = 6;
      return reply(res, twiml, "📎 Upload your resume (PDF/DOC):");
    }

    // STEP 6: RESUME UPLOAD
    if (user.step === 6) {

      const numMedia = parseInt(req.body.NumMedia || "0");

      if (numMedia === 0) {
        return reply(res, twiml, "❗ Please upload a resume file (PDF/DOC)");
      }

      const mediaUrl = req.body.MediaUrl0;
      const contentType = req.body.MediaContentType0;

      console.log("📎 Media URL:", mediaUrl);
      console.log("📄 Content Type:", contentType);

      // Optional file validation
      if (!contentType.includes("pdf") && !contentType.includes("word")) {
        return reply(res, twiml, "❗ Only PDF or DOC files allowed");
      }

      try {
        const file = await axios({
          method: 'GET',
          url: mediaUrl,
          responseType: 'arraybuffer',
          auth: {
            username: process.env.TWILIO_ACCOUNT_SID,
            password: process.env.TWILIO_AUTH_TOKEN
          }
        });

        const base64 = Buffer.from(file.data).toString('base64');

        await pool.query(
          `INSERT INTO candidates 
          (name,email,phone,position,experience,resume_url)
          VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            user.data.name,
            user.data.email,
            user.data.phone,
            user.data.position,
            user.data.experience,
            base64
          ]
        );

        delete sessions[from];

        return reply(res, twiml, "✅ Application submitted successfully!");

      } catch (err) {
        console.error("❌ Resume Upload Error:", err);
        return reply(res, twiml, "❌ Failed to process resume. Try again.");
      }
    }

    // DEFAULT
    return reply(res, twiml, "❗ Type 'hi' to start application");

  } catch (error) {
    console.error("❌ ERROR:", error);
    return reply(res, twiml, "❌ Something went wrong. Try again.");
  }
});

// ================= HEALTH CHECK =================
app.get('/', (req, res) => {
  res.send("🚀 Chatbot is running...");
});

// ================= SERVER =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
