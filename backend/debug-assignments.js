/**
 * Debug Script: Check Assignment Visibility Issue
 * 
 * This script connects directly to Firestore to check:
 * 1. If assignments exist in the database
 * 2. If they have the correct status
 * 3. User roles are set correctly
 * 
 * Run: node debug-assignments.js
 */

require('dotenv').config();
const { db } = require('./src/config/firebase');

async function debugAssignments() {
  console.log('\n🔍 Starting Assignment Visibility Debug...\n');
  console.log('=' .repeat(60));

  try {
    // 1. Check Assignments Collection
    console.log('\n📋 CHECKING ASSIGNMENTS...');
    console.log('-'.repeat(60));
    
    const assignmentsSnapshot = await db.collection('assignments').get();
    
    if (assignmentsSnapshot.empty) {
      console.log('❌ No assignments found in database!');
      console.log('   → Teachers need to create assignments first');
    } else {
      console.log(`✅ Found ${assignmentsSnapshot.size} assignment(s)\n`);
      
      assignmentsSnapshot.forEach((doc, index) => {
        const data = doc.data();
        console.log(`Assignment ${index + 1}:`);
        console.log(`  ID: ${doc.id}`);
        console.log(`  Title: ${data.title}`);
        console.log(`  Type: ${data.type}`);
        console.log(`  Status: ${data.status} ${data.status === 'active' ? '✅' : '❌ (should be "active")'}`);
        console.log(`  Professor: ${data.professorName || data.professorId}`);
        console.log(`  Due Date: ${data.dueDate}`);
        console.log(`  Created: ${data.createdAt}`);
        console.log('');
      });
    }

    // 2. Check Active Assignments (what students see)
    console.log('-'.repeat(60));
    console.log('\n👀 CHECKING ACTIVE ASSIGNMENTS (Student View)...');
    console.log('-'.repeat(60));
    
    const activeAssignments = await db.collection('assignments')
      .where('status', '==', 'active')
      .get();
    
    if (activeAssignments.empty) {
      console.log('❌ No ACTIVE assignments found!');
      console.log('   → Students will see an empty list');
      console.log('   → Check if assignments have status: "active"');
    } else {
      console.log(`✅ Found ${activeAssignments.size} active assignment(s)`);
      console.log('   → Students should see these assignments\n');
      
      activeAssignments.forEach((doc, index) => {
        const data = doc.data();
        console.log(`  ${index + 1}. ${data.title} (${data.type})`);
      });
    }

    // 3. Check Users Collection
    console.log('\n\n' + '='.repeat(60));
    console.log('\n👥 CHECKING USERS...');
    console.log('-'.repeat(60));
    
    const usersSnapshot = await db.collection('users').get();
    
    if (usersSnapshot.empty) {
      console.log('❌ No users found!');
    } else {
      console.log(`✅ Found ${usersSnapshot.size} user(s)\n`);
      
      const professors = [];
      const students = [];
      const others = [];
      
      usersSnapshot.forEach(doc => {
        const data = doc.data();
        const user = {
          id: doc.id,
          email: data.email,
          role: data.role,
          name: data.name
        };
        
        if (data.role === 'professor') {
          professors.push(user);
        } else if (data.role === 'student') {
          students.push(user);
        } else {
          others.push(user);
        }
      });
      
      console.log(`Professors (${professors.length}):`);
      if (professors.length === 0) {
        console.log('  ❌ No professors found');
      } else {
        professors.forEach(p => {
          console.log(`  ✅ ${p.email} (${p.name || 'No name'})`);
        });
      }
      
      console.log(`\nStudents (${students.length}):`);
      if (students.length === 0) {
        console.log('  ❌ No students found');
      } else {
        students.forEach(s => {
          console.log(`  ✅ ${s.email} (${s.name || 'No name'})`);
        });
      }
      
      if (others.length > 0) {
        console.log(`\n⚠️  Users with unknown role (${others.length}):`);
        others.forEach(u => {
          console.log(`  ❓ ${u.email} - role: "${u.role || 'undefined'}"`);
        });
      }
    }

    // 4. Check Submissions
    console.log('\n\n' + '='.repeat(60));
    console.log('\n📝 CHECKING SUBMISSIONS...');
    console.log('-'.repeat(60));
    
    const submissionsSnapshot = await db.collection('submissions').get();
    
    if (submissionsSnapshot.empty) {
      console.log('ℹ️  No submissions yet (expected if just starting)');
    } else {
      console.log(`✅ Found ${submissionsSnapshot.size} submission(s)\n`);
      
      const submissionsByAssignment = {};
      submissionsSnapshot.forEach(doc => {
        const data = doc.data();
        const assignmentId = data.assignmentId;
        if (!submissionsByAssignment[assignmentId]) {
          submissionsByAssignment[assignmentId] = [];
        }
        submissionsByAssignment[assignmentId].push({
          studentId: data.studentId,
          studentName: data.studentName,
          score: data.score
        });
      });
      
      Object.keys(submissionsByAssignment).forEach(assignmentId => {
        const subs = submissionsByAssignment[assignmentId];
        console.log(`Assignment ${assignmentId}:`);
        console.log(`  ${subs.length} submission(s)`);
        subs.forEach(s => {
          console.log(`    - ${s.studentName || s.studentId} (Score: ${s.score || 'not graded'})`);
        });
        console.log('');
      });
    }

    // 5. Summary & Recommendations
    console.log('\n' + '='.repeat(60));
    console.log('\n📊 SUMMARY & RECOMMENDATIONS');
    console.log('='.repeat(60));
    
    const hasAssignments = !assignmentsSnapshot.empty;
    const hasActiveAssignments = !activeAssignments.empty;
    const hasProfessors = professors.length > 0;
    const hasStudents = students.length > 0;
    
    if (!hasAssignments) {
      console.log('\n❌ CRITICAL: No assignments in database');
      console.log('   ACTION: Teachers need to log in and create assignments');
    } else if (!hasActiveAssignments) {
      console.log('\n⚠️  WARNING: Assignments exist but none are active');
      console.log('   ACTION: Check assignment status in Firebase Console');
      console.log('   → Go to Firestore → assignments → verify status: "active"');
    } else {
      console.log('\n✅ GOOD: Active assignments exist');
    }
    
    if (!hasProfessors) {
      console.log('\n⚠️  WARNING: No professors found');
      console.log('   ACTION: Ensure teachers sign up with role: "professor"');
    }
    
    if (!hasStudents) {
      console.log('\n⚠️  WARNING: No students found');
      console.log('   ACTION: Ensure students sign up with role: "student"');
    }
    
    if (hasActiveAssignments && hasStudents) {
      console.log('\n✅ GOOD: System has active assignments and students');
      console.log('   → Students should be able to see assignments');
      console.log('   → If not, check:');
      console.log('     1. Frontend API connection (VITE_API_URL in .env)');
      console.log('     2. Browser console for errors (F12)');
      console.log('     3. Backend logs when student loads dashboard');
      console.log('     4. Student authentication (valid VIT email)');
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n✨ Debug complete!\n');

  } catch (error) {
    console.error('\n❌ Error during debug:', error);
    console.error('\nPossible causes:');
    console.error('  1. Firebase credentials not configured correctly');
    console.error('  2. Missing .env file in backend directory');
    console.error('  3. Invalid Firebase private key');
    console.error('\nCheck backend/.env file and ensure all Firebase credentials are set.');
  }
}

// Run the debug
debugAssignments()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
