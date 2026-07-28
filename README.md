# 🌸 Magic Petals - Customer Intake, QR Scanner & Admin App

A full-stack mobile-friendly application built for **Magic Petals** (Pets Food & Stationery Shop). Hosted ready for **Render**.

---

## 🌟 Key Features

1. **Mobile Customer Intake Form (`/`)**:
   - Clean, mobile-friendly design with pet & stationery themed styling.
   - Captures **Name**, **Phone Number**, and **Optional Feedback / Message**.
   - Saves submissions into database.

2. **Front Desk QR Scanner Poster (`/scanner`)**:
   - Clean QR code poster display with puppy mascot branding.
   - Any mobile phone camera scanning the QR code opens the customer form directly.

3. **Admin Console (`/admin`)**:
   - **Login Credentials**:
     - **Username**: `thoma@magicpetals.com`
     - **Password**: `Thoma@1990`
   - **Data Table**: Search, filter, and view all customer records.
   - **CSV Export**: One-click download of all customer submissions in `.csv` format.
   - **Counter QR Code Generator**: Generates and prints the official store counter QR code.

4. **Permanent Database Storage (Render Free PostgreSQL / SQLite)**:
   - Supports Render's **Free PostgreSQL Database** so your customer data **NEVER** gets erased when Render restarts or goes to sleep!

---

## 💾 How to Make Your Database Permanent on Render (Fix Data Clearing)

Render's web server filesystem is temporary (*ephemeral*). To keep customer data permanently so it **never gets deleted on restarts**:

### 1-Minute Setup on Render:
1. Go to your [Render Dashboard](https://dashboard.render.com/).
2. Click **+ New** > **Postgres** (Select the **Free** tier).
3. Copy the **Internal Database URL** (or External Database URL).
4. Go to your Web Service (**magic-petals-shop**) > **Environment**.
5. Add an environment variable:
   - **Key**: `DATABASE_URL`
   - **Value**: *(Paste your Postgres Database URL)*
6. Click **Save Changes**.

Your app will automatically detect `DATABASE_URL` and switch to PostgreSQL. All customer data will be stored **permanently**!

---

## 🚀 Quick Start (Local Run)

```bash
# 1. Install dependencies
npm install

# 2. Start application
npm start
```

Access the app in your browser:
- 📱 **Customer Intake Form**: `http://localhost:3000/`
- 📷 **Front Desk Scanner**: `http://localhost:3000/scanner`
- 🔐 **Admin Dashboard**: `http://localhost:3000/admin`
