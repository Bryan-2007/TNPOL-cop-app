import express from "express";
import { createClient } from "@supabase/supabase-js";

const app = express();

app.use(express.json());

/* =========================
   SUPABASE CONFIG
========================= */

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/* =========================
   HEALTH CHECK
========================= */

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Server running on Vercel",
  });
});

/* =========================
   BASIC TEST ROUTE
========================= */

app.get("/api/me", (req, res) => {
  res.json({
    success: true,
    message: "API working",
  });
});

/* =========================
   DATABASE TEST ROUTE
========================= */

app.get("/api/db-test", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("test")     // table name in Supabase
      .select("*")
      .limit(1);

    if (error) throw error;

    res.json({
      success: true,
      message: "Database connected successfully",
      data,
    });
  } catch (err) {
    console.error("DB ERROR:", err.message);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/* =========================
   INSERT TEST
========================= */

app.get("/api/db-insert", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("test")
      .insert([
        {
          // created_at auto generated
        },
      ])
      .select();

    if (error) throw error;

    res.json({
      success: true,
      message: "Record inserted",
      data,
    });
  } catch (err) {
    console.error("INSERT ERROR:", err.message);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/* =========================
   DATABASE UPDATE TEST
========================= */

app.get("/api/db-update", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("test")
      .update({ created_at: new Date() })
      .eq("id", 2)
      .select();

    if (error) throw error;

    res.json({
      success: true,
      message: "Record updated",
      data,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/* =========================
   EXPORT FOR VERCEL
========================= */

export default app;