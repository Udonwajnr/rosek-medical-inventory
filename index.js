const express = require("express");
const http = require("http"); // Import HTTP module
const app = express();
const server = http.createServer(app); // Create a server from the express app
const connectDb = require("./config/db");
const dotenv = require("dotenv").config();
const port = process.env.PORT || 3000;
const colors = require("colors");
let cors = require("cors");
let cookieParser = require("cookie-parser");

// Import socket.io setup
const initSocket = require("./middleware/socket.js"); // WebSocket logic in separate file

const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'https://medical-inventory-beta.vercel.app',
      "https://rosek-beta.vercel.app"
    ];
    if (allowedOrigins.includes(origin) || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};

app.use(cookieParser());
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Routes
app.use('/api', require('./route/authenticationTokenRoute.js'));
app.use("/api/hospital", require("./route/hospitalAuthenticationRoute.js"));
app.use('/api/user', require('./route/userRoute'));
app.use('/api/medication', require('./route/medicationRoute'));
app.use('/api/purchase', require('./route/purchaseRoute.js'));
app.use('/api/', require('./route/userSpecificMedicationRegimen.js'));
app.use('/api/ai', require('./route/aiDispensingRoute.js'));
app.use('/api/supplier', require('./route/supplierRoute.js'));
app.use('/api/stock', require('./route/stockRoute.js'));
app.use('/api/purchase-order', require('./route/purchaseOrderRoute.js'));
app.use('/api/report', require('./route/reportRoute.js'));

// Initialize WebSocket
const io = initSocket(server);

// Trigger the reminder
server.listen(port, () => {
  console.log(`Server is running on port ${port}`.yellow);
  console.log(new Date());
  // sendMedicationReminder(userPhoneNumber, userName, medicationName, dosage, dosageForm);
});

connectDb();