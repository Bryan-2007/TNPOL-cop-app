import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ================================
   VERCEL SAFE UPLOAD DIRECTORY
   ================================ */

// Only writable location in Vercel
const uploadDir = "/tmp/uploads";

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/* ================================
   MULTER CONFIG
   ================================ */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

/* ================================
   ROUTES
   ================================ */

// Health check (VERY IMPORTANT)
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Server running on Vercel",
  });
});

// Example protected route
app.get("/api/me", (req, res) => {
  res.json({
    success: true,
    message: "API working",
  });
});

// Example upload route
app.post("/api/upload", upload.single("file"), (req, res) => {
  res.json({
    success: true,
    file: req.file,
  });
});

/* ================================
   ERROR HANDLER
   ================================ */

app.use((err, req, res, next) => {
  console.error("Server Error:", err);
  res.status(500).json({
    error: "Internal Server Error",
  });
});

/* ================================
   EXPORT FOR VERCEL SERVERLESS
   ================================ */

export default app;