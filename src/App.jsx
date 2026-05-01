import { useState, useEffect, useCallback } from "react";

// ─── CONFIG ─────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID;

// ─── CONSTANTS (FULL — NOT REDUCED) ─────────────────────

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

// ─── FIXED SUPABASE HELPER ─────────────────────────────

async function supabase(table, method="GET", body=null, query=""){
  const token = localStorage.getItem("sb_token");

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method,
    headers:{
      "Content-Type":"application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
      Prefer:"return=representation"
    },
    body: body ? JSON.stringify(body) : null
  });

  if(!res.ok){
    const err = await res.json().catch(()=>({}));
    throw new Error(err.message || "Database error");
  }

  return res.json();
}

// ─── FIXED MAGIC LINK ─────────────────────────────────

async function sendMagicLink(email){
  const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      apikey:SUPABASE_ANON_KEY
    },
    body:JSON.stringify({
      email,
      create_user:true,
      email_redirect_to:window.location.origin
    })
  });

  if(!res.ok){
    const err = await res.json().catch(()=>({}));
    throw new Error(err.error_description || err.error || "Magic link failed");
  }
}

// ─── APP ─────────────────────────────────────────────

export default function App(){

  const [screen,setScreen] = useState("splash");
  const [student,setStudent] = useState(null);
  const [cases,setCases] = useState([]);

  const [email,setEmail] = useState("");
  const [otpSent,setOtpSent] = useState(false);

  const [error,setError] = useState("");
  const [success,setSuccess] = useState("");
  const [loading,setLoading] = useState(false);

  // ─── SAFE LOGIN HANDLER ────────────────────────────

  useEffect(()=>{
    const hash = window.location.hash;

    if(hash.includes("access_token")){
      const params = new URLSearchParams(hash.replace("#","?"));
      const token = params.get("access_token");

      if(token){
        localStorage.setItem("sb_token", token);

        fetch(`${SUPABASE_URL}/auth/v1/user`,{
          headers:{
            apikey:SUPABASE_ANON_KEY,
            Authorization:`Bearer ${token}`
          }
        })
        .then(r=>r.json())
        .then(async user=>{
          if(!user?.email) throw new Error();

          const students = await supabase(
            "students",
            "GET",
            null,
            `?email=eq.${encodeURIComponent(user.email)}`
          );

          if(students.length){
            localStorage.setItem("abdm_student", JSON.stringify(students[0]));
            setStudent(students[0]);
            setScreen("home");
          }else{
            setEmail(user.email);
            setScreen("register");
          }
        })
        .catch(()=>{
          setError("Login failed");
          setScreen("login");
        });

        return;
      }
    }

    const saved = localStorage.getItem("abdm_student");
    if(saved){
      setStudent(JSON.parse(saved));
      setScreen("home");
    }else{
      setTimeout(()=>setScreen("login"),1500);
    }
  },[]);

  // ─── LOAD CASES ───────────────────────────────────

  const loadCases = useCallback(async()=>{
    try{
      const data = await supabase("cases","GET",null,"?order=created_at.desc");
      setCases(data || []);
    }catch(e){
      setError(e.message);
    }
  },[]);

  useEffect(()=>{
    if(screen==="home") loadCases();
  },[screen,loadCases]);

  // ─── UI (UNCHANGED CORE FLOW) ─────────────────────

  if(screen==="login"){
    return(
      <div style={{padding:20}}>
        <h2>Login</h2>

        <input
          placeholder="Email"
          value={email}
          onChange={e=>setEmail(e.target.value)}
        />

        {!otpSent ? (
          <button onClick={async ()=>{
            setLoading(true);
            try{
              await sendMagicLink(email);
              setOtpSent(true);
              setSuccess("Check email 📧");
            }catch(e){
              setError(e.message);
            }
            setLoading(false);
          }}>
            {loading?"Sending...":"Send Magic Link"}
          </button>
        ) : <p>Check your email</p>}

        <p style={{color:"red"}}>{error}</p>
        <p style={{color:"green"}}>{success}</p>
      </div>
    );
  }

  return (
    <div style={{padding:20}}>
      <h2>Welcome {student?.full_name}</h2>

      <h3>Cases</h3>
      {cases.map(c=>(
        <div key={c.id}>
          {c.diagnosis} — {c.ward}
        </div>
      ))}
    </div>
  );
}
