import { useState, useEffect, useCallback } from "react";

/* ───────── CONFIG ───────── */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID;

/* ───────── CONSTANTS (FULL LIST PRESERVED) ───────── */

const TN_COLLEGES = [
  "Madras Medical College, Chennai",
  "Stanley Medical College, Chennai",
  "Kilpauk Medical College, Chennai",
  "Coimbatore Medical College, Coimbatore",
  "Madurai Medical College, Madurai",
  "Thanjavur Medical College, Thanjavur",
  "Tirunelveli Medical College, Tirunelveli",
  "Salem Government Medical College, Salem",
  "Dharmapuri Medical College, Dharmapuri",
  "Kanyakumari Government Medical College, Kanyakumari",
  "Thoothukudi Medical College, Thoothukudi",
  "Villupuram Medical College, Villupuram",
  "Government Vellore Medical College, Vellore",
  "Tiruvarur Medical College, Tiruvarur",
  "Karur Medical College, Karur",
  "Nagapattinam Medical College, Nagapattinam",
  "Ramanathapuram Medical College, Ramanathapuram",
  "Sivagangai Medical College, Sivagangai",
  "Pudukkottai Medical College, Pudukkottai",
  "Krishnagiri Medical College, Krishnagiri",
  "Namakkal Medical College, Namakkal",
  "Dindigul Medical College, Dindigul",
  "Virudhunagar Medical College, Virudhunagar",
  "Sri Ramachandra Medical College, Chennai",
  "Saveetha Medical College, Chennai",
  "Chettinad Medical College, Chennai",
  "SRM Medical College, Chennai",
  "Vinayaka Mission Medical College, Salem",
  "PSG Medical College, Coimbatore",
  "KMCH Medical College, Coimbatore",
  "Sri Manakula Vinayagar Medical College, Puducherry",
  "Aarupadai Veedu Medical College, Puducherry",
  "Mahatma Gandhi Medical College, Puducherry",
  "Meenakshi Medical College, Chennai",
  "ACS Medical College, Chennai",
  "Sree Balaji Medical College, Chennai",
  "Tagore Medical College, Chennai",
  "Indira Gandhi Medical College, Puducherry",
];

const WARDS = [
  "General Medicine Ward",
  "General Surgery Ward",
  "Pediatrics Ward",
  "Obstetrics & Gynecology Ward",
  "Orthopedics Ward",
  "Neurology Ward",
  "Cardiology Ward",
  "Nephrology Ward",
  "Pulmonology Ward",
  "Gastroenterology Ward",
  "Endocrinology Ward",
  "Dermatology Ward",
  "ENT Ward",
  "Ophthalmology Ward",
  "Psychiatry Ward",
  "Oncology Ward",
  "ICU",
  "Emergency Ward",
  "Burns Ward",
  "Urology Ward",
];

/* ───────── SUPABASE HELPER ───────── */

async function supabase(table, method = "GET", body = null, query = "") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : null,
  });

  if (!res.ok) throw new Error("DB error");
  return res.json();
}

/* ───────── FIXED MAGIC LINK ───────── */

async function sendMagicLink(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      email,
      create_user: true,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error_description || "Magic link failed");
  }
}

/* ───────── APP ───────── */

export default function App() {
  const [screen, setScreen] = useState("login");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  /* ───────── HANDLE REDIRECT LOGIN ───────── */

  useEffect(() => {
    const hash = window.location.hash;

    if (hash.includes("access_token")) {
      setMsg("✅ Login success!");
      setScreen("home");
    }
  }, []);

  /* ───────── SEND LINK ───────── */

  const sendOTP = async () => {
    if (!email.includes("@")) {
      setMsg("❌ Invalid email");
      return;
    }

    setLoading(true);

    try {
      await sendMagicLink(email);
      setMsg("✅ Magic link sent! Check email");
    } catch (e) {
      setMsg("❌ " + e.message);
    }

    setLoading(false);
  };

  /* ───────── UI ───────── */

  if (screen === "login") {
    return (
      <div style={{ padding: 40 }}>
        <h1>Login</h1>

        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <button onClick={sendOTP}>
          {loading ? "Sending..." : "Send Magic Link"}
        </button>

        <p style={{ color: "red" }}>{msg}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Welcome</h1>
      <p>Login successful 🎉</p>
    </div>
  );
                   }
