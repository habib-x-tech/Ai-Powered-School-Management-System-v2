import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GraduationCap, LogIn, Database, Server, Users } from 'lucide-react';
import './style.css';

function App() {
  const [email, setEmail] = useState('admin@school.local');
  const [password, setPassword] = useState('admin123');
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');

  async function login(e) {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || 'Login failed');
    setUser(data.user);
  }

  if (user) {
    return <main className="shell">
      <div className="top"><div className="brand"><GraduationCap size={30}/> <span>AI School Management</span></div><button onClick={() => setUser(null)}>Logout</button></div>
      <section className="hero"><span className="pill">{user.role.toUpperCase()}</span><h1>Welcome, {user.name}</h1><p>Your simplified Vite + npm school portal is ready.</p></section>
      <div className="cards">
        <div className="card"><Database/><h3>SQLite Database</h3><p>Simple local database. No Prisma or database server.</p></div>
        <div className="card"><Server/><h3>Express API</h3><p>Simple REST API running on port 5000.</p></div>
        <div className="card"><Users/><h3>Role Based</h3><p>Admin, teacher and student accounts are supported.</p></div>
      </div>
    </main>;
  }

  return <main className="login-page"><form className="login-card" onSubmit={login}>
    <div className="logo"><GraduationCap size={42}/></div>
    <h1>AI-Powered School</h1><p>Simple Vite + npm version</p>
    <label>Email<input value={email} onChange={e=>setEmail(e.target.value)} type="email" /></label>
    <label>Password<input value={password} onChange={e=>setPassword(e.target.value)} type="password" /></label>
    {error && <div className="error">{error}</div>}
    <button className="submit"><LogIn size={18}/> Sign in</button>
    <small>Demo: admin@school.local / admin123</small>
  </form></main>;
}

createRoot(document.getElementById('root')).render(<App />);
