require('dotenv').config();
const User = require('./src/models/User');
const { closePool } = require('./src/models/database');

async function bootstrapAdmin() {
  try {
    console.log('🚀 Bootstrapping admin user...');
    
    // Check if admin user already exists
    const existingAdmin = await User.findByUsername('admin');
    if (existingAdmin) {
      console.log('ℹ️  Admin user already exists');
      return;
    }
    
    // Create admin user
    const admin = await User.create('admin', 'admin123', 5368709120); // 5GB quota
    console.log('✅ Created admin user:');
    console.log(`   Username: admin`);
    console.log(`   Password: admin123`);
    console.log(`   User ID: ${admin.id}`);
    console.log(`   Storage Quota: 5GB`);
    console.log('');
    console.log('⚠️  IMPORTANT: Change the admin password immediately after first login!');
    
  } catch (error) {
    console.error('❌ Failed to bootstrap admin user:', error.message);
    process.exit(1);
  } finally {
    await closePool();
  }
}

bootstrapAdmin();