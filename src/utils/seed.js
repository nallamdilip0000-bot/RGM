require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Users } = require('../services/dbService');

const seedFirebaseData = async () => {
  console.log('Verifying core system configuration in Firebase Firestore...');

  try {
    const salt = await bcrypt.genSalt(10);
    const adminPasswordHash = await bcrypt.hash('Admin@123', salt);

    // Ensure Admin Account Exists
    let admin = await Users.findByEmail('admin@rgm.edu');
    if (!admin) {
      admin = await Users.create({
        name: 'System Administrator',
        email: 'admin@rgm.edu',
        password: adminPasswordHash,
        department: 'Academic Affairs',
        phone: '9876543210',
        role: 'admin',
        isActive: true,
        notificationPreferences: { email: true, inApp: true }
      });
      console.log('Admin account created in Firebase: admin@rgm.edu / Admin@123');
    }

    console.log('Firebase system initialization completed.');
  } catch (err) {
    console.error('Firebase Initialization Error:', err);
  }
};

module.exports = seedFirebaseData;

if (require.main === module) {
  seedFirebaseData().then(() => {
    console.log('Done');
    process.exit(0);
  });
}
