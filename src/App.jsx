import { useState, useEffect, useCallback } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

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

// Supabase API helper
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

// Generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Check trial/subscription status
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

export default function App() {
  const [screen, setScreen] = useState("splash");
  const [student, setStudent] = useState(null);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Auth states
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  // 🔑 Store OTP in React state only — no Supabase otps table needed
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [otpExpiry, setOtpExpiry] = useState(null);
  const [otpSent, setOtpSent] = useState(false);
  const [regData, setRegData] = useState({
    full_name: "", college: "", year_of_study: "", roll_number: ""
  });

  // Case states
  const [caseForm, setCaseForm] = useState({
    ward: "", bed_number: "", patient_initials: "", age: "",
    gender: "", chief_complaint: "", diagnosis: "", symptoms: "", treatment: "", notes: "",
    is_discharged: false, case_photos: []
  });
  const [photoPreview, setPhotoPreview] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [filterCollege, setFilterCollege] = useState("");
  const [filterWard, setFilterWard] = useState("");
  const [searchText, setSearchText] = useState("");
  const [activeTab, setActiveTab] = useState("cases");

  // Client-side filtered cases — works with any number of cases
  const filteredCases = cases.filter(c => {
    const matchCollege = !filterCollege || c.college === filterCollege;
    const matchWard = !filterWard || c.ward === filterWard;
    const q = searchText.toLowerCase();
    const matchSearch = !q || (
      c.diagnosis?.toLowerCase().includes(q) ||
      c.chief_complaint?.toLowerCase().includes(q) ||
      c.ward?.toLowerCase().includes(q) ||
      c.college?.toLowerCase().includes(q) ||
      c.patient_initials?.toLowerCase().includes(q)
    );
    return matchCollege && matchWard && matchSearch;
  });

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

  // ✅ DEMO OTP: Generated in state, shown on screen — no SMS, no Supabase otps table
  const sendOTP = () => {
    if (!phone || phone.length !== 10) {
      return showMsg("Enter a valid 10-digit phone number", true);
    }
    const code = generateOTP();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    setGeneratedOtp(code);
    setOtpExpiry(expiry);
    setOtpSent(true);
    showMsg(`📱 Demo OTP sent! Your OTP is: ${code}`);
  };

  const verifyOTPAndLogin = async () => {
    if (!otp || otp.length !== 6) return showMsg("Enter the 6-digit OTP", true);

    // Check OTP match
    if (otp !== generatedOtp) return showMsg("❌ Wrong OTP. Please try again.", true);

    // Check expiry
    if (new Date() > otpExpiry) {
      setOtpSent(false);
      setOtp("");
      return showMsg("OTP expired. Please request a new one.", true);
    }

    setLoading(true);
    try {
      // Check if student already exists in Supabase
      const students = await supabase("students", "GET", null, `?phone=eq.${phone}`);
      if (students && students.length > 0) {
        const s = students[0];
        localStorage.setItem("abdm_student", JSON.stringify(s));
        setStudent(s);
        setScreen("home");
        showMsg(`Welcome back, Dr. ${s.full_name}! 🩺`);
      } else {
        // New user — go to registration
        setScreen("register");
      }
    } catch (e) {
      showMsg("Verification failed: " + e.message, true);
    }
    setLoading(false);
  };

  const registerStudent = async () => {
    const { full_name, college, year_of_study, roll_number } = regData;
    if (!full_name || !college || !year_of_study || !roll_number)
      return showMsg("Please fill all fields", true);
    setLoading(true);
    try {
      const newStudent = await supabase("students", "POST", {
        full_name,
        phone,
        college,
        year_of_study,
        roll_number,
        is_verified: true,
        credits: 0,
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

  const loadCases = useCallback(async () => {
    setLoading(true);
    try {
      const query = "?is_active=eq.true&order=created_at.desc";
      const data = await supabase("cases", "GET", null, query);
      setCases(data || []);
    } catch (e) {
      showMsg("Failed to load cases: " + e.message, true);
    }
    setLoading(false);
  }, []);

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
        ...caseForm,
        age: parseInt(age),
        college: student.college,
        uploaded_by: student.id,
        is_discharged: caseForm.is_discharged,
        case_photos: caseForm.case_photos,
      });
      // Add credit log
      await supabase("credit_logs", "POST", {
        student_id: student.id,
        action: "CASE_UPLOAD",
        points: 1,
      });
      // Update student credits
      const updatedStudents = await supabase("students", "PATCH",
        { credits: (student.credits || 0) + 1 },
        `?id=eq.${student.id}`);
      if (updatedStudents && updatedStudents[0]) {
        const updated = updatedStudents[0];
        setStudent(updated);
        localStorage.setItem("abdm_student", JSON.stringify(updated));
      }
      setCaseForm({
        ward: "", bed_number: "", patient_initials: "", age: "",
        gender: "", chief_complaint: "", diagnosis: "", symptoms: "",
        treatment: "", notes: "", is_discharged: false, case_photos: []
      });
      setPhotoPreview([]);
      showMsg("Case uploaded! +1 Credit earned 🎉");
      setActiveTab("cases");
      loadCases();
    } catch (e) {
      showMsg("Upload failed: " + e.message, true);
    }
    setLoading(false);
  };

  const handlePhotoChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length + photoPreview.length > 4) {
      return showMsg("Maximum 4 photos allowed", true);
    }
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPhotoPreview(prev => [...prev, ev.target.result]);
        setCaseForm(prev => ({ ...prev, case_photos: [...prev.case_photos, ev.target.result] }));
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (idx) => {
    setPhotoPreview(prev => prev.filter((_, i) => i !== idx));
    setCaseForm(prev => ({ ...prev, case_photos: prev.case_photos.filter((_, i) => i !== idx) }));
  };

  const deleteCase = async (caseItem) => {
    if (!window.confirm("Delete this case? This cannot be undone.")) return;
    setLoading(true);
    try {
      await supabase("cases", "PATCH", { is_active: false }, `?id=eq.${caseItem.id}`);
      showMsg("Case deleted successfully.");
      setScreen("home");
      setSelectedCase(null);
      loadCases();
    } catch (e) {
      showMsg("Delete failed: " + e.message, true);
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
        { credits: student.credits - 1 },
        `?id=eq.${student.id}`);
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

  const logout = () => {
    localStorage.removeItem("abdm_student");
    setStudent(null);
    setPhone("");
    setOtp("");
    setGeneratedOtp("");
    setOtpSent(false);
    setScreen("login");
  };

  const accessStatus = getAccessStatus(student);
  const trialDaysLeft = student
    ? Math.max(0, 5 - Math.floor((new Date() - new Date(student.trial_start_date)) / (1000 * 60 * 60 * 24)))
    : 0;

  const canViewCase = () =>
    accessStatus === "trial" || accessStatus === "subscribed" || accessStatus === "credits";

  // ─── STYLES ───────────────────────────────────────────────────────
  const styles = {
    app: {
      fontFamily: "'Segoe UI', sans-serif",
      background: "#0a0f1e",
      minHeight: "100vh",
      color: "#e8f4f8",
      maxWidth: 480,
      margin: "0 auto",
      position: "relative",
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
      fontSize: 15, outline: "none", boxSizing: "border-box",
      marginBottom: 10,
    },
    select: {
      width: "100%", padding: "12px 14px",
      background: "#0d2137",
      border: "1px solid rgba(255,255,255,0.15)",
      borderRadius: 10, color: "#e8f4f8",
      fontSize: 15, outline: "none", boxSizing: "border-box",
      marginBottom: 10,
    },
    btn: {
      width: "100%", padding: "14px",
      background: "linear-gradient(135deg, #00b4d8, #0077b6)",
      border: "none", borderRadius: 10, color: "white",
      fontSize: 16, fontWeight: 700, cursor: "pointer",
      marginBottom: 10, letterSpacing: 0.5,
    },
    btnOutline: {
      width: "100%", padding: "12px",
      background: "transparent",
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
      background: "rgba(10,15,30,0.95)",
      padding: "14px 16px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      borderBottom: "1px solid rgba(255,255,255,0.08)",
      position: "sticky", top: 0, zIndex: 100,
      backdropFilter: "blur(10px)",
    },
    badge: {
      background: "linear-gradient(135deg, #00b4d8, #0077b6)",
      borderRadius: 20, padding: "4px 12px",
      fontSize: 12, fontWeight: 700, color: "white",
    },
    caseCard: {
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(0,180,216,0.2)",
      borderRadius: 14, padding: 16, margin: "10px 16px",
      cursor: "pointer",
    },
    tabBar: {
      display: "flex", position: "fixed", bottom: 0, left: "50%",
      transform: "translateX(-50%)", width: "100%", maxWidth: 480,
      background: "rgba(10,15,30,0.98)",
      borderTop: "1px solid rgba(255,255,255,0.08)",
      zIndex: 100,
    },
    tab: (active) => ({
      flex: 1, padding: "12px 0", textAlign: "center",
      cursor: "pointer", fontSize: 11, fontWeight: 600,
      color: active ? "#00b4d8" : "#6b8399",
      borderBottom: active ? "2px solid #00b4d8" : "2px solid transparent",
    }),
    alertBox: (isError) => ({
      margin: "0 16px 10px",
      padding: "12px 16px",
      background: isError ? "rgba(220,53,69,0.15)" : "rgba(0,180,216,0.15)",
      border: `1px solid ${isError ? "rgba(220,53,69,0.4)" : "rgba(0,180,216,0.4)"}`,
      borderRadius: 10, fontSize: 14, color: isError ? "#ff6b7a" : "#00b4d8",
    }),
    otpBox: {
      margin: "0 16px 10px",
      padding: "14px 16px",
      background: "rgba(255,193,7,0.12)",
      border: "2px dashed rgba(255,193,7,0.5)",
      borderRadius: 12, fontSize: 14, color: "#ffc107",
      textAlign: "center",
    },
    warningBox: {
      margin: "0 16px 10px",
      padding: "12px 16px",
      background: "rgba(255,193,7,0.1)",
      border: "1px solid rgba(255,193,7,0.3)",
      borderRadius: 10, fontSize: 12, color: "#ffc107",
    },
    detailRow: {
      display: "flex", justifyContent: "space-between",
      padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)",
    },
  };

  // ─── SCREENS ──────────────────────────────────────────────────────

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
            animation: "pulse 1.5s infinite", animationDelay: `${i * 0.3}s`
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

      {/* 🟡 Demo OTP display box */}
      {otpSent && generatedOtp && (
        <div style={styles.otpBox}>
          <div style={{ fontSize: 12, marginBottom: 4, opacity: 0.8 }}>🔐 DEMO MODE — Your OTP is:</div>
          <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: 8 }}>{generatedOtp}</div>
          <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>Valid for 10 minutes</div>
        </div>
      )}

      <div style={styles.card}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 16 }}>
          🔐 Student Login
        </h2>
        <label style={{ fontSize: 13, color: "#6b8399" }}>Mobile Number</label>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <div style={{ ...styles.input, width: "auto", padding: "12px 10px", marginBottom: 0, color: "#6b8399" }}>+91</div>
          <input
            style={{ ...styles.input, marginBottom: 0, flex: 1 }}
            placeholder="10-digit mobile"
            maxLength={10}
            value={phone}
            onChange={e => setPhone(e.target.value.replace(/\D/g, ""))}
            disabled={otpSent}
          />
        </div>

        {!otpSent ? (
          <button style={{ ...styles.btn, marginTop: 12 }} onClick={sendOTP} disabled={loading}>
            Send OTP 📱
          </button>
        ) : (
          <>
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 13, color: "#6b8399" }}>Enter OTP</label>
              <input
                style={{ ...styles.input, marginTop: 6, letterSpacing: 8, textAlign: "center", fontSize: 22, fontWeight: 700 }}
                placeholder="······"
                maxLength={6}
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <button style={styles.btn} onClick={verifyOTPAndLogin} disabled={loading}>
              {loading ? "Verifying..." : "Verify & Login ✅"}
            </button>
            <button style={styles.btnOutline} onClick={() => { setOtpSent(false); setOtp(""); setGeneratedOtp(""); }}>
              Change Number
            </button>
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
        <div style={styles.warningBox}>
          ⚠️ Please enter accurate details. This platform handles medical information.
        </div>

        <div style={styles.card}>
          <h3 style={{ margin: "0 0 14px", fontSize: 16, color: "#00b4d8" }}>👨‍⚕️ Student Details</h3>

          <label style={{ fontSize: 12, color: "#6b8399" }}>Full Name *</label>
          <input style={styles.input} placeholder="Dr. Full Name"
            value={regData.full_name}
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
          <input style={styles.input} placeholder="Your Roll Number"
            value={regData.roll_number}
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
            ["🚪 Status", selectedCase.is_discharged ? "✅ Discharged" : "🏥 Currently Admitted"],
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

          {selectedCase.case_photos && selectedCase.case_photos.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <p style={{ margin: "0 0 8px", fontSize: 12, color: "#6b8399" }}>📷 Case Sheet Photos</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {selectedCase.case_photos.map((photo, idx) => (
                  <img key={idx} src={photo} alt={`Case photo ${idx + 1}`}
                    style={{ width: "calc(50% - 4px)", borderRadius: 10, objectFit: "cover", maxHeight: 160, border: "1px solid rgba(0,180,216,0.3)" }} />
                ))}
              </div>
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

        {/* Delete button — only for uploader */}
        {student && selectedCase.uploaded_by === student.id && (
          <button
            style={{ ...styles.btnOutline, color: "#ff6b7a", borderColor: "#ff6b7a", margin: "0 0 16px" }}
            onClick={() => deleteCase(selectedCase)}
            disabled={loading}>
            🗑️ {loading ? "Deleting..." : "Delete This Case"}
          </button>
        )}
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
      <div style={{ padding: 16 }}>
        {error && <div style={styles.alertBox(true)}>⚠️ {error}</div>}
        {success && <div style={styles.alertBox(false)}>✅ {success}</div>}

        <div style={{ ...styles.card, textAlign: "center", border: "1px solid rgba(0,180,216,0.4)" }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>🩺</div>
          <h2 style={{ margin: "0 0 6px", color: "#00b4d8" }}>MedCase TN Pro</h2>
          <div style={{ fontSize: 36, fontWeight: 800, color: "#e8f4f8" }}>₹30<span style={{ fontSize: 16, color: "#6b8399" }}>/month</span></div>
          <p style={{ color: "#6b8399", fontSize: 13, margin: "10px 0 16px" }}>Unlimited access to all cases across 38 TN colleges</p>
          {["Unlimited case viewing", "All 38 TN Medical Colleges", "Filter by ward & college", "Upload & earn credits", "Priority new cases"].map(f => (
            <div key={f} style={{ textAlign: "left", padding: "6px 0", fontSize: 14, color: "#e8f4f8" }}>
              ✅ {f}
            </div>
          ))}
          <button style={{ ...styles.btn, marginTop: 16 }}
            onClick={async () => {
              setLoading(true);
              try {
                const endDate = new Date();
                endDate.setMonth(endDate.getMonth() + 1);
                await supabase("subscriptions", "POST", {
                  student_id: student.id,
                  end_date: endDate.toISOString(),
                  amount: 30,
                  is_active: true,
                });
                const updated = await supabase("students", "PATCH", {
                  is_subscribed: true,
                  subscription_end_date: endDate.toISOString(),
                }, `?id=eq.${student.id}`);
                const s = updated[0];
                setStudent(s);
                localStorage.setItem("abdm_student", JSON.stringify(s));
                showMsg("Subscription activated! ✅");
                setTimeout(() => setScreen("home"), 1500);
              } catch (e) { showMsg("Failed. Try again.", true); }
              setLoading(false);
            }} disabled={loading}>
            {loading ? "Processing..." : "Activate ₹30/month"}
          </button>
          <p style={{ fontSize: 11, color: "#6b8399", margin: 0 }}>
            Demo mode: Payment integration ready for Razorpay/UPI
          </p>
        </div>

        <div style={{ ...styles.card, border: "1px solid rgba(255,193,7,0.3)" }}>
          <h3 style={{ margin: "0 0 10px", color: "#ffc107", fontSize: 15 }}>💡 Free Alternative</h3>
          <p style={{ margin: 0, fontSize: 13, color: "#6b8399" }}>
            Upload patient cases to earn credits.<br />
            <strong style={{ color: "#e8f4f8" }}>1 upload = 1 free case view</strong><br />
            You currently have <strong style={{ color: "#00b4d8" }}>{student?.credits || 0} credits</strong>
          </p>
        </div>
      </div>
    </div>
  );

  // ─── HOME SCREEN ──────────────────────────────────────────────────
  return (
    <div style={styles.app}>
      <div style={styles.header}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#00b4d8" }}>🏥 MedCase TN</div>
          <div style={{ fontSize: 11, color: "#6b8399" }}>Dr. {student?.full_name}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={styles.badge}>⭐ {student?.credits || 0} Credits</div>
          {accessStatus === "trial" && (
            <div style={{ ...styles.badge, background: "rgba(255,193,7,0.2)", color: "#ffc107", border: "1px solid rgba(255,193,7,0.4)" }}>
              {trialDaysLeft}d left
            </div>
          )}
        </div>
      </div>

      {error && <div style={styles.alertBox(true)}>⚠️ {error}</div>}
      {success && <div style={styles.alertBox(false)}>✅ {success}</div>}

      {accessStatus === "expired" && (
        <div style={{ ...styles.alertBox(true), margin: "10px 16px" }}>
          ⏰ Free trial ended! Subscribe for ₹30/month or upload cases to earn credits.
          <button style={{ ...styles.btnSmall, marginTop: 8, width: "100%" }}
            onClick={() => setScreen("subscribe")}>Subscribe Now</button>
        </div>
      )}

      {activeTab === "cases" && (
        <div style={{ paddingBottom: 80 }}>
          <div style={{ display: "flex", gap: 10, padding: "12px 16px 0" }}>
            {[
              { label: "Total Cases", value: cases.length, icon: "📋" },
              { label: "My Credits", value: student?.credits || 0, icon: "⭐" },
              { label: "Access", value: accessStatus === "trial" ? "Trial" : accessStatus === "subscribed" ? "Pro" : accessStatus === "credits" ? "Credits" : "Expired", icon: "🔓" },
            ].map(s => (
              <div key={s.label} style={{ ...styles.card, flex: 1, margin: 0, textAlign: "center", padding: "12px 8px" }}>
                <div style={{ fontSize: 20 }}>{s.icon}</div>
                <div style={{ fontWeight: 800, fontSize: 18, color: "#00b4d8" }}>{s.value}</div>
                <div style={{ fontSize: 10, color: "#6b8399" }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ padding: "10px 16px 0", display: "flex", gap: 8 }}>
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
          <div style={{ padding: "8px 16px 0", display: "flex", gap: 8 }}>
            <input
              style={{ ...styles.input, flex: 1, marginBottom: 0, fontSize: 13, padding: "9px 12px" }}
              placeholder="🔍 Search diagnosis, complaint, ward..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
            <button style={{ ...styles.btnSmall, padding: "9px 14px", whiteSpace: "nowrap" }}
              onClick={loadCases} disabled={loading}>
              {loading ? "..." : "↻"}
            </button>
          </div>

          {loading && <div style={{ textAlign: "center", padding: 30, color: "#6b8399" }}>Loading cases...</div>}
          {!loading && filteredCases.length === 0 && (
            <div style={{ textAlign: "center", padding: 40, color: "#6b8399" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
              <p>No cases found.<br />Be the first to upload a case!</p>
            </div>
          )}
          {!loading && filteredCases.length > 0 && (
            <div style={{ padding: "6px 16px 0", fontSize: 12, color: "#6b8399" }}>
              Showing {filteredCases.length} of {cases.length} case{cases.length !== 1 ? "s" : ""}
            </div>
          )}
          {filteredCases.map(c => (
            <div key={c.id} style={styles.caseCard}
              onClick={() => {
                if (!canViewCase()) {
                  setScreen("subscribe");
                } else if (accessStatus === "credits") {
                  useCredit(c);
                } else {
                  setSelectedCase(c);
                  setScreen("caseDetail");
                }
              }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                    <span style={{ ...styles.badge, fontSize: 11 }}>🛏️ Bed {c.bed_number}</span>
                    <span style={{ fontSize: 11, color: "#6b8399" }}>{c.gender}, {c.age}y</span>
                    {c.is_discharged !== undefined && (
                      <span style={{
                        fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 700,
                        background: c.is_discharged ? "rgba(40,200,100,0.15)" : "rgba(255,193,7,0.15)",
                        color: c.is_discharged ? "#28c864" : "#ffc107",
                        border: `1px solid ${c.is_discharged ? "rgba(40,200,100,0.4)" : "rgba(255,193,7,0.4)"}`,
                      }}>
                        {c.is_discharged ? "✅ Discharged" : "🏥 Admitted"}
                      </span>
                    )}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#e8f4f8" }}>{c.diagnosis}</div>
                  <div style={{ fontSize: 12, color: "#6b8399", marginTop: 4 }}>{c.ward}</div>
                  <div style={{ fontSize: 11, color: "#4a90a4", marginTop: 2 }}>{c.college.split(",")[0]}</div>
                </div>
                <div style={{ fontSize: 22, marginLeft: 10 }}>
                  {canViewCase() ? "👁️" : "🔒"}
                </div>
              </div>
              <div style={{ marginTop: 8, padding: "8px 10px", background: "rgba(0,180,216,0.08)", borderRadius: 8 }}>
                <span style={{ fontSize: 12, color: "#6b8399" }}>Chief Complaint: </span>
                <span style={{ fontSize: 12, color: "#e8f4f8" }}>{c.chief_complaint}</span>
              </div>
              {accessStatus === "credits" && (
                <div style={{ marginTop: 6, fontSize: 11, color: "#ffc107", textAlign: "right" }}>
                  Uses 1 credit to view
                </div>
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
            <input style={styles.input} placeholder="e.g. 24A"
              value={caseForm.bed_number}
              onChange={e => setCaseForm({ ...caseForm, bed_number: e.target.value })} />

            <label style={{ fontSize: 12, color: "#6b8399" }}>Patient Initials Only * (NOT full name)</label>
            <input style={styles.input} placeholder="e.g. R.K."
              value={caseForm.patient_initials}
              onChange={e => setCaseForm({ ...caseForm, patient_initials: e.target.value })} />

            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: "#6b8399" }}>Age *</label>
                <input style={styles.input} placeholder="Age" type="number"
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
            <input style={styles.input} placeholder="Main presenting complaint"
              value={caseForm.chief_complaint}
              onChange={e => setCaseForm({ ...caseForm, chief_complaint: e.target.value })} />

            <label style={{ fontSize: 12, color: "#6b8399" }}>Diagnosis *</label>
            <input style={styles.input} placeholder="Primary diagnosis"
              value={caseForm.diagnosis}
              onChange={e => setCaseForm({ ...caseForm, diagnosis: e.target.value })} />

            <label style={{ fontSize: 12, color: "#6b8399" }}>Symptoms *</label>
            <textarea style={{ ...styles.input, minHeight: 80, resize: "vertical" }}
              placeholder="Describe symptoms in detail"
              value={caseForm.symptoms}
              onChange={e => setCaseForm({ ...caseForm, symptoms: e.target.value })} />

            <label style={{ fontSize: 12, color: "#6b8399" }}>Treatment Plan *</label>
            <textarea style={{ ...styles.input, minHeight: 80, resize: "vertical" }}
              placeholder="Current treatment being given"
              value={caseForm.treatment}
              onChange={e => setCaseForm({ ...caseForm, treatment: e.target.value })} />

            <label style={{ fontSize: 12, color: "#6b8399" }}>Additional Notes (Optional)</label>
            <textarea style={{ ...styles.input, minHeight: 60, resize: "vertical" }}
              placeholder="Any other observations..."
              value={caseForm.notes}
              onChange={e => setCaseForm({ ...caseForm, notes: e.target.value })} />

            {/* Discharge Status */}
            <label style={{ fontSize: 12, color: "#6b8399" }}>Patient Status *</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              {[{ label: "🏥 Currently Admitted", val: false }, { label: "✅ Discharged", val: true }].map(opt => (
                <div key={String(opt.val)}
                  onClick={() => setCaseForm({ ...caseForm, is_discharged: opt.val })}
                  style={{
                    flex: 1, padding: "11px 8px", textAlign: "center", borderRadius: 10, cursor: "pointer",
                    fontSize: 13, fontWeight: 600,
                    background: caseForm.is_discharged === opt.val ? "rgba(0,180,216,0.25)" : "rgba(255,255,255,0.05)",
                    border: `1.5px solid ${caseForm.is_discharged === opt.val ? "#00b4d8" : "rgba(255,255,255,0.1)"}`,
                    color: caseForm.is_discharged === opt.val ? "#00b4d8" : "#6b8399",
                  }}>
                  {opt.label}
                </div>
              ))}
            </div>

            {/* Photo Upload */}
            <label style={{ fontSize: 12, color: "#6b8399" }}>📷 Case Sheet Photos (Optional, max 4)</label>
            <label style={{
              display: "block", padding: "14px", border: "2px dashed rgba(0,180,216,0.4)",
              borderRadius: 10, textAlign: "center", cursor: "pointer", marginBottom: 10,
              background: "rgba(0,180,216,0.05)", color: "#00b4d8", fontSize: 13,
            }}>
              📸 Take Photo / Choose from Gallery
              <input type="file" accept="image/*" multiple capture="environment"
                style={{ display: "none" }}
                onChange={handlePhotoChange} />
            </label>
            {photoPreview.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                {photoPreview.map((src, idx) => (
                  <div key={idx} style={{ position: "relative", width: "calc(50% - 4px)" }}>
                    <img src={src} alt="preview" style={{ width: "100%", borderRadius: 10, objectFit: "cover", maxHeight: 120 }} />
                    <div onClick={() => removePhoto(idx)}
                      style={{
                        position: "absolute", top: 4, right: 4, background: "rgba(255,0,0,0.7)",
                        borderRadius: "50%", width: 22, height: 22, display: "flex",
                        alignItems: "center", justifyContent: "center", cursor: "pointer",
                        fontSize: 12, color: "white", fontWeight: 700,
                      }}>✕</div>
                  </div>
                ))}
              </div>
            )}

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
              <div style={{ width: 70, height: 70, borderRadius: "50%", background: "linear-gradient(135deg,#00b4d8,#0077b6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 10px" }}>
                👨‍⚕️
              </div>
              <h2 style={{ margin: 0, fontSize: 18 }}>Dr. {student?.full_name}</h2>
              <p style={{ margin: "4px 0 0", color: "#6b8399", fontSize: 13 }}>{student?.year_of_study}</p>
            </div>
            {[
              ["📱 Phone", `+91 ${student?.phone}`],
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
            <button style={styles.btn} onClick={() => setScreen("subscribe")}>
              💳 Subscribe for ₹30/month
            </button>
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

          <button style={{ ...styles.btnOutline, color: "#ff6b7a", borderColor: "#ff6b7a" }}
            onClick={logout}>Logout</button>
        </div>
      )}

      <div style={styles.tabBar}>
        {[
          { id: "cases", icon: "🏥", label: "Cases" },
          { id: "upload", icon: "📤", label: "Upload" },
          { id: "profile", icon: "👤", label: "Profile" },
        ].map(t => (
          <div key={t.id} style={styles.tab(activeTab === t.id)}
            onClick={() => setActiveTab(t.id)}>
            <div style={{ fontSize: 20 }}>{t.icon}</div>
            <div>{t.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

