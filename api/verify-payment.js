// api/verify-payment.js
// Vercel serverless function — verifies Razorpay signature and activates subscription

import crypto from "crypto";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    student_id,
  } = req.body;

  // ── 1. Verify Razorpay HMAC signature ──────────────────────────────────────
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ message: "Missing payment fields" });
  }

  const body      = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expected  = crypto
    .createHmac("sha256", process.env.RAZORPAY_SECRET)
    .update(body)
    .digest("hex");

  if (expected !== razorpay_signature) {
    return res.status(400).json({ message: "Invalid payment signature" });
  }

  // ── 2. Activate subscription in Supabase ───────────────────────────────────
  const supabaseUrl     = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

  // Get the auth token from the Authorization header
  const authHeader = req.headers.authorization || "";
  const userToken  = authHeader.replace("Bearer ", "").trim();

  const subscriptionEndDate = new Date();
  subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + 1); // +1 month

  const updateRes = await fetch(
    `${supabaseUrl}/rest/v1/students?id=eq.${student_id}`,
    {
      method:  "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey:          supabaseAnonKey,
        Authorization:   `Bearer ${userToken || supabaseAnonKey}`,
        Prefer:          "return=representation",
      },
      body: JSON.stringify({
        is_subscribed:         true,
        subscription_end_date: subscriptionEndDate.toISOString(),
      }),
    }
  );

  if (!updateRes.ok) {
    const err = await updateRes.json().catch(() => ({}));
    console.error("Supabase update error:", err);
    return res.status(500).json({ message: "Failed to activate subscription" });
  }

  // ── 3. Return success ──────────────────────────────────────────────────────
  return res.status(200).json({
    verified:              true,
    subscription_end_date: subscriptionEndDate.toISOString(),
  });
}
