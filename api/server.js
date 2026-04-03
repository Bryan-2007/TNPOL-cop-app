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
   DATABASE DELETE TEST
========================= */

app.get("/api/db-delete", async (req, res) => {
  try {
    const { error } = await supabase
      .from("test")
      .delete()
      .eq("id", 2);

    if (error) throw error;

    res.json({
      success: true,
      message: "Record deleted",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/* =========================
   CONNECTING DATABASE WITH FRONTEND
========================= */

/* =========================
   COMPLAINT API ROUTES
========================= */

app.post("/api/complaints", async (req, res) => {
  try {
    const { user_id, station_id, title, description, category, priority } = req.body;

    const { data, error } = await supabase
      .from("complaints")
      .insert([{ user_id, station_id, title, description, category, priority }])
      .select();

    if (error) throw error;

    res.json({ success: true, message: "Complaint created", data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/complaints", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("complaints")
      .select(`*, users(name,email), police_stations(station_name,district)`)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/complaints/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("complaints")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch("/api/complaints/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, priority } = req.body;

    const { data, error } = await supabase
      .from("complaints")
      .update({ status, priority, updated_at: new Date() })
      .eq("id", id)
      .select();

    if (error) throw error;

    res.json({ success: true, message: "Complaint updated", data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/api/complaints/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase.from("complaints").delete().eq("id", id);

    if (error) throw error;

    res.json({ success: true, message: "Complaint deleted" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =========================
   EXPORT FOR VERCEL
========================= */

export default app;