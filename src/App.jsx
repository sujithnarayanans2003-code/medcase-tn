import { useState, useEffect, useCallback } from "react";

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID;

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

// ─── HELPERS ─────────────────────────────────────────────────────────────────

async function supabase(table, method = "GET", body = null, query = "") {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const headers = {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    Prefer: "return=representation",
  };
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Database error");
  }
  return res.json();
}

// ─── Supabase Email OTP ───────────────────────────────────────────────────────

async function sendEmailOTP(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, create_user: true }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.msg || err.message || "Failed to send OTP");
  }
}

async function verifyEmailOTP(email, token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, token, type: "email" }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.msg || err.message || "Invalid OTP");
  }
  return res.json();
}

function getAccessStatus(student) {
  if (!student) return "none";
  if (student.is_subscribed) {
    const end = new Date(student.subscription_end_date);
    if (end > new Date()) return "subscribed";
  }
  const trialStart = new Date(student.trial_start_date);
  const daysPassed = (new Date() - trialStart) / (1000 * 60 * 60 * 24);
  if (daysPassed <= 5) return "trial";
  if (student.credits > 0) return "credits";
  return "expired";
}

// ─── APP ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState("splash");
  const [student, setStudent] = useState(null);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  const [regData, setRegData] = useState({
    full_name: "", college: "", year_of_study: "", roll_number: "",
  });

  const [caseForm, setCaseForm] = useState({
    ward: "", bed_number: "", patient_initials: "", age: "",
    gender: "", chief_complaint: "", diagnosis: "", symptoms: "", treatment: "", notes: "",
  });
  const [selectedCase, setSelectedCase] = useState(null);
  const [filterCollege, setFilterCollege] = useState("");
  const [filterWard, setFilterWard] = useState("");
  const [activeTab, setActiveTab] = useState("cases");

  useEffect(() => {
    setTimeout(() => {
      const saved = localStorage.getItem("abdm_student");
      if (saved) {
        try {
          const s = JSON.parse(saved);
          setStudent(s);
          setScreen("home");
        } catch {
          setScreen("login");
        }
      } else {
        setScreen("login");
      }
    }, 2000);
  }, []);

  const showMsg = (msg, isError = false) => {
    if (isError) { setError(msg); setTimeout(() => setError(""), 5000); }
    else { setSuccess(msg); setTimeout(() => setSuccess(""), 5000); }
  };

  // ─── EMAIL OTP FLOW ───────────────────────────────────────────────────

  const sendOTP = async () => {
    if (!email || !email.includes("@"))
      return showMsg("Enter a valid email address", true);
    setLoading(true);
    try {
      await sendEmailOTP(email);
      setOtpSent(true);
      showMsg("✅ OTP sent to " + email + " — check your inbox!");
    } catch (e) {
      showMsg("Failed to send OTP: " + e.message, true);
    }
    setLoading(false);
  };

  const verifyOTPAndLogin = async () => {
    if (!otp || otp.length !== 6) return showMsg("Enter the 6-digit OTP", true);
    setLoading(true);
    try {
      await verifyEmailOTP(email, otp);
      const students = await supabase("students", "GET", null, `?email=eq.${encodeURIComponent(email)}`);
      if (students && students.length > 0) {
        const s = students[0];
        localStorage.setItem("abdm_student", JSON.stringify(s));
        setStudent(s);
        setScreen("home");
        showMsg(`Welcome back, Dr. ${s.full_name}! 🩺`);
      } else {
        setScreen("register");
      }
    } catch (e) {
      showMsg("Wrong OTP. Please try again.", true);
    }
    setLoading(false);
  };

  const resetEmail = () => {
    setOtpSent(false);
    setOtp("");
  };

  // ─── REGISTER ────────────────────────────────────────────────────────

  const registerStudent = async () => {
    const { full_name, college, year_of_study, roll_number } = regData;
    if (!full_name || !college || !year_of_study || !roll_number)
      return showMsg("Please fill all fields", true);
    setLoading(true);
    try {
      const newStudent = await supabase("students", "POST", {
        full_name, email, college, year_of_study, roll_number,
        is_verified: true, credits: 0,
        trial_start_date: new Date().toISOString(),
        is_subscribed: false,
      });
      const s = newStudent[0];
      localStorage.setItem("abdm_student", JSON.stringify(s));
      setStudent(s);
      setScreen("home");
      showMsg(`Welcome Dr. ${s.full_name}! 5-day free trial started! 🎉`);
    } catch (e) {
      showMsg("Registration failed: " + e.message, true);
    }
    setLoading(false);
  };

  // ─── CASES ───────────────────────────────────────────────────────────

  const loadCases = useCallback(async () => {
    setLoading(true);
    try {
      let query = "?is_active=eq.true&order=created_at.desc";
      if (filterCollege) query += `&college=eq.${encodeURIComponent(filterCollege)}`;
      if (filterWard) query += `&ward=eq.${encodeURIComponent(filterWard)}`;
      const data = await supabase("cases", "GET", null, query);
      setCases(data || []);
    } catch (e) {
      showMsg("Failed to load cases: " + e.message, true);
    }
    setLoading(false);
  }, [filterCollege, filterWard]);

  useEffect(() => {
    if (screen === "home") loadCases();
  }, [screen, loadCases]);

  const uploadCase = async () => {
    const { ward, bed_number, patient_initials, age, gender,
      chief_complaint, diagnosis, symptoms, treatment } = caseForm;
    if (!ward || !bed_number || !patient_initials || !age || !gender ||
      !chief_complaint || !diagnosis || !symptoms || !treatment)
      return showMsg("Fill all required fields", true);
    if (age < 0 || age > 120) return showMsg("Enter a valid age", true);
    setLoading(true);
    try {
      await supabase("cases", "POST", {
        ...caseForm, age: parseInt(age),
        college: student.college, uploaded_by: student.id,
      });
      await supabase("credit_logs", "POST", {
        student_id: student.id, action: "CASE_UPLOAD", points: 1,
      });
      const updatedStudents = await supabase("students", "PATCH",
        { credits: (student.credits || 0) + 1 }, `?id=eq.${student.id}`);
      if (updatedStudents && updatedStudents[0]) {
        const updated = updatedStudents[0];
        setStudent(updated);
        localStorage.setItem("abdm_student", JSON.stringify(updated));
      }
      setCaseForm({
        ward: "", bed_number: "", patient_initials: "", age: "",
        gender: "", chief_complaint: "", diagnosis: "", symptoms: "", treatment: "", notes: "",
      });
      showMsg("Case uploaded! +1 Credit earned 🎉");
      setActiveTab("cases");
      loadCases();
    } catch (e) {
      showMsg("Upload failed: " + e.message, true);
    }
    setLoading(false);
  };

  const useCredit = async (caseItem) => {
    if (student.credits <= 0) return showMsg("No credits! Upload a case to earn credits.", true);
    setLoading(true);
    try {
      await supabase("credit_logs", "POST", {
        student_id: student.id, action: "CASE_VIEW", points: -1,
      });
      const updatedStudents = await supabase("students", "PATCH",
        { credits: student.credits - 1 }, `?id=eq.${student.id}`);
      if (updatedStudents && updatedStudents[0]) {
        const updated = updatedStudents[0];
        setStudent(updated);
        localStorage.setItem("abdm_student", JSON.stringify(updated));
      }
      setSelectedCase(caseItem);
      setScreen("caseDetail");
    } catch (e) {
      showMsg("Failed. Try again.", true);
    }
    setLoading(false);
  };

  // ─── RAZORPAY ────────────────────────────────────────────────────────

  const openRazorpay = () => {
    if (!window.Razorpay) {
      showMsg("Payment service not loaded. Please refresh the page.", true);
      return;
    }
    const options = {
      key: RAZORPAY_KEY_ID,
      amount: 3000,
      currency: "INR",
      name: "MedCase TN",
      description: "1 Month Pro Subscription",
      prefill: { email: student?.email },
      theme: { color: "#00b4d8" },
      handler: async function (response) {
        setLoading(true);
        try {
          const endDate = new Date();
          endDate.setMonth(endDate.getMonth() + 1);
          await supabase("subscriptions", "POST", {
            student_id: student.id,
            end_date: endDate.toISOString(),
            amount: 30, is_active: true,
            payment_id: response.razorpay_payment_id,
          });
          const updated = await supabase("students", "PATCH", {
            is_subscribed: true,
            subscription_end_date: endDate.toISOString(),
          }, `?id=eq.${student.id}`);
          const s = updated[0];
          setStudent(s);
          localStorage.setItem("abdm_student", JSON.stringify(s));
          showMsg("🎉 Subscription activated! Welcome to Pro!");
          setTimeout(() => setScreen("home"), 1500);
        } catch (e) {
          showMsg("Payment done but activation failed. Contact support.", true);
        }
        setLoading(false);
      },
      modal: { ondismiss: () => showMsg("Payment cancelled.", true) },
    };
    new window.Razorpay(options).open();
  };

  // ─── LOGOUT ──────────────────────────────────────────────────────────

  const logout = () => {
    localStorage.removeItem("abdm_student");
    setStudent(null);
    setEmail("");
    setOtp("");
    setOtpSent(false);
    setScreen("login");
  };

  const accessStatus = getAccessStatus(student);
  const trialDaysLeft = student
    ? Math.max(0, 5 - Math.floor((new Date() - new Date(student.trial_start_date)) / (1000 * 60 * 60 * 24)))
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
      fontSize: 40, marginBottom: 20,
      boxShadow: "0 0 40px rgba(0,180,216,0.4)",
    },
    card: {
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 16, padding: 20, margin: "12px 16px",
      backdropFilter: "blur(10px)",
    },
    input: {
      width: "100%", padding: "12px 14px",
      background: "rgba(255,255,255,0.08)",
      border: "1px solid rgba(255,255,255,0.15)",
      borderRadius: 10, color: "#e8f4f8",
      fontSize: 15, outline: "none", boxSizing: "border-box", marginBottom: 10,
    },
    select: {
      width: "100%", padding: "12px 14px", background: "#0d2137",
      border: "1px solid rgba(255,255,255,0.15)",
      borderRadius: 10, color: "#e8f4f8",
      fontSize: 15, outline: "none", boxSizing: "border-box", marginBottom: 10,
    },
    btn: {
      width: "100%", padding: "14px",
      background: "linear-gradient(135deg, #00b4d8, #0077b6)",
      border: "none", borderRadius: 10, color: "white",
      fontSize: 16, fontWeight: 700, cursor: "pointer",
      marginBottom: 10, letterSpacing: 0.5,
    },
    btnOutline: {
      width: "100%", padding: "12px", background: "transparent",
      border: "1px solid #00b4d8", borderRadius: 10,
      color: "#00b4d8", fontSize: 15, cursor: "pointer", marginBottom: 8,
    },
    btnSmall: {
      padding: "8px 16px",
      background: "linear-gradient(135deg, #00b4d8, #0077b6)",
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
      background: "linear-gradient(135deg, #00b4d8, #0077b6)",
      borderRadius: 20, padding: "4px 12px",
      fontSize: 12, fontWeight: 700, color: "white",
    },
    caseCard: {
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(0,180,216,0.2)",
      borderRadius: 14, padding: 16, margin: "10px 16px", cursor: "pointer",
    },
    tabBar: {
      display: "flex", position: "fixed", bottom: 0, left: "50%",
      transform: "translateX(-50%)", width: "100%", maxWidth: 480,
      background: "rgba(10,15,30,0.98)",
      borderTop: "1px solid rgba(255,255,255,0.08)", zIndex: 100,
    },
    tab: (active) => ({
      flex: 1, padding: "12px 0", textAlign: "center",
      cursor: "pointer", fontSize: 11, fontWeight: 600,
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
      background: "rgba(255,193,7,0.1)",
      border: "1px solid rgba(255,193,7,0.3)",
      borderRadius: 10, fontSize: 12, color: "#ffc107",
    },
    detailRow: {
      display: "flex", justifyContent: "space-between",
      padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)",
    },
  };

  // ─── SCREENS ─────────────────────────────────────────────────────────

  if (screen === "splash") return (
    <div style={styles.splash}>
      <div style={styles.logo}>🏥</div>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: "#00b4d8", margin: 0 }}>MedCase TN</h1>
      <p style={{ color: "#6b8399", fontSize: 14, marginTop: 6 }}>Tamil Nadu Medical Learning Platform</p>
      <div style={{ marginTop: 30, display: "flex", gap: 8 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 8, height: 8, borderRadius: "50%",
            background: "#00b4d8", opacity: 0.3 + i * 0.35,
            animation: "pulse 1.5s infinite", animationDelay: `${i * 0.3}s`,
          }} />
        ))}
      </div>
      <style>{`@keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.4)} }`}</style>
    </div>
  );

  if (screen === "login") return (
    <div style={styles.app}>
      <div style={{ padding: "40px 16px 20px", textAlign: "center" }}>
        <div style={{ ...styles.logo, margin: "0 auto 16px", width: 70, height: 70, fontSize: 32 }}>🏥</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: "#00b4d8", margin: 0 }}>MedCase TN</h1>
        <p style={{ color: "#6b8399", fontSize: 13, marginTop: 4 }}>Practical Medical Learning for TN Students</p>
      </div>

      {error && <div style={styles.alertBox(true)}>⚠️ {error}</div>}
      {success && <div style={styles.alertBox(false)}>✅ {success}</div>}

      <div style={styles.card}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 16 }}>🔐 Student Login</h2>
        <label style={{ fontSize: 13, color: "#6b8399" }}>Email Address</label>
        <input
          style={{ ...styles.input, marginTop: 6 }}
          placeholder="your@email.com"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value.trim())}
          disabled={otpSent}
        />

        {!otpSent ? (
          <button style={{ ...styles.btn, marginTop: 4 }} onClick={sendOTP} disabled={loading}>
            {loading ? "Sending OTP..." : "Send OTP 📧"}
          </button>
        ) : (
          <>
            <label style={{ fontSize: 13, color: "#6b8399" }}>Enter OTP sent to {email}</label>
            <input
              style={{ ...styles.input, marginTop: 6, letterSpacing: 8, textAlign: "center", fontSize: 22, fontWeight: 700 }}
              placeholder="······" maxLength={6}
              value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
            />
            <button style={styles.btn} onClick={verifyOTPAndLogin} disabled={loading}>
              {loading ? "Verifying..." : "Verify & Login ✅"}
            </button>
            <button style={styles.btnOutline} onClick={resetEmail}>Change Email</button>
          </>
        )}
      </div>

      <div style={styles.warningBox}>
        <strong>⚕️ Educational Use Only</strong><br />
        This platform is strictly for medical students to learn from anonymized clinical cases. Patient privacy is our top priority.
      </div>
      <div style={{ ...styles.card, textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 13, color: "#6b8399" }}>
          🎁 <strong style={{ color: "#00b4d8" }}>5-Day Free Trial</strong> for new students<br />
          Then just <strong style={{ color: "#00b4d8" }}>₹30/month</strong> or earn credits by uploading cases!
        </p>
      </div>
    </div>
  );

  if (screen === "register") return (
    <div style={styles.app}>
      <div style={styles.header}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>📋 Complete Registration</span>
      </div>
      {error && <div style={styles.alertBox(true)}>⚠️ {error}</div>}
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
          <button style={styles.btn} onClick={registerStudent} disabled={loading}>
            {loading ? "Registering..." : "Register & Start Free Trial 🎉"}
          </button>
        </div>
      </div>
    </div>
  );

  if (screen === "caseDetail" && selectedCase) return (
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
            ["🏥 Ward", selectedCase.ward],
            ["👤 Age / Gender", `${selectedCase.age} yrs / ${selectedCase.gender}`],
            ["🩺 Chief Complaint", selectedCase.chief_complaint],
            ["🔬 Diagnosis", selectedCase.diagnosis],
            ["📋 Symptoms", selectedCase.symptoms],
            ["💊 Treatment", selectedCase.treatment],
            ["📅 Uploaded", new Date(selectedCase.created_at).toLocaleDateString("en-IN")],
          ].map(([label, value]) => (
            <div key={label} style={styles.detailRow}>
              <span style={{ fontSize: 13, color: "#6b8399", flex: "0 0 140px" }}>{label}</span>
              <span style={{ fontSize: 14, color: "#e8f4f8", flex: 1, textAlign: "right" }}>{value}</span>
            </div>
          ))}
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
      </div>
    </div>
  );

  if (screen === "subscribe") return (
    <div style={styles.app}>
      <div style={styles.header}>
        <button onClick={() => setScreen("home")}
          style={{ background: "none", border: "none", color: "#00b4d8", fontSize: 22, cursor: "pointer" }}>←</button>
        <span style={{ fontWeight: 700, fontSize: 16 }}>💳 Subscription</span>
        <div />
      </div>
      {error && <div style={styles.alertBox(true)}>⚠️ {error}</div>}
      {success && <div style={styles.alertBox(false)}>✅ {success}</div>}
      <div style={{ padding: "16px 16px 100px" }}>
        <div style={{ ...styles.card, textAlign: "center", background: "linear-gradient(135deg, rgba(0,180,216,0.1), rgba(0,119,182,0.1))", border: "1px solid rgba(0,180,216,0.3)" }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>👑</div>
          <h2 style={{ margin: "0 0 6px", color: "#00b4d8" }}>MedCase TN Pro</h2>
          <div style={{ fontSize: 32, fontWeight: 800, color: "#e8f4f8" }}>₹30<span style={{ fontSize: 16, color: "#6b8399" }}>/month</span></div>
          <p style={{ color: "#6b8399", fontSize: 13, margin: "10px 0 0" }}>Unlimited access to all cases</p>
        </div>
        {["✅ Unlimited case views", "✅ All colleges & wards", "✅ New cases daily", "✅ Upload & earn credits", "✅ Priority support"].map(f => (
          <div key={f} style={{ padding: "10px 16px", fontSize: 14, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>{f}</div>
        ))}
        <div style={{ padding: 16 }}>
          <button style={styles.btn} onClick={openRazorpay}>💳 Subscribe Now — ₹30/month</button>
          <button style={styles.btnOutline} onClick={() => setScreen("home")}>Maybe Later</button>
        </div>
      </div>
    </div>
  );

  // ─── HOME ─────────────────────────────────────────────────────────────

  return (
    <div style={styles.app}>
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
          {accessStatus === "credits" && <span style={{ ...styles.badge, background: "linear-gradient(135deg,#6f42c1,#4a0080)" }}>⭐ {student?.credits}</span>}
          {accessStatus === "expired" && (
            <button style={{ ...styles.btnSmall, fontSize: 11, padding: "5px 10px" }} onClick={() => setScreen("subscribe")}>Subscribe</button>
          )}
        </div>
      </div>

      {error && <div style={styles.alertBox(true)}>⚠️ {error}</div>}
      {success && <div style={styles.alertBox(false)}>✅ {success}</div>}

      {activeTab === "cases" && (
        <div style={{ paddingBottom: 80 }}>
          <div style={{ display: "flex", gap: 8, padding: "12px 16px 0" }}>
            <select style={{ ...styles.select, flex: 1, marginBottom: 0, fontSize: 12, padding: "8px 10px" }}
              value={filterCollege} onChange={e => setFilterCollege(e.target.value)}>
              <option value="">All Colleges</option>
              {TN_COLLEGES.map(c => <option key={c} value={c}>{c.split(",")[0]}</option>)}
            </select>
            <select style={{ ...styles.select, flex: 1, marginBottom: 0, fontSize: 12, padding: "8px 10px" }}
              value={filterWard} onChange={e => setFilterWard(e.target.value)}>
              <option value="">All Wards</option>
              {WARDS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div style={{ padding: "8px 16px 0" }}>
            <button style={{ ...styles.btnSmall, width: "100%", padding: "10px" }}
              onClick={loadCases} disabled={loading}>
              {loading ? "Loading..." : "🔍 Search Cases"}
            </button>
          </div>
          {loading && <div style={{ textAlign: "center", padding: 30, color: "#6b8399" }}>Loading cases...</div>}
          {!loading && cases.length === 0 && (
            <div style={{ textAlign: "center", padding: 40, color: "#6b8399" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
              <p>No cases found.<br />Be the first to upload a case!</p>
            </div>
          )}
          {cases.map(c => (
            <div key={c.id} style={styles.caseCard}
              onClick={() => {
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
                <div style={{ marginTop: 6, fontSize: 11, color: "#ffc107", textAlign: "right" }}>Uses 1 credit to view</div>
              )}
            </div>
          ))}
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
                <input style={styles.input} placeholder="Age" type="number" value={caseForm.age}
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
            <button style={styles.btn} onClick={uploadCase} disabled={loading}>
              {loading ? "Uploading..." : "Upload Case & Earn 1 Credit ⭐"}
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
              ["📧 Email", student?.email],
              ["🏥 College", student?.college],
              ["🎓 Year", student?.year_of_study],
              ["🆔 Roll No", student?.roll_number],
              ["⭐ Credits", student?.credits || 0],
              ["🔓 Access", accessStatus === "trial" ? `Free Trial (${trialDaysLeft} days left)` : accessStatus === "subscribed" ? "Pro Subscriber ✅" : accessStatus === "credits" ? "Credit-based Access" : "Expired"],
              ["📅 Member Since", new Date(student?.created_at).toLocaleDateString("en-IN")],
            ].map(([label, value]) => (
              <div key={label} style={styles.detailRow}>
                <span style={{ fontSize: 13, color: "#6b8399" }}>{label}</span>
                <span style={{ fontSize: 13, color: "#e8f4f8" }}>{value}</span>
              </div>
            ))}
          </div>
          {accessStatus !== "subscribed" && (
            <button style={styles.btn} onClick={() => setScreen("subscribe")}>💳 Subscribe for ₹30/month</button>
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
        </div>
      )}

      <div style={styles.tabBar}>
        {[
          { id: "cases", icon: "🏥", label: "Cases" },
          { id: "upload", icon: "📤", label: "Upload" },
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
