const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const HospitalSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  address: {
    type: String,
    // required: true,
  },
  phone: {
    type: String,
    // required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  operatingHours: {
    type: String,
    default: '24/7',
  },
  socialMedia: {
    facebook: String,
    twitter: String,
    instagram: String,
  },
  verificationToken:{
    type:String,
  },
  users:[{
    type:mongoose.Types.ObjectId,
    ref:"User"
    }],
  medication:[{
    type:mongoose.Types.ObjectId,
    ref:"Medication"
  }],
  userSpecificMedicationRegimen: [{
    type: mongoose.Types.ObjectId,
    ref: "UserSpecificMedicationRegimen"
  }],
  registrationDate: {
    type: Date,
    default: Date.now,
  },
  resetPasswordToken:{
    type:String
    },
  resetPasswordExpires:{
    type:Date
    },
  purchaseHistory:[{
    type:mongoose.Types.ObjectId,
    ref:"Purchase"
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

// Hash password before saving the hospital
HospitalSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Match entered password with hashed password
HospitalSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('Hospital', HospitalSchema);
