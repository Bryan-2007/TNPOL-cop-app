import express from "express";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcrypt";
import crypto from "crypto";

const app = express();

/* =========================
   BODY PARSERS
========================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   SUPABASE
========================= */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

/* =========================
   SIMPLE SESSION (cookie)
========================= */
const sessions = new Map();

function createSession(user) {
  const token = crypto.randomUUID();
  sessions.set(token, user);
  return token;
}

function getUser(req) {
  const token = req.headers.cookie?.replace("session=", "");
  if (!token) return null;
  return sessions.get(token) || null;
}

/* =========================
   HEALTH
========================= */
app.get("/api/health", (_, res) => {
  res.json({ status: "ok" });
});

/* =========================
   CURRENT USER
========================= */
app.get("/api/me", (req, res) => {
  const user = getUser(req);
  res.json({ user: user || null });
});

/* =====================================================
   AUTH
===================================================== */

/* ========= REGISTER ========= */
app.post("/api/auth/register", async (req, res) => {
  try {
    let { name, email, password } = req.body || {};

    name = name?.trim() || "";
    email = email?.trim() || "";
    password = password?.trim() || "";

    if (!name || !email || !password)
      return res.status(400).json({ error: "Missing fields" });

    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existing)
      return res.status(400).json({ error: "User already exists" });

    const password_hash = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from("users")
      .insert([{ name, email, password_hash }])
      .select()
      .single();

    if (error) throw error;

    delete data.password_hash;
    // Add displayName for client compatibility
    data.displayName = data.name;

    const token = createSession(data);

    res.setHeader("Set-Cookie", `session=${token}; Path=/; HttpOnly`);

    res.json({
      ok: true,
      user: data,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ========= LOGIN ========= */
app.post("/api/auth/login", async (req, res) => {
  try {
    let { email, password } = req.body || {};

    email = email?.trim() || "";
    password = password?.trim() || "";

    if (!email || !password)
      return res.status(400).json({ error: "Email and password required" });

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (error || !user)
      return res.status(401).json({ error: "Invalid credentials" });

    const match = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!match)
      return res.status(401).json({ error: "Invalid credentials" });

    delete user.password_hash;
    // Add displayName for client compatibility
    user.displayName = user.name;

    const token = createSession(user);
    res.setHeader("Set-Cookie", `session=${token}; Path=/; HttpOnly`);

    res.json({
      ok: true,
      user,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ========= LOGOUT ========= */
app.post("/api/auth/logout", (req, res) => {
  const token = req.headers.cookie?.replace("session=", "");
  if (token) sessions.delete(token);

  res.setHeader("Set-Cookie", "session=; Max-Age=0; Path=/");
  res.json({ ok: true });
});

/* =====================================================
   COMPLAINTS
===================================================== */

app.post("/api/complaints", async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: "Login required" });

    const {
      title,
      description,
      category,
    } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: "Title and description are required" });
    }

    const { data, error } = await supabase
      .from("complaints")
      .insert([
        {
          user_id: user.id,
          title,
          description,
          category,
          status: "submitted",
          priority: "normal",
        },
      ])
      .select()
      .single();

    if (error) throw error;

    res.json({ ok: true, complaint: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* user's complaints */
app.get("/api/complaints/mine", async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: "Login required" });

    const { data, error } = await supabase
      .from("complaints")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({ ok: true, complaints: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================
   REWARDS
===================================================== */

app.get("/api/rewards/mine", async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: "Login required" });

    const { data, error } = await supabase
      .from("rewards")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({ ok: true, rewards: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default app;