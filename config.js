// ===============================
// FIREBASE CONFIG (CLIENT SIDE) - GEMINI PRODUCTION
// ===============================

const firebaseConfig = {
  apiKey: "AIzaSyC6i0uGo5Efg6AKbQ9s8W-Yc9wM1Ggcj0I",
  authDomain: "mangrove-watch-a65e4.firebaseapp.com",
  projectId: "mangrove-watch-a65e4",
  storageBucket: "mangrove-watch-a65e4.firebasestorage.app",
  messagingSenderId: "10784769729",
  appId: "1:10784769729:web:8b29569402c3c7049b7640",
  measurementId: "G-LK4ZTXRZ3X"
};

// Init Firebase
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

const DEBUG = false;

// ===============================
// HELPERS
// ===============================

const safeTimestamp = (timestamp) => {
  if (!timestamp) return new Date().toISOString();
  if (timestamp.toDate) return timestamp.toDate().toISOString();
  return new Date(timestamp).toISOString();
};

// ===============================
// MAIN SERVICE
// ===============================

const FirebaseService = {

  // ---------- AUTH ----------

  async registerUser(email, password, fullName, phone="") {
    try {
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      const user = cred.user;

      await user.updateProfile({ displayName: fullName });

      await db.collection("users").doc(user.uid).set({
        fullName,
        email,
        phone,
        role: "citizen",
        points: 0,
        totalReports: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      return { success:true };

    } catch(e){
      return { success:false, error:e.message };
    }
  },

  async loginUser(email,password){
    try{
      const res = await auth.signInWithEmailAndPassword(email,password);
      return { success:true, user:res.user };
    }catch(e){
      return { success:false, error:e.message };
    }
  },

  async logoutUser(){
    await auth.signOut();
    return { success:true };
  },

  getCurrentUser(){
    return auth.currentUser;
  },

  // Real-time listener for user profile
  listenToUserProfile(uid, callback){
    const unsubscribe = db.collection("users").doc(uid)
      .onSnapshot(
        (doc) => {
          if (doc.exists) {
            callback({
              success: true,
              userData: doc.data()
            });
          } else {
            callback({
              success: false,
              error: "User profile not found"
            });
          }
        },
        (error) => {
          console.error("User profile listener error:", error);
          callback({
            success: false,
            error: error.message
          });
        }
      );
    
    return unsubscribe;
  },

  // ---------- REPORT SUBMIT ----------

  async submitReport(reportData, photoFile){

    const user = auth.currentUser;
    if(!user) throw new Error("Not logged in");

    const profileSnap = await db.collection("users").doc(user.uid).get();
    const profile = profileSnap.data();

    let photoUrl = null;

    if(photoFile){
      const ref = storage.ref(`reports/${Date.now()}_${photoFile.name}`);
      await ref.put(photoFile);
      photoUrl = await ref.getDownloadURL();
    }

    const doc = await db.collection("reports").add({
      userId: user.uid,
      reporterName: profile.fullName,
      reporterEmail: user.email,

      incidentType: reportData.incidentType,
      description: reportData.description,
      latitude: Number(reportData.lat),
      longitude: Number(reportData.lng),

      photoUrl,

      status: "pending",

      authorityId:null,
      authorityName:null,
      authorityContact:null,

      evidencePhotoUrl:null,

      aiPending:true,

      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await db.collection("users").doc(user.uid).update({
      totalReports: firebase.firestore.FieldValue.increment(1),
      points: firebase.firestore.FieldValue.increment(10)
    });

    return { success:true, id:doc.id };
  },

  // ---------- AUTHORITY TAKE CASE ----------

  async assignAuthority(reportId,name,contact){

    const user = auth.currentUser;

    await db.collection("reports").doc(reportId).update({
      status:"investigating",
      authorityId:user.uid,
      authorityName:name,
      authorityContact:contact,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    return { success:true };
  },

  // ---------- RESOLVE ----------

  async resolveReport(reportId,file){

    let url=null;

    if(file){
      const ref = storage.ref(`evidence/${reportId}_${file.name}`);
      await ref.put(file);
      url = await ref.getDownloadURL();
    }

    await db.collection("reports").doc(reportId).update({
      status:"resolved",
      evidencePhotoUrl:url,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    return { success:true };
  },

  // ---------- FETCH ----------

  async getUserReports(uid){

    const snap = await db.collection("reports")
      .where("userId","==",uid)
      .get();

    // Sort client-side to avoid needing composite index
    const reports = snap.docs.map(d=>({
      id:d.id,
      ...d.data(),
      createdAt:safeTimestamp(d.data().createdAt)
    })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return {
      success:true,
      reports
    };
  },

  // Real-time listener for user reports
  listenToUserReports(uid, callback){
    const unsubscribe = db.collection("reports")
      .where("userId","==",uid)
      .onSnapshot(
        (snapshot) => {
          const reports = snapshot.docs.map(d=>({
            id:d.id,
            ...d.data(),
            createdAt:safeTimestamp(d.data().createdAt)
          })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          
          callback({
            success:true,
            reports
          });
        },
        (error) => {
          console.error("User reports listener error:", error);
          callback({
            success:false,
            error: error.message
          });
        }
      );
    
    return unsubscribe;
  },

  async getAllReports(){

    const snap = await db.collection("reports")
      .orderBy("createdAt","desc")
      .get();

    return {
      success:true,
      reports:snap.docs.map(d=>({
        id:d.id,
        ...d.data(),
        createdAt:safeTimestamp(d.data().createdAt)
      }))
    };
  },

  async getLeaderboard(){

    const snap = await db.collection("users")
      .orderBy("points","desc")
      .limit(10)
      .get();

    return {
      success:true,
      leaderboard:snap.docs.map(d=>({
        id:d.id,
        ...d.data()
      }))
    };
  },

  // Real-time leaderboard listener
  listenToLeaderboard(callback){
    const unsubscribe = db.collection("users")
      .orderBy("points","desc")
      .limit(10)
      .onSnapshot(
        (snapshot) => {
          const leaderboard = snapshot.docs.map(d=>({
            id:d.id,
            ...d.data()
          }));
          callback({
            success:true,
            leaderboard
          });
        },
        (error) => {
          console.error("Leaderboard listener error:", error);
          callback({
            success:false,
            error: error.message
          });
        }
      );
    
    return unsubscribe;
  },

  async getReportStats(){

    const snap = await db.collection("reports").get();
    const arr = snap.docs.map(d=>d.data());

    let pending=0,investigating=0,resolved=0;
    const uniqueUsers = new Set();

    // FIX: compute activeReporters and thisWeekReports which were missing
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    let thisWeekReports = 0;

    arr.forEach(r=>{
      if(r.status==="pending") pending++;
      if(r.status==="investigating") investigating++;
      if(r.status==="resolved") resolved++;
      if(r.userId) uniqueUsers.add(r.userId);

      // Count reports from the last 7 days
      const createdAt = r.createdAt && r.createdAt.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
      if(createdAt >= weekAgo) thisWeekReports++;
    });

    return {
      success:true,
      stats:{
        totalReports:arr.length,
        pendingReports:pending,
        investigatingReports:investigating,
        resolvedReports:resolved,
        resolvedPercentage:arr.length?Math.round(resolved/arr.length*100):0,
        activeReporters:uniqueUsers.size,
        thisWeekReports:thisWeekReports
      }
    };
  },

  // ---------- AI COMPLAINT GENERATION (GOOGLE GEMINI via Cloud Function) ----------
  // 100% FREE! 45,000 requests/month

 // Around line 230 in your config.js
  async generateComplaintLetter(reportData, photoBase64 = null) {
    try {
      // Calls the 'generateComplaint' function we deployed above
      const generateComplaint = firebase.functions().httpsCallable('generateComplaint');
      
      const result = await generateComplaint({ 
        reportData, 
        photoBase64 
      });

      return {
        success: true,
        complaintLetter: result.data.complaintLetter
      };

    } catch (error) {
      console.error("AI Generation Error:", error);
      
      let msg = "AI service unavailable.";
      if (error.code === 'unauthenticated') msg = "Please log in again.";
      if (error.code === 'resource-exhausted') msg = "AI is busy. Try in 1 minute.";

      return {
        success: false,
        error: msg,
        complaintLetter: null
      };
    }
  },

  async updateReportWithComplaint(reportId, complaintLetter) {
    try {
      await db.collection("reports").doc(reportId).update({
        aiComplaintLetter: complaintLetter,
        aiPending: false,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

};

// ===============================
// AUTH OBSERVER
// ===============================

auth.onAuthStateChanged(user=>{
  updateUIForAuthState(user);
});