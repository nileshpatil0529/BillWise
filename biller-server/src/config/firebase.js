import admin from 'firebase-admin';
import config from './config.js';

// Initialize Firebase Admin
let db = null;
let storage = null;
let firebaseInitialized = false;

const initializeFirebase = () => {
  try {
    // Check if Firebase is already initialized
    if (admin.apps.length > 0) {
      db = admin.firestore();
      storage = admin.storage();
      firebaseInitialized = true;
      return { db, storage };
    }

    // Only initialize if we have valid credentials
    if (config.firebase.projectId && 
        config.firebase.privateKey && 
        config.firebase.clientEmail &&
        config.firebase.privateKey.includes('BEGIN')) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: config.firebase.projectId,
          privateKey: config.firebase.privateKey,
          clientEmail: config.firebase.clientEmail
        })
      });
      db = admin.firestore();
      storage = admin.storage();
      firebaseInitialized = true;
      console.log('✅ Firebase initialized successfully');
    } else {
      // Demo mode - no Firebase
      console.log('⚠️ Running in DEMO MODE - Firebase not configured. Data stored in memory only.');
      firebaseInitialized = false;
    }

    return { db, storage };
  } catch (error) {
    console.error('❌ Firebase initialization failed:', error.message);
    console.log('⚠️ Running in DEMO MODE - Data stored in memory only.');
    firebaseInitialized = false;
    return { db: null, storage: null };
  }
};

// Initialize on import
initializeFirebase();

export { db, storage, admin, firebaseInitialized };
export default { db, storage, admin, initializeFirebase, firebaseInitialized };
