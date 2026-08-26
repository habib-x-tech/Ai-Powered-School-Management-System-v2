import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'school.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','teacher','student'))
  );
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    class_name TEXT,
    roll_no TEXT,
    attendance REAL DEFAULT 0,
    marks REAL DEFAULT 0
  );
`);

const count = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
if (!count) {
  const insert = db.prepare('INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)');
  insert.run('Administrator', 'admin@school.local', bcrypt.hashSync('admin123', 10), 'admin');
  insert.run('Demo Teacher', 'teacher@school.local', bcrypt.hashSync('teacher123', 10), 'teacher');
  insert.run('Demo Student', 'student@school.local', bcrypt.hashSync('student123', 10), 'student');
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true, database: 'SQLite' }));

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT id,name,email,password,role FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password || '', user.password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  delete user.password;
  res.json({ user });
});

app.get('/api/students', (_req, res) => {
  res.json(db.prepare('SELECT * FROM students ORDER BY id DESC').all());
});

app.post('/api/students', (req, res) => {
  const { name, class_name = '', roll_no = '' } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Student name is required' });
  const result = db.prepare('INSERT INTO students (name,class_name,roll_no) VALUES (?,?,?)').run(name, class_name, roll_no);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.listen(5000, () => console.log('API running at http://localhost:5000'));
