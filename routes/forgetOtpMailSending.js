import express from 'express';
import nodemailer from 'nodemailer';
import supabase from './supabase.js';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import handlebars from "handlebars";
import fs from 'fs';
import path from 'path';

const router = express.Router();
// Configure your SMTP (e.g., Resend, SendGrid SMTP, Gmail, etc.)
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

  // Helper: 6-digit OTP
function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * POST /v1/auth/otp/request
 * body: { email: string, purpose?: string }
 */
router.post('/otp/request/resend', async (req, res) => {
  try {
    const email = (req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 60 * 1000); // 1 minute

    // Store
    const { error: insertErr } = await supabase
      .from('otp')
      .insert({
        email,
        code,
        expires_at: expiresAt.toISOString()
      });

    if (insertErr) return res.status(500).json({ error: insertErr.message });

    // Email
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6">
        <h2>Your One-Time Password</h2>
        <p>Use this OTP. It expires in <b>1 minute</b>.</p>
        <p style="font-size:24px;font-weight:bold;letter-spacing:3px">${code}</p>
        <p>If you didn’t request this, you can ignore this email.</p>
      </div>
    `;
        // console.log("opt",code,email,"email");
        

    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: email,
      subject: `Your forget password is OTP`,
      html
    });

    res.json({ ok: true, message: 'OTP sent' });
  } catch (e) {
    console.error('OTP request error:', e);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});



router.post('/otp/request', async (req, res) => {
  try {
    const email = (req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email is required' });


    const { data: staffRow, error: staffErr } = await supabase
      .from('staff')
      .select('id, email, status')
      .eq('email', email)
      .limit(1)
      .maybeSingle();

    if (staffErr) return res.status(500).json({ error: staffErr.message });

    if (!staffRow || staffRow.status !== 'active') {
      // DEV mode: tell the truth
        
        return res.status(404).json({
          error: "This email isn't registered or is inactive. Please sign up or contact support."
        });
      }
      // PROD mode alternative (comment above and enable below to avoid enumeration)
      // return res.json({ ok: true, message: 'If the email exists, an OTP has been sent.' });
    
      function resolveLogoPath() {
        const base = path.join(process.cwd(), "templates", "assets");
        const candidates = ["Logo.webp", "Logo.png", "Logo.jpg", "Logo.jpeg", "Logo.webg"]; // last is in case your file really is .webg
        for (const name of candidates) {
          const p = path.join(base, name);
          if (fs.existsSync(p)) return p;
        }
        return null;
      }

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 60 * 1000); // 1 minute

    // Store
    const { error: insertErr } = await supabase
      .from('otp')
      .insert({
        email,
        code,
        expires_at: expiresAt.toISOString()
      });

    if (insertErr) return res.status(500).json({ error: insertErr.message });

    // Email
    // const html = `
    //   <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6">
    //     <h2>Your One-Time Password</h2>
    //     <p>Use this OTP. It expires in <b>1 minute</b>.</p>
    //     <p style="font-size:24px;font-weight:bold;letter-spacing:3px">${code}</p>
    //     <p>If you didn’t request this, you can ignore this email.</p>
    //   </div>
    // `;
       
        
        const templateFile = path.join(process.cwd(), "templates", "forgetPassword.hbs");
        const templateSource = fs.readFileSync(templateFile, "utf8");
        const forgetPassword = handlebars.compile(templateSource);

        const data = {
          brandName: "Fliptrade",
          email:email,
          otp:code,
          customUrl: process.env.APP_CUSTOM_URL || "",     // optional
          loginUrl: process.env.APP_LOGIN_URL || "https://admin.fliptradegroup.com//login",
          supportEmail: process.env.SUPPORT_EMAIL || "support@fliptrade.com",
          companyName: "",
          companyAddress: ""
        };
        const html = forgetPassword(data);
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
      to: email,
      subject: `Your forget password is OTP`,
      html,
      attachments
    });

    res.json({ ok: true, message: 'OTP sent' });
  } catch (e) {
    console.error('OTP request error:', e);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// helper: random token
function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex'); // 64 chars
}
/**
 * POST /v1/otp/verify
 * body: { email: string, code: string, purpose?: string }
 * Success → consumes (deletes) the OTP.
 */
router.post('/otp/verify', async (req, res) => {
  try {
    const email = (req.body?.email || '').trim().toLowerCase();
    const code  = (req.body?.code  || '').trim();
    if (!email || !code) return res.status(400).json({ error: 'Email and code are required.' });

    // 1) Fetch the latest OTP for this email
    const { data: latest, error: fetchErr } = await supabase
      .from('otp')
      .select('id,email,code,expires_at,created_at')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchErr) return res.status(500).json({ error: fetchErr.message });

    // No OTP ever created (or already auto-cleaned by cron) → ask to resend
    if (!latest) {
      return res.status(404).json({
        error: 'No OTP found for this email. Please request a new OTP.',
        action: 'request_otp'
      });
    }

    // 2) Check expiry
    const nowIso = new Date().toISOString();
    if (latest.expires_at <= nowIso) {
      // Optionally delete the expired OTP right away (cleanup)
      await supabase.from('otp').delete().eq('id', latest.id);

      return res.status(410).json({
        error: 'OTP expired. Please request a new OTP.',
        action: 'request_otp'
      });
    }

    // 3) Check code match
    if (latest.code !== code) {
      return res.status(400).json({
        error: 'Invalid OTP. Please check the code or request a new OTP.',
        action: 'request_otp'
      });
    }

    // 4) Success → consume OTP (delete)
    const { error: delErr } = await supabase.from('otp').delete().eq('id', latest.id);
    if (delErr) return res.status(500).json({ error: delErr.message });

    // 5) (Optional) Invalidate any previous reset tokens for this email
    // await supabase
    //   .from('password_reset_token')
    //   .update({ used_at: new Date().toISOString() })
    //   .eq('email', email)
    //   .is('used_at', null);

    // 6) (Optional) Issue a fresh reset token here if your flow needs it
    // const token = randomToken();
    // const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    // await supabase.from('password_reset_token').insert({ email, token, expires_at: expiresAt });
    // return res.json({ ok: true, resetToken: token, expiresInSec: 600 });

    // If you only need "verified" status (no token issuance here):
    return res.status(200).json({ ok: true, message: 'OTP verified.' });
  } catch (e) {
    console.error('OTP verify error:', e);
    return res.status(500).json({ error: 'Failed to verify OTP' });
  }
});





function normalizeEmail(v) { return (v || '').trim().toLowerCase(); }
function normalize(v) { return (v || '').trim(); }

router.post('/reset-password', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    // const resetToken = normalize(req.body?.resetToken);
    const password = normalize(req.body?.password);
    const confirmPassword = normalize(req.body?.confirmPassword);

    // if (!email || !resetToken || !password || !confirmPassword) {
      if (!email  || !password || !confirmPassword) {
      return res.status(400).json({ error: 'Email,  password, and confirm password are required.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    // 1) Strict check: exists, unused, not expired, matches email+token
    //    Add 5s grace to handle tiny client/server clock skew.
    const nowMinus5s = new Date(Date.now() - 5000).toISOString();

    // const { data: prt, error: selErr } = await supabase
    //   .from('password_reset_token')
    //   .select('id,email,token,expires_at,used_at,created_at')
    //   .eq('email', email)
    //   .eq('token', resetToken)
    //   .is('used_at', null)
    //   .gt('expires_at', nowMinus5s)
    //   .maybeSingle();

    // if (selErr) {
    //   return res.status(500).json({ error: selErr.message });
    // }

    // if (!prt) {
    //   // Debug assist: fetch latest to see what failed (remove in prod if you prefer)
    //   const { data: latest } = await supabase
    //     .from('password_reset_token')
    //     .select('id,email,token,expires_at,used_at,created_at')
    //     .eq('email', email)
    //     .order('created_at', { ascending: false })
    //     .limit(1)
    //     .maybeSingle();

    //   console.warn('reset-password strict match failed', {
    //     received: { email, now: new Date().toISOString() },
    //     latest, // inspect in server logs
    //   });

    //   return res.status(400).json({ error: 'Invalid or expired token.' });
    // }

    // 2) Update password in your staff table (hash first)
    // const hash = await bcrypt.hash(password, 10);

    const { error: updErr } = await supabase
      .from('staff')
      .update({ password_hash: password })
      .eq('email', email);

    if (updErr) {
      return res.status(500).json({ error: updErr.message });
    }

    // // 3) Mark token as used
    // const { error: markErr } = await supabase
    //   .from('password_reset_token')
    //   .update({ used_at: new Date().toISOString() })
    //   .eq('id', prt.id);

    // if (markErr) {
    //   // Not fatal for user, but log it
    //   console.error('Failed to mark token used', markErr);
    // }

    return res.json({ ok: true, message: 'Password reset successfully.' });
  } catch (e) {
    console.error('Reset password error:', e);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});




export default router;