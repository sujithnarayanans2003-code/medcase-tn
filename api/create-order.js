// api/create-order.js

const Razorpay = require("razorpay");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    // 🔍 Check environment variables
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_SECRET) {
      console.error("Missing Razorpay env variables");
      return res.status(500).json({ message: "Server config error" });
    }

    // ✅ Initialize Razorpay
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_SECRET,
    });

    // ✅ Get amount (default ₹30)
    const amount = req.body?.amount || 3000;

    console.log("Creating order for amount:", amount);

    // ✅ Create order
    const order = await razorpay.orders.create({
      amount: amount,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
    });

    console.log("Order created:", order);

    return res.status(200).json(order);

  } catch (e) {
    console.error("CREATE ORDER ERROR:", e);

    return res.status(500).json({
      message: e.message || "Order creation failed",
    });
  }
};
