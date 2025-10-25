// routes/forgetPassword.js
import express from 'express';
import supabase from './supabase.js';
const router=express.Router();
// console.log("from the forget router");

router.get('/describe/otp', async (req, res) => {
  const { data, error } = await supabase.from('otp').select('*');
  // console.log("Data is ",data);
  
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

export default router;
