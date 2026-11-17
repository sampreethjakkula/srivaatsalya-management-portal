const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.log('[Database] Running with local persistent data engine in /data.');
    return;
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 50
    });
    console.log(`[Database] Connected to Cloud MongoDB Atlas: ${conn.connection.host}`);
  } catch (err) {
    console.warn(`[Database Warning] Could not reach MongoDB URI (${err.message}). Defaulting to local persistent engine.`);
  }
};

module.exports = connectDB;
