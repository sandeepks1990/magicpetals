# 🌸 Magic Petals - Customer Intake, QR Scanner & Admin App

A full-stack mobile-friendly application built for **Magic Petals** (Pets Food & Stationery Shop). Hosted ready for **Render**.

---

## 🌟 Key Features

1. **Mobile Customer Intake Form (`/`)**:
   - Clean, mobile-friendly design with pet & stationery themed styling.
   - Captures **Name**, **Phone Number**, and **Optional Feedback / Message**.
   - Saves submissions directly into SQLite database with timestamp.

2. **Front Desk QR Scanner (`/scanner`)**:
   - Built-in camera scanner powered by HTML5 Webcam QR Reader.
   - Quick launch buttons for shop front counter setup.

3. **Admin Console (`/admin`)**:
   - **Login Credentials**:
     - **Username**: `thoma@magicpetals.com`
     - **Password**: `Thoma@1990`
   - **Data Table**: Search, filter, and view all customer records.
   - **CSV Export**: One-click download of all customer submissions in `.csv` format.
   - **Counter QR Code Generator**: Generates and prints the official store counter QR code.

4. **Render Deployment Ready**:
   - Complete with `render.yaml` blueprint for zero-configuration web service hosting.

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

---

## ☁️ How to Deploy on Render

1. Push this codebase to GitHub or GitLab repository.
2. Go to [Render Dashboard](https://dashboard.render.com/) and click **New > Blueprint**.
3. Connect your repository. Render will automatically detect `render.yaml` and set up the build & start commands:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Click **Apply**. Your application will be live in 1-2 minutes!
