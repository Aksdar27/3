import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp, doc, updateDoc, getDocs, query, orderBy, limit, setDoc } from 'firebase/firestore';
import { sendTelegramAlert } from './telegram.js';
import { globalState, addLog } from './state.js';
import { Signal } from '../types.js';

const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
};

export let db: any = null;
let isFirebaseQuotaExceeded = false;
const ENGINE_START_TIME = Date.now();

export function initFirebase() {
    if (process.env.FIREBASE_PROJECT_ID) {
        try {
            const firebaseApp = initializeApp(firebaseConfig);
            db = getFirestore(firebaseApp);
            console.log("Firebase initialized successfully");
        } catch (e) {
            console.error("Firebase init error:", e);
        }
    }
}

export function addFirebaseLog(message: string, level: string, timestamp: number) {
    if (db && !isFirebaseQuotaExceeded) {
        addDoc(collection(db, "logs"), {
            timestamp,
            timestampStr: new Date(timestamp).toISOString(),
            message,
            level,
            createdAt: serverTimestamp()
        }).catch(e => {
            console.error("Firebase log error:", e);
            const msg = (e.message || '').toLowerCase();
            if (msg.includes('quota') || msg.includes('exceeded') || e.code === 'resource-exhausted') {
                sendTelegramAlert(`Firebase Quota Exceeded.\\nError: ${e.message}`);
                isFirebaseQuotaExceeded = true;
                db = null;
            }
        });
    }
}

export function startFirebaseHeartbeat() {
    setInterval(async () => {
        if (!db || isFirebaseQuotaExceeded) return;
        
        try {
            const uptime_seconds = Math.floor((Date.now() - ENGINE_START_TIME) / 1000);
            const market_feed = globalState.status === 'LIVE' || globalState.status === 'FALLBACK';
            const telegram = !!(globalState.settings.telegramBotToken && globalState.settings.telegramChatId);
            const ai_validation = !!(globalState.settings.geminiApiKey || process.env.GEMINI_API_KEY);
            const current_price = globalState.price || 0;
            const memory_usage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB';
            let latency_ms = globalState.lastTickTime ? Date.now() - globalState.lastTickTime : 0;
            
            let last_signal = 'NONE';
            if (globalState.signals.length > 0) {
                last_signal = `${globalState.signals[0].direction}@${globalState.signals[0].entry}`;
            }

            const heartbeatData = {
                engine: "RUNNING",
                firebase: true,
                market_feed,
                telegram,
                railway: true,
                ai_validation,
                last_tick: current_price,
                heartbeat: serverTimestamp(),
                uptime_seconds,
                websocket_status: globalState.status,
                last_signal,
                memory_usage,
                latency_ms
            };

            await setDoc(doc(db, "engine_state", "main"), heartbeatData);
            
            addDoc(collection(db, "logs"), {
                timestamp: Date.now(),
                timestampStr: new Date().toISOString(),
                message: "Firebase write success (Heartbeat)",
                level: "info",
                createdAt: serverTimestamp()
            }).catch(() => {});
        } catch (e: any) {
            console.error("Firebase heartbeat error:", e);
            const msg = (e.message || '').toLowerCase();
            if (msg.includes('quota') || msg.includes('exceeded') || e.code === 'resource-exhausted') {
                isFirebaseQuotaExceeded = true;
                db = null; 
                sendTelegramAlert(`Firebase Quota Exceeded.\\nDatabase writes disabled.\\nError: ${e.message}`);
            }
        }
    }, 5000);
}

export async function addFirebaseSignal(newSignal: Signal) {
    if (!db || isFirebaseQuotaExceeded) return;
    try {
        const docRef = await addDoc(collection(db, "signals"), {
            ...newSignal,
            createdAt: serverTimestamp()
        });
        newSignal.firebaseId = docRef.id;
    } catch (e: any) {
        console.error("Firebase create signal error:", e);
    }
}

export async function updateFirebaseSignal(id: string, updates: any) {
    if (!db || isFirebaseQuotaExceeded || !id) return;
    try {
        await updateDoc(doc(db, "signals", id), updates);
    } catch (e) {
        console.error("Firebase update signal error:", e);
    }
}

export async function saveStateToFirebase(smcState: any) {
    if (!db || isFirebaseQuotaExceeded) return;
    try {
        await setDoc(doc(db, "engine_state", "smc_fsm"), {
            ...smcState,
            updatedAt: serverTimestamp()
        });
    } catch(e) {
        console.error("Firebase save state error:", e);
    }
}

export async function restoreStateFromFirebase(): Promise<any | null> {
    if (!db) return null;
    try {
        const { getDoc } = await import('firebase/firestore');
        const docSnap = await getDoc(doc(db, "engine_state", "smc_fsm"));
        if (docSnap.exists()) {
            return docSnap.data();
        }
    } catch(e) {
        console.error("Firebase restore state error:", e);
    }
    return null;
}

export async function getFirebaseHistory(): Promise<Signal[]> {
    if (!db) {
        throw new Error('Database not connected');
    }
    const q = query(collection(db, "signals"), orderBy("createdAt", "desc"), limit(50));
    const querySnapshot = await getDocs(q);
    const signals: Signal[] = [];
    querySnapshot.forEach((doc) => {
        const data = doc.data();
        signals.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toMillis() || Date.now()
        } as any);
    });
    return signals;
}
