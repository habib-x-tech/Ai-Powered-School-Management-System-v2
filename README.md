# AI-Powered School Management System v2

A lightweight school management application built with a simple JavaScript stack.

## Stack

- React + Vite
- Node.js + Express
- SQLite (`better-sqlite3`)
- npm

## Run

Install dependencies:

```bash
npm install
```

Start the frontend:

```bash
npm run dev
```

Start the API in a second terminal:

```bash
npm run server
```

Frontend: http://localhost:5173  
API health: http://localhost:5000/api/health

## Demo accounts

- Admin: `admin@school.local` / `admin123`
- Teacher: `teacher@school.local` / `teacher123`
- Student: `student@school.local` / `student123`

The SQLite database is created automatically at `data/school.db`.