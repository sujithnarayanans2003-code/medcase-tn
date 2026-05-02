🩺 MedCase TN

A secure, scalable platform for medical students to upload, explore, and learn from real clinical cases using a credit-based access system.

🔗 Live App: https://medcase-tn.vercel.app

---

🚀 Features

- 🔐 Authentication
  
  - Magic link login (passwordless)

- 💳 Credit System
  
  - Earn credits by uploading cases
  - Spend credits to view detailed cases
  - Atomic credit deduction (race-condition safe)

- 📚 Case Management
  
  - Upload structured clinical cases
  - Filter by college / ward
  - Paginated case browsing

- 🧠 Fraud Detection System
  
  - Upload rate limiting
  - Duplicate case detection
  - Low-quality content flagging
  - Self-view prevention

- 🚫 Auto-Ban Engine
  
  - Progressive ban levels (warning → restriction → suspension → permanent ban)
  - Auto-unban after cooldown

- 🔗 Multi-Account Detection
  
  - Device-based linking
  - IP-based linking
  - Behavior-based graph detection
  - Fraud ring detection

- 📊 Analytics
  
  - Credit usage tracking
  - Leaderboards (top contributors)
  - Weekly & monthly stats

---

🛡️ Security Highlights

- Row Level Security (RLS) enforced
- RPC-based atomic transactions
- XSS protection (input + render sanitization)
- Rate limiting (OTP + uploads)
- Secure token handling
- Fraud scoring + automated enforcement

---

🏗️ Tech Stack

- Frontend: React (Vite)
- Backend: Supabase (PostgreSQL, Auth, RPC)
- Deployment: Vercel
- Payments: Razorpay (planned / integrated)

---

⚙️ Local Setup

git clone https://github.com/YOUR_USERNAME/medcase-tn.git
cd medcase-tn
npm install
npm run dev

Create a ".env" file:

VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key

---

🗂️ Project Structure

src/
  ├── App.jsx
  ├── components/
  ├── utils/

supabase/
  ├── use_credit.sql
  ├── fraud_system.sql
  ├── auto_ban.sql
  ├── graph_detection.sql
  ├── analytics.sql

---

🔑 Key Backend Logic

- use_credit()
  
  - Atomic credit deduction using SQL
  - Prevents race conditions and double spending

- Fraud System
  
  - Tracks abnormal usage patterns
  - Assigns fraud scores

- Auto-Ban System
  
  - Automatically restricts abusive users

- Graph Detection
  
  - Detects multi-account fraud rings

---

📊 Future Improvements

- 🤖 AI-based case quality scoring
- 📈 Admin dashboard (fraud monitoring)
- 📍 Device fingerprinting
- 📊 Graph visualization of fraud networks
- 💰 Full payment integration

---

⚠️ Disclaimer

This platform is intended for educational purposes only.
No patient-identifiable data should be uploaded.

---

👤 Author

Developed by SUJITHNARAYANAN 

---

⭐ Support

If you find this useful:

- Star the repository ⭐
- Share with other medical students
- 💡 Why this project?

This project was built to address the lack of accessible, structured clinical case discussions among medical students while ensuring responsible usage through a secure credit-based system.

It combines:

- 🔐 Secure system design (RLS, atomic transactions)
- 🧠 Fraud detection & prevention (rate limits, graph-based multi-account detection)
- ⚙️ Scalable backend logic using Supabase RPC
- 📊 Data-driven insights through analytics and leaderboards

The focus is not just on building features, but on designing a system that can:

- Prevent misuse and abuse
- Scale with increasing users
- Maintain fairness in content access

---

🚀 Vision

The long-term goal is to evolve this into a full-fledged learning platform for medical students by adding:

- 🤖 AI-based case quality evaluation
- 📈 Admin moderation dashboard
- 🔗 Visual fraud graph analysis
- 🌐 Wider adoption across institutions

---

⭐ Support

If you find this project useful:

- Star the repository ⭐
- Share with other medical students
- Contribute ideas or improvements
