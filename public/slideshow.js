/**
 * Slideshow.js
 * Implements core slideshow functionality based on user stories:
 * - Slideshow User Story 1: View slideshow of images with titles and descriptions
 * - Slideshow User Story 2: Navigate through slideshow with next/previous buttons
 * - Slideshow User Story 3: Crossfade transitions between images
 */

import { state, updateState } from './state.js';
import './socket-client.js'; // Import socket-client.js to ensure it's loaded
import { fetchImages, updateSlideshowSettings } from './api.js';
import { DEFAULTS, STORAGE_KEYS, HIDDEN_TAG_NAME } from './config.js';
// NOTE: api.js might not be directly needed if all data comes via sockets, but keep for potential future use.
// import * as api from './api.js';

// Access the socket from the global window object
const socket = window.socket;

// --- Constants & Configuration ---
const DEFAULT_SLIDESHOW_SPEED = 3000; // Default speed in milliseconds
const DEFAULT_SLIDESHOW_ORDER = 'random';

// --- DOM Element Cache --- (Populated in initSlideshow)
const dom = {};

// --- Slideshow State Variables (Managed within this module) ---
let currentImageIndex = 0;
let intervalId = null;
let activeSlideIndex = 1; // Tracks which img tag (1 or 2) is currently visible

// --- Helper Functions ---

/**
 * Preloads an image URL for smooth transitions
 * Used in Slideshow User Story 3 for crossfade transitions
 */
function preloadImage(url) {
    const img = new Image();
    img.src = url;
}

/**
 * Updates the text content of the title and subtitle overlays with a crossfade effect.
 * @param {string} title - The main title text.
 * @param {string} [subtitle=''] - The subtitle text (optional).
 */
function updateTitleOverlay(title, subtitle = '') {
    // Ensure DOM elements are cached
    if (!dom.titleOverlay1 || !dom.titleOverlay2 || !dom.subtitleOverlay1 || !dom.subtitleOverlay2) {
        console.warn('[Slideshow] Title/Subtitle overlay elements not cached.');
        return;
    }

    // Determine which set of overlays is currently active
    const isSet1Active = dom.titleOverlay1.classList.contains('active');

    // Identify the next (currently inactive) and current (currently active) overlays
    const nextTitleOverlay = isSet1Active ? dom.titleOverlay2 : dom.titleOverlay1;
    const currentTitleOverlay = isSet1Active ? dom.titleOverlay1 : dom.titleOverlay2;
    const nextSubtitleOverlay = isSet1Active ? dom.subtitleOverlay2 : dom.subtitleOverlay1;
    const currentSubtitleOverlay = isSet1Active ? dom.subtitleOverlay1 : dom.subtitleOverlay2;

    // Update the text content of the *next* overlays
    nextTitleOverlay.textContent = title;
    nextSubtitleOverlay.textContent = subtitle;

    // Toggle the active class to start the crossfade
    currentTitleOverlay.classList.remove('active');
    currentSubtitleOverlay.classList.remove('active');
    nextTitleOverlay.classList.add('active');
    nextSubtitleOverlay.classList.add('active');

    // Debugging log
    // console.log(`[Slideshow] Updated title: "${title}", subtitle: "${subtitle}". Activated set ${isSet1Active ? 2 : 1}`);
}

/**
 * Sets static text overlay without animation
 * Used by Slideshow User Story 1 for initial display
 */
function setTextOverlayStatic(title, subtitle = '') {
    if (!dom.titleOverlay1 || !dom.titleOverlay2 || !dom.subtitleOverlay1 || !dom.subtitleOverlay2) return;

    const activeTitleOverlay = activeSlideIndex === 1 ? dom.titleOverlay1 : dom.titleOverlay2;
    const inactiveTitleOverlay = activeSlideIndex === 1 ? dom.titleOverlay2 : dom.titleOverlay1;
    const activeSubtitleOverlay = activeSlideIndex === 1 ? dom.subtitleOverlay1 : dom.subtitleOverlay2;
    const inactiveSubtitleOverlay = activeSlideIndex === 1 ? dom.subtitleOverlay2 : dom.subtitleOverlay1;

    // Set text only on the currently active one
    activeTitleOverlay.textContent = title || '';
    activeSubtitleOverlay.textContent = subtitle || '';

    // Ensure only the active one has the class and inactive doesn't
    activeTitleOverlay.classList.add('active');
    activeSubtitleOverlay.classList.add('active');
    inactiveTitleOverlay.classList.remove('active');
    inactiveSubtitleOverlay.classList.remove('active');
    inactiveTitleOverlay.textContent = ''; // Clear inactive text
    inactiveSubtitleOverlay.textContent = ''; // Clear inactive text
}

/**
 * Performs crossfade transition to new image
 * Implements Slideshow User Story 3:
 * - Crossfade transition between images
 * - Ease-out timing function
 */
function crossfadeTo(imageUrl, title, description = '') {
    console.log(`[crossfadeTo] Called with: URL=${imageUrl}, title=${title}`);
    if (!dom.slide1 || !dom.slide2 || !imageUrl) {
        console.warn('[crossfadeTo] Missing elements or imageUrl. Aborting.');
        setTextOverlayStatic(title, description); // Still update text even if fade fails
        return;
    }

    const activeSlide = dom.slide1.classList.contains('active') ? dom.slide1 : dom.slide2;
    const inactiveSlide = activeSlide === dom.slide1 ? dom.slide2 : dom.slide1;
    console.log(`[crossfadeTo] Active slide: ${activeSlide.id}, Inactive slide: ${inactiveSlide.id}`);

    // Update title overlay immediately before image loads
    updateTitleOverlay(title, description);

    // Set the source for the inactive slide and wait for it to load
    console.log(`[crossfadeTo] Setting image src=${imageUrl} on inactive slide: ${inactiveSlide.id}`);
    inactiveSlide.src = imageUrl;

    inactiveSlide.onload = () => {
        console.log(`[crossfadeTo] Image loaded on ${inactiveSlide.id}`);
        // Ensure smooth transition even if load is very fast
        requestAnimationFrame(() => {
             requestAnimationFrame(() => { // Double RAF for potentially better browser rendering sync
                console.log(`[crossfadeTo] Toggling active class. Removing from ${activeSlide.id}, adding to ${inactiveSlide.id}`);
    activeSlide.classList.remove('active');
                inactiveSlide.classList.add('active');
                // Ensure title overlay matches active slide
    updateTitleOverlay(title, description);
                 console.log(`[crossfadeTo] Active classes toggled. New active: ${inactiveSlide.id}`);
            });
        });
        inactiveSlide.onload = null; // Prevent potential multiple triggers
    };

    inactiveSlide.onerror = () => {
        console.error(`[crossfadeTo] Failed to load image: ${imageUrl} on ${inactiveSlide.id}`);
        inactiveSlide.onload = null; // Clear onload handler on error too
        inactiveSlide.onerror = null; 
        // Optionally display an error image or message
         inactiveSlide.src = 'icons/error_file.svg'; // Show error placeholder
         // Still attempt to transition to show the error placeholder
         requestAnimationFrame(() => {
             requestAnimationFrame(() => {
                 activeSlide.classList.remove('active');
                 inactiveSlide.classList.add('active');
                  updateTitleOverlay("Error Loading Image", ""); // Update text
             });
         });
    };
}

/**
 * Determines the index of the next image to show based on the current order.
 */
function getNextImageIndex() {
    const { order, currentImageIndex, activeList, randomizedOrder, usedIndices } = state.slideshow;
    const listLength = activeList?.length || 0;
    if (listLength === 0) return -1; // No images

    console.log(`[getNextImageIndex] ENTRY - Order: ${order}, CurrentIndex: ${currentImageIndex}, ListLength: ${listLength}, UsedIndicesSize: ${usedIndices?.size}`);

    let nextIndex = -1;
    
    switch (order) {
        case 'sequential':
            nextIndex = (currentImageIndex + 1) % listLength;
            break;
        case 'random':
            const randomOrderLength = randomizedOrder?.length || 0;
            if (randomOrderLength !== listLength) {
                console.warn('[getNextImageIndex] Random order length mismatch! Regenerating.');
                generateRandomOrder(); // Regenerate order
                // *** FIX: Immediately return the first index of the NEW order ***
                usedIndices.clear(); // Clear used indices
                updateState('slideshow', { history: [] }); // Clear history
                const newRandomOrder = state.slideshow.randomizedOrder; // Get the newly generated order from state
                nextIndex = newRandomOrder.length > 0 ? newRandomOrder[0] : 0; // Get the first index
                if (nextIndex !== -1) {
                    usedIndices.add(nextIndex); // Add the first index to used
                    console.log(`[getNextImageIndex] Regenerated order. Returning first new index: ${nextIndex}`);
                    return nextIndex; // Return immediately
                }
                // *** END FIX ***
            }
            if (usedIndices.size >= listLength) {
                console.log('[getNextImageIndex] Random cycle complete, clearing used indices.');
                usedIndices.clear();
                // Clear history when cycle restarts
                updateState('slideshow', { history: [] }); 
            }

            // Find the next available index in the randomized order
            let foundIndex = -1;
            for (let i = 0; i < randomizedOrder.length; i++) {
                const potentialIndex = randomizedOrder[i];
                if (!usedIndices.has(potentialIndex)) {
                    foundIndex = potentialIndex;
                    break;
                }
            }

            if (foundIndex !== -1) {
                usedIndices.add(foundIndex);
                nextIndex = foundIndex;
            } else {
                // Should not happen if usedIndices was cleared correctly, but as a fallback:
                console.warn('[getNextImageIndex] Random fallback: Could not find unused index, restarting cycle.');
                usedIndices.clear();
                nextIndex = randomizedOrder.length > 0 ? randomizedOrder[0] : 0;
                if(nextIndex !== -1) usedIndices.add(nextIndex);
            }
            break;
        default: // Includes 'alphabetical' and any other case
            nextIndex = (currentImageIndex + 1) % listLength;
            break;
    }
    console.log(`[getNextImageIndex] EXIT - Calculated nextIndex: ${nextIndex}`);
    return nextIndex;
}

/**
 * Determines the index of the previous image to show based on the current order.
 */
function getPrevImageIndex() {
    const { order, currentImageIndex, activeList, randomizedOrder, usedIndices, history } = state.slideshow;
    const listLength = activeList?.length || 0;
    if (listLength === 0) return -1; // No images

    console.log(`[getPrevImageIndex] ENTRY - Order: ${order}, CurrentIndex: ${currentImageIndex}, ListLength: ${listLength}, HistoryLength: ${history?.length}`);

    let prevIndex = -1;

    switch (order) {
        case 'sequential':
        case 'alphabetical': // Treat alphabetical same as sequential for prev
            prevIndex = (currentImageIndex - 1 + listLength) % listLength;
            break;
        case 'random':
            // Use history for random previous
            if (history && history.length > 0) {
                // Remove current index from end of history (it was added when it was displayed)
                if (history[history.length - 1] === currentImageIndex) {
                    history.pop();
                }
                // Get the previous index from history
                if(history.length > 0){
                    prevIndex = history.pop(); // Pop the actual previous index
                    console.log(`[getPrevImageIndex] Random Previous: Popped index ${prevIndex} from history.`);
                    // Update state immediately (or let showPreviousImage handle it?)
                     updateState('slideshow', { history: [...history] });
                } else {
                    console.warn('[getPrevImageIndex] Random Previous: History is empty after popping current index. Falling back.');
                     // Fallback: sequential previous if history becomes empty
                     prevIndex = (currentImageIndex - 1 + listLength) % listLength;
                }
            } else {
                console.warn('[getPrevImageIndex] Random Previous: History is empty or invalid. Falling back.');
                // Fallback: sequential previous if no history
                prevIndex = (currentImageIndex - 1 + listLength) % listLength;
            }
            break;
        default:
            prevIndex = (currentImageIndex - 1 + listLength) % listLength;
            break;
    }
    console.log(`[getPrevImageIndex] EXIT - Calculated prevIndex: ${prevIndex}`);
    return prevIndex;
}

/**
 * Preloads the next image in sequence for smoother transitions
 * Used by Slideshow User Story 3 - crossfade transitions
 */
function preloadNextImage() {
    const images = state.slideshow.images;
    if (!images || images.length <= 1) return; // No need to preload if there's only one image
    
    // Find next index based on order mode
    const order = state.slideshow.order || DEFAULT_SLIDESHOW_ORDER;
    let nextIndex;
    
    if (order === 'random') {
        // For random, just pick a random one that isn't the current
        // We don't use getNextImageIndex() here because we don't want to update usedRandomIndices
        let candidateIndex;
        do {
            candidateIndex = Math.floor(Math.random() * images.length);
        } while (candidateIndex === currentImageIndex && images.length > 1);
        nextIndex = candidateIndex;
    } else {
        // For sequential, just get the next one with wraparound
        nextIndex = (currentImageIndex + 1) % images.length;
    }
    
    // Preload the image
    if (nextIndex >= 0 && nextIndex < images.length) {
        const nextImage = images[nextIndex];
        if (nextImage && nextImage.url) {
            preloadImage(nextImage.url);
        }
    }
}

/**
 * Shows the next image in the sequence based on the current index and order.
 */
function showNextImage() {
    console.log(`[Slideshow showNextImage] ENTRY - Active list length: ${state.slideshow.activeList?.length || 0}`);
    if (!state.slideshow.activeList || state.slideshow.activeList.length === 0) {
        console.log('[Slideshow showNextImage] Conditions not met (no images), stopping.');
        return;
    }
    
    const nextIndex = getNextImageIndex();
    console.log(`[Slideshow showNextImage] Index received from getNextImageIndex: ${nextIndex}`);

    // *** ADDED DETAILED LOGGING ***
    const currentImage = state.slideshow.currentImage;
    const activeList = state.slideshow.activeList;
    const image = activeList ? activeList[nextIndex] : null;

    console.log(`[Slideshow showNextImage] Attempting to show index: ${nextIndex}`);
    console.log(`[Slideshow showNextImage] Image data at index ${nextIndex}:`, JSON.stringify(image, null, 2));
    // *** END ADDED LOGGING ***

    if (!image || typeof image.url !== 'string' || !image.url) {
        console.error(`[Slideshow showNextImage] Invalid image data at index ${nextIndex}. Stopping. Data:`, image);
        stopSlideshowInterval();
        return;
    }

    if (nextIndex !== -1 && nextIndex < state.slideshow.activeList.length) {
        const nextImage = state.slideshow.activeList[nextIndex];
        console.log(`[Slideshow showNextImage] Next image object found:`, nextImage);
        if (nextImage && nextImage.url) {
            crossfadeTo(nextImage.url, nextImage.title, nextImage.description);
            console.log(`[Slideshow showNextImage] currentImageIndex BEFORE state update: ${state.slideshow.currentImageIndex}`);
            // --- Add current index to history BEFORE updating index state ---            
            const history = state.slideshow.history || [];
            if (state.slideshow.currentImageIndex !== -1) { // Don't add initial -1 index
                history.push(state.slideshow.currentImageIndex);
                console.log(`[showNextImage] Pushed ${state.slideshow.currentImageIndex} to history. New length: ${history.length}`);
            }            
            // ---------------------------------------------------------------
            // Keep playing state true, just reset the timer
            updateState('slideshow', { 
                currentImageIndex: nextIndex, 
                currentImage: nextImage,
                history: [...history] // Update history state
            }); // REMOVED: isPlaying: false 
            console.log(`[Slideshow showNextImage] currentImageIndex AFTER state update attempt (reading state): ${state.slideshow.currentImageIndex}`);
            resetSlideshowInterval(state.slideshow.activeList?.length || 0); // Reset interval FROM this new image
            updatePlayPauseButtonUI(); // Update button UI
            preloadNextImage(); // Preload the one after this
        } else {
            console.warn(`[Slideshow showNextImage] Invalid image data at index ${nextIndex}. Stopping.`);
            stopSlideshowInterval();
        }
    } else {
        console.warn(`[Slideshow showNextImage] Invalid next index (${nextIndex}) received. Stopping.`);
        stopSlideshowInterval();
    }
}

/**
 * Shows the previous image in the sequence.
 */
function showPreviousImage() {
    console.log(`[Slideshow showPreviousImage] ENTRY - Active list length: ${state.slideshow.activeList?.length || 0}`);
     if (!state.slideshow.activeList || state.slideshow.activeList.length === 0) {
        console.log('[Slideshow showPreviousImage] No images, cannot go previous.');
        return;
    }
    // No need to check isPlaying for manual navigation

    const prevIndex = getPrevImageIndex();
    console.log(`[Slideshow showPreviousImage] Index received from getPrevImageIndex: ${prevIndex}`);

    if (prevIndex !== -1 && prevIndex < state.slideshow.activeList.length) {
        const prevImage = state.slideshow.activeList[prevIndex];
         console.log(`[Slideshow showPreviousImage] Previous image object found:`, prevImage);
        if (prevImage && prevImage.url) {
            stopSlideshowInterval(); // Stop auto-advance on manual navigation
            crossfadeTo(prevImage.url, prevImage.title, prevImage.description);
            console.log(`[Slideshow showPreviousImage] currentImageIndex BEFORE state update: ${state.slideshow.currentImageIndex}`);
            // Keep playing state true, just reset the timer
            updateState('slideshow', { currentImageIndex: prevIndex, currentImage: prevImage }); // REMOVED: isPlaying: false 
             console.log(`[Slideshow showPreviousImage] currentImageIndex AFTER state update attempt (reading state): ${state.slideshow.currentImageIndex}`);
             resetSlideshowInterval(state.slideshow.activeList?.length || 0); // Reset interval FROM this new image
             updatePlayPauseButtonUI(); // Update button to show 'play' potentially
            preloadNextImage(); // Preload based on the new current index
        } else {
            console.warn(`[Slideshow showPreviousImage] Invalid image data at index ${prevIndex}.`);
        }
    } else {
         console.warn(`[Slideshow showPreviousImage] Invalid previous index (${prevIndex}) received.`);
    }
}

/**
 * Reset the slideshow interval for automatic playback
 * If an interval already exists, it will be stopped and then restarted
 * Implements Slideshow User Story 1 - automatic playback
 */
function resetSlideshowInterval(imageCount) {
    stopSlideshowInterval(); // Clear existing interval first
    const speed = (state.slideshow.transitionTime ?? 3) * 1000; // Default 3 seconds
    // const imageCount = state.slideshow.activeList?.length || 0; // REMOVED: Read from param

    console.log(`[Interval] Attempting to start interval. Image count: ${imageCount}, transitionTime (s): ${speed / 1000}, speed (ms): ${speed}`);
    
    // Only start interval if there are multiple images and speed > 0
    if (imageCount > 1 && speed > 0) {
        intervalId = setInterval(showNextImage, speed);
        console.log(`[Interval] Started new interval with ID: ${intervalId}, Speed: ${speed}ms`);
    } else {
        console.log('[Interval] Not starting interval: ' + 
            (imageCount <= 1 ? 'Not enough images. ' : '') +
            (speed <= 0 ? 'Speed is zero or negative. ' : ''));
    }
}

/**
 * Stops the slideshow interval if one is running
 */
function stopSlideshowInterval() {
    if (intervalId !== null) {
        console.log('Stopping slideshow interval');
        clearInterval(intervalId);
        intervalId = null;
    }
}

/**
 * Handles play image event from socket
 * Used by Image Management User Story 7 for playing specific images
 */
function handlePlayImage(data) {
    console.log('Received playImage event:', data);
    stopSlideshowInterval(); // Stop automatic playback when a specific image is requested
    // Find the index of the image to play, if it exists in the current list
    const index = state.slideshow.images.findIndex(img => img.url === data.imageUrl);
    if (index !== -1) {
        currentImageIndex = index;
        crossfadeTo(data.imageUrl, data.title, data.description);
    } else {
        // If image not in current list, just display it once without changing index
        console.log(`Image ${data.title} not in current slideshow list, displaying it directly.`);
         crossfadeTo(data.imageUrl, data.title, data.description);
        // Don't update currentImageIndex as it's not part of the sequence
    }
}

/**
 * Handle play selection events
 * This could be playing selected images, playlists, or tags
 * Implements Slideshow Management User Story 1:
 * - Play selected images
 * - Play all images from a playlist
 * - Play images with selected tags
 */
function handlePlaySelect(data) {
    console.log('[Slideshow] Received playSelect request:', data);
    
    if (data && data.images && data.images.length > 0) {
        // Update state with received settings
    updateState('slideshow', {
            transitionTime: data.speed ?? state.slideshow.transitionTime ?? DEFAULTS.TRANSITION_TIME,
            order: data.order ?? state.slideshow.order ?? DEFAULTS.SLIDESHOW_ORDER, // Also update order if provided
            // Store source info for reference/debugging, but don't use it to fetch again here
            sourceType: data.sourceType || 'selection',
            sourceDetails: data.sourceDetails || null 
        });
        console.log(`[Slideshow handlePlaySelect] About to call startSlideshowWithImages with ${data.images.length} images.`);
        // *** MODIFICATION: Call startSlideshowWithImages directly with the received image data ***
        startSlideshowWithImages(data.images); 
                } else {
        console.warn('[Slideshow] playSelect called with invalid image data.');
    }
}

/**
 * Starts or restarts the slideshow with a new set of images
 * Used by handlePlaySelect and other controls
 * Implements Slideshow User Story 1
 */
function startSlideshowWithImages(images) {
    console.log('Starting slideshow with images:', images.length);
    
    // First stop any existing slideshow
    stopSlideshowInterval();
    
    if (!images || images.length === 0) {
        console.warn("startSlideshowWithImages: No images provided");
        updateState('slideshow', { activeList: [], currentImageIndex: -1, isPlaying: false, currentImage: null });
        crossfadeTo('', 'No images available');
        return;
    }
    
    // *** MODIFICATION: Store the received image list in the state ***
    updateState('slideshow', { activeList: images, isPlaying: true });
    
    console.log('First image object:', images[0]); // Debug first image object
    
    // Display the first image immediately
    console.log(`[startSlideshowWithImages] Calling getNextImageIndex. Current state index: ${state.slideshow.currentImageIndex}`); // LOG BEFORE CALL
    const firstImageIndex = getNextImageIndex(); // Get index respecting order logic
    console.log(`[startSlideshowWithImages] getNextImageIndex returned: ${firstImageIndex}`); // LOG AFTER CALL
    const firstImage = images[firstImageIndex];
    updateState('slideshow', { currentImageIndex: firstImageIndex, currentImage: firstImage }); // Update state
    
    // Verify image has a URL property
    if (firstImage && firstImage.url) {
        console.log('Displaying first image with URL:', firstImage.url);
        crossfadeTo(firstImage.url, firstImage.title || '', firstImage.description || '');
        
        // Start the interval to display the rest of the images if there are more than one
        if (images.length > 1 && state.slideshow.speed > 0) {
            resetSlideshowInterval(images.length);
        }
    } else {
        console.warn("First image is missing URL. Full image object:", firstImage);
        crossfadeTo('', 'Error loading images');
    }
}

/**
 * Handles settings update events
 * Implements Slideshow Management User Story 1:
 * - Update transition time
 * - Update sequence order
 * - Reset random indices tracking on order change
 */
function handleSettingsUpdate(data) {
    console.log('Slideshow handling settings update:', data);
    if (data.speed !== undefined) {
        state.slideshow.transitionTime = data.speed; // Update local state if needed
    }
    if (data.order !== undefined) {
        state.slideshow.order = data.order; // Update local state if needed
    }
    if (data.showTextOverlay !== undefined) {
        state.slideshow.showTextOverlay = data.showTextOverlay;
        // Toggle visibility class on the container
        if (dom.titleContainer) {
            dom.titleContainer.classList.toggle('text-overlay-hidden', !data.showTextOverlay);
            console.log('Toggled text-overlay-hidden class based on settings', !data.showTextOverlay);
        }
    }

    // If the slideshow is currently running with a list of images,
    // resetting the interval applies the new speed immediately.
    // If it's paused or showing a single image, the new speed/order will apply next time playSelect is called.
    if (intervalId !== null && currentImageIndex !== -1 && state.slideshow.images.length > 0) {
        resetSlideshowInterval(state.slideshow.activeList?.length || 0);
    }
}

/**
 * Handles slide navigation actions
 * Used by Slideshow Management User Story 2 for navigation controls
 * @param {object} data - Action data ({ action: 'next' | 'prev' | 'reset' | 'togglePause' }).
 */
function handleSlideAction(data) {
    console.log(`[handleSlideAction] Received action: ${data.action}`, data);
    switch (data.action) {
        case 'next':
            // Server might send the next image data, or just the command
            if (data.image) {
                // Option A: Server dictates the exact next image
                crossfadeTo(data.image.url, data.image.title, data.image.description);
                // Update state index if possible
                const nextIndex = state.slideshow.activeList.findIndex(img => img.id === data.image.id);
                 updateState('slideshow', { currentImageIndex: nextIndex, currentImage: data.image });
            } else {
                // Option B: Client calculates next image based on command
        showNextImage();
            }
            break;
        case 'prev':
             console.log('[handleSlideAction] Calling showPreviousImage()');
            // Similar logic as 'next' - server might send image or just command
            if (data.image) {
                crossfadeTo(data.image.url, data.image.title, data.image.description);
                const prevIndex = state.slideshow.activeList.findIndex(img => img.id === data.image.id);
                 updateState('slideshow', { currentImageIndex: prevIndex, currentImage: data.image });
            } else {
        showPreviousImage();
    }
            break;
        case 'pause':
            pauseSlideshow();
            break;
        case 'resume':
            resumeSlideshow(); // This now calls play()
            break;
        case 'togglePause': // Handle the toggle action
            if (state.slideshow.isPlaying) {
                pauseSlideshow();
            } else {
                 resumeSlideshow(); // This now calls play()
            }
            break;
        // Potentially handle 'reset' if needed
        default:
            console.warn(`Unhandled slide action: ${data.action}`);
    }
}

// --- Initialization ---

/**
 * Cache DOM elements needed for the slideshow
 * Returns true if all required elements are found, false otherwise
 */
function cacheDOMElements() {
    console.log('Caching DOM elements for slideshow...');
    
    // Container and slides are required
    dom.slideshowContainer = document.getElementById('slideshow-container');
    dom.slide1 = document.getElementById('slide1');
    dom.slide2 = document.getElementById('slide2');
    
    // Title overlays - required for displaying image titles
    dom.titleOverlay1 = document.getElementById('title-overlay1');
    dom.titleOverlay2 = document.getElementById('title-overlay2');
    dom.subtitleOverlay1 = document.getElementById('subtitle-overlay1');
    dom.subtitleOverlay2 = document.getElementById('subtitle-overlay2');
    
    // NEW: Get the main container for title/subtitle overlays
    dom.titleContainer = document.querySelector('.title-container');
    
    // Check if required elements exist
    const requiredElements = [
        dom.slideshowContainer,
        dom.slide1, 
        dom.slide2,
        dom.titleOverlay1,
        dom.titleOverlay2
    ];
    
    const allElementsFound = requiredElements.every(element => !!element);
    
    if (!allElementsFound) {
        console.error('Critical slideshow DOM elements are missing:');
        if (!dom.slideshowContainer) console.error(' - Missing #slideshow-container');
        if (!dom.slide1) console.error(' - Missing #slide1');
        if (!dom.slide2) console.error(' - Missing #slide2');
        if (!dom.titleOverlay1) console.error(' - Missing #title-overlay1');
        if (!dom.titleOverlay2) console.error(' - Missing #title-overlay2');
    } else {
        console.log('All required slideshow DOM elements found successfully.');
    }
    
    return allElementsFound;
}

/**
 * Attaches event listeners for slideshow controls
 * Implements Slideshow User Story 2:
 * - Click next/previous buttons
 * - Keyboard controls (arrow keys, space, etc)
 */
function attachEventListeners() {
    console.log('Attaching slideshow event listeners...');
    
    // Navigation button click handlers
    const leftHoverArea = document.querySelector('.hover-area.left');
    const rightHoverArea = document.querySelector('.hover-area.right');
    
    if (leftHoverArea) {
        leftHoverArea.addEventListener('click', () => {
            console.log('Left navigation button clicked');
            showPreviousImage();
        });
    } else {
        console.warn('Left navigation area not found');
    }
    
    if (rightHoverArea) {
        rightHoverArea.addEventListener('click', () => {
            console.log('Right navigation button clicked');
            showNextImage();
        });
    } else {
        console.warn('Right navigation area not found');
    }
    
    // Touch/swipe support if available
    if (dom.slideshowContainer) {
        let touchStartX = 0;
        let touchEndX = 0;
        let touchStartY = 0;
        let touchEndY = 0;
        
        dom.slideshowContainer.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        });
        
        dom.slideshowContainer.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            touchEndY = e.changedTouches[0].screenY;
            
            const deltaX = touchStartX - touchEndX;
            const deltaY = touchStartY - touchEndY;
            
            // If the swipe is more horizontal than vertical and long enough to be intentional
            if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
                if (deltaX > 0) {
                    // Swipe left = next
                    showNextImage();
                } else {
                    // Swipe right = previous
                    showPreviousImage();
                }
            }
        });
    }
    
    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        // Only handle keystrokes if we're on the slideshow page
        if (!dom.slideshowContainer) return;
        
        switch (e.key) {
            case 'ArrowRight':
            case ' ': // Space
                showNextImage();
                break;
            case 'ArrowLeft':
                showPreviousImage();
                break;
            case 'Escape':
                // Could add feature to exit or toggle fullscreen
                break;
        }
    });
    
    console.log('Slideshow event listeners attached.');
}

/**
 * Initializes the slideshow module.
 * - Caches DOM elements
 * - Fetches initial image set
 * - Sets up Socket.IO event listeners
 * 
 * Implements Slideshow User Story 1:
 * - Load images from server
 */
async function _initSlideshow() {
    console.log('Initializing slideshow module...');
    
    const elementsFound = cacheDOMElements();
    if (!elementsFound) {
        console.error('Missing essential DOM elements for slideshow!');
        return;
    }
    
    // Initialize state with empty images array and default speed/order
    updateState('slideshow', {
        images: [],
        speed: DEFAULT_SLIDESHOW_SPEED,
        order: DEFAULT_SLIDESHOW_ORDER,
        usedRandomIndices: new Set()
    });
    
    // Show loading message while we fetch initial images
    crossfadeTo('', 'Loading images...');
    
    attachEventListeners();

    // --- Socket Listeners (Moved here from socket-client.js) ---
    if (window.socket) {
        // Remove old listeners before adding new ones (prevent duplicates on re-init)
        window.socket.off('playImage', handlePlayImage);
        window.socket.off('playSelect', handlePlaySelect);
        window.socket.off('settingsUpdate', handleSettingsUpdate);
        window.socket.off('slideAction', handleSlideAction);

        // Attach listeners
        window.socket.on('playImage', handlePlayImage);
        window.socket.on('playSelect', handlePlaySelect);
        window.socket.on('settingsUpdate', handleSettingsUpdate);
        window.socket.on('slideAction', handleSlideAction);
        console.log('[Slideshow] Socket event listeners attached inside slideshow.js.');
    } else {
        console.warn('[Slideshow] Socket not available when initializing listeners inside slideshow.js.');
    }
    // --- End Socket Listeners ---

    console.log('Slideshow initialized, settings loaded, listeners attached.');
    // >>> ADD CALL TO START PLAYING 'ALL' <<< 
    startSlideshow('all', null); 
}

// --- Exported Functions --- 

/**
 * Exports the initSlideshow function to be called from the main page
 * This keeps slideshow functionality encapsulated
 */
export async function initSlideshow() {
    console.log('Initializing slideshow from exported function');
    
    // Initialize the internal slideshow logic
    await _initSlideshow();
    
    // Attach event listeners for user interaction
    attachEventListeners();
}

/**
 * Main function to start or restart the slideshow with a new image source.
 * @param {string} sourceType - 'all', 'tags', 'playlist', 'selection', 'direct', 'none'
 * @param {*} sourceDetails - Tag array, playlist ID, image object array, or null.
 */
async function startSlideshow(sourceType, sourceDetails) {
    // *** Log parameters immediately upon entry ***
    console.log(`[Slideshow startSlideshow] ENTRY - Raw Params - sourceType: ${sourceType}, sourceDetails:`, sourceDetails);
    console.log(`[Slideshow] Starting slideshow. Source: ${sourceType}`, sourceDetails);
    pauseSlideshow(); // Stop any current interval

    // *** Restore combined state update ***
    // Update source and clear runtime state first
    updateState('slideshow', {
        sourceType: sourceType,
        sourceDetails: sourceDetails, // Store the original source details
        activeList: [],
        currentImageIndex: -1,
        usedIndices: new Set(),
        randomizedOrder: [],
        history: [],
        currentImage: null,
        isPlaying: false // Start paused until images loaded
    });
    console.log(`[Slideshow startSlideshow] State AFTER initial source/clear update:`, state.slideshow);

    let imageList = [];
    // *** ADD CHECK: If sourceDetails is already an image array, use it directly ***
    if (Array.isArray(sourceDetails)) {
        console.log('[Slideshow startSlideshow] Using provided image list directly.');
        imageList = sourceDetails; // sourceDetails contains the images from handlePlaySelect
    } else {
         console.log('[Slideshow startSlideshow] Fetching image list from server...');
        imageList = await fetchImageList(sourceType, sourceDetails);
         console.log(`[Slideshow startSlideshow] Fetched imageList length: ${imageList?.length || 0}`);
    }

    if (!imageList || imageList.length === 0) {
        console.warn('[Slideshow] No images found for the specified source.');
        crossfadeTo('', 'No images available'); // Display message
        // Keep sourceType/sourceDetails, but mark as not playing
        updateState('slideshow', { activeList: [], isPlaying: false, currentImageIndex: -1 }); 
        return;
    }
    
    // *** Update state again with the fetched list ***
    updateState('slideshow', { activeList: imageList });
    console.log('[Slideshow startSlideshow] State AFTER activeList update:', JSON.parse(JSON.stringify(state.slideshow)));

    if (state.slideshow.order === 'random') {
        generateRandomOrder();
    }

    // Start playback using the new play function
    play();
}

/**
 * Fetches the appropriate image list based on the source type.
 * NOTE: This needs refinement. Fetching ALL images for tags/playlists might be slow.
 * Consider fetching only IDs then details, or modifying API.
 */
async function fetchImageList(sourceType, sourceDetails) {
    let filters = {};
    let fetchAll = true; // Flag to fetch all matching, not just one page (NEEDS API SUPPORT or client filter)
    let limit = 10000; // Temporary high limit - BAD PRACTICE

    switch (sourceType) {
        case 'tags':
            filters.tags = sourceDetails; // Array of tag names
            break;
        case 'playlist':
            filters.playlistId = sourceDetails; // Playlist ID
            break;
        case 'selection':
            filters.ids = sourceDetails.map(img => img.id); // Array of image IDs
            if (filters.ids.length === 0) return [];
            break;
        case 'all':
            // No specific filters needed, just exclude hidden by default
            break;
        case 'direct': // 'direct' source uses the single image passed, no fetch needed here
             return [sourceDetails]; // Assuming sourceDetails is the image object
        case 'none':
        default:
            return [];
    }

    // Always exclude hidden unless source is 'direct' (handled above)
    // This might need adjustment based on how direct play passes data
    // filters.includeHidden = (sourceType === 'direct'); 

    // Call API - Needs modification if fetchAll is true
    const { images } = await fetchImages({ 
        page: 1, 
        limit: limit, // Request potentially large number
        sortKey: state.slideshow.order === 'alphabetical' ? 'title' : 'dateAdded', // Default sort for non-random
        sortDir: 'asc',
        filters 
    });

    return images || [];
}

/**
 * Generates a shuffled order of indices for the activeList.
 * Optionally ensures a specific index is first.
 * @param {number} [firstIndex=-1] - The index to place at the beginning.
 */
function generateRandomOrder(firstIndex = -1) {
    const list = state.slideshow.activeList;
    if (!list || list.length === 0) {
        updateState('slideshow', { randomizedOrder: [] });
        return;
    }

    let indices = Array.from({ length: list.length }, (_, i) => i);
    
    // Shuffle the array (Fisher-Yates algorithm)
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    // Move the desired firstIndex to the beginning if specified and valid
    if (firstIndex >= 0 && firstIndex < indices.length) {
        const currentPos = indices.indexOf(firstIndex);
        if (currentPos !== -1) {
            indices.splice(currentPos, 1); // Remove from current position
            indices.unshift(firstIndex); // Add to the front
        }
    }

    updateState('slideshow', { randomizedOrder: indices });
    console.log('[Slideshow] Generated random order:', indices);
}

/**
 * Pauses the slideshow.
 */
function pauseSlideshow() {
    stopSlideshowInterval();
    if (state.slideshow.isPlaying) { // Only update state if it was playing
        updateState('slideshow', { isPlaying: false });
        updatePlayPauseButtonUI();
        console.log('[Slideshow] Paused.');
    }
}

/**
 * Resumes the slideshow by showing the next image.
 */
function resumeSlideshow() {
    if (state.slideshow.isPlaying) {
        console.log('[Slideshow] Already playing.');
        return;
    } // Already playing
    if (state.slideshow.activeList && state.slideshow.activeList.length > 0) {
        console.log('[Slideshow] Resuming playback...');
        play(); // Call the centralized play function
    } else {
        console.log('[Slideshow] Cannot resume, no active images.');
    }
}

/**
 * Displays a directly played image and pauses.
 * @param {object} image - The image object to display.
 */
function playDirectImage(image) {
    console.log('[Slideshow] Playing direct image:', image.title);
    pauseSlideshow();
    crossfadeTo(image.url, image.title, image.description);

    // Find index in current list, update state
    const directImageIndex = state.slideshow.activeList.findIndex(img => img.id === image.id);
    
    updateState('slideshow', {
        currentImage: image, // Also update currentImage
        currentImageIndex: directImageIndex // May be -1 if not in activeList
    });

    // Reset random order if applicable (Mode A)
    if (state.slideshow.order === 'random') {
        console.log('[Slideshow] Random order active, regenerating with direct image first.');
        // Regenerate ensuring the direct image is first if found
        generateRandomOrder(directImageIndex); 
        // Reset used indices, add the current one
        const newUsedIndices = new Set();
        if (directImageIndex !== -1) { 
            // If the direct image was found, its effective index in the *new* random order is 0
            newUsedIndices.add(state.slideshow.randomizedOrder[0]); 
            updateState('slideshow', { currentImageIndex: state.slideshow.randomizedOrder[0] });
        }
        updateState('slideshow', { usedIndices: newUsedIndices });
    }
}

// --- UI Updates ---

function updatePlayPauseButtonUI() {
    // TODO: Implement logic to update the play/pause button icon in manage.html
    // based on state.slideshow.isPlaying
    console.log('[Slideshow] TODO: Update Play/Pause Button UI. isPlaying:', state.slideshow.isPlaying);
}

/**
 * The main function to start or resume playback.
 * Sets playing state, shows the first/next image, and starts the interval.
 */
function play() {
    if (state.slideshow.isPlaying) {
        console.log('[Slideshow play] Already playing.');
        return; // Don't restart if already playing
    }
     if (!state.slideshow.activeList || state.slideshow.activeList.length === 0) {
        console.log('[Slideshow play] Cannot play, no active images.');
        return;
    }

    console.log('[Slideshow play] Starting playback...');
    updateState('slideshow', { isPlaying: true });
    const imageCount = state.slideshow.activeList?.length || 0;
    // Show the image *before* starting the interval that will show the *next* one.
    // If currentImageIndex is -1 (just started), showNextImage handles it.
    // If resuming, showNextImage will advance from the last shown index.
    showNextImage(); 
    resetSlideshowInterval(imageCount); // Pass the count
    updatePlayPauseButtonUI();
}