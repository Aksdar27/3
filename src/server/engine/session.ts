import { addLog } from '../state.js';

export function isSessionValid(): boolean {
    const checkDate = new Date();
    // Use WITA specifically (UTC+8)
    const witaOffsetMs = 8 * 60 * 60 * 1000;
    const utcTime = checkDate.getTime() + (checkDate.getTimezoneOffset() * 60000);
    const witaTime = new Date(utcTime + witaOffsetMs);
    
    const h = witaTime.getHours();
    
    // London starts at 15:00 WITA, New York opens 20:00 WITA
    // Asian overlap and chop is usually 05:00 to 14:00 WITA
    const isLondonSession = h >= 14 && h < 19;
    const isNYSession = h >= 19 && h <= 23;
    const isLateNY = h >= 0 && h < 4;
    
    if (isLondonSession || isNYSession || isLateNY) {
        return true;
    }
    
    return false;
}
