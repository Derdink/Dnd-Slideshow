// public/manage/utils.js
// Utility functions shared across management page modules

import { state } from '../state.js'; // May need state for some utils later

// --- Constants (copied from manage.js, consider centralizing later if needed elsewhere) ---
const BACKGROUND_COLORS = [
    "#e0e0e0", "#dde1e6", "#e5e0df", "#ffd7d9", "#ffd6e8", "#e8daff",
    "#d0e2ff", "#bae6ff", "#9ef0f0", "#a7f0ba", "#FFD8BD", "#ffeeb1", "#D5FFBD"
];
const CONTENT_COLORS = [
    "#161616", "#121619", "#171414", "#a2191f", "#9f1853", "#6929c4",
    "#0043ce", "#00539a", "#005d5d", "#0e6027", "#d91313", "#f97d3f", "#265C34"
];

/**
 * Gets content color based on background color.
 */
export function getContentColorForBackground(bgColor) {
    const index = BACKGROUND_COLORS.findIndex(col => col.toLowerCase() === bgColor?.toLowerCase());
    return index !== -1 ? CONTENT_COLORS[index] : "#161616"; // Default to dark text
}

/**
 * Formats a timestamp for display.
 */
export function formatDateAdded(timestamp) {
    if (!timestamp) return '-';
    const now = Date.now();
    const diff = now - Number(timestamp);
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (hours < 24) {
        return `${hours} ${hours === 1 ? 'Hr' : 'Hrs'} ago`;
    } else if (days < 3) {
        return `${days} ${days === 1 ? 'Day' : 'Days'} ago`;
    } else {
        const date = new Date(Number(timestamp));
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear().toString().slice(-2);
        return `${day}/${month}/${year}`;
    }
} 