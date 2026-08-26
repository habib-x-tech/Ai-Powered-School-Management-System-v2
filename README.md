# School Management System v2

A lightweight school management portal using a simple JavaScript stack.

## Stack

- React + Vite
- Node.js + Express
- SQLite via `better-sqlite3`
- npm only

## Features

- Role-based login for admin, teacher and student
- Admin dashboard with school statistics
- Student, teacher, class and subject management
- Daily attendance tracking
- Exams and marks management
- Results and performance views
- Notices and quizzes
- Class timetable
- Audit log
- Basic profile and system settings
- SQLite database created automatically on first server start

## Run

Install dependencies:

```bash
npm install
```

Start the API in one terminal:

```bash
npm run server
```

Start the frontend in another terminal:

```bash
npm run dev
```

Frontend: http://localhost:5173
API health: http://localhost:5000/api/health

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Admin | `admin@school.local` | `admin123` |
| Teacher | `teacher@school.local` | `teacher123` |
| Student | `student@school.local` | `student123` |

The local database is stored at `data/school.db` and is ignored by Git.

## Project layout

```text
.
├── src/
│   ├── main.jsx
│   └── style.css
├── server/
│   └── server.js
├── data/               # created automatically
├── index.html
├── vite.config.js
├── package.json
└── README.md
```
