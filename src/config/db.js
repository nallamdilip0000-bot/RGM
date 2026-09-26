const mongoose = require('mongoose');

let isConnected = false;
let mongoMemoryServer = null;

const connectDB = async () => {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const primaryUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/personal_project_tracker';

  try {
    console.log(`Connecting to MongoDB at: ${primaryUri.replace(/:([^:@]{3,})@/, ':****@')}...`);
    await mongoose.connect(primaryUri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });
    isConnected = true;
    console.log('Successfully connected to MongoDB Database');
    return mongoose.connection;
  } catch (err) {
    console.warn(`Could not connect to primary MongoDB URI (${err.message}). Attempting memory instance fallback...`);
    
    try {
      // Dynamic require so production deployment does not fail if dev-dep is excluded
      const { MongoMemoryServer } = require('mongodb-memory-server');
      mongoMemoryServer = await MongoMemoryServer.create({
        instance: { startupTimeout: 60000 }
      });
      const memoryUri = mongoMemoryServer.getUri();
      console.log(`Started MongoDB In-Memory Server at: ${memoryUri}`);
      await mongoose.connect(memoryUri);
      isConnected = true;
      console.log('Successfully connected to MongoDB In-Memory Server');
      return mongoose.connection;
    } catch (memErr) {
      console.error('Fatal: Could not connect to either primary MongoDB or In-Memory instance:', memErr.message);
      console.info('Please verify your MONGODB_URI in .env file (e.g. your MongoDB Atlas connection string).');
      // Do not exit process immediately so server can display diagnostics
      return null;
    }
  }
};

const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    if (mongoMemoryServer) {
      await mongoMemoryServer.stop();
    }
    isConnected = false;
  } catch (e) {
    console.error('Error during database disconnection:', e);
  }
};

module.exports = { connectDB, disconnectDB };
