import express from "express";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

/* =========================
   STATIC FILES
========================= */
app.use(express.static(join(__dirname, "..", "public")));

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
   SESSION (signed cookie)
========================= */
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-key-change-in-production";

function createSessionCookie(user) {
  // Create a signed session cookie with user data
  const userData = JSON.stringify({ id: user.id, email: user.email, role: user.role, name: user.name, displayName: user.name });
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(userData).digest('hex');
  return Buffer.from(userData).toString('base64') + '.' + signature;
}

function parseSessionCookie(cookie) {
  try {
    const [data, signature] = cookie.split('.');
    const userData = Buffer.from(data, 'base64').toString('utf-8');
    const expectedSignature = crypto.createHmac('sha256', SESSION_SECRET).update(userData).digest('hex');
    
    if (signature !== expectedSignature) {
      console.log('[SESSION] Invalid signature');
      return null;
    }
    
    return JSON.parse(userData);
  } catch (e) {
    console.log('[SESSION] Failed to parse session:', e.message);
    return null;
  }
}

function getUser(req) {
  const sessionCookie = req.headers.cookie?.split('session=')[1]?.split(';')[0];
  if (!sessionCookie) {
    console.log('[SESSION] No session cookie');
    return null;
  }
  const user = parseSessionCookie(sessionCookie);
  console.log('[SESSION] Parsed user:', user?.email);
  return user;
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
  const token = req.headers.cookie?.replace("session=", "");
  console.log('[API/ME] Cookie received:', token ? 'YES' : 'NO');
  const user = getUser(req);
  console.log('[API/ME] User found:', user ? `${user.email} (role: ${user.role})` : 'NO');
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
      .insert([{ name, email, password_hash, role: 'citizen' }])
      .select()
      .single();

    if (error) throw error;

    delete data.password_hash;
    // Add displayName for client compatibility
    data.displayName = data.name;

    console.log('[REGISTER] User created:', email, 'role:', data.role);
    const sessionCookie = createSessionCookie(data);

    res.setHeader("Set-Cookie", `session=${sessionCookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);

    res.json({
      ok: true,
      user: data,
    });
  } catch (err) {
    console.error('[REGISTER] Error:', err.message);
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

    const sessionCookie = createSessionCookie(user);
    console.log('[LOGIN] Session created for:', user.email, 'role:', user.role);
    res.setHeader("Set-Cookie", `session=${sessionCookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);

    res.json({
      ok: true,
      user,
    });
  } catch (err) {
    console.error('[LOGIN] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ========= LOGOUT ========= */
app.post("/api/auth/logout", (req, res) => {
  res.setHeader("Set-Cookie", "session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax");
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

/* =====================================================
   POLICE OPERATIONS
===================================================== */

/* Get all complaints for police verification */
app.get("/api/police/complaints", async (req, res) => {
  try {
    const user = getUser(req);
    if (!user || user.role !== "police")
      return res.status(401).json({ error: "Police access required" });

    const status = req.query.status || "submitted";

    const { data, error } = await supabase
      .from("complaints")
      .select(`
        id,
        user_id,
        title,
        description,
        category,
        status,
        priority,
        created_at,
        updated_at
      `)
      .eq("status", status)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Fetch user details for each complaint
    const complaintsWithUsers = await Promise.all(
      data.map(async (complaint) => {
        const { data: userData } = await supabase
          .from("users")
          .select("id, name, email")
          .eq("id", complaint.user_id)
          .single();
        return {
          ...complaint,
          reporter: {
            id: userData?.id,
            displayName: userData?.name,
            email: userData?.email,
          },
        };
      })
    );

    res.json({ ok: true, complaints: complaintsWithUsers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* Update complaint status and award rewards */
app.post("/api/police/complaints/:id/status", async (req, res) => {
  try {
    const user = getUser(req);
    if (!user || user.role !== "police")
      return res.status(401).json({ error: "Police access required" });

    const { id } = req.params;
    const { status } = req.body || {};

    if (!status || !["verified", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    // Get complaint
    const { data: complaint, error: complaintError } = await supabase
      .from("complaints")
      .select("*")
      .eq("id", id)
      .single();

    if (complaintError || !complaint)
      return res.status(404).json({ error: "Complaint not found" });

    // Update complaint status
    const { data: updated, error: updateError } = await supabase
      .from("complaints")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Award reward if verified
    if (status === "verified") {
      const rewardAmount = parseInt(process.env.COMPLAINT_REWARD_AMOUNT, 10) || 500;
      const currency = process.env.CURRENCY || "INR";

      console.log('[REWARD] Creating reward - user_id:', complaint.user_id, 'amount:', rewardAmount, 'currency:', currency);

      const { error: rewardError } = await supabase
        .from("rewards")
        .insert([
          {
            user_id: complaint.user_id,
            amount: rewardAmount,
            currency,
            source_type: "complaint_verified",
            status: "awarded",
          },
        ]);

      console.log('[REWARD] Insert result - error:', rewardError);
      if (rewardError) throw rewardError;
    }

    res.json({ ok: true, complaint: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* Get rewards history */
app.get("/api/police/rewards-history", async (req, res) => {
  try {
    const user = getUser(req);
    if (!user || user.role !== "police")
      return res.status(401).json({ error: "Police access required" });

    console.log('[POLICE REWARDS] Fetching rewards for police user:', user.id);

    const { data, error } = await supabase
      .from("rewards")
      .select(`
        id,
        user_id,
        amount,
        currency,
        source_type,
        status,
        created_at
      `)
      .order("created_at", { ascending: false });

    console.log('[POLICE REWARDS] Query result - error:', error, 'data:', data);

    if (error) throw error;

    // Fetch user data for each reward
    const rewardsWithUsers = await Promise.all(
      data.map(async (reward) => {
        const { data: userData } = await supabase
          .from("users")
          .select("name, email")
          .eq("id", reward.user_id)
          .single();
        return {
          ...reward,
          user_name: userData?.name,
          user_email: userData?.email,
        };
      })
    );

    console.log('[POLICE REWARDS] Final response:', rewardsWithUsers);
    res.json({ ok: true, rewards: rewardsWithUsers });
  } catch (err) {
    console.error('[POLICE REWARDS] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* Test endpoint - Check rewards table directly */
app.get("/api/test/rewards-count", async (req, res) => {
  try {
    const { data, count, error } = await supabase
      .from("rewards")
      .select("id", { count: "exact" });
    
    res.json({ 
      error: error?.message || null, 
      count, 
      sample: data?.slice(0, 3) 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default app;