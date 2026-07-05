const Hospital = require("../model/hospital");
const asyncHandler = require("express-async-handler");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const JWT = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Medication = require("../model/medication");

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key";

const createHospital = asyncHandler(async (req, res) => {
  const { name, email, password, confirmPassword } = req.body;

  // Check if passwords match
  if (password !== confirmPassword) {
    return res.status(400).json({ msg: "Passwords do not match" });
  }

  const normalizedEmail = email.toLowerCase();

  let hospital = await Hospital.findOne({ email: normalizedEmail });
  if (hospital) {
    return res
      .status(400)
      .json({ msg: "Hospital already exists With this email" });
  }

const autoVerify = process.env.AUTO_VERIFY_EMAIL === "true";

  hospital = new Hospital({
    name,
    email: normalizedEmail,
    password, // Save plain text password, hashing happens in pre-save hook
    // isVerified: false, // Make sure to set the default verification status
     isVerified: autoVerify
  });

  // Save the hospital to get its ID
  await hospital.save();

  if (autoVerify) {
    return res.status(201).json({
      msg: "Account created successfully. You can now log in.",
    });
  }

  // Create a JWT token for email verification with the hospital ID
  const verificationToken = JWT.sign(
    { id: hospital._id }, // Include hospital ID
    JWT_SECRET,
    { expiresIn: "1h" }, // Token expires in 1 hour
  );

  // Update the hospital with the verification token
  hospital.verificationToken = verificationToken;
  await hospital.save();

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSCODE,
    },
  });

  const mailOptions = {
    to: hospital.email,
    from: process.env.EMAIL_USER,
    subject: "Email Verification",
    html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 8px;">
            <h2 style="color: #2c3e50; text-align: center;">Rosek Inventory</h2>
            <h3 style="color: #34495e;">Verify Your Email Address</h3>
            <p style="color: #555;">Hi there,</p>
            <p style="color: #555;">
              Thank you for registering with Rosek Inventory. To complete your registration, please verify your email address by clicking the link below:
            </p>
            <p style="text-align: center;">
              <a href="https://rosek-beta.vercel.app/verify-email/${verificationToken}" 
                style="display: inline-block; padding: 10px 20px; font-size: 16px; color: #ffffff; background-color: #3498db; text-decoration: none; border-radius: 5px;">
                Verify Email Address
              </a>
            </p>
            <p style="color: #555;">
              This link will expire in <strong>1 hour</strong>. If you did not request this email, please ignore it.
            </p>
            <p style="color: #555;">Best regards,<br/>The Rosek  Team</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; text-align: center; font-size: 12px;">
              © ${new Date().getFullYear()} Pharma Inventory. All rights reserved.
            </p>
          </div>
        `,
  };

  transporter.sendMail(mailOptions, (err, response) => {
    if (err) {
      console.error("There was an error:", err);
      // Account was created but the email failed — tell the client instead of hanging
      return res.status(502).json({
        msg: "Account created, but the verification email could not be sent. Please use resend verification.",
      });
    }
    res.status(201).json({ msg: "Verification email sent" });
  });
});

const verifyEmail = asyncHandler(async (req, res) => {
  const decoded = JWT.verify(req.params.token, process.env.JWT_SECRET);
  const hospital = await Hospital.findById(decoded.id);

  if (!hospital) {
    return res.status(400).json({ msg: "Invalid token or hospital not found" });
  }

  if (hospital.isVerified) {
    return res.status(400).json({ msg: "Email already verified" });
  }

  hospital.isVerified = true;
  await hospital.save();

  res.status(200).json({ msg: "Email verified successfully" });
});

const loginHospital = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Find the hospital by email
  const hospital = await Hospital.findOne({ email });

  if (!hospital) {
    return res.status(400).json({ msg: "Hospital not found" });
  }

  // Check if the hospital has verified their email
  if (!hospital.isVerified) {
    return res.status(400).json({ msg: "Email not verified" });
  }

  // Compare the provided password with the hashed password
  const isMatch = await hospital.matchPassword(password);
  if (!isMatch) {
    return res.status(400).json({ msg: "Invalid credentials" });
  }

  // Create an access token
  const accessToken = JWT.sign(
    { id: hospital._id, name: hospital.name, email: hospital.email },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }, // Shorter expiration time for access token
  );

  // Create a refresh token
  const refreshToken = JWT.sign(
    { id: hospital._id, name: hospital.name, email: hospital.email },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: "7d" }, // Longer expiration for refresh token
  );

  // Set the refresh token in an HTTP-only cookie
  res.cookie("refreshToken", refreshToken, {
    // httpOnly: false, // Not HTTP-only for testing, visible in browser
    secure: true,
    sameSite: "None",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  // Send the access token in the response body
  res.status(200).json({
    msg: "Login successful",
    accessToken,
    refreshToken,
  });
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  // console.log(req.cookies)
  if (!refreshToken) {
    return res.status(403).json({ msg: "Refresh token is required" });
  }

  try {
    // Verify the refresh token
    const decoded = JWT.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

    // Generate a new access token
    const accessToken = JWT.sign(
      { id: decoded.id, name: decoded.name, email: decoded.email },
      process.env.JWT_SECRET,
      { expiresIn: "15m" },
    );

    res.status(200).json({
      msg: "Token refreshed",
      accessToken,
    });
  } catch (err) {
    return res.status(403).json({ msg: "Invalid refresh token" });
  }
});

// Logout hospital
const logoutHospital = asyncHandler(async (req, res) => {
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });

  res.status(200).json({ msg: "Logged out successfully" });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const hospital = await Hospital.findOne({ email });

  if (!hospital) {
    return res.status(400).json({ msg: "Hospital not found" });
  }

  // Create a JWT token for password reset
  const resetToken = JWT.sign(
    { id: hospital._id },
    JWT_SECRET,
    { expiresIn: "1h" }, // Token expires in 1 hour
  );

  // Set the reset token and expiration in the database
  hospital.resetPasswordToken = resetToken;
  hospital.resetPasswordExpires = Date.now() + 3600000; // 1 hour from now
  await hospital.save();

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSCODE,
    },
  });

  const mailOptions = {
    to: hospital.email,
    from: process.env.EMAIL_USER,
    subject: "Password Reset Request",
    html: `
          <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                <h2 style="color: #0056b3;">Password Reset Request</h2>
                <p>Hello,</p>
                <p>You requested a password reset for your account. Please click the link below to reset your password:</p>
                <p>
                  <a href="https://medical-inventory-beta.vercel.app/reset-password/${resetToken}" 
                     style="display: inline-block; padding: 10px 20px; margin: 10px 0; color: #fff; background-color: #007bff; text-decoration: none; border-radius: 5px;">
                    Reset Password
                  </a>
                </p>
                <p>This link will expire in 1 hour. If you did not request this, please ignore this email.</p>
                <p>Thank you,<br>Your Team</p>
                <hr style="border: 0; border-top: 1px solid #ddd; margin: 20px 0;">
                <p style="font-size: 0.9em; color: #777;">
                  If you have any questions or need further assistance, feel free to contact us at <a href="mailto:support@medical-inventory-beta.vercel.app" style="color: #007bff;">support@medical-inventory-beta.vercel.app</a>.
                </p>
              </div>
            </body>
          </html>
        `,
  };

  transporter.sendMail(mailOptions, (err) => {
    if (err) {
      console.error("There was an error:", err);
      return res.status(500).json({ msg: "Error sending email" });
    }
    res.status(200).json({ msg: "Password reset email sent" });
  });
});

const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword, confirmPassword } = req.body;

  try {
    const decoded = JWT.verify(token, JWT_SECRET);
    const hospital = await Hospital.findById(decoded.id);

    if (!hospital) {
      return res.status(400).json({ msg: "Hospital not found" });
    }

    // Check if the reset token is valid and not expired
    if (
      hospital.resetPasswordToken !== token ||
      hospital.resetPasswordExpires < Date.now()
    ) {
      return res.status(400).json({ msg: "Token is invalid or has expired" });
    }

    // Check if new passwords match
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ msg: "Passwords do not match" });
    }

    // Ensure newPassword is a valid string
    if (!newPassword || typeof newPassword !== "string") {
      return res.status(400).json({ msg: "Invalid password" });
    }

    // Set the new password and clear the reset token and expiration
    hospital.password = newPassword;
    hospital.resetPasswordToken = undefined; // Clear the reset token
    hospital.resetPasswordExpires = undefined; // Clear the expiration time
    await hospital.save();

    res.status(200).json({ msg: "Password has been reset successfully" });
  } catch (error) {
    console.error("Error during password reset:", error);
    return res.status(400).json({ msg: "Invalid or expired token" });
  }
});

const resendVerificationLink = asyncHandler(async (req, res) => {
  const { email } = req.body;

  // Check if the hospital exists
  const hospital = await Hospital.findOne({ email });
  if (!hospital) {
    return res.status(400).json({ msg: "Hospital not found" });
  }

  // Check if the hospital is already verified
  if (hospital.isVerified) {
    return res.status(400).json({ msg: "Email already verified" });
  }

  // Create a new JWT token for email verification
  const verificationToken = JWT.sign(
    { id: hospital._id },
    JWT_SECRET,
    { expiresIn: "1h" }, // Token expires in 1 hour
  );

  // Update the hospital with the new verification token
  hospital.verificationToken = verificationToken;
  await hospital.save();

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSCODE,
    },
  });

  const mailOptions = {
    to: hospital.email,
    from: process.env.EMAIL_USER,
    subject: "Resend Email Verification",
    html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 8px;">
            <h2 style="color: #2c3e50; text-align: center;">Rosek Inventory</h2>
            <h3 style="color: #34495e;">Verify Your Email Address</h3>
            <p style="color: #555;">Hi there,</p>
            <p style="color: #555;">
              You have requested to resend your verification email. Please verify your email address by clicking the link below:
            </p>
            <p style="text-align: center;">
              <a href="https://medical-inventory-beta.vercel.app/verify-email/${verificationToken}" 
                style="display: inline-block; padding: 10px 20px; font-size: 16px; color: #ffffff; background-color: #3498db; text-decoration: none; border-radius: 5px;">
                Verify Email Address
              </a>
            </p>
            <p style="color: #555;">
              This link will expire in <strong>1 hour</strong>. If you did not request this email, please ignore it.
            </p>
            <p style="color: #555;">Best regards,<br/>The Pharma Inventory Team</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; text-align: center; font-size: 12px;">
              © ${new Date().getFullYear()} Pharma Inventory. All rights reserved.
            </p>
          </div>
        `,
  };

  transporter.sendMail(mailOptions, (err, response) => {
    if (err) {
      console.error("There was an error:", err);
      return res.status(500).json({ msg: "Failed to send verification email" });
    } else {
      console.log("sent");
      res
        .status(200)
        .json({
          msg: "Verification email resent successfully",
          token: verificationToken,
        });
    }
  });
});

const getAllHospitals = asyncHandler(async (req, res) => {
  const hospitals = await Hospital.find()
    .populate("users")
    .populate("medication");

  res.status(200).json(hospitals);
});

const getHospitalById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const hospital = await Hospital.findById(id)
    .populate("users")
    .populate("medication");

  if (!hospital) {
    return res.status(404).json({ msg: "Hospital not found" });
  }

  res.status(200).json(hospital);
});
// check this again

const searchHospitals = asyncHandler(async (req, res) => {
  const { query } = req.query;

  const hospitals = await Hospital.find({
    $or: [
      { name: { $regex: query, $options: "i" } },
      { address: { $regex: query, $options: "i" } },
      { phone: { $regex: query, $options: "i" } },
    ],
  });

  res.status(200).json(hospitals);
});

const updateHospital = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, address, phone, operatingHours, socialMedia, email } = req.body;

  let hospital = await Hospital.findById(id);

  if (!hospital) {
    return res.status(404).json({ msg: "Hospital not found" });
  }

  // If the email is being updated, check if the new email already exists
  if (email && email !== hospital.email) {
    const emailExists = await Hospital.findOne({ email });
    if (emailExists) {
      return res
        .status(400)
        .json({ msg: "Email already in use by another hospital" });
    }

    // Update email and set isVerified to false
    hospital.email = email;
    hospital.isVerified = false; // Re-verify the email

    // Generate a new verification token
    const verificationToken = JWT.sign(
      { id: hospital._id },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );
    hospital.verificationToken = verificationToken;

    // Send verification email to the new email address
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSCODE,
      },
    });

    const mailOptions = {
      to: email,
      from: process.env.EMAIL_USER,
      subject: "Email Verification",
      text: `Please verify your new email address by clicking the following link:\n\n
            http://${req.headers.host}/verify-email/${verificationToken}\n\n
            This link will expire in 1 hour.\n
            If you did not request this, please ignore this email.\n`,
    };

    transporter.sendMail(mailOptions, (err, response) => {
      if (err) {
        console.error("There was an error:", err);
      }
    });
  }

  // Update other fields
  hospital.name = name || hospital.name;
  hospital.address = address || hospital.address;
  hospital.phone = phone || hospital.phone;
  hospital.operatingHours = operatingHours || hospital.operatingHours;
  hospital.socialMedia = socialMedia || hospital.socialMedia;

  await hospital.save();

  res
    .status(200)
    .json({
      msg: "Hospital details updated successfully. Please verify your new email.",
      hospital,
    });
});

const deleteHospital = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Find the hospital by ID
  const hospital = await Hospital.findById(id);

  if (!hospital) {
    return res.status(404).json({ msg: "Hospital not found" });
  }

  // Delete related medications
  await Medication.deleteMany({ hospital: id }); // Use the `hospital` field to find related medications

  // Delete the hospital
  await Hospital.deleteOne({ _id: id });

  res
    .status(200)
    .json({ msg: "Hospital and related medications deleted successfully" });
});

module.exports = {
  createHospital,
  verifyEmail,
  loginHospital,
  refreshAccessToken,
  resendVerificationLink,
  logoutHospital,
  forgotPassword,
  resetPassword,
  updateHospital,
  getHospitalById,
  deleteHospital,
  searchHospitals,
  getAllHospitals,
};
