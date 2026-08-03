const TRACE_PATTERNS = [
    /\bat\s+[\w$.<>]+\s*\(/i,
    /\.(js|ts|jsx|tsx):\d+:\d+/i,
    /\bnode_modules\b/i,
    /^\s*(Type|Reference|Syntax|Range|Eval)Error\b/i,
    /\bstack\s*[:=]/i,
    /\bcannot read propert(y|ies)\b/i,
    /\bundefined is not an object\b/i,
    /\bunhandled (promise )?rejection\b/i,
    /0x[a-fA-F0-9]{20,}/,
    /[{[][\s\S]*"(code|reason|method|transaction|stack)"[\s\S]*[}\]]/i,
    /\bnetwork error\b.*\bcode\b/i,
    /\btimeout of \d+ms exceeded\b/i,
];

const MAX_SAFE_LENGTH = 160;

const looksTechnical = (msg) => {
    if (typeof msg !== 'string' || msg.trim().length === 0) return true;
    if (msg.length > MAX_SAFE_LENGTH) return true;
    return TRACE_PATTERNS.some((pattern) => pattern.test(msg));
};

export const getSafeErrorMessage = (
    rawError,
    fallback = 'Something went wrong. Please try again.'
) => {
    try {
        if (rawError) {
            console.error('[SafeError]', rawError);
        }

        if (rawError instanceof Error) {
            return fallback;
        }

        let candidate = null;
        if (typeof rawError === 'string') {
            candidate = rawError;
        } else if (rawError && typeof rawError.message === 'string') {
            candidate = rawError.message;
        }

        if (candidate && !looksTechnical(candidate)) {
            return candidate;
        }
        return fallback;
    } catch (e) {
        return fallback;
    }
};

export default getSafeErrorMessage;