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
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','teacher','student')),created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS classes (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,section TEXT DEFAULT '',room TEXT DEFAULT '',teacher_id INTEGER);
CREATE TABLE IF NOT EXISTS subjects (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,code TEXT DEFAULT '',class_name TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,name TEXT NOT NULL,class_name TEXT DEFAULT '',roll_no TEXT DEFAULT '',guardian TEXT DEFAULT '',phone TEXT DEFAULT '',attendance REAL DEFAULT 0,marks REAL DEFAULT 0);
CREATE TABLE IF NOT EXISTS teachers (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,name TEXT NOT NULL,subject TEXT DEFAULT '',phone TEXT DEFAULT '',class_name TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL,date TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('present','absent','late')));
CREATE TABLE IF NOT EXISTS exams (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,class_name TEXT DEFAULT '',subject TEXT DEFAULT '',exam_date TEXT DEFAULT '',max_marks REAL DEFAULT 100);
CREATE TABLE IF NOT EXISTS marks (id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL,exam_id INTEGER NOT NULL,marks REAL NOT NULL DEFAULT 0,UNIQUE(student_id,exam_id));
CREATE TABLE IF NOT EXISTS notices (id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,message TEXT NOT NULL,audience TEXT DEFAULT 'all',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS quizzes (id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,subject TEXT DEFAULT '',class_name TEXT DEFAULT '',questions INTEGER DEFAULT 0,status TEXT DEFAULT 'draft');
CREATE TABLE IF NOT EXISTS timetable (id INTEGER PRIMARY KEY AUTOINCREMENT,day TEXT NOT NULL,period TEXT NOT NULL,class_name TEXT NOT NULL,subject TEXT NOT NULL,teacher TEXT DEFAULT '',room TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT,action TEXT NOT NULL,actor TEXT DEFAULT '',details TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
`);

const userCount = db.prepare('SELECT COUNT(*) count FROM users').get().count;
if (!userCount) {
  const add = db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)');
  add.run('Administrator','admin@school.local',bcrypt.hashSync('admin123',10),'admin');
  const t = add.run('Demo Teacher','teacher@school.local',bcrypt.hashSync('teacher123',10),'teacher');
  const s = add.run('Demo Student','student@school.local',bcrypt.hashSync('student123',10),'student');
  db.prepare('INSERT INTO teachers(user_id,name,subject,phone,class_name) VALUES(?,?,?,?,?)').run(t.lastInsertRowid,'Demo Teacher','Mathematics','9999999999','Class 10');
  const student = db.prepare('INSERT INTO students(user_id,name,class_name,roll_no,guardian,phone,attendance,marks) VALUES(?,?,?,?,?,?,?,?)').run(s.lastInsertRowid,'Demo Student','Class 10','01','Demo Guardian','9999999998',92,84);
  db.prepare('INSERT INTO classes(name,section,room) VALUES(?,?,?)').run('Class 10','A','101');
  db.prepare('INSERT INTO subjects(name,code,class_name) VALUES(?,?,?)').run('Mathematics','MATH10','Class 10');
  db.prepare('INSERT INTO subjects(name,code,class_name) VALUES(?,?,?)').run('Science','SCI10','Class 10');
  const exam = db.prepare('INSERT INTO exams(name,class_name,subject,exam_date,max_marks) VALUES(?,?,?,?,?)').run('Unit Test 1','Class 10','Mathematics','2026-09-15',100);
  db.prepare('INSERT INTO marks(student_id,exam_id,marks) VALUES(?,?,?)').run(student.lastInsertRowid,exam.lastInsertRowid,84);
  db.prepare('INSERT INTO notices(title,message,audience) VALUES(?,?,?)').run('Welcome','Welcome to the school management portal.','all');
  db.prepare('INSERT INTO quizzes(title,subject,class_name,questions,status) VALUES(?,?,?,?,?)').run('Algebra Basics','Mathematics','Class 10',10,'published');
  db.prepare('INSERT INTO timetable(day,period,class_name,subject,teacher,room) VALUES(?,?,?,?,?,?)').run('Monday','1','Class 10','Mathematics','Demo Teacher','101');
}

const app = express();
app.use(cors());
app.use(express.json());
const list = (table, order='id DESC') => db.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all();
const log = (action, actor='system', details='') => db.prepare('INSERT INTO audit_log(action,actor,details) VALUES(?,?,?)').run(action,actor,details);

app.get('/api/health',(_req,res)=>res.json({ok:true,database:'SQLite',timestamp:new Date().toISOString()}));
app.post('/api/auth/login',(req,res)=>{const {email,password}=req.body||{};const user=db.prepare('SELECT id,name,email,password,role FROM users WHERE lower(email)=lower(?)').get(email||'');if(!user||!bcrypt.compareSync(password||'',user.password))return res.status(401).json({error:'Invalid email or password'});delete user.password;log('login',user.email,user.role);res.json({user});});
app.get('/api/auth/me/:id',(req,res)=>{const user=db.prepare('SELECT id,name,email,role FROM users WHERE id=?').get(req.params.id);if(!user)return res.status(404).json({error:'User not found'});res.json({user});});

app.get('/api/dashboard',(_req,res)=>{const count=t=>db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;const averageMarks=db.prepare('SELECT COALESCE(ROUND(AVG(marks),1),0) v FROM marks').get().v;res.json({students:count('students'),teachers:count('teachers'),classes:count('classes'),subjects:count('subjects'),exams:count('exams'),notices:count('notices'),quizzes:count('quizzes'),averageMarks});});

function basicCrud(table, fields){
  app.get(`/api/${table}`,(req,res)=>res.json(list(table)));
  app.post(`/api/${table}`,(req,res)=>{const values=fields.map(f=>req.body?.[f]??'');if(!values[0])return res.status(400).json({error:`${fields[0]} is required`});const result=db.prepare(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`).run(...values);log(`create_${table}`,req.body?.actor||'user',String(result.lastInsertRowid));res.status(201).json({id:Number(result.lastInsertRowid)});});
  app.delete(`/api/${table}/:id`,(req,res)=>{db.prepare(`DELETE FROM ${table} WHERE id=?`).run(req.params.id);log(`delete_${table}`,req.body?.actor||'user',String(req.params.id));res.json({ok:true});});
}

basicCrud('classes',['name','section','room','teacher_id']);
basicCrud('subjects',['name','code','class_name']);
basicCrud('teachers',['name','subject','phone','class_name','user_id']);
basicCrud('exams',['name','class_name','subject','exam_date','max_marks']);
basicCrud('notices',['title','message','audience']);
basicCrud('quizzes',['title','subject','class_name','questions','status']);
basicCrud('timetable',['day','period','class_name','subject','teacher','room']);

app.get('/api/students',(_req,res)=>res.json(list('students')));
app.post('/api/students',(req,res)=>{const {name,class_name='',roll_no='',guardian='',phone='',attendance=0,marks=0}=req.body||{};if(!name)return res.status(400).json({error:'Student name is required'});const result=db.prepare('INSERT INTO students(name,class_name,roll_no,guardian,phone,attendance,marks) VALUES(?,?,?,?,?,?,?)').run(name,class_name,roll_no,guardian,phone,Number(attendance)||0,Number(marks)||0);log('create_student',req.body?.actor||'user',name);res.status(201).json({id:Number(result.lastInsertRowid)});});
app.delete('/api/students/:id',(req,res)=>{db.prepare('DELETE FROM students WHERE id=?').run(req.params.id);db.prepare('DELETE FROM marks WHERE student_id=?').run(req.params.id);db.prepare('DELETE FROM attendance WHERE student_id=?').run(req.params.id);res.json({ok:true});});

app.get('/api/attendance',(_req,res)=>res.json(db.prepare('SELECT a.*,s.name student_name,s.class_name,s.roll_no FROM attendance a JOIN students s ON s.id=a.student_id ORDER BY a.date DESC,a.id DESC').all()));
app.post('/api/attendance',(req,res)=>{const {student_id,date,status}=req.body||{};if(!student_id||!date||!status)return res.status(400).json({error:'student_id, date and status are required'});db.prepare('INSERT INTO attendance(student_id,date,status) VALUES(?,?,?)').run(student_id,date,status);const pct=db.prepare("SELECT ROUND(100.0*SUM(CASE WHEN status='present' THEN 1 ELSE 0 END)/COUNT(*),1) pct FROM attendance WHERE student_id=?").get(student_id).pct;db.prepare('UPDATE students SET attendance=? WHERE id=?').run(pct??0,student_id);log('attendance_marked',req.body?.actor||'user',`${student_id}:${status}`);res.status(201).json({ok:true});});

app.get('/api/marks',(_req,res)=>res.json(db.prepare('SELECT m.*,s.name student_name,s.class_name,e.name exam_name,e.subject,e.max_marks FROM marks m JOIN students s ON s.id=m.student_id JOIN exams e ON e.id=m.exam_id ORDER BY m.id DESC').all()));
app.post('/api/marks',(req,res)=>{const {student_id,exam_id,marks}=req.body||{};if(!student_id||!exam_id)return res.status(400).json({error:'student_id and exam_id are required'});db.prepare('INSERT INTO marks(student_id,exam_id,marks) VALUES(?,?,?) ON CONFLICT(student_id,exam_id) DO UPDATE SET marks=excluded.marks').run(student_id,exam_id,Number(marks)||0);const avg=db.prepare('SELECT COALESCE(ROUND(AVG(marks),1),0) v FROM marks WHERE student_id=?').get(student_id).v;db.prepare('UPDATE students SET marks=? WHERE id=?').run(avg,student_id);log('marks_saved',req.body?.actor||'user',`${student_id}:${exam_id}`);res.json({ok:true});});
app.get('/api/results',(_req,res)=>res.json(db.prepare('SELECT s.id,s.name,s.class_name,s.roll_no,s.attendance,s.marks,COUNT(m.id) exams_count FROM students s LEFT JOIN marks m ON m.student_id=s.id GROUP BY s.id ORDER BY s.marks DESC').all()));

app.get('/api/profile/:userId',(req,res)=>{const user=db.prepare('SELECT id,name,email,role FROM users WHERE id=?').get(req.params.userId);if(!user)return res.status(404).json({error:'User not found'});let profile=null;if(user.role==='student')profile=db.prepare('SELECT * FROM students WHERE user_id=?').get(user.id);if(user.role==='teacher')profile=db.prepare('SELECT * FROM teachers WHERE user_id=?').get(user.id);res.json({user,profile});});
app.put('/api/profile/:userId',(req,res)=>{const u=db.prepare('SELECT id,name FROM users WHERE id=?').get(req.params.userId);if(!u)return res.status(404).json({error:'User not found'});db.prepare('UPDATE users SET name=? WHERE id=?').run(req.body?.name||u.name,u.id);res.json({ok:true});});
app.get('/api/audit',(_req,res)=>res.json(list('audit_log')));
app.get('/api/settings',(_req,res)=>res.json(db.prepare('SELECT * FROM settings ORDER BY key').all()));
app.put('/api/settings/:key',(req,res)=>{db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(req.params.key,String(req.body?.value??''));res.json({ok:true});});

app.get('/api/student/:userId/overview',(req,res)=>{const student=db.prepare('SELECT * FROM students WHERE user_id=?').get(req.params.userId);if(!student)return res.status(404).json({error:'Student profile not found'});const marks=db.prepare('SELECT m.*,e.name exam_name,e.subject,e.max_marks FROM marks m JOIN exams e ON e.id=m.exam_id WHERE m.student_id=? ORDER BY e.exam_date DESC').all(student.id);const attendance=db.prepare('SELECT date,status FROM attendance WHERE student_id=? ORDER BY date DESC LIMIT 30').all(student.id);const notices=list('notices');const schedule=db.prepare('SELECT * FROM timetable WHERE class_name=? ORDER BY id').all(student.class_name);res.json({student,marks,attendance,notices,schedule});});

app.listen(5000,()=>console.log('School API running at http://localhost:5000'));
