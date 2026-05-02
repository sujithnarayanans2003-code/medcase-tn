import { useState, useEffect, useCallback, useRef } from "react";

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID;

// Magic link redirect uses actual deployed origin — works on Vercel, not localhost
const APP_URL = window.location.origin;

// FIX (No pagination): Load 20 cases per page to prevent DOM/DB overload
const PAGE_SIZE = 20;

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

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

// ─── VALIDATION ───────────────────────────────────────────────────────────────

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((email || "").trim());
}

function isBlank(str) {
  return !str || str.trim().length === 0;
}

// FIX (Weak handling of invalid numeric inputs): reject floats, non-numeric, out-of-range
function isValidAge(val) {
  const n = Number(val);
  return Number.isInteger(n) && n > 0 && n <= 120;
}

// FIX (XSS risk from user-entered case data): Escape HTML entities in all
// free-text fields before storing in DB and before rendering untrusted content.
// React auto-escapes JSX text children, but this defends DB values and any
// future dangerouslySetInnerHTML usage.
function sanitize(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// ─── NETWORK HELPERS ─────────────────────────────────────────────────────────

// FIX (No offline handling): Throw early so all API paths surface the same message
function assertOnline() {
  if (!navigator.onLine)
    throw new Error("You appear to be offline. Please check your connection.");
}

// FIX (No retry mechanism): Exponential back-off retry (500 ms → 1 s → 2 s).
// Skips retry on 4xx responses (auth/validation errors — not transient).
async function withRetry(fn, times = 3) {
  let lastErr;
  for (let i = 0; i < times; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (e.status >= 400 && e.status < 500) throw e;
      if (i < times - 1) await new Promise(r => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw lastErr;
}

// ─── SUPABASE HELPER ─────────────────────────────────────────────────────────

// FIX (RLS depends on config): Always pass user JWT so Supabase RLS evaluates
//   per authenticated user — not the permissive anon key.
// FIX (No network error handling): assertOnline + withRetry wrap every call.
// FIX (No session expiry handling): 401 responses set e.sessionExpired = true
//   so the caller can force logout without showing a generic error.
async function supabaseCall(table, method = "GET", body = null, query = "", accessToken = null) {
  assertOnline();
  return withRetry(async () => {
    const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
    const headers = {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
      Prefer: "return=representation",
    };
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const e = new Error(err.message || `HTTP ${res.status}`);
      e.status = res.status;
      if (res.status === 401) e.sessionExpired = true;
      throw e;
    }
    return res.json();
  });
}

// ─── MAGIC LINK ──────────────────────────────────────────────────────────────

async function sendMagicLink(email) {
  assertOnline();
  return withRetry(async () => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({
        email: email.trim(),
        create_user: true,
        options: { emailRedirectTo: APP_URL },
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const e = new Error(err.error_description || err.message || "Magic link failed");
      e.status = res.status;
      throw e;
    }
  });
}

// ─── RAZORPAY SCRIPT LOADER ───────────────────────────────────────────────────

// FIX (Razorpay script can load multiple times): Module-level promise ensures
// only one <script> is ever injected regardless of how many times this is called.
let _razorpayPromise = null;
function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve(true);
  if (_razorpayPromise) return _razorpayPromise;
  _razorpayPromise = new Promise(resolve => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => { _razorpayPromise = null; resolve(false); };
    document.body.appendChild(s);
  });
  return _razorpayPromise;
}

// ─── PAYMENT VERIFICATION ────────────────────────────────────────────────────

// FIX (Payment not verified securely): The frontend sends the raw Razorpay
// callback to a Vercel serverless function (/api/verify-payment) which:
//   1. Verifies the HMAC signature with the Razorpay secret (server-side only).
//   2. Writes the subscription row and updates students.is_subscribed atomically.
//   3. Returns { verified: true, subscription_end_date } on success.
// The frontend NEVER writes subscription data directly — only the API does.
// This prevents users from faking payment by calling Supabase directly.
async function verifyPaymentServerSide(razorpayResponse, studentId, accessToken) {
  assertOnline();
  const res = await fetch("/api/verify-payment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      razorpay_order_id:   razorpayResponse.razorpay_order_id,
      razorpay_payment_id: razorpayResponse.razorpay_payment_id,
      razorpay_signature:  razorpayResponse.razorpay_signature,
      student_id: studentId,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Payment verification failed");
  }
  return res.json();
}

// ─── ACCESS STATUS ───────────────────────────────────────────────────────────

function getAccessStatus(student) {
  if (!student) return "none";
  if (student.is_subscribed) {
    const end = new Date(student.subscription_end_date);
    if (!isNaN(end) && end > new Date()) return "subscribed";
  }
  const trialStart = student.trial_start_date ? new Date(student.trial_start_date) : null;
  if (trialStart && !isNaN(trialStart)) {
    const daysPassed = (Date.now() - trialStart.getTime()) / (1000 * 60 * 60 * 24);
    if (daysPassed <= 5) return "trial";
  }
  if ((student.credits || 0) > 0) return "credits";
  return "expired";
}

// ─── SKELETON COMPONENT ──────────────────────────────────────────────────────

// FIX (No skeleton/loading UI): Animated shimmer cards shown on initial fetch
function CaseSkeleton() {
  const pulse = {
    background: "linear-gradient(90deg,rgba(255,255,255,0.05) 25%,rgba(255,255,255,0.1) 50%,rgba(255,255,255,0.05) 75%)",
    backgroundSize: "200% 100%",
    animation: "shimmer 1.4s infinite",
    borderRadius: 8,
  };
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,180,216,0.1)", borderRadius: 14, padding: 16, margin: "10px 16px" }}>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <div style={{ ...pulse, width: 70, height: 20 }} />
        <div style={{ ...pulse, width: 50, height: 20 }} />
      </div>
      <div style={{ ...pulse, width: "75%", height: 18, marginBottom: 8 }} />
      <div style={{ ...pulse, width: "50%", height: 14, marginBottom: 6 }} />
      <div style={{ ...pulse, width: "100%", height: 36, marginTop: 8 }} />
    </div>
  );
}

// ─── CREDIT CONFIRM MODAL ────────────────────────────────────────────────────

// FIX (No confirmation before spending credits): Modal requires explicit consent
function CreditConfirmModal({ caseItem, onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#0d2137", border: "1px solid rgba(0,180,216,0.4)", borderRadius: 16, padding: 24, maxWidth: 360, width: "100%" }}>
        <div style={{ fontSize: 32, textAlign: "center", marginBottom: 12 }}>⭐</div>
        <h3 style={{ margin: "0 0 10px", color: "#00b4d8", textAlign: "center" }}>Use 1 Credit?</h3>
        <p style={{ color: "#6b8399", fontSize: 13, textAlign: "center", margin: "0 0 10px" }}>
          This will deduct 1 credit to unlock:
        </p>
        <div style={{ background: "rgba(0,180,216,0.08)", borderRadius: 10, padding: "10px 14px", marginBottom: 20 }}>
          <div style={{ fontWeight: 700, color: "#e8f4f8", fontSize: 14 }}>{caseItem.diagnosis}</div>
          <div style={{ color: "#6b8399", fontSize: 12, marginTop: 4 }}>{caseItem.ward}</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "12px", background: "transparent", border: "1px solid #6b8399", borderRadius: 10, color: "#6b8399", fontSize: 14, cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={onConfirm} style={{ flex: 1, padding: "12px", background: "linear-gradient(135deg,#00b4d8,#0077b6)", border: "none", borderRadius: 10, color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Use 1 Credit
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── APP ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState("splash");
  const [student, setStudent] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [cases, setCases] = useState([]);

  // FIX (Single global loading state blocks whole app): Granular per-key loading
  // so upload spinner doesn't freeze the case list, payment doesn't block filters, etc.
  const [loadingKeys, setLoadingKeys] = useState(new Set());
  const startLoading = (key) => setLoadingKeys(p => new Set(p).add(key));
  const stopLoading  = (key) => setLoadingKeys(p => { const s = new Set(p); s.delete(key); return s; });
  const isLoading    = (key) => loadingKeys.has(key);
  const anyLoading   = loadingKeys.size > 0;

  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState("");
  const [email,   setEmail]   = useState("");
  const [otpSent, setOtpSent] = useState(false);

  // FIX (No offline handling): Track network status with event listeners
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // FIX (No confirmation before spending credits): Hold pending case until confirmed
  const [creditPendingCase, setCreditPendingCase] = useState(null);

  const [regData, setRegData] = useState({
    full_name: "", college: "", year_of_study: "", roll_number: "", phone: "",
  });
  const [caseForm, setCaseForm] = useState({
    ward: "", bed_number: "", patient_initials: "", age: "",
    gender: "", chief_complaint: "", diagnosis: "", symptoms: "", treatment: "", notes: "",
    patient_status: "admitted", case_photo: null,
  });
  const [selectedCase, setSelectedCase] = useState(null);
  const [filterCollege, setFilterCollege] = useState("");
  const [filterWard,    setFilterWard]    = useState("");
  const [activeTab,     setActiveTab]     = useState("cases");

  // FIX (No pagination): Page index + whether more rows exist
  const [casePage,     setCasePage]     = useState(0);
  const [hasMoreCases, setHasMoreCases] = useState(true);

  // Single inflight ref — blocks concurrent write operations across all handlers
  const inflightRef   = useRef(false);
  // FIX (Debounce timer not cleaned up): Ref so we can cancel in cleanup effect
  const debounceTimer = useRef(null);

  // ─── OFFLINE LISTENERS ───────────────────────────────────────────────

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline  = () => {
      setIsOffline(false);
      // Auto-refresh cases when connection restores
      if (screen === "home") loadCases(0);
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online",  goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online",  goOnline);
    };
  }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps

  // FIX (Debounce timer not cleaned up): Clear on unmount to prevent memory leak
  useEffect(() => () => clearTimeout(debounceTimer.current), []);

  // ─── HELPERS ─────────────────────────────────────────────────────────

  const showMsg = (msg, isError = false) => {
    if (isError) { setError(msg);   setTimeout(() => setError(""),   7000); }
    else         { setSuccess(msg); setTimeout(() => setSuccess(""), 5000); }
  };

  // Only {id, token} stored — all mutable fields always re-fetched from DB
  const persistStudent = (s, token) => {
    setStudent(s);
    localStorage.setItem("abdm_student_id", JSON.stringify({ id: s.id, token }));
  };

  // FIX (No session expiry handling): Centralised handler — 401 forces logout
  const handleApiError = (e, fallback) => {
    if (e.sessionExpired) {
      showMsg("Your session has expired. Please log in again.", true);
      logout();
      return;
    }
    showMsg(e.message || fallback, true);
  };

  // ─── INIT ────────────────────────────────────────────────────────────

  useEffect(() => {
    const hash = window.location.hash;

    // Magic link callback — Supabase appends access_token to hash
    if (hash && hash.includes("access_token")) {
      const params = new URLSearchParams(hash.replace("#", "?"));
      const token  = params.get("access_token");
      if (token) {
        window.history.replaceState(null, "", window.location.pathname);
        setAccessToken(token);
        startLoading("init");
        fetch(`${SUPABASE_URL}/auth/v1/user`, {
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
        })
          .then(r => r.json())
          .then(async user => {
            if (!user?.email) throw new Error("No user email");
            const rows = await supabaseCall(
              "students", "GET", null,
              `?email=eq.${encodeURIComponent(user.email.trim())}`, token
            );
            if (rows?.length > 0) {
              if (rows[0].is_blocked) {
                alert("Your account has been suspended. Please contact admin.");
                setScreen("login");
                return;
              }
              persistStudent(rows[0], token); setScreen("home");
            }
            else { setEmail(user.email.trim()); setScreen("register"); }
          })
          .catch(e => { handleApiError(e, "Login failed. Please try again."); setScreen("login"); })
          .finally(() => stopLoading("init"));
        return;
      }
    }

    // Returning session restore
    const saved = localStorage.getItem("abdm_student_id");
    if (saved) {
      try {
        const { id, token } = JSON.parse(saved);
        if (id && token) {
          setAccessToken(token);
          startLoading("init");
          supabaseCall("students", "GET", null, `?id=eq.${id}`, token)
            .then(rows => {
              if (rows?.[0]) {
                if (rows[0].is_blocked) {
                  localStorage.removeItem("abdm_student_id");
                  alert("Your account has been suspended. Please contact admin.");
                  setScreen("login");
                  return;
                }
                setStudent(rows[0]); setScreen("home");
              }
              else { localStorage.removeItem("abdm_student_id"); setScreen("login"); }
            })
            .catch(e => {
              // FIX (Auth token in localStorage / session expiry): expired token → clean logout
              if (e.sessionExpired) localStorage.removeItem("abdm_student_id");
              setScreen("login");
            })
            .finally(() => stopLoading("init"));
          return;
        }
      } catch {
        localStorage.removeItem("abdm_student_id");
      }
    }

    setTimeout(() => setScreen("login"), 2000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── SEND MAGIC LINK ─────────────────────────────────────────────────

  const sendOTP = async () => {
    if (!isValidEmail(email))
      return showMsg("Enter a valid email address (e.g. name@college.edu)", true);
    if (inflightRef.current) return;
    inflightRef.current = true;
    startLoading("otp");
    try {
      // FIX (No retry mechanism): sendMagicLink retries up to 3× with back-off
      await sendMagicLink(email);
      setOtpSent(true);
      showMsg("✅ Magic link sent to " + email.trim() + " — check your inbox!");
    } catch (e) {
      handleApiError(e, "Failed to send magic link");
    }
    stopLoading("otp");
    inflightRef.current = false;
  };

  const resetEmail = () => { setOtpSent(false); setEmail(""); };

  // ─── REGISTER ────────────────────────────────────────────────────────

  const registerStudent = async () => {
    const { full_name, college, year_of_study, roll_number } = regData;
    if (isBlank(full_name) || isBlank(college) || isBlank(year_of_study) || isBlank(roll_number))
      return showMsg("Please fill all fields", true);
    if (inflightRef.current) return;
    inflightRef.current = true;
    startLoading("register");
    try {
      const rows = await supabaseCall("students", "POST", {
        // FIX (XSS risk): sanitize all free-text inputs before persisting
        full_name:        sanitize(full_name.trim()),
        email:            email.trim(),
        college,
        year_of_study,
        roll_number:      sanitize(roll_number.trim()),
        is_verified:      true,
        credits:          0,
        trial_start_date: new Date().toISOString(),
        is_subscribed:    false,
      }, "", accessToken);
      persistStudent(rows[0], accessToken);
      setScreen("home");
      showMsg(`Welcome Dr. ${rows[0].full_name}! 5-day free trial started! 🎉`);
    } catch (e) {
      handleApiError(e, "Registration failed");
    }
    stopLoading("register");
    inflightRef.current = false;
  };

  // ─── LOAD CASES ──────────────────────────────────────────────────────

  // FIX (No pagination): page=0 resets list; page>0 appends next batch.
  // Uses Supabase Range header — fetches exactly PAGE_SIZE rows per call.
  const loadCases = useCallback(
    async (page = 0, college = filterCollege, ward = filterWard) => {
      startLoading("cases");
      try {
        assertOnline();
        const from = page * PAGE_SIZE;
        const to   = from + PAGE_SIZE - 1;
        let query = "?is_active=eq.true&order=created_at.desc";
        if (college) query += `&college=eq.${encodeURIComponent(college)}`;
        if (ward)    query += `&ward=eq.${encodeURIComponent(ward)}`;
        const res = await fetch(`${SUPABASE_URL}/rest/v1/cases${query}`, {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
            "Range-Unit": "items",
            Range: `${from}-${to}`,
            Prefer: "count=exact",
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data         = await res.json();
        const contentRange = res.headers.get("Content-Range") || "";
        const total        = parseInt(contentRange.split("/")[1] || "0", 10);
        setCases(prev => page === 0 ? (data || []) : [...prev, ...(data || [])]);
        setHasMoreCases((page + 1) * PAGE_SIZE < total);
        setCasePage(page);
      } catch (e) {
        handleApiError(e, "Failed to load cases");
      }
      stopLoading("cases");
    },
    [filterCollege, filterWard, accessToken] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (screen === "home") loadCases(0);
  }, [screen, loadCases]);

  const handleFilterChange = (type, value) => {
    if (type === "college") setFilterCollege(value);
    else setFilterWard(value);
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      loadCases(
        0,
        type === "college" ? value : filterCollege,
        type === "ward"    ? value : filterWard
      );
    }, 400);
  };

  // ─── UPLOAD CASE ─────────────────────────────────────────────────────

  const uploadCase = async () => {
    const { ward, bed_number, patient_initials, age, gender,
            chief_complaint, diagnosis, symptoms, treatment } = caseForm;
    if (!ward || !gender || isBlank(bed_number) || isBlank(patient_initials) ||
        isBlank(chief_complaint) || isBlank(diagnosis) || isBlank(symptoms) || isBlank(treatment))
      return showMsg("Fill all required fields", true);
    if (!isValidAge(age))
      return showMsg("Enter a valid whole-number age between 1 and 120", true);
    if (inflightRef.current) return;
    inflightRef.current = true;
    startLoading("upload");
    try {
      await supabaseCall("cases", "POST", {
        ward,
        // FIX (XSS risk): sanitize all user free-text fields before DB insert
        bed_number:       sanitize(bed_number.trim()),
        patient_initials: sanitize(patient_initials.trim()),
        age:              parseInt(age, 10),
        gender,
        chief_complaint:  sanitize(chief_complaint.trim()),
        diagnosis:        sanitize(diagnosis.trim()),
        symptoms:         sanitize(symptoms.trim()),
        treatment:        sanitize(treatment.trim()),
        notes:            sanitize(caseForm.notes.trim()),
        patient_status:   caseForm.patient_status || "admitted",
        case_photo:       caseForm.case_photo || null,
        college:          student.college,
        uploaded_by:      student.id,
        is_active:        true,
      }, "", accessToken);

      await supabaseCall("credit_logs", "POST",
        { student_id: student.id, action: "CASE_UPLOAD", points: 1 },
        "", accessToken
      );

      // Always re-fetch student from DB — never local arithmetic on credits
      const fresh = await supabaseCall("students", "GET", null, `?id=eq.${student.id}`, accessToken);
      if (fresh?.[0]) persistStudent(fresh[0], accessToken);

      setCaseForm({ ward:"", bed_number:"", patient_initials:"", age:"",
        gender:"", chief_complaint:"", diagnosis:"", symptoms:"", treatment:"", notes:"",
        patient_status:"admitted", case_photo: null });
      // FIX (No feedback after actions): Show updated credit balance
      showMsg(`Case uploaded! You now have ${fresh?.[0]?.credits ?? "?"} credits ⭐`);
      setActiveTab("cases");
      loadCases(0);
    } catch (e) {
      handleApiError(e, "Upload failed");
    }
    stopLoading("upload");
    inflightRef.current = false;
  };

  // ─── DELETE CASE ─────────────────────────────────────────────────────

  const deleteCase = async (caseId) => {
    if (!window.confirm("Delete this case? This cannot be undone.")) return;
    if (inflightRef.current) return;
    inflightRef.current = true;
    startLoading("deleteCase");
    try {
      await supabaseCall("cases", "DELETE", null, `?id=eq.${caseId}`, accessToken);
      showMsg("Case deleted successfully.");
      setScreen("home");
      setSelectedCase(null);
      loadCases(0);
    } catch (e) {
      handleApiError(e, "Failed to delete case");
    }
    stopLoading("deleteCase");
    inflightRef.current = false;
  };

  // ─── USE CREDIT ──────────────────────────────────────────────────────

  // FIX (Credit system race condition — double-use): Three layers of protection:
  //   1. inflightRef blocks any concurrent call from this tab.
  //   2. DB balance is re-fetched immediately before deduction.
  //   3. The deduction is written via credit_logs (append-only audit log),
  //      and credits are re-fetched after to get the authoritative balance.
  // For bulletproof atomicity across multiple tabs/devices, replace the
  // credit_logs POST with a Supabase RPC:
  //   UPDATE students SET credits = credits - 1 WHERE id = $1 AND credits > 0
  //   RETURNING credits
  // This makes the check-and-decrement a single atomic SQL operation.
  const executeUseCredit = async (caseItem) => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    startLoading("credit");
    try {
      const freshRows = await supabaseCall("students", "GET", null, `?id=eq.${student.id}`, accessToken);
      const fresh = freshRows?.[0];
      if (!fresh || fresh.credits <= 0) {
        showMsg("No credits left! Upload a case to earn more.", true);
        stopLoading("credit");
        inflightRef.current = false;
        return;
      }
      await supabaseCall("credit_logs", "POST",
        { student_id: student.id, action: "CASE_VIEW", points: -1 },
        "", accessToken
      );
      const updated = await supabaseCall("students", "GET", null, `?id=eq.${student.id}`, accessToken);
      if (updated?.[0]) persistStudent(updated[0], accessToken);
      // FIX (No feedback after actions): Confirm remaining balance
      showMsg(`Case unlocked! ${updated?.[0]?.credits ?? 0} credits remaining.`);
      setSelectedCase(caseItem);
      setScreen("caseDetail");
    } catch (e) {
      handleApiError(e, "Failed to use credit. Try again.");
    }
    stopLoading("credit");
    inflightRef.current = false;
  };

  // FIX (No confirmation before spending credits): Trigger modal; actual spend deferred
  const useCredit = (caseItem) => setCreditPendingCase(caseItem);

  // ─── RAZORPAY ────────────────────────────────────────────────────────

  const openRazorpay = async () => {
    if (anyLoading || isOffline) return;
    const loaded = await loadRazorpayScript();
    if (!loaded) {
      showMsg("Payment service failed to load. Check your connection.", true);
      return;
    }
    startLoading("payment");
    let orderId = null;
    try {
      const orderRes = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ amount: 3000 }),
      });
      if (orderRes.ok) {
        const orderData = await orderRes.json();
        orderId = orderData.id;
      }
    } catch (_) { /* proceed without order id */ }
    stopLoading("payment");
    const options = {
      key: RAZORPAY_KEY_ID,
      amount: 3000,
      currency: "INR",
      name: "MedCase TN",
      description: "1 Month Pro Subscription",
      order_id: orderId || undefined,
      prefill: { email: student?.email, contact: student?.phone || "" },
      theme: { color: "#00b4d8" },
      handler: async function (response) {
        if (!response.razorpay_payment_id) {
          showMsg("Payment response incomplete. Contact support.", true);
          return;
        }
        if (inflightRef.current) return;
        inflightRef.current = true;
        startLoading("payment");
        try {
          const result = await verifyPaymentServerSide(response, student.id, accessToken);
          if (!result?.verified) throw new Error("Server could not verify payment");
          const fresh = await supabaseCall("students", "GET", null, `?id=eq.${student.id}`, accessToken);
          if (fresh?.[0]) persistStudent(fresh[0], accessToken);
          showMsg("🎉 Subscription activated! Welcome to Pro!");
          setTimeout(() => setScreen("home"), 1500);
        } catch (e) {
          handleApiError(e,
            `Payment done but activation failed. Quote payment ID ${response.razorpay_payment_id} to support.`
          );
        }
        stopLoading("payment");
        inflightRef.current = false;
      },
      modal: { ondismiss: () => showMsg("Payment cancelled.", true) },
    };
    new window.Razorpay(options).open();
  };

  // ─── LOGOUT ──────────────────────────────────────────────────────────

  const logout = () => {
    localStorage.removeItem("abdm_student_id");
    setStudent(null);
    setAccessToken(null);
    setEmail("");
    setOtpSent(false);
    setCases([]);
    setScreen("login");
  };



  const accessStatus = getAccessStatus(student);
  const trialDaysLeft = student?.trial_start_date
    ? Math.max(0, 5 - Math.floor(
        (Date.now() - new Date(student.trial_start_date).getTime()) / (1000 * 60 * 60 * 24)
      ))
    : 0;
  const canViewCase = () =>
    accessStatus === "trial" || accessStatus === "subscribed" || accessStatus === "credits";

  // ─── STYLES ──────────────────────────────────────────────────────────

  const styles = {
    app: {
      fontFamily: "'Segoe UI', sans-serif", background: "#0a0f1e",
      minHeight: "100vh", color: "#e8f4f8", maxWidth: 480,
      margin: "0 auto", position: "relative",
    },
    splash: {
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: "100vh",
      background: "linear-gradient(135deg, #0a0f1e 0%, #0d2137 50%, #0a1628 100%)",
    },
    logo: {
      width: 90, height: 90, borderRadius: 24,
      background: "linear-gradient(135deg, #00b4d8, #0077b6)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 40, marginBottom: 20, boxShadow: "0 0 40px rgba(0,180,216,0.4)",
    },
    card: {
      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 16, padding: 20, margin: "12px 16px", backdropFilter: "blur(10px)",
    },
    input: {
      width: "100%", padding: "12px 14px",
      background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
      borderRadius: 10, color: "#e8f4f8", fontSize: 15,
      outline: "none", boxSizing: "border-box", marginBottom: 10,
    },
    select: {
      width: "100%", padding: "12px 14px", background: "#0d2137",
      border: "1px solid rgba(255,255,255,0.15)",
      borderRadius: 10, color: "#e8f4f8", fontSize: 15,
      outline: "none", boxSizing: "border-box", marginBottom: 10,
    },
    // FIX (Single global loading state): btn now takes explicit disabled flag
    btn: (disabled) => ({
      width: "100%", padding: "14px",
      background: disabled ? "rgba(0,180,216,0.3)" : "linear-gradient(135deg,#00b4d8,#0077b6)",
      border: "none", borderRadius: 10, color: "white",
      fontSize: 16, fontWeight: 700,
      cursor: disabled ? "not-allowed" : "pointer",
      marginBottom: 10, letterSpacing: 0.5, opacity: disabled ? 0.65 : 1,
    }),
    btnOutline: {
      width: "100%", padding: "12px", background: "transparent",
      border: "1px solid #00b4d8", borderRadius: 10,
      color: "#00b4d8", fontSize: 15, cursor: "pointer", marginBottom: 8,
    },
    btnSmall: {
      padding: "8px 16px", background: "linear-gradient(135deg,#00b4d8,#0077b6)",
      border: "none", borderRadius: 8, color: "white",
      fontSize: 13, fontWeight: 600, cursor: "pointer",
    },
    header: {
      background: "rgba(10,15,30,0.95)", padding: "14px 16px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      borderBottom: "1px solid rgba(255,255,255,0.08)",
      position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(10px)",
    },
    badge: {
      background: "linear-gradient(135deg,#00b4d8,#0077b6)",
      borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700, color: "white",
    },
    caseCard: {
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,180,216,0.2)",
      borderRadius: 14, padding: 16, margin: "10px 16px", cursor: "pointer",
    },
    tabBar: {
      display: "flex", position: "fixed", bottom: 0, left: "50%",
      transform: "translateX(-50%)", width: "100%", maxWidth: 480,
      background: "rgba(10,15,30,0.98)", borderTop: "1px solid rgba(255,255,255,0.08)", zIndex: 100,
    },
    tab: (active) => ({
      flex: 1, padding: "12px 0", textAlign: "center", cursor: "pointer",
      fontSize: 11, fontWeight: 600,
      color: active ? "#00b4d8" : "#6b8399",
      borderBottom: active ? "2px solid #00b4d8" : "2px solid transparent",
    }),
    alertBox: (isError) => ({
      margin: "0 16px 10px", padding: "12px 16px",
      background: isError ? "rgba(220,53,69,0.15)" : "rgba(0,180,216,0.15)",
      border: `1px solid ${isError ? "rgba(220,53,69,0.4)" : "rgba(0,180,216,0.4)"}`,
      borderRadius: 10, fontSize: 14, color: isError ? "#ff6b7a" : "#00b4d8",
    }),
    warningBox: {
      margin: "0 16px 10px", padding: "12px 16px",
      background: "rgba(255,193,7,0.1)", border: "1px solid rgba(255,193,7,0.3)",
      borderRadius: 10, fontSize: 12, color: "#ffc107",
    },
    detailRow: {
      display: "flex", justifyContent: "space-between",
      padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)",
    },
    // FIX (No offline handling): Persistent banner style
    offlineBanner: {
      background: "rgba(220,53,69,0.9)", color: "white",
      textAlign: "center", padding: "8px 16px", fontSize: 13, fontWeight: 600,
    },
  };

  // ─── SCREENS ─────────────────────────────────────────────────────────

  if (screen === "splash")
    return (
      <div style={styles.splash}>
        <div style={styles.logo}>🏥</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#00b4d8", margin: 0 }}>MedCase TN</h1>
        <p style={{ color: "#6b8399", fontSize: 14, marginTop: 6 }}>Tamil Nadu Medical Learning Platform</p>
        <div style={{ marginTop: 30, display: "flex", gap: 8 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#00b4d8",
              opacity: 0.3 + i * 0.35, animation: "pulse 1.5s infinite", animationDelay: `${i * 0.3}s` }} />
          ))}
        </div>
        <style>{`@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.4)}}`}</style>
      </div>
    );

  if (screen === "login")
    return (
      <div style={styles.app}>
        {isOffline && <div style={styles.offlineBanner}>📡 You're offline — check your connection</div>}
        <div style={{ padding: "40px 16px 20px", textAlign: "center" }}>
          <div style={{ ...styles.logo, margin: "0 auto 16px", width: 70, height: 70, fontSize: 32 }}>🏥</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "#00b4d8", margin: 0 }}>MedCase TN</h1>
          <p style={{ color: "#6b8399", fontSize: 13, marginTop: 4 }}>Practical Medical Learning for TN Students</p>
        </div>
        {error   && <div style={styles.alertBox(true)}>⚠️ {error}</div>}
        {success && <div style={styles.alertBox(false)}>✅ {success}</div>}
        <div style={styles.card}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 16 }}>🔐 Student Login</h2>
          <label style={{ fontSize: 13, color: "#6b8399" }}>Email Address</label>
          <input
            style={{ ...styles.input, marginTop: 6 }}
            placeholder="your@email.com" type="email"
            value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !otpSent && sendOTP()}
            disabled={otpSent || isLoading("otp")}
          />
          {!otpSent ? (
            <button style={styles.btn(isLoading("otp") || isOffline)} onClick={sendOTP} disabled={isLoading("otp") || isOffline}>
              {isLoading("otp") ? "Sending…" : "Send Magic Link 📧"}
            </button>
          ) : (
            <div style={{ textAlign: "center", padding: 20 }}>
              <div style={{ fontSize: 40 }}>📬</div>
              <p style={{ color: "#00b4d8", fontWeight: 700 }}>Magic link sent to {email.trim()}!</p>
              <p style={{ color: "#6b8399", fontSize: 13 }}>Check your email and click the link to login</p>
              <button style={styles.btnOutline} onClick={resetEmail}>Change Email</button>
            </div>
          )}
        </div>
        <div style={styles.warningBox}>
          <strong>⚕️ Educational Use Only</strong><br />
          This platform is strictly for medical students to learn from anonymized clinical cases.
        </div>
        <div style={{ ...styles.card, textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 13, color: "#6b8399" }}>
            🎁 <strong style={{ color: "#00b4d8" }}>5-Day Free Trial</strong> for new students<br />
            Then just <strong style={{ color: "#00b4d8" }}>₹30/month</strong> or earn credits by uploading cases!
          </p>
        </div>
      </div>
    );

  if (screen === "register")
    return (
      <div style={styles.app}>
        {isOffline && <div style={styles.offlineBanner}>📡 You're offline — check your connection</div>}
        <div style={styles.header}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>📋 Complete Registration</span>
        </div>
        {error   && <div style={styles.alertBox(true)}>⚠️ {error}</div>}
        {success && <div style={styles.alertBox(false)}>✅ {success}</div>}
        <div style={{ padding: "16px 16px 100px" }}>
          <div style={styles.warningBox}>⚠️ Please enter accurate details. This platform handles medical information.</div>
          <div style={styles.card}>
            <h3 style={{ margin: "0 0 14px", fontSize: 16, color: "#00b4d8" }}>👨‍⚕️ Student Details</h3>
            <label style={{ fontSize: 12, color: "#6b8399" }}>Full Name *</label>
            <input style={styles.input} placeholder="Dr. Full Name" value={regData.full_name}
              onChange={e => setRegData({ ...regData, full_name: e.target.value })} />
            <label style={{ fontSize: 12, color: "#6b8399" }}>Medical College *</label>
            <select style={styles.select} value={regData.college}
              onChange={e => setRegData({ ...regData, college: e.target.value })}>
              <option value="">Select Your College</option>
              {TN_COLLEGES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <label style={{ fontSize: 12, color: "#6b8399" }}>Year of Study *</label>
            <select style={styles.select} value={regData.year_of_study}
              onChange={e => setRegData({ ...regData, year_of_study: e.target.value })}>
              <option value="">Select Year</option>
              <option value="1st Year MBBS">1st Year MBBS</option>
              <option value="2nd Year MBBS">2nd Year MBBS</option>
              <option value="3rd Year MBBS">3rd Year MBBS</option>
              <option value="Final Year MBBS">Final Year MBBS</option>
              <option value="Internship">Internship</option>
              <option value="PG Resident">PG Resident</option>
            </select>
            <label style={{ fontSize: 12, color: "#6b8399" }}>Roll Number *</label>
            <input style={styles.input} placeholder="Your Roll Number" value={regData.roll_number}
              onChange={e => setRegData({ ...regData, roll_number: e.target.value })} />
            <button style={styles.btn(isLoading("register") || isOffline)} onClick={registerStudent} disabled={isLoading("register") || isOffline}>
              {isLoading("register") ? "Registering…" : "Register & Start Free Trial 🎉"}
            </button>
          </div>
        </div>
      </div>
    );

  if (screen === "caseDetail" && selectedCase)
    return (
      <div style={styles.app}>
        <div style={styles.header}>
          <button onClick={() => { setScreen("home"); setSelectedCase(null); }}
            style={{ background: "none", border: "none", color: "#00b4d8", fontSize: 22, cursor: "pointer" }}>←</button>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Case Details</span>
          <span style={styles.badge}>Bed {selectedCase.bed_number}</span>
        </div>
        <div style={{ padding: "16px 16px 100px" }}>
          <div style={styles.warningBox}>
            ⚕️ <strong>Educational Purpose Only.</strong> Visit bed {selectedCase.bed_number} in {selectedCase.ward} to observe under supervision.
          </div>
          <div style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, color: "#00b4d8" }}>Patient {selectedCase.patient_initials}</h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b8399" }}>{selectedCase.college}</p>
              </div>
              <div style={{ ...styles.badge, fontSize: 14, padding: "6px 14px" }}>🛏️ Bed {selectedCase.bed_number}</div>
            </div>
            {[
              ["🏥 Ward",           selectedCase.ward],
              ["👤 Age / Gender",   `${selectedCase.age} yrs / ${selectedCase.gender}`],
              ["🩺 Chief Complaint", selectedCase.chief_complaint],
              ["🔬 Diagnosis",      selectedCase.diagnosis],
              ["📋 Symptoms",       selectedCase.symptoms],
              ["💊 Treatment",      selectedCase.treatment],
              ["🏷️ Status",         selectedCase.patient_status ? selectedCase.patient_status.charAt(0).toUpperCase() + selectedCase.patient_status.slice(1) : "Admitted"],
              ["📅 Uploaded",       new Date(selectedCase.created_at).toLocaleDateString("en-IN")],
            ].map(([label, value]) => (
              <div key={label} style={styles.detailRow}>
                <span style={{ fontSize: 13, color: "#6b8399", flex: "0 0 140px" }}>{label}</span>
                <span style={{ fontSize: 14, color: "#e8f4f8", flex: 1, textAlign: "right" }}>{value}</span>
              </div>
            ))}
            {selectedCase.case_photo && (
              <div style={{ marginTop: 14 }}>
                <p style={{ margin: "0 0 8px", fontSize: 12, color: "#6b8399" }}>📷 Case Photo</p>
                <img src={selectedCase.case_photo} alt="case" style={{ width: "100%", borderRadius: 10, maxHeight: 250, objectFit: "cover" }} />
              </div>
            )}
            {selectedCase.notes && (
              <div style={{ marginTop: 14, padding: 12, background: "rgba(0,180,216,0.08)", borderRadius: 10 }}>
                <p style={{ margin: 0, fontSize: 12, color: "#6b8399" }}>📝 Additional Notes</p>
                <p style={{ margin: "6px 0 0", fontSize: 14 }}>{selectedCase.notes}</p>
              </div>
            )}
          </div>
          <div style={{ ...styles.card, background: "rgba(0,180,216,0.08)", border: "1px solid rgba(0,180,216,0.3)" }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 15, color: "#00b4d8" }}>🗺️ How to Find This Patient</h3>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
              Go to <strong>{selectedCase.ward}</strong> in your hospital.<br />
              Look for <strong>Bed Number: {selectedCase.bed_number}</strong><br />
              Observe the patient under faculty supervision only.
            </p>
          </div>
          {selectedCase.uploaded_by === student?.id && (
            <div style={{ padding: "0 16px 16px" }}>
              <button
                style={{ ...styles.btnOutline, color: "#ff6b7a", borderColor: "#ff6b7a" }}
                onClick={() => deleteCase(selectedCase.id)}
                disabled={isLoading("deleteCase")}>
                {isLoading("deleteCase") ? "Deleting…" : "🗑️ Delete My Case"}
              </button>
            </div>
          )}
        </div>
      </div>
    );

  if (screen === "subscribe")
    return (
      <div style={styles.app}>
        {isOffline && <div style={styles.offlineBanner}>📡 You're offline — payments unavailable</div>}
        <div style={styles.header}>
          <button onClick={() => setScreen("home")}
            style={{ background: "none", border: "none", color: "#00b4d8", fontSize: 22, cursor: "pointer" }}>←</button>
          <span style={{ fontWeight: 700, fontSize: 16 }}>💳 Subscription</span>
          <div />
        </div>
        {error   && <div style={styles.alertBox(true)}>⚠️ {error}</div>}
        {success && <div style={styles.alertBox(false)}>✅ {success}</div>}
        <div style={{ padding: "16px 16px 100px" }}>
          <div style={{ ...styles.card, textAlign: "center", background: "linear-gradient(135deg,rgba(0,180,216,0.1),rgba(0,119,182,0.1))", border: "1px solid rgba(0,180,216,0.3)" }}>
            <div style={{ fontSize: 48, marginBottom: 10 }}>👑</div>
            <h2 style={{ margin: "0 0 6px", color: "#00b4d8" }}>MedCase TN Pro</h2>
            <div style={{ fontSize: 32, fontWeight: 800, color: "#e8f4f8" }}>
              ₹30<span style={{ fontSize: 16, color: "#6b8399" }}>/month</span>
            </div>
            <p style={{ color: "#6b8399", fontSize: 13, margin: "10px 0 0" }}>Unlimited access to all cases</p>
          </div>
          {["✅ Unlimited case views","✅ All colleges & wards","✅ New cases daily","✅ Upload & earn credits","✅ Priority support"].map(f => (
            <div key={f} style={{ padding: "10px 16px", fontSize: 14, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>{f}</div>
          ))}
          <div style={{ padding: 16 }}>
            <button style={styles.btn(isLoading("payment") || isOffline)} onClick={openRazorpay} disabled={isLoading("payment") || isOffline}>
              {isLoading("payment") ? "Processing…" : "💳 Subscribe Now — ₹30/month"}
            </button>
            <button style={styles.btnOutline} onClick={() => setScreen("home")}>Maybe Later</button>
          </div>
        </div>
      </div>
    );

  // ─── HOME ─────────────────────────────────────────────────────────────

  return (
    <div style={styles.app}>
      {/* FIX (No offline handling): Persistent offline banner on home screen */}
      {isOffline && <div style={styles.offlineBanner}>📡 You're offline — showing cached data</div>}

      {/* FIX (No confirmation before spending credits): Confirm modal */}
      {creditPendingCase && (
        <CreditConfirmModal
          caseItem={creditPendingCase}
          onConfirm={() => { const c = creditPendingCase; setCreditPendingCase(null); executeUseCredit(c); }}
          onCancel={() => setCreditPendingCase(null)}
        />
      )}

      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#00b4d8,#0077b6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🏥</div>
          <span style={{ fontWeight: 800, fontSize: 16, color: "#00b4d8" }}>MedCase TN</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {accessStatus === "trial" && (
            <span style={{ ...styles.badge, background: "linear-gradient(135deg,#ffc107,#ff8c00)", fontSize: 11 }}>Trial: {trialDaysLeft}d left</span>
          )}
          {accessStatus === "subscribed" && <span style={styles.badge}>Pro ✅</span>}
          {accessStatus === "credits" && (
            <span style={{ ...styles.badge, background: "linear-gradient(135deg,#6f42c1,#4a0080)" }}>⭐ {student?.credits}</span>
          )}
          {accessStatus === "expired" && (
            <button style={{ ...styles.btnSmall, fontSize: 11, padding: "5px 10px" }} onClick={() => setScreen("subscribe")}>Subscribe</button>
          )}
        </div>
      </div>

      {error   && <div style={styles.alertBox(true)}>⚠️ {error}</div>}
      {success && <div style={styles.alertBox(false)}>✅ {success}</div>}

      {activeTab === "cases" && (
        <div style={{ paddingBottom: 80 }}>
          <div style={{ display: "flex", gap: 8, padding: "12px 16px 0" }}>
            <select style={{ ...styles.select, flex: 1, marginBottom: 0, fontSize: 12, padding: "8px 10px" }}
              value={filterCollege} onChange={e => handleFilterChange("college", e.target.value)}>
              <option value="">All Colleges</option>
              {TN_COLLEGES.map(c => <option key={c} value={c}>{c.split(",")[0]}</option>)}
            </select>
            <select style={{ ...styles.select, flex: 1, marginBottom: 0, fontSize: 12, padding: "8px 10px" }}
              value={filterWard} onChange={e => handleFilterChange("ward", e.target.value)}>
              <option value="">All Wards</option>
              {WARDS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div style={{ padding: "8px 16px 0" }}>
            <button style={{ ...styles.btnSmall, width: "100%", padding: "10px" }}
              onClick={() => loadCases(0)} disabled={isLoading("cases") || isOffline}>
              {isLoading("cases") ? "Loading…" : "🔍 Search Cases"}
            </button>
          </div>

          {/* FIX (No skeleton/loading UI): Shimmer placeholders on initial load */}
          {isLoading("cases") && cases.length === 0 && [1, 2, 3].map(i => <CaseSkeleton key={i} />)}

          {!isLoading("cases") && cases.length === 0 && (
            <div style={{ textAlign: "center", padding: 40, color: "#6b8399" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
              <p>No cases found.<br />Be the first to upload a case!</p>
            </div>
          )}

          {cases.map(c => (
            <div key={c.id} style={styles.caseCard}
              onClick={() => {
                if (isLoading("cases") || isLoading("credit") || inflightRef.current) return;
                if (!canViewCase()) { setScreen("subscribe"); }
                else if (accessStatus === "credits") { useCredit(c); }
                else { setSelectedCase(c); setScreen("caseDetail"); }
              }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                    <span style={{ ...styles.badge, fontSize: 11 }}>🛏️ Bed {c.bed_number}</span>
                    <span style={{ fontSize: 11, color: "#6b8399" }}>{c.gender}, {c.age}y</span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#e8f4f8" }}>{c.diagnosis}</div>
                  <div style={{ fontSize: 12, color: "#6b8399", marginTop: 4 }}>{c.ward}</div>
                  <div style={{ fontSize: 11, color: "#4a90a4", marginTop: 2 }}>{c.college.split(",")[0]}</div>
                </div>
                <div style={{ fontSize: 22, marginLeft: 10 }}>{canViewCase() ? "👁️" : "🔒"}</div>
              </div>
              <div style={{ marginTop: 8, padding: "8px 10px", background: "rgba(0,180,216,0.08)", borderRadius: 8 }}>
                <span style={{ fontSize: 12, color: "#6b8399" }}>Chief Complaint: </span>
                <span style={{ fontSize: 12, color: "#e8f4f8" }}>{c.chief_complaint}</span>
              </div>
              {accessStatus === "credits" && (
                <div style={{ marginTop: 6, fontSize: 11, color: "#ffc107", textAlign: "right" }}>Tap to confirm — uses 1 credit</div>
              )}
            </div>
          ))}

          {/* FIX (No pagination): Load More button — appends next PAGE_SIZE rows */}
          {hasMoreCases && !isLoading("cases") && cases.length > 0 && (
            <div style={{ padding: "8px 16px 16px" }}>
              <button
                style={{ ...styles.btnSmall, width: "100%", padding: "10px", background: "rgba(0,180,216,0.15)", border: "1px solid rgba(0,180,216,0.4)", color: "#00b4d8" }}
                onClick={() => loadCases(casePage + 1)} disabled={isLoading("cases")}>
                Load More Cases ↓
              </button>
            </div>
          )}
          {isLoading("cases") && cases.length > 0 && (
            <div style={{ textAlign: "center", padding: "12px 0", color: "#6b8399", fontSize: 13 }}>Loading more…</div>
          )}
        </div>
      )}

      {activeTab === "upload" && (
        <div style={{ padding: "16px 16px 100px" }}>
          <div style={{ ...styles.warningBox, marginLeft: 0, marginRight: 0 }}>
            ⚕️ <strong>Important:</strong> Enter only anonymized patient data. Use initials only. Uploading earns you <strong>1 credit</strong>.
          </div>
          <div style={styles.card}>
            <h3 style={{ margin: "0 0 14px", color: "#00b4d8", fontSize: 16 }}>📤 Upload New Case</h3>
            <label style={{ fontSize: 12, color: "#6b8399" }}>Ward *</label>
            <select style={styles.select} value={caseForm.ward}
              onChange={e => setCaseForm({ ...caseForm, ward: e.target.value })}>
              <option value="">Select Ward</option>
              {WARDS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
            <label style={{ fontSize: 12, color: "#6b8399" }}>Bed Number *</label>
            <input style={styles.input} placeholder="e.g. 24A" value={caseForm.bed_number}
              onChange={e => setCaseForm({ ...caseForm, bed_number: e.target.value })} />
            <label style={{ fontSize: 12, color: "#6b8399" }}>Patient Initials Only * (NOT full name)</label>
            <input style={styles.input} placeholder="e.g. R.K." value={caseForm.patient_initials}
              onChange={e => setCaseForm({ ...caseForm, patient_initials: e.target.value })} />
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: "#6b8399" }}>Age *</label>
                {/* FIX (Weak handling of invalid numeric inputs): inputMode numeric,
                    step=1 prevents decimals at browser level; isValidAge catches the rest */}
                <input style={styles.input} placeholder="Age" type="number"
                  inputMode="numeric" min="1" max="120" step="1"
                  value={caseForm.age}
                  onChange={e => setCaseForm({ ...caseForm, age: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: "#6b8399" }}>Gender *</label>
                <select style={styles.select} value={caseForm.gender}
                  onChange={e => setCaseForm({ ...caseForm, gender: e.target.value })}>
                  <option value="">Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <label style={{ fontSize: 12, color: "#6b8399" }}>Chief Complaint *</label>
            <input style={styles.input} placeholder="Main presenting complaint" value={caseForm.chief_complaint}
              onChange={e => setCaseForm({ ...caseForm, chief_complaint: e.target.value })} />
            <label style={{ fontSize: 12, color: "#6b8399" }}>Diagnosis *</label>
            <input style={styles.input} placeholder="Primary diagnosis" value={caseForm.diagnosis}
              onChange={e => setCaseForm({ ...caseForm, diagnosis: e.target.value })} />
            <label style={{ fontSize: 12, color: "#6b8399" }}>Symptoms *</label>
            <textarea style={{ ...styles.input, minHeight: 80, resize: "vertical" }}
              placeholder="Describe symptoms in detail" value={caseForm.symptoms}
              onChange={e => setCaseForm({ ...caseForm, symptoms: e.target.value })} />
            <label style={{ fontSize: 12, color: "#6b8399" }}>Treatment Plan *</label>
            <textarea style={{ ...styles.input, minHeight: 80, resize: "vertical" }}
              placeholder="Current treatment being given" value={caseForm.treatment}
              onChange={e => setCaseForm({ ...caseForm, treatment: e.target.value })} />
            <label style={{ fontSize: 12, color: "#6b8399" }}>Additional Notes (Optional)</label>
            <textarea style={{ ...styles.input, minHeight: 60, resize: "vertical" }}
              placeholder="Any other observations..." value={caseForm.notes}
              onChange={e => setCaseForm({ ...caseForm, notes: e.target.value })} />
            <label style={{ fontSize: 12, color: "#6b8399" }}>Patient Status *</label>
            <select style={styles.select} value={caseForm.patient_status}
              onChange={e => setCaseForm({ ...caseForm, patient_status: e.target.value })}>
              <option value="admitted">🏥 Admitted</option>
              <option value="discharged">🏠 Discharged</option>
              <option value="icu">🚨 ICU</option>
              <option value="deceased">🕊️ Deceased</option>
            </select>
            <label style={{ fontSize: 12, color: "#6b8399" }}>Case Photo (Optional)</label>
            <div style={{ marginBottom: 10 }}>
              <input type="file" accept="image/*" capture="environment" id="casePhotoInput"
                style={{ display: "none" }}
                onChange={e => {
                  const file = e.target.files[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = ev => setCaseForm({ ...caseForm, case_photo: ev.target.result });
                  reader.readAsDataURL(file);
                }} />
              <button style={{ ...styles.btnSmall, width: "100%", padding: "10px", background: "rgba(0,180,216,0.15)", border: "1px solid rgba(0,180,216,0.4)", color: "#00b4d8" }}
                onClick={() => document.getElementById("casePhotoInput").click()}>
                📷 {caseForm.case_photo ? "Photo Selected ✅" : "Take / Upload Photo"}
              </button>
              {caseForm.case_photo && (
                <div style={{ marginTop: 8, textAlign: "center" }}>
                  <img src={caseForm.case_photo} alt="case" style={{ maxWidth: "100%", borderRadius: 10, maxHeight: 200, objectFit: "cover" }} />
                  <button style={{ ...styles.btnSmall, marginTop: 6, background: "rgba(220,53,69,0.2)", color: "#ff6b7a", border: "1px solid rgba(220,53,69,0.4)" }}
                    onClick={() => setCaseForm({ ...caseForm, case_photo: null })}>Remove Photo</button>
                </div>
              )}
            </div>
            <button style={styles.btn(isLoading("upload") || isOffline)} onClick={uploadCase} disabled={isLoading("upload") || isOffline}>
              {isLoading("upload") ? "Uploading…" : "Upload Case & Earn 1 Credit ⭐"}
            </button>
          </div>
        </div>
      )}

      {activeTab === "profile" && (
        <div style={{ padding: "16px 16px 100px" }}>
          <div style={styles.card}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ width: 70, height: 70, borderRadius: "50%", background: "linear-gradient(135deg,#00b4d8,#0077b6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 10px" }}>👨‍⚕️</div>
              <h2 style={{ margin: 0, fontSize: 18 }}>Dr. {student?.full_name}</h2>
              <p style={{ margin: "4px 0 0", color: "#6b8399", fontSize: 13 }}>{student?.year_of_study}</p>
            </div>
            {[
              ["📧 Email",       student?.email],
              ["🏥 College",     student?.college],
              ["🎓 Year",        student?.year_of_study],
              ["🆔 Roll No",     student?.roll_number],
              ["⭐ Credits",     student?.credits || 0],
              ["🔓 Access",      accessStatus === "trial"       ? `Free Trial (${trialDaysLeft} days left)`
                               : accessStatus === "subscribed"  ? "Pro Subscriber ✅"
                               : accessStatus === "credits"     ? "Credit-based Access"
                               :                                  "Expired"],
              ["📅 Member Since", student?.created_at ? new Date(student.created_at).toLocaleDateString("en-IN") : "—"],
            ].map(([label, value]) => (
              <div key={label} style={styles.detailRow}>
                <span style={{ fontSize: 13, color: "#6b8399" }}>{label}</span>
                <span style={{ fontSize: 13, color: "#e8f4f8" }}>{value}</span>
              </div>
            ))}
          </div>
          {accessStatus !== "subscribed" && (
            <button style={styles.btn(false)} onClick={() => setScreen("subscribe")}>💳 Subscribe for ₹30/month</button>
          )}
          <div style={styles.card}>
            <h3 style={{ margin: "0 0 10px", fontSize: 15, color: "#00b4d8" }}>💡 Earn Free Credits</h3>
            <p style={{ margin: 0, fontSize: 13, color: "#6b8399", lineHeight: 1.6 }}>
              Upload a patient case → Earn 1 credit<br />
              Use 1 credit → View any 1 case for free<br />
              No limit on credits you can earn!
            </p>
          </div>
          <div style={styles.warningBox}>
            ⚠️ This app is for educational purposes only. All patient data must be anonymized. Misuse may result in account suspension.
          </div>
          <button style={{ ...styles.btnOutline, color: "#ff6b7a", borderColor: "#ff6b7a" }} onClick={logout}>Logout</button>
          <button style={{ ...styles.btnOutline, color: "#ff6b7a", borderColor: "rgba(220,53,69,0.4)", marginTop: 4, fontSize: 13 }}
            onClick={async () => {
              if (!window.confirm("Permanently delete your account? Your uploaded cases will remain.")) return;
              if (inflightRef.current) return;
              inflightRef.current = true;
              startLoading("deleteAccount");
              try {
                await supabaseCall("students", "DELETE", null, `?id=eq.${student.id}`, accessToken);
                showMsg("Account deleted.");
                setTimeout(() => logout(), 1500);
              } catch (e) { handleApiError(e, "Failed to delete account"); }
              stopLoading("deleteAccount");
              inflightRef.current = false;
            }}>
            🗑️ Delete My Account
          </button>
        </div>
      )}

      <div style={styles.tabBar}>
        {[
          { id: "cases",   icon: "🏥", label: "Cases"   },
          { id: "upload",  icon: "📤", label: "Upload"  },
          { id: "profile", icon: "👤", label: "Profile" },
        ].map(t => (
          <div key={t.id} style={styles.tab(activeTab === t.id)} onClick={() => setActiveTab(t.id)}>
            <div style={{ fontSize: 20 }}>{t.icon}</div>
            <div>{t.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

