// Optional cross-device sync for KanjiPrefs via Firebase Auth (Google) +
// Firestore. If firebase-config.js hasn't been filled in yet, or the
// Firebase CDN scripts failed to load (e.g. offline), this quietly disables
// itself -- the site is fully functional without it, just local-only.
(function(){
  "use strict";

  var signInBtn = document.getElementById("signInBtn");
  var signOutBtn = document.getElementById("signOutBtn");
  var signedInAs = document.getElementById("signedInAs");

  var notConfigured = typeof firebase === "undefined" ||
    typeof firebaseConfig === "undefined" ||
    firebaseConfig.apiKey === "PASTE_API_KEY_HERE";

  if(notConfigured){
    console.warn("Firebase not configured -- kanji preferences will stay local to this browser only. See firebase-config.js.");
    if(signInBtn){
      signInBtn.disabled = true;
      signInBtn.textContent = "Sync unavailable";
      signInBtn.title = "Firebase isn't configured yet -- see firebase-config.js";
    }
    return;
  }

  firebase.initializeApp(firebaseConfig);
  var auth = firebase.auth();
  var db = firebase.firestore();
  var currentUid = null;
  var saveTimer = null;

  function docRef(uid){
    return db.collection("users").doc(uid);
  }

  function scheduleSave(){
    if(!currentUid) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function(){
      docRef(currentUid).set({
        prefs: KanjiPrefs.getRaw(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }, 800);
  }

  KanjiPrefs.onChange(function(reason){
    if(reason === "set") scheduleSave();
  });

  auth.onAuthStateChanged(function(user){
    if(user){
      currentUid = user.uid;
      signInBtn.hidden = true;
      signOutBtn.hidden = false;
      signedInAs.hidden = false;
      signedInAs.textContent = "Signed in as " + (user.displayName || user.email);
      docRef(user.uid).get().then(function(snap){
        if(snap.exists && snap.data().prefs){
          KanjiPrefs.replaceAll(snap.data().prefs);
        } else {
          scheduleSave();
        }
      });
    } else {
      currentUid = null;
      signInBtn.hidden = false;
      signOutBtn.hidden = true;
      signedInAs.hidden = true;
    }
  });

  signInBtn.addEventListener("click", function(){
    auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(function(err){
      alert("Sign-in failed: " + err.message);
    });
  });
  signOutBtn.addEventListener("click", function(){
    auth.signOut();
  });
})();
