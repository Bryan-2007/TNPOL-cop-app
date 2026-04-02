const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

require('dotenv').config();

const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const multer = require('multer');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-change-me';

const COMPLAINT_REWARD_AMOUNT = process.env.COMPLAINT_REWARD_AMOUNT
  ? Number(process.env.COMPLAINT_REWARD_AMOUNT)
  : 1000;
const REFERRAL_REWARD_AMOUNT = process.env.REFERRAL_REWARD_AMOUNT
  ? Number(process.env.REFERRAL_REWARD_AMOUNT)
  : 500;
const CURRENCY = process.env.CURRENCY || 'INR';

const ROOT_DIR = __dirname;
const DB_PATH = process.env.DB_PATH || path.join(ROOT_DIR, 'data', 'tnpol.db');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(ROOT_DIR, 'uploads');

fs.mkdirSync(path.join(ROOT_DIR, 'data'), { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ---------- Database ----------
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      referral_code TEXT UNIQUE NOT NULL,
      referrer_user_id TEXT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(referrer_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS police_users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      location_tag TEXT NOT NULL,
      description TEXT NOT NULL,
      identity_text TEXT NULL,
      crime_type TEXT NULL,
      reporter_name TEXT NULL,
      reporter_phone TEXT NULL,
      status TEXT NOT NULL CHECK (status IN ('submitted','verified','rejected')) DEFAULT 'submitted',
      police_notes TEXT NULL,
      verified_at INTEGER NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS complaint_images (
      id TEXT PRIMARY KEY,
      complaint_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(complaint_id) REFERENCES complaints(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS referrals (
      id TEXT PRIMARY KEY,
      referrer_user_id TEXT NOT NULL,
      referred_user_id TEXT NOT NULL UNIQUE,
      reward_amount INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(referrer_user_id) REFERENCES users(id),
      FOREIGN KEY(referred_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS rewards (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK (source_type IN ('complaint','referral')),
      source_id TEXT NULL,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending','paid')) DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_rewards_user_id ON rewards(user_id);
    CREATE INDEX IF NOT EXISTS idx_complaints_user_id ON complaints(user_id);
  `);

  // Seed police user for MVP.
  const policeCount = db.prepare('SELECT COUNT(*) as c FROM police_users').get().c;
  if (policeCount === 0) {
    const username = process.env.POLICE_USERNAME || 'admin';
    const password = process.env.POLICE_PASSWORD || 'admin123';
    const id = randomId();
    const password_hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO police_users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)').run(
      id,
      username,
      password_hash,
      Date.now()
    );
    console.log(`[TNPOL] Seeded police login: ${username} / ${password}`);
  }
}

function randomId() {
  return crypto.randomBytes(16).toString('hex');
}

function randomReferralCode() {
  // Short human-friendly code.
  return crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 chars
}

function ensureUniqueReferralCode() {
  for (let i = 0; i < 10; i++) {
    const code = randomReferralCode();
    const exists = db.prepare('SELECT id FROM users WHERE referral_code = ?').get(code);
    if (!exists) return code;
  }
  // Extremely unlikely; fall back.
  return `${randomReferralCode()}${randomReferralCode().slice(0, 2)}`;
}

initDb();

// ---------- Middleware ----------
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 1000 * 60 * 60 * 24 * 30,
    },
  })
);

app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(ROOT_DIR, 'public')));

function requireUser(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  return next();
}

function requirePolice(req, res, next) {
  if (!req.session.policeUserId) return res.status(401).json({ error: 'Police login required' });
  return next();
}

function userPublicFields(userRow) {
  return {
    id: userRow.id,
    email: userRow.email,
    displayName: userRow.display_name,
    referralCode: userRow.referral_code,
    referrerUserId: userRow.referrer_user_id,
  };
}

// ---------- Auth ----------
app.post('/api/auth/register', async (req, res) => {
  try {
    const wantsJson = (req.headers['content-type'] || '').includes('application/json');
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const displayName = String(req.body.displayName || '').trim();
    const referralCode = req.body.referralCode ? String(req.body.referralCode).trim().toUpperCase() : null;

    if (!email || !password || !displayName) return res.status(400).json({ error: 'Missing fields' });
    if (password.length < 6) return res.status(400).json({ error: 'Password too short' });

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const id = randomId();
    const password_hash = bcrypt.hashSync(password, 10);
    const referral_unique = ensureUniqueReferralCode();

    const referrer = referralCode
      ? db.prepare('SELECT id FROM users WHERE referral_code = ?').get(referralCode)
      : null;

    const created_at = Date.now();
    const insert = db.prepare(`
      INSERT INTO users (id, email, password_hash, display_name, referral_code, referrer_user_id, created_at)
      VALUES (@id, @email, @password_hash, @display_name, @referral_code, @referrer_user_id, @created_at)
    `);
    insert.run({
      id,
      email,
      password_hash,
      display_name: displayName,
      referral_code: referral_unique,
      referrer_user_id: referrer ? referrer.id : null,
      created_at,
    });

    // Referral reward: credited to the referrer immediately after referred user registers.
    if (referrer) {
      const referralId = randomId();
      const insertReferral = db.prepare(`
        INSERT OR IGNORE INTO referrals (id, referrer_user_id, referred_user_id, reward_amount, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      insertReferral.run(referralId, referrer.id, id, REFERRAL_REWARD_AMOUNT, created_at);

      const referralRow = db.prepare('SELECT id FROM referrals WHERE referred_user_id = ?').get(id);
      if (referralRow) {
        const rewardExists = db.prepare(
          `SELECT id FROM rewards WHERE source_type = 'referral' AND source_id = ? AND user_id = ?`
        ).get(referralRow.id, referrer.id);
        if (!rewardExists) {
          db.prepare(`
            INSERT INTO rewards (id, user_id, source_type, source_id, amount, status, created_at)
            VALUES (?, ?, 'referral', ?, ?, 'pending', ?)
          `).run(randomId(), referrer.id, referralRow.id, REFERRAL_REWARD_AMOUNT, created_at);
        }
      }
    }

    req.session.userId = id;
    const payload = {
      ok: true,
      user: userPublicFields(db.prepare('SELECT * FROM users WHERE id = ?').get(id)),
    };

    // If this was submitted by an HTML form (not fetch JSON), redirect so the button works.
    if (!wantsJson) return res.redirect('/');
    return res.json(payload);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const wantsJson = (req.headers['content-type'] || '').includes('application/json');
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Missing fields' });

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    req.session.userId = user.id;
    const payload = { ok: true, user: userPublicFields(user) };
    if (!wantsJson) return res.redirect('/');
    return res.json(payload);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/me', requireUser, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  return res.json({ user: userPublicFields(user) });
});

// ---------- Logout / Feedback ----------
app.post('/api/auth/logout', requireUser, (req, res) => {
  req.session.destroy(() => {
    return res.json({ ok: true });
  });
});

app.post('/api/feedback', requireUser, (req, res) => {
  try {
    const message = String(req.body.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Message is required' });
    const id = randomId();
    db.prepare(
      'INSERT INTO feedback (id, user_id, message, created_at) VALUES (?, ?, ?, ?)'
    ).run(id, req.session.userId, message, Date.now());
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ---------- Police Auth ----------
app.post('/api/police/login', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });

    const police = db.prepare('SELECT * FROM police_users WHERE username = ?').get(username);
    if (!police) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, police.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    req.session.policeUserId = police.id;
    req.session.policeUsername = police.username;
    return res.json({ ok: true, username: police.username });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/police/me', requirePolice, (req, res) => {
  return res.json({ ok: true, username: req.session.policeUsername || 'police' });
});

// ---------- Complaints ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB each
  },
});

app.post('/api/complaints', requireUser, upload.array('evidence', 10), async (req, res) => {
  try {
    const userId = req.session.userId;

    const locationTag = String(req.body.locationTag || '').trim();
    const description = String(req.body.description || '').trim();
    const crimeType = String(req.body.crimeType || '').trim();
    const reporterName = req.body.reporterName ? String(req.body.reporterName).trim() : null;
    const reporterPhone = req.body.reporterPhone ? String(req.body.reporterPhone).trim() : null;
    const identityTextRaw = req.body.identityText ? String(req.body.identityText).trim() : '';
    const identityText = identityTextRaw ? identityTextRaw : null;

    if (!locationTag || !description || !crimeType) return res.status(400).json({ error: 'locationTag, description, and crimeType required' });

    const id = randomId();
    const created_at = Date.now();

    db.prepare(`
      INSERT INTO complaints (id, user_id, location_tag, description, identity_text, crime_type, reporter_name, reporter_phone, status, police_notes, verified_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'submitted', NULL, NULL, ?)
    `).run(id, userId, locationTag, description, identityText, crimeType, reporterName, reporterPhone, created_at);

    const complaintImagesDir = path.join(UPLOADS_DIR, 'complaint-images', id);
    fs.mkdirSync(complaintImagesDir, { recursive: true });

    const files = Array.isArray(req.files) ? req.files : [];
    for (const f of files) {
      // Basic sanitization.
      const ext = path.extname(f.originalname || '').toLowerCase() || '';
      const allowed = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
      const safeExt = allowed.includes(ext) ? ext : '.png';
      const filename = `${randomId()}${safeExt}`;
      const fullPath = path.join(complaintImagesDir, filename);
      fs.writeFileSync(fullPath, f.buffer);

      const file_path = `/complaint-images/${id}/${filename}`;
      db.prepare(`
        INSERT INTO complaint_images (id, complaint_id, file_path, created_at)
        VALUES (?, ?, ?, ?)
      `).run(randomId(), id, file_path, created_at);
    }

    return res.json({ ok: true, complaintId: id });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/complaints/mine', requireUser, (req, res) => {
  const userId = req.session.userId;
  const complaints = db
    .prepare(`
      SELECT * FROM complaints WHERE user_id = ? ORDER BY created_at DESC
    `)
    .all(userId);

  const withImages = complaints.map((c) => {
    const imgs = db
      .prepare('SELECT file_path FROM complaint_images WHERE complaint_id = ? ORDER BY created_at DESC')
      .all(c.id);
    return {
      id: c.id,
      locationTag: c.location_tag,
      description: c.description,
      identityText: c.identity_text,
      crimeType: c.crime_type,
      reporterName: c.reporter_name,
      reporterPhone: c.reporter_phone,
      status: c.status,
      policeNotes: c.police_notes,
      verifiedAt: c.verified_at,
      createdAt: c.created_at,
      images: imgs.map((i) => `/uploads${i.file_path}`),
    };
  });

  res.json({ complaints: withImages });
});

// ---------- Police view / verify ----------
app.get('/api/police/complaints', requirePolice, (req, res) => {
  const status = req.query.status ? String(req.query.status) : 'submitted';
  const allowed = ['submitted', 'verified', 'rejected'];
  const safeStatus = allowed.includes(status) ? status : 'submitted';

  const rows = db.prepare(
    `
      SELECT c.*, u.display_name, u.email
      FROM complaints c
      JOIN users u ON u.id = c.user_id
      WHERE c.status = ?
      ORDER BY c.created_at DESC
    `
  ).all(safeStatus);

  const result = rows.map((c) => {
    const imgs = db
      .prepare('SELECT file_path FROM complaint_images WHERE complaint_id = ? ORDER BY created_at DESC')
      .all(c.id);

    return {
      id: c.id,
      locationTag: c.location_tag,
      description: c.description,
      identityText: c.identity_text,
      crimeType: c.crime_type,
      reporterName: c.reporter_name,
      reporterPhone: c.reporter_phone,
      reporter: {
        userId: c.user_id,
        displayName: c.display_name,
        email: c.email,
      },
      status: c.status,
      policeNotes: c.police_notes,
      verifiedAt: c.verified_at,
      createdAt: c.created_at,
      images: imgs.map((i) => `/uploads${i.file_path}`),
    };
  });

  res.json({ complaints: result });
});

app.post('/api/police/complaints/:id/action', requirePolice, (req, res) => {
  try {
    const complaintId = req.params.id;
    const action = String(req.body.action || '').trim(); // verify|reject
    const policeNotes = req.body.policeNotes ? String(req.body.policeNotes).trim() : null;
    const now = Date.now();

    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(complaintId);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    if (!['verify', 'reject'].includes(action)) return res.status(400).json({ error: 'Invalid action' });

    if (action === 'reject') {
      db.prepare(`
        UPDATE complaints
        SET status = 'rejected', police_notes = ?, verified_at = NULL
        WHERE id = ?
      `).run(policeNotes, now, complaintId);
      return res.json({ ok: true });
    }

    // Verify
    db.prepare(`
      UPDATE complaints
      SET status = 'verified', police_notes = ?, verified_at = ?
      WHERE id = ?
    `).run(policeNotes, now, complaintId);

    // Create complaint reward once.
    const already = db.prepare(`
      SELECT id FROM rewards
      WHERE source_type = 'complaint' AND source_id = ? AND user_id = ?
    `).get(complaintId, complaint.user_id);

    if (!already) {
      db.prepare(`
        INSERT INTO rewards (id, user_id, source_type, source_id, amount, status, created_at)
        VALUES (?, ?, 'complaint', ?, ?, 'pending', ?)
      `).run(randomId(), complaint.user_id, complaintId, COMPLAINT_REWARD_AMOUNT, now);
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ---------- Rewards ----------
app.get('/api/rewards/mine', requireUser, (req, res) => {
  const userId = req.session.userId;
  const rows = db
    .prepare(`
      SELECT id, source_type, source_id, amount, status, created_at
      FROM rewards
      WHERE user_id = ?
      ORDER BY created_at DESC
    `)
    .all(userId);

  const formatted = rows.map((r) => ({
    id: r.id,
    sourceType: r.source_type,
    sourceId: r.source_id,
    amount: r.amount,
    currency: CURRENCY,
    status: r.status,
    createdAt: r.created_at,
  }));

  res.json({ rewards: formatted });
});

// ---------- App pages ----------
app.get('/', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'public', 'index.html'));
});

app.get('/police', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'public', 'police.html'));
});

app.get('/rewards', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'public', 'rewards.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'public', 'register.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'public', 'login.html'));
});

app.use((req, res) => {
  res.status(404).send('Not found');
});

app.listen(PORT, () => {
  console.log(`[TNPOL] Listening on http://localhost:${PORT}`);
});

