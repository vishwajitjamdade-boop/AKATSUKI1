# DevDarshan – How to Run the Backend

## One-time setup (run in PowerShell):

```powershell
cd d:\AKATSUKI1
npm install
```

## Start the server (every time):

```powershell
node server.js
```

Then open: **http://localhost:3000/index.html**

---

## Login Credentials

| Role | Username | Password |
|------|----------|----------|
| Security Admin | `admin` | `admin123` |
| Demo Devotee | `devotee` | `dev123` |
| New Devotee | Register yourself from login page |

---

## What's Real Now (no hardcoded values)

| Feature | Before | Now |
|---------|--------|-----|
| Pilgrims today | hardcoded 24,847 | calculated from DB + real time |
| Slots booked | hardcoded 1,240 | actual bookings in SQLite DB |
| New user bookings | always 0 hardcoded | 0 from real DB (no bookings yet) |
| AI prediction | static time curve | 90-day historical data in DB |
| Crowd data | Math.random() | real-time DB updated every minute |
| Gate status | in-memory only | persisted in SQLite across sessions |
| Registration | not possible | new users can register |

---

## Database Location
`d:\AKATSUKI1\db\devdarshan.db` – SQLite file created on first run.
