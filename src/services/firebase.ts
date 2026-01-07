import { initializeApp, getApps, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

// Master Config (Hardcoded for Puri Yatra)
export const MASTER_CONFIG: FirebaseOptions = {
    apiKey: "AIzaSyAv9AJA_4AZkOTCCZuBtraZntNW3xVspuA",
    authDomain: "puri-yatra-one-page-site.firebaseapp.com",
    projectId: "puri-yatra-one-page-site",
    storageBucket: "puri-yatra-one-page-site.firebasestorage.app",
    messagingSenderId: "489940391211",
    appId: "1:489940391211:web:a30966971f77626feba16e"
};

// Singleton for Master App
let masterApp: FirebaseApp;
let masterDb: Firestore;

export const getMasterApp = () => {
    if (!masterApp) {
        masterApp = initializeApp(MASTER_CONFIG, "[MASTER]");
        masterDb = getFirestore(masterApp);
    }
    return { app: masterApp, db: masterDb };
};

// Dynamic App Cache
const appCache: Record<string, { app: FirebaseApp; db: Firestore }> = {};

export const getDynamicApp = (name: string, config: FirebaseOptions) => {
    if (appCache[name]) {
        return appCache[name];
    }

    // Check if already initialized in Firebase runtime
    const existingApp = getApps().find(app => app.name === name);
    let app: FirebaseApp;

    if (existingApp) {
        app = existingApp;
    } else {
        app = initializeApp(config, name);
    }

    const db = getFirestore(app);
    appCache[name] = { app, db };
    return { app, db };
};
