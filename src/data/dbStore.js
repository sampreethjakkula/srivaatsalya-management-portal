const path = require('path');
const Datastore = require('nedb-promises');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

// Mongoose Models
const UserModel = require('../models/User');
const StudentModel = require('../models/Student');
const FeeModel = require('../models/Fee');
const AttendanceModel = require('../models/Attendance');
const NoticeModel = require('../models/Notice');
const AdmissionModel = require('../models/Admission');
const GalleryModel = require('../models/Gallery');

const dataDir = path.join(__dirname, '../../data');

// Local NeDB Stores
const localUsers = Datastore.create({ filename: path.join(dataDir, 'users.db'), autoload: true });
const localStudents = Datastore.create({ filename: path.join(dataDir, 'students.db'), autoload: true });
const localFees = Datastore.create({ filename: path.join(dataDir, 'fees.db'), autoload: true });
const localAttendance = Datastore.create({ filename: path.join(dataDir, 'attendance.db'), autoload: true });
const localNotices = Datastore.create({ filename: path.join(dataDir, 'notices.db'), autoload: true });
const localAdmissions = Datastore.create({ filename: path.join(dataDir, 'admissions.db'), autoload: true });
const localGallery = Datastore.create({ filename: path.join(dataDir, 'gallery.db'), autoload: true });

const isMongoActive = () => mongoose.connection.readyState === 1;

// Unified Wrapper Object
const createStore = (MongooseModel, nedbStore) => ({
  async find(query = {}) {
    if (isMongoActive()) {
      return await MongooseModel.find(query).sort({ createdAt: -1 }).lean();
    }
    return await nedbStore.find(query).sort({ createdAt: -1 });
  },

  async findOne(query) {
    if (isMongoActive()) {
      return await MongooseModel.findOne(query).lean();
    }
    return await nedbStore.findOne(query);
  },

  async insert(doc) {
    if (isMongoActive()) {
      return await MongooseModel.create(doc);
    }
    return await nedbStore.insert(doc);
  },

  async update(query, updateData, options = {}) {
    if (isMongoActive()) {
      return await MongooseModel.findOneAndUpdate(query, updateData, { new: true, upsert: options.upsert || false });
    }
    return await nedbStore.update(query, updateData, options);
  },

  async remove(query, options = {}) {
    if (isMongoActive()) {
      return await MongooseModel.deleteMany(query);
    }
    return await nedbStore.remove(query, options);
  },

  async count(query = {}) {
    if (isMongoActive()) {
      return await MongooseModel.countDocuments(query);
    }
    return await nedbStore.count(query);
  }
});

const Users = createStore(UserModel, localUsers);
const Students = createStore(StudentModel, localStudents);
const Fees = createStore(FeeModel, localFees);
const Attendance = createStore(AttendanceModel, localAttendance);
const Notices = createStore(NoticeModel, localNotices);
const Admissions = createStore(AdmissionModel, localAdmissions);
const Gallery = createStore(GalleryModel, localGallery);

// Seed function for cloud & local
const seedDB = async () => {
  try {
    // Fix: Remove any corrupted (double-hashed) default accounts so they get re-seeded correctly
    const testUser = await Users.findOne({ username: 'SUPERADMIN' });
    if (testUser) {
      const isValid = await bcrypt.compare('super123', testUser.password);
      if (!isValid) {
        console.log('[Database] Detected corrupted default accounts. Re-seeding...');
        await Users.remove({ username: { $in: ['SUPERADMIN', 'ADMIN', 'STUDENT'] } }, { multi: true });
        await Students.remove({ id: 'STUDENT' });
        await Fees.remove({ studentId: 'STUDENT' });
        await Notices.remove({});
      }
    }

    const userCount = await Users.count({});
    if (userCount === 0) {
      console.log('[Database] Seeding initial administrative and student accounts...');
      
      const superAdminPass = await bcrypt.hash('super123', 10);
      await Users.insert({
        username: 'SUPERADMIN',
        password: superAdminPass,
        role: 'superadmin',
        name: 'Chief Administrator',
        campus: 'All Campuses'
      });

      const adminPass = await bcrypt.hash('admin123', 10);
      await Users.insert({
        username: 'ADMIN',
        password: adminPass,
        role: 'admin',
        name: 'Campus Administrator',
        campus: 'All Campuses'
      });

      const studentPass = await bcrypt.hash('student123', 10);
      await Users.insert({
        username: 'STUDENT',
        password: studentPass,
        role: 'student',
        name: 'Default Student',
        campus: 'Day Scholar',
        studentId: 'STUDENT'
      });

      await Students.insert({
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

      await Fees.insert({
        studentId: 'STUDENT',
        total: 150000,
        paid: 50000,
        history: [{ amount: 50000, date: new Date().toISOString().split('T')[0], receiptNo: 'REC-001024' }]
      });

      await Notices.insert({
        title: 'NEET & JEE Advanced Mock Test Series',
        content: 'The statewide mock test series starts this coming Monday at 8:30 AM across all campuses.',
        desc: 'The statewide mock test series starts this coming Monday at 8:30 AM across all campuses.',
        type: 'global',
        campus: 'All Campuses',
        target: 'All Students',
        priority: 'Important',
        postedBy: 'SUPERADMIN',
        sender: 'Administrator',
        date: new Date().toISOString().split('T')[0]
      });
      console.log('✓ Seeding complete.');
    }
  } catch (e) {
    console.error('Seed notice:', e.message);
  }
};

mongoose.connection.on('connected', () => {
  console.log('[Database] Live MongoDB connection established. Syncing cloud collections...');
  seedDB();
});

// Run local seed if needed
setTimeout(seedDB, 1500);

module.exports = {
  Users,
  Students,
  Fees,
  Attendance,
  Notices,
  Admissions,
  Gallery,
  seedDB
};
