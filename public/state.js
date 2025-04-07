// state.js
// Simple state management for the application

import { validateAndSanitizeStateUpdate } from './manage/stateValidator.js';
import { handleError, ErrorTypes } from './manage/errorHandler.js';
import { DEFAULTS } from './config.js';

console.log('state.js loaded'); // Placeholder

/**
 * The central state object for the slideshow application.
 * Implements Slideshow Management User Story 2:
 * - Track slideshow source (selected images, playlists, tags, or all)
 * - Maintain slideshow state for different play modes
 */
const initialState = {
    slideshow: {
        images: [], // The full list of images fetched
        filteredImages: [], // The currently active list for display (after filtering/ordering)
        currentIndex: 0,
        transitionTime: parseFloat(localStorage.getItem('transitionTime')) || 3, // In seconds
        order: localStorage.getItem('slideshowOrder') || 'random', // 'random', 'alphabetical', 'groups'
        paused: false,
        intervalId: null, // Reference to the setInterval timer
        usedRandomIndices: new Set(), // Tracks used indices in random mode for current cycle
        source: 'all', // Tracks what triggered the current slideshow: 'selected', 'playlist', 'tags', or 'all'
        tagGroups: null,           // Map of tag names to arrays of image indices
        currentTagIndex: 0,        // Current tag being shown
        currentImageInTagIndex: 0, // Current image index within the current tag
        dom: { // Cached DOM elements for the slideshow
            slide1: null,
            slide2: null,
            title1: null,
            title2: null,
            subtitle1: null,
            subtitle2: null,
            container: null,
            leftNav: null,
            rightNav: null,
            currentImage: null,
            nextImage: null,
            overlay: null,
            controls: null,
            playPauseBtn: null,
            speedInput: null,
            orderSelect: null
        },
        // Settings
        showTextOverlay: DEFAULTS.SHOW_TEXT_OVERLAY, // From config

        // Runtime State
        isPlaying: false,
        currentImageIndex: -1,
        activeList: [], // Holds the image objects currently in the slideshow
        sourceType: 'none', // 'all', 'tags', 'playlist', 'selection', 'direct', 'none'
        sourceDetails: null, // Stores the specific tags, playlistId, or image objects
        usedIndices: new Set(), // Tracks indices used in the current loop
        randomizedOrder: [], // Stores shuffled indices for random order
        currentImage: null, // Stores the object of the currently displayed image
        history: [], // Add history for random prev
    },
    // Add other application states here if needed (e.g., management page state)
    tags: [],
    playlists: [],
    management: {
        // State for the management page (sorting, filtering, pagination)
        allImages: [], // Original fetched list for management view
        displayedImages: [], // Images currently shown in the table
        selectedImageIds: new Set(),
        sortKey: 'title', // Default sort key
        sortDirection: 'asc', // Default sort direction
        currentPage: 1,
        currentLimit: 20,
        totalPages: 1,
        selectedFilterTags: [],
        selectedPlaylistId: null,
        // Add other management states
        currentSearchTerm: '',
        totalPages: 1
    }
};

// Current state
let state = { ...initialState };

/**
 * Updates the state with validation and error handling
 */
export function updateState(section, update) {
    try {
        // Create a new state object with the update
        const newState = {
            ...state,
            [section]: {
                ...state[section],
                ...update
            }
        };

        // Validate and sanitize the update
        const validatedUpdate = validateAndSanitizeStateUpdate(state, newState);

        // Update the state
        state = validatedUpdate;

        // Log state change for debugging
        console.log(`[State] Updated ${section}:`, update);

        return state;
    } catch (error) {
        handleError(error, ErrorTypes.VALIDATION);
        return state; // Return current state on error
    }
}

/**
 * Gets the current state
 */
export function getState() {
    return { ...state }; // Return a copy to prevent direct mutation
}

/**
 * Resets the state to initial values
 */
export function resetState() {
    state = { ...initialState };
    console.log('[State] Reset to initial state');
}

/**
 * Gets a specific section of the state
 */
export function getStateSection(section) {
    return { ...state[section] }; // Return a copy to prevent direct mutation
}

// Export the state object (updateState is exported via `export function`)
export { state };