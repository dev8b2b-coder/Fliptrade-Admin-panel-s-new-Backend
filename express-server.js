import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
dotenv.config();
import handlebars from "handlebars";
import forgetPasswordRoutes from './routes/forgetPassword.js';
import forgetOtpMailSendingRoutes from "./routes/forgetOtpMailSending.js"
import staffData from "./routes/allStaff.js"
const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.EMAIL_API_PORT || 8787);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: String(process.env.SMTP_SECURE ?? 'true') === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: { minVersion: 'TLSv1.2' },
});

app.use('/v1', forgetPasswordRoutes);
app.use('/v1',forgetOtpMailSendingRoutes);
app.use('/v1',staffData)
app.get("/",(req,res)=>{res.send("hi")})

const templateFile = path.join(process.cwd(), "templates", "welcome.hbs");
const templateSource = fs.readFileSync(templateFile, "utf8");
 const welcomeTpl = handlebars.compile(templateSource);

// Pick the first logo file that exists
function resolveLogoPath() {
  const base = path.join(process.cwd(), "templates", "assets");
  const candidates = ["Logo.webp", "Logo.png", "Logo.jpg", "Logo.jpeg", "Logo.webg"]; // last is in case your file really is .webg
  for (const name of candidates) {
    const p = path.join(base, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

app.post("/api/send-welcome-email", async (req, res) => {
  try {
    const { to, name, temporaryPassword } = req.body || {};
    if (!to || !name || !temporaryPassword ) {
      return res.status(400).json({ error: "Missing fields (to, name, temporaryPassword)" });
    }

    // Your dynamic values (edit as you like)
    const data = {
      brandName: "Fliptrade",
      name,
      email:to,
      password: temporaryPassword,
      customUrl: process.env.APP_CUSTOM_URL || "",     // optional
      loginUrl: process.env.APP_LOGIN_URL || "https://admin.fliptradegroup.com//login",
      supportEmail: process.env.SUPPORT_EMAIL || "support@fliptrade.com",
      companyName: "",
      companyAddress: ""
    };

    const html = welcomeTpl(data);

    // Attach logo inline via CID so it renders everywhere
    const logoPath = resolveLogoPath();
    const attachments = [];
    if (logoPath) {
      attachments.push({
        filename: path.basename(logoPath),
        path: logoPath,
        cid: "fliptrade-logo" // must match the CID used in the HTML <img src="cid:fliptrade-logo">
      });
    }

    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to,
      subject: `Welcome to ${data.brandName}`,
      html,
      attachments
    });

    res.json({ ok: "Mail sent successfully" });
  } catch (err) {
    console.error("Email error:", err);
    res.status(500).json({ error: "Failed to send email" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Express email API running at http://localhost:${PORT}`);
});