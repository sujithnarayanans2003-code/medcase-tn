import { useState, useEffect, useCallback } from "react";

// ─── CONFIG ─────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID;

// ─── HELPERS ────────────────────────────────────────────

async function supabase(table, method = "GET", body = null, query = "") {
  const token = localStorage.getItem("sb_token");

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: token ? `Bearer ${token}` : `Bearer ${SUPABASE_ANON_KEY}`,
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : null,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Database error");
  }

  return res.json();
}

// ─── FIXED MAGIC LINK ───────────────────────────────────

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
      email_redirect_to: window.location.origin,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || err.error || "Failed to send magic link");
  }
}

// ─── APP ────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState("splash");
  const [student, setStudent] = useState(null);
  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const showMsg = (msg, isError = false) => {
    if (isError) {
      setError(msg);
      setTimeout(() => setError(""), 4000);
    } else {
      setSuccess(msg);
      setTimeout(() => setSuccess(""), 4000);
    }
  };

  // ─── FIXED LOGIN HANDLER ──────────────────────────────

  useEffect(() => {
    const hash = window.location.hash;

    if (hash && hash.includes("access_token")) {
      const params = new URLSearchParams(hash.replace("#", "?"));
      const accessToken = params.get("access_token");

      if (accessToken) {
        localStorage.setItem("sb_token", accessToken);

        fetch(`${SUPABASE_URL}/auth/v1/user`, {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${accessToken}`,
          },
        })
          .then(res => res.json())
          .then(async user => {
            if (!user?.email) throw new Error();

            const students = await supabase(
              "students",
              "GET",
              null,
              `?email=eq.${encodeURIComponent(user.email)}`
            );

            if (students?.length > 0) {
              localStorage.setItem("abdm_student", JSON.stringify(students[0]));
              setStudent(students[0]);
              setScreen("home");
            } else {
              setEmail(user.email);
              setScreen("register");
            }
          })
          .catch(() => {
            showMsg("Login failed. Try again.", true);
            setScreen("login");
          });

        return;
      }
    }

    const saved = localStorage.getItem("abdm_student");

    if (saved) {
      try {
        const s = JSON.parse(saved);
        if (s?.email) {
          setStudent(s);
          setScreen("home");
          return;
        }
      } catch {
        localStorage.removeItem("abdm_student");
      }
    }

    setTimeout(() => setScreen("login"), 1500);
  }, []);

  // ─── LOGIN ACTION ─────────────────────────────────────

  const sendOTP = async () => {
    if (!email.includes("@")) return showMsg("Invalid email", true);

    setLoading(true);
    try {
      await sendMagicLink(email);
      setOtpSent(true);
      showMsg("Magic link sent! Check email 📧");
    } catch (e) {
      showMsg(e.message, true);
    }
    setLoading(false);
  };

  // ─── REGISTER ─────────────────────────────────────────

  const [name, setName] = useState("");

  const register = async () => {
    if (!name) return showMsg("Enter name", true);

    setLoading(true);
    try {
      const res = await supabase("students", "POST", {
        full_name: name,
        email,
        credits: 0,
        is_subscribed: false,
        trial_start_date: new Date().toISOString(),
      });

      const s = res[0];
      localStorage.setItem("abdm_student", JSON.stringify(s));
      setStudent(s);
      setScreen("home");

      showMsg("Welcome! 🎉");
    } catch (e) {
      showMsg(e.message, true);
    }
    setLoading(false);
  };

  const logout = () => {
    localStorage.clear();
    setStudent(null);
    setScreen("login");
  };

  // ─── UI ───────────────────────────────────────────────

  if (screen === "splash")
    return <div style={{ padding: 40 }}>Loading...</div>;

  if (screen === "login")
    return (
      <div style={{ padding: 20 }}>
        <h2>Login</h2>

        {error && <p style={{ color: "red" }}>{error}</p>}
        {success && <p style={{ color: "green" }}>{success}</p>}

        <input
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />

        {!otpSent ? (
          <button onClick={sendOTP}>
            {loading ? "Sending..." : "Send Magic Link"}
          </button>
        ) : (
          <p>Check your email 📬</p>
        )}
      </div>
    );

  if (screen === "register")
    return (
      <div style={{ padding: 20 }}>
        <h2>Register</h2>

        <input
          placeholder="Full Name"
          value={name}
          onChange={e => setName(e.target.value)}
        />

        <button onClick={register}>
          {loading ? "Saving..." : "Register"}
        </button>
      </div>
    );

  return (
    <div style={{ padding: 20 }}>
      <h2>Welcome {student?.full_name}</h2>

      <button onClick={logout}>Logout</button>
    </div>
  );
  }
