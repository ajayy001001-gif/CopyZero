/**
 * Fix Script: Set All Assignments to Active Status
 * 
 * This script updates all assignments in Firestore to have status: 'active'
 * Use this if assignments exist but aren't showing up for students
 * 
 * Run: node fix-assignment-status.js
 */

require('dotenv').config();
const { db } = require('./src/config/firebase');

async function fixAssignmentStatus() {
  console.log('\n🔧 Starting Assignment Status Fix...\n');
  
  try {
    // Get all assignments
    const assignmentsSnapshot = await db.collection('assignments').get();
    
    if (assignmentsSnapshot.empty) {
      console.log('❌ No assignments found in database');
      console.log('   Nothing to fix!');
      return;
    }
    
    console.log(`Found ${assignmentsSnapshot.size} assignment(s)\n`);
    
    let updatedCount = 0;
    let alreadyActiveCount = 0;
    
    // Update each assignment
    for (const doc of assignmentsSnapshot.docs) {
      const data = doc.data();
      const currentStatus = data.status;
      
      console.log(`Processing: ${data.title}`);
      console.log(`  Current status: ${currentStatus || 'undefined'}`);
      
      if (currentStatus === 'active') {
        console.log(`  ✅ Already active - no change needed\n`);
        alreadyActiveCount++;
      } else {
        // Update to active
        await db.collection('assignments').doc(doc.id).update({
          status: 'active',
          updatedAt: new Date().toISOString()
        });
        
        console.log(`  ✅ Updated to active\n`);
        updatedCount++;
      }
    }
    
    console.log('='.repeat(60));
    console.log('\n📊 Summary:');
    console.log(`  Total assignments: ${assignmentsSnapshot.size}`);
    console.log(`  Already active: ${alreadyActiveCount}`);
    console.log(`  Updated to active: ${updatedCount}`);
    console.log('\n✨ Fix complete!\n');
    
    if (updatedCount > 0) {
      console.log('Students should now be able to see these assignments.');
      console.log('Have students refresh their dashboard.\n');
    }
    
  } catch (error) {
    console.error('\n❌ Error during fix:', error);
    console.error('\nMake sure:');
    console.error('  1. Backend .env file is configured correctly');
    console.error('  2. Firebase credentials are valid');
    console.error('  3. You have write permissions to Firestore\n');
  }
}

// Run the fix
fixAssignmentStatus()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
