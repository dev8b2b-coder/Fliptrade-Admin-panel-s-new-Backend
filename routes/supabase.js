import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import express from 'express';


dotenv.config();
const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY // or SERVICE_ROLE key on server only
);

// console.log(supabase);


export default supabase;