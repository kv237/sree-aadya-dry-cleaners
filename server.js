// server.js — Sree Aadya Dry Cleaners (MongoDB + Firebase Sync + Auth + Email)
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const { OAuth2Client } = require("google-auth-library");
const nodemailer = require("nodemailer");
const admin = require("firebase-admin");
const path = require("path");

const app = express();

// ----------------- Middleware -----------------
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type"],
  })
);
app.use(express.json());
app.use(bodyParser.json());

// ----------------- MongoDB -----------------
mongoose
  .connect("mongodb://127.0.0.1:27017/sreeaadya", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB Connected Successfully"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// ----------------- Schemas -----------------
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  googleId: String,
  phone: String,
  image: String,
  notificationsEnabled: { type: Boolean, default: true },
  darkMode: { type: Boolean, default: false },
  joined: { type: Date, default: Date.now },
  address: String,
  city: String,
  pincode: String,
  landmark: String,
});
const User = mongoose.model("User", userSchema);

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  userEmail: { type: String, required: true },
  service: { type: String, required: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
  totalPrice: Number,
  date: { type: Date, default: Date.now },
  status: { type: String, default: "Pending" },
  expectedDelivery: String,
  pickupPerson: String,
});
const Order = mongoose.model("Order", orderSchema);

// ----------------- Firebase Admin -----------------
let firebaseDb = null;
let firebaseOrdersRef = null;

try {
  const serviceAccountPath = path.join(__dirname, "config", "firebaseServiceAccount.json");
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://sree-aadya-dry-cleaners-ec791-default-rtdb.firebaseio.com",
  });

  firebaseDb = admin.database();
  firebaseOrdersRef = firebaseDb.ref("orders");

  console.log("✅ Firebase Admin initialized");
} catch (err) {
  console.warn("⚠️ Firebase Admin not initialized. Check config/firebaseServiceAccount.json or credentials.");
}

// ----------------- Google OAuth2 -----------------
const GOOGLE_CLIENT_ID = "965231085923-js980aremi5hgi3ne2qv914auafv36nd.apps.googleusercontent.com";
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// ----------------- Helpers -----------------
async function generateOrderId() {
  const lastOrder = await Order.findOne().sort({ _id: -1 });
  let nextNumber = 1;
  if (lastOrder && lastOrder.orderId) {
    const parts = lastOrder.orderId.split("-");
    const lastNumber = parseInt(parts[1], 10);
    if (!isNaN(lastNumber)) nextNumber = lastNumber + 1;
  }
  return `AADYA-${String(nextNumber).padStart(5, "0")}`;
}

// ----------------- Nodemailer -----------------
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "sreeaadyadrycleaners@gmail.com",
    pass: "your_gmail_app_password_here", // ⚠️ Replace with Gmail App Password
  },
});

async function sendOrderEmail(to, order) {
  const mailOptions = {
    from: `"Sree Aadya Dry Cleaners" <sreeaadyadrycleaners@gmail.com>`,
    to,
    subject: `🧺 Order Confirmation - ${order.orderId}`,
    html: `
      <div style="font-family:Poppins,Arial,sans-serif;padding:15px;">
        <h2>Thank you for your order, ${order.userEmail.split("@")[0]}!</h2>
        <table border="1" cellspacing="0" cellpadding="8" style="border-collapse:collapse;width:100%;margin-top:10px;">
          <tr><th>Order ID</th><td>${order.orderId}</td></tr>
          <tr><th>Service</th><td>${order.service}</td></tr>
          <tr><th>Quantity</th><td>${order.quantity}</td></tr>
          <tr><th>Total</th><td>₹${order.totalPrice}</td></tr>
          <tr><th>Status</th><td>${order.status}</td></tr>
        </table>
        <p style="margin-top:15px;">We’ll notify you once your clothes are ready for pickup or delivery.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent to ${to}`);
  } catch (err) {
    console.error("❌ Email sending failed:", err.message);
  }
}

// ----------------- Routes -----------------
app.get("/", (req, res) => {
  res.json({ message: "✅ Sree Aadya Backend Running" });
});

// ---------- Auth ----------
app.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: "All fields required" });

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "Email already registered" });

    const newUser = new User({ name, email, password });
    await newUser.save();
    res.status(201).json({ message: "User registered", user: newUser });
  } catch (error) {
    res.status(500).json({ message: "Signup error", error: error.message });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.password !== password)
      return res.status(400).json({ message: "Incorrect password" });
    res.json({ message: "Login successful", user });
  } catch (error) {
    res.status(500).json({ message: "Login error", error: error.message });
  }
});

app.post("/google-login", async (req, res) => {
  try {
    const token = req.body.credential || req.body.token || req.body.id_token;
    if (!token) return res.status(400).json({ message: "No token provided" });

    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, sub: googleId } = payload;
    let user = await User.findOne({ email });

    if (!user) {
      user = new User({ name, email, googleId });
      await user.save();
    } else if (!user.googleId) {
      user.googleId = googleId;
      await user.save();
    }

    res.json({ message: "Google login successful", user });
  } catch (error) {
    res.status(500).json({ message: "Google login error", error: error.message });
  }
});

// ---------- Orders ----------
app.post("/api/orders", async (req, res) => {
  try {
    const { userEmail, service, quantity, price, expectedDelivery, pickupPerson } = req.body;
    const totalPrice = quantity * price;
    const orderId = await generateOrderId();

    const newOrder = new Order({
      orderId,
      userEmail,
      service,
      quantity,
      price,
      totalPrice,
      expectedDelivery,
      pickupPerson,
    });

    const savedOrder = await newOrder.save();

    sendOrderEmail(userEmail, savedOrder);

    if (firebaseOrdersRef) {
      await firebaseOrdersRef.child(orderId).set({
        orderId,
        userEmail,
        service,
        quantity,
        totalPrice,
        status: savedOrder.status,
        expectedDelivery: savedOrder.expectedDelivery || "",
        pickupPerson: savedOrder.pickupPerson || "",
        updatedAt: new Date().toISOString(),
      });
      console.log(`✅ Order synced to Firebase: ${orderId}`);
    } else {
      console.warn("⚠️ Firebase reference not available. Skipping sync.");
    }

    res.status(201).json({ message: "Order placed", order: savedOrder });
  } catch (error) {
    console.error("❌ Error creating order:", error.message);
    res.status(500).json({ message: "Order creation error", error: error.message });
  }
});

app.get("/api/orders", async (req, res) => {
  try {
    const orders = await Order.find().sort({ date: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: "Error fetching orders", error: error.message });
  }
});

app.get("/api/orders/:email", async (req, res) => {
  try {
    const orders = await Order.find({ userEmail: req.params.email }).sort({ date: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: "Error fetching user orders", error: error.message });
  }
});

app.put("/api/orders/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const updates = req.body;

    const updatedOrder = await Order.findOneAndUpdate({ orderId }, updates, { new: true });
    if (!updatedOrder) return res.status(404).json({ message: "Order not found" });

    if (firebaseOrdersRef) {
      await firebaseOrdersRef.child(orderId).update({
        status: updatedOrder.status,
        expectedDelivery: updatedOrder.expectedDelivery || "",
        pickupPerson: updatedOrder.pickupPerson || "",
        updatedAt: new Date().toISOString(),
      });
      console.log(`✅ Firebase updated for Order: ${orderId}`);
    } else {
      console.warn("⚠️ Firebase reference not available during update.");
    }

    res.json({ message: "Order updated successfully", order: updatedOrder });
  } catch (error) {
    console.error("❌ Error updating order:", error.message);
    res.status(500).json({ message: "Error updating order", error: error.message });
  }
});

app.delete("/api/orders/:orderId", async (req, res) => {
  try {
    const order = await Order.findOneAndDelete({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (firebaseOrdersRef) await firebaseOrdersRef.child(req.params.orderId).remove();

    res.json({ message: "Order deleted" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting order", error: error.message });
  }
});

// ---------- Profile & Address Update ----------
app.post("/api/updateUser", async (req, res) => {
  try {
    const { uid, name, email, phone, joinedDate, address, city, pincode, landmark } = req.body;

    // ✅ Update MongoDB
    const user = await User.findOneAndUpdate(
      { email },
      {
        name,
        phone,
        joined: joinedDate ? new Date(joinedDate) : undefined,
        address,
        city,
        pincode,
        landmark,
      },
      { new: true, upsert: true }
    );

    // ✅ Sync Firebase
    if (firebaseDb) {
      await firebaseDb.ref(`users/${uid}`).update({
        name,
        email,
        phone,
        joinedDate,
        address,
        city,
        pincode,
        landmark,
      });
    }

    res.json({ message: "✅ User data updated successfully", user });
  } catch (error) {
    console.error("❌ Error updating user:", error.message);
    res.status(500).json({ message: "Error updating user", error: error.message });
  }
});

// ---------- Delete User ----------
app.delete("/api/deleteUser", async (req, res) => {
  try {
    const { uid, email } = req.body;

    // Delete from MongoDB
    await User.findOneAndDelete({ email });

    // Delete from Firebase
    if (firebaseDb) {
      await firebaseDb.ref(`users/${uid}`).remove();
    }

    res.json({ message: "✅ User deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting user:", error.message);
    res.status(500).json({ message: "Error deleting user", error: error.message });
  }
});

// ----------------- Start Server -----------------
const PORT = 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
