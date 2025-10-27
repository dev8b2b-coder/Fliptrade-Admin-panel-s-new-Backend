// routes/staff.js
import express from 'express';
import supabase from './supabase.js';
// (keep your other imports if you need them later)

const router = express.Router();

/**
 * GET /staff
 * Query params (optional):
 *  - status=active|inactive
 *  - q=search text (name/email/role)
 *  - limit=50
 *  - offset=0
 *  - order=created_at|name|email
 *  - dir=asc|desc
 */
router.get('/staff', async (req, res) => {
  try {
    const {
      status,
      q,
      limit = 50,
      offset = 0,
      order = 'created_at',
      dir = 'desc',
    } = req.query;

    let query = supabase
      .from('staff')
      .select('*', { count: 'exact' })
      .order(order, { ascending: String(dir).toLowerCase() === 'asc' })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status) query = query.eq('status', String(status).toLowerCase()); // 'active' | 'inactive'

    if (q && String(q).trim()) {
      const s = String(q).trim();
      // search in name/email/role
      query = query.or(`name.ilike.%${s}%,email.ilike.%${s}%,role.ilike.%${s}%`);
    }

    const { data, error, count } = await query;
    if (error) {
      console.error('[GET /staff] Supabase error:', error);
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.json({
      ok: true,
      count,
      limit: Number(limit),
      offset: Number(offset),
      data,
    });
  } catch (err) {
    console.error('[GET /staff] Unexpected error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
});


router.post("/staff/change-password", async (req, res) => {
    try {
      const { email, currentPassword, newPassword, confirmPassword } = req.body;
  
      // 1️⃣ Validate input
      if (!email || !currentPassword || !newPassword || !confirmPassword) {
        return res
          .status(400)
          .json({ error: "All fields are required (email, current, new, confirm)." });
      }
  
      if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: "New passwords do not match." });
      }
  
      if (newPassword.length < 8) {
        return res
          .status(400)
          .json({ error: "Password must be at least 8 characters long." });
      }
  
      // 2️⃣ Fetch staff by email
      const { data: user, error: fetchErr } = await supabase
        .from("staff")
        .select("id, email, password_hash")
        .ilike("email", email.trim())
        .maybeSingle();
  
      if (fetchErr) {
        console.error("[Supabase Fetch Error]", fetchErr.message);
        return res.status(500).json({ error: "Database error fetching user." });
      }
  
      if (!user) {
        return res.status(404).json({ error: "No user found for this email." });
      }
  
      // 3️⃣ Compare plain passwords directly
      if (user.password_hash !== currentPassword) {
        return res.status(400).json({ error: "Current password is incorrect." });
      }
  
      // 4️⃣ Update password directly
      const { error: updateErr } = await supabase
        .from("staff")
        .update({ password_hash: newPassword })
        .eq("id", user.id);
  
      if (updateErr) {
        console.error("[Supabase Update Error]", updateErr.message);
        return res.status(500).json({ error: "Failed to update password." });
      }
  
      // 5️⃣ Success
      return res.json({ ok: true, message: "Password updated successfully." });
    } catch (err) {
      console.error("[Change Password Error]", err);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  });
export default router;


