// api/create-order.js
// Vercel serverless function — creates a Razorpay order server-side

import Razorpay from "razorpay";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const razorpay = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_SECRET,
    });

    const { amount = 3000 } = req.body; // amount in paise (3000 = ₹30)

    const order = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt:  `receipt_${Date.now()}`,
    });

    return res.status(200).json(order);
  } catch (e) {
    console.error("create-order error:", e);
    return res.status(500).json({ message: e.message || "Order creation failed" });
  }
}

