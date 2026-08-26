# AI-Powered School Management System v2

Simplified migration of the original school-management project.

## Stack
- React + Vite
- Node.js + Express
- SQLite (better-sqlite3)
- npm only

No Next.js, Bun, Prisma, or other package manager is required.

## Run

```bash
npm install
npm run dev
```

In a second terminal:

```bash
npm run server
```

Frontend: http://localhost:5173
API: http://localhost:5000/api/health

## Demo accounts

- Admin: `admin@school.local` / `admin123`
- Teacher: `teacher@school.local` / `teacher123`
- Student: `student@school.local` / `student123`

The SQLite database is created automatically at `data/school.db` on first server start.