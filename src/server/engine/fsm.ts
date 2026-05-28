import { SmcState } from '../../types.js';
import { addLog } from '../state.js';
import { saveStateToFirebase } from '../db.js';

export type FSMState = 
    | 'WAITING'
    | 'SWEEP_DETECTED'
    | 'BOS_CONFIRMED'
    | 'MITIGATION_WAIT'
    | 'ENTRY_READY'
    | 'ENTRY_TRIGGERED'
    | 'TRADE_ACTIVE'
    | 'PARTIAL_EXIT'
    | 'BREAKEVEN'
    | 'TRAILING'
    | 'INVALIDATED'
    | 'COOLDOWN';

// Strict Transition Map
const allowedTransitions: Record<FSMState, FSMState[]> = {
    'WAITING': ['SWEEP_DETECTED', 'COOLDOWN'],
    'SWEEP_DETECTED': ['BOS_CONFIRMED', 'INVALIDATED', 'WAITING'],
    'BOS_CONFIRMED': ['MITIGATION_WAIT', 'COOLDOWN', 'INVALIDATED', 'WAITING'],
    'MITIGATION_WAIT': ['ENTRY_READY', 'COOLDOWN', 'INVALIDATED', 'WAITING'],
    'ENTRY_READY': ['ENTRY_TRIGGERED', 'COOLDOWN', 'INVALIDATED', 'WAITING'],
    'ENTRY_TRIGGERED': ['TRADE_ACTIVE', 'COOLDOWN', 'WAITING'],
    'TRADE_ACTIVE': ['PARTIAL_EXIT', 'BREAKEVEN', 'TRAILING', 'COOLDOWN', 'WAITING'],
    'PARTIAL_EXIT': ['BREAKEVEN', 'TRAILING', 'COOLDOWN', 'WAITING'],
    'BREAKEVEN': ['TRAILING', 'COOLDOWN', 'WAITING'],
    'TRAILING': ['COOLDOWN', 'WAITING'],
    'INVALIDATED': ['WAITING'],
    'COOLDOWN': ['WAITING']
};

export function transitionState(currentState: SmcState, newState: FSMState, reason?: string): boolean {
    const currentStep = currentState.step as FSMState;
    
    if (currentStep === newState) return true; // No-op

    const allowed = allowedTransitions[currentStep] || [];
    if (!allowed.includes(newState)) {
        addLog(`Illegal State Transition Blocked: ${currentStep} -> ${newState}`, 'error');
        return false;
    }

    currentState.step = newState;

    if (reason) {
        addLog(`State Transition: ${currentStep} -> ${newState} (${reason})`, 'info');
    }

    // Attempt persistent state save to keep it crash-safe
    saveStateToFirebase(currentState).catch(e => {});

    return true;
}
