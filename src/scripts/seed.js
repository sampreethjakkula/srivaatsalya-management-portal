require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Student = require('../models/Student');
const Fee = require('../models/Fee');
const Notice = require('../models/Notice');

const seedDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_management');
    console.log('[Seed] Connected to MongoDB');

    // 1. Seed Administrator (Super Admin)
    let superAdmin = await User.findOne({ username: 'SUPERADMIN' });
    if (!superAdmin) {
      const hashedPass = await bcrypt.hash('super123', 10);
      superAdmin = new User({
        username: 'SUPERADMIN',
        password: hashedPass,
        role: 'superadmin',
        name: 'Chief Administrator',
        campus: 'All Campuses'
      });
      await superAdmin.save();
      console.log('✓ Administrator created: Username: SUPERADMIN | Password: super123');
    }

    // 2. Seed Admin
    let admin = await User.findOne({ username: 'ADMIN' });
    if (!admin) {
      const hashedPass = await bcrypt.hash('admin123', 10);
      admin = new User({
        username: 'ADMIN',
        password: hashedPass,
        role: 'admin',
        name: 'Campus Admin',
        campus: 'All Campuses'
      });
      await admin.save();
      console.log('✓ Admin created: Username: ADMIN | Password: admin123');
    }

    // 3. Seed Default Student
    let studentUser = await User.findOne({ username: 'STUDENT' });
    if (!studentUser) {
      const hashedPass = await bcrypt.hash('student123', 10);
      studentUser = new User({
        username: 'STUDENT',
        password: hashedPass,
        role: 'student',
        name: 'Default Student',
        campus: 'Day Scholar',
        studentId: 'STUDENT'
      });
      await studentUser.save();
      console.log('✓ Student User created: Username: STUDENT | Password: student123');
    }

    let studentProfile = await Student.findOne({ id: 'STUDENT' });
    if (!studentProfile) {
      studentProfile = new Student({
        id: 'STUDENT',
        name: 'Default Student',
        course: 'BiPC - NEET',
        year: '1st Year',
        campus: 'Day Scholar',
        dob: '2007-05-15',
        gender: 'Male',
        father: 'R. Krishna',
        mother: 'R. Lakshmi',
        phone: '9876543210',
        school: 'Sri Vaatsalya Junior College',
        transport: false,
        att: 95,
        pass: 'student123',
        results: [
          { exam: 'Unit Test 1', marks: '92/100', grade: 'A+' },
          { exam: 'Quarterly', marks: '88/100', grade: 'A' }
        ]
      });
      await studentProfile.save();
      console.log('✓ Student Profile created: STUDENT');
    }

    // 4. Seed Fee for Student
    let studentFee = await Fee.findOne({ studentId: 'STUDENT' });
    if (!studentFee) {
      studentFee = new Fee({
        studentId: 'STUDENT',
        studentName: 'Default Student',
        course: 'BiPC - NEET',
        year: '1st Year',
        totalFee: 75000,
        paidAmount: 50000,
        dueAmount: 25000,
        status: 'Partial',
        paymentHistory: [
          {
            amount: 50000,
            date: new Date(),
            receiptNo: 'REC-001024',
            method: 'Online Banking',
            notes: 'First Term Tuition Fee'
          }
        ]
      });
      await studentFee.save();
      console.log('✓ Fee Record created for STUDENT');
    }

    // 5. Seed Sample Notices
    const noticeCount = await Notice.countDocuments();
    if (noticeCount === 0) {
      await Notice.create([
        {
          title: 'NEET & JEE Mock Test Series Schedule',
          content: 'The second round of statewide mock tests will begin from Monday. All students are required to report at 8:30 AM.',
          type: 'global',
          campus: 'All Campuses',
          postedBy: 'SUPERADMIN'
        },
        {
          title: 'Term Fee Due Notice',
          content: 'Kindly clear the remaining second-term fee balance by the end of this month to avoid late fee penalties.',
          type: 'global',
          campus: 'All Campuses',
          postedBy: 'ADMIN'
        }
      ]);
      console.log('✓ Sample Notices created');
    }

    console.log('[Seed Completed Successfully]');
    process.exit(0);
  } catch (err) {
    console.error('Seed Error:', err);
    process.exit(1);
  }
};

seedDB();
