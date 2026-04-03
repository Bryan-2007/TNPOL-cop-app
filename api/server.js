const path = require('path');
const crypto = require('crypto');

const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const multer = require('multer');
const { Pool } = require('pg');
const { put } = require('@vercel/blob');
const pgSession = require('connect-pg-simple')(session);

const app = express();

/* =====================================================
   ENV CONFIG
===================================================== */

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-change-me';

const COMPLAINT_REWARD_AMOUNT =
  Number(process.env.COMPLAINT_REWARD_AMOUNT || 1000);

const REFERRAL_REWARD_AMOUNT =
  Number(process.env.REFERRAL_REWARD_AMOUNT || 500);

const CURRENCY = process.env.CURRENCY || 'INR';

/* =====================================================
   DATABASE (Supabase Postgres)
===================================================== */

const pool = new Pool({
  connectionString:
    process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error', err);
});

const sessionStore = new pgSession({
  pool,
  tableName: 'session',
  createTableIfMissing: true,
});

/* =====================================================
   DB INIT (RUN ONLY ONCE PER INSTANCE)
===================================================== */

let dbInitialized = false;

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        referral_code TEXT UNIQUE NOT NULL,
        referrer_user_id TEXT NULL,
        created_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS police_users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS complaints (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        location_tag TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'submitted',
        created_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS complaint_images (
        id TEXT PRIMARY KEY,
        complaint_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        created_at BIGINT NOT NULL
      );
    `);

    console.log('[DB] Initialized');
  } finally {
    client.release();
  }
}

async function ensureDb(req, res, next) {
  if (!dbInitialized) {
    await initDb();
    dbInitialized = true;
  }
  next();
}

/* =====================================================
   MIDDLEWARE
===================================================== */

app.use(ensureDb);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(
  session({
    store:
      process.env.NODE_ENV === 'production'
        ? sessionStore
        : undefined,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 30,
    },
  })
);

/* =====================================================
   HELPERS
===================================================== */

function randomId() {
  return crypto.randomBytes(16).toString('hex');
}

function requireUser(req, res, next) {
  if (!req.session.userId)
    return res.status(401).json({ error: 'Not logged in' });
  next();
}

/* =====================================================
   AUTH
===================================================== */

app.post('/api/auth/register', async (req, res) => {
  try {
    const email = String(req.body.email || '').toLowerCase();
    const password = String(req.body.password || '');
    const displayName = String(req.body.displayName || '');

    if (!email || !password || !displayName)
      return res.status(400).json({ error: 'Missing fields' });

    const existing = await pool.query(
      'SELECT id FROM users WHERE email=$1',
      [email]
    );

    if (existing.rows.length)
      return res.status(409).json({ error: 'Email exists' });

    const id = randomId();
    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO users
       (id,email,password_hash,display_name,referral_code,created_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, email, hash, displayName, randomId().slice(0, 6), Date.now()]
    );

    req.session.userId = id;

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

/* =====================================================
   FILE UPLOAD (VERCEL BLOB ONLY)
===================================================== */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

app.post(
  '/api/complaints',
  requireUser,
  upload.array('evidence', 10),
  async (req, res) => {
    try {
      const complaintId = randomId();

      await pool.query(
        `INSERT INTO complaints
         (id,user_id,location_tag,description,created_at)
         VALUES ($1,$2,$3,$4,$5)`,
        [
          complaintId,
          req.session.userId,
          req.body.locationTag,
          req.body.description,
          Date.now(),
        ]
      );

      const files = req.files || [];

      for (const f of files) {
        const filename = `${randomId()}.png`;

        const blob = await put(
          `complaints/${complaintId}/${filename}`,
          f.buffer,
          {
            access: 'public',
            contentType: f.mimetype,
          }
        );

        await pool.query(
          `INSERT INTO complaint_images
           (id,complaint_id,file_path,created_at)
           VALUES ($1,$2,$3,$4)`,
          [randomId(), complaintId, blob.url, Date.now()]
        );
      }

      res.json({ ok: true, complaintId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Upload failed' });
    }
  }
);

/* =====================================================
   HEALTH CHECK
===================================================== */

app.get('/api/health', (_, res) => {
  res.json({ status: 'ok' });
});

/* =====================================================
   EXPORT (CRITICAL FOR VERCEL)
===================================================== */

module.exports = app;