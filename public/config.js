// Color schemes
export const BACKGROUND_COLORS = [
    "#e0e0e0", "#dde1e6", "#e5e0df", "#ffd7d9", "#ffd6e8", "#e8daff",
    "#d0e2ff", "#bae6ff", "#9ef0f0", "#a7f0ba", "#FFD8BD", "#ffeeb1", "#D5FFBD"
];

export const CONTENT_COLORS = [
    "#161616", "#121619", "#171414", "#a2191f", "#9f1853", "#6929c4",
    "#0043ce", "#00539a", "#005d5d", "#0e6027", "#d91313", "#f97d3f", "#265C34"
];

// Protected tag names
export const PROTECTED_TAGS = {
    HIDDEN: 'Hidden',
    ALL: 'All'
};

// Local storage keys
export const STORAGE_KEYS = {
    TRANSITION_TIME: 'transitionTime',
    SLIDESHOW_ORDER: 'slideshowOrder',
    NEXT_TAG_COLOR: 'nextTagColorIndex'
};

// Default values
export const DEFAULTS = {
    TRANSITION_TIME: 3,
    SLIDESHOW_ORDER: 'random',
    TAG_COLOR: '#FF4081',
    ITEMS_PER_PAGE: 20,
    MAX_FILE_SIZE: 50 * 1024 * 1024 // 50MB
};

// API endpoints
export const API_ENDPOINTS = {
    IMAGES: '/api/images',
    TAGS: '/api/tags',
    PLAYLISTS: '/api/playlists',
    SLIDESHOW: '/api/slideshow'
};

// Special tag names
export const HIDDEN_TAG_NAME = 'Hidden';

// UI constants
export const UI = {
    DEBOUNCE_DELAY: 300,
    SAVE_MESSAGE_DURATION: 2000,
    FADE_DURATION: 500
}; 