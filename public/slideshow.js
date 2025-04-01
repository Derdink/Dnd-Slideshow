/**
 * Slideshow.js
 * Implements core slideshow functionality based on user stories:
 * - Slideshow User Story 1: View slideshow of images with titles and descriptions
 * - Slideshow User Story 2: Navigate through slideshow with next/previous buttons
 * - Slideshow User Story 3: Crossfade transitions between images
 */

import { state, updateState } from './state.js';
import './socket-client.js'; // Import socket-client.js to ensure it's loaded
import { fetchImages } from './api.js'; // ADDED for initial load
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
 * Updates the title overlay with new text
 * Implements Slideshow User Story 1:
 * - Display title over image at bottom
 * - Display description as subtitle
 * - Subtle gradient behind text
 */
function updateTitleOverlay(title, subtitle = '') {
    if (!dom.titleOverlay1 || !dom.titleOverlay2 || !dom.subtitleOverlay1 || !dom.subtitleOverlay2) return;

    const activeTitleOverlay = activeSlideIndex === 1 ? dom.titleOverlay1 : dom.titleOverlay2;
    const inactiveTitleOverlay = activeSlideIndex === 1 ? dom.titleOverlay2 : dom.titleOverlay1;
    const activeSubtitleOverlay = activeSlideIndex === 1 ? dom.subtitleOverlay1 : dom.subtitleOverlay2;
    const inactiveSubtitleOverlay = activeSlideIndex === 1 ? dom.subtitleOverlay2 : dom.subtitleOverlay1;

    // Set text on the *inactive* overlay first
    inactiveTitleOverlay.textContent = title || '';
    inactiveSubtitleOverlay.textContent = subtitle || '';

    // Fade out active, fade in inactive
    activeTitleOverlay.classList.remove('active');
    activeSubtitleOverlay.classList.remove('active');
    inactiveTitleOverlay.classList.add('active');
    inactiveSubtitleOverlay.classList.add('active');
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
    console.log(`crossfadeTo called with: URL=${imageUrl}, title=${title}`);
    
    // Check essential DOM elements exist
    if (!dom.slide1 || !dom.slide2) {
        console.error('Crossfade failed: Missing slide img elements.');
        return;
    }
    // Handle case where imageUrl is missing (e.g., for "Loading..." message)
    if (!imageUrl) {
        console.warn(`Crossfade called without image URL. Displaying text: "${title}"`);
        // If no image url, clear both image sources and set text statically
        dom.slide1.src = '';
        dom.slide2.src = '';
        dom.slide1.classList.remove('active');
        dom.slide2.classList.remove('active'); // Ensure no images are active
        setTextOverlayStatic(title, description); // Set text on current active overlay only
        return; // Stop here, don't proceed with image transition logic
    }

    const inactiveSlide = activeSlideIndex === 1 ? dom.slide2 : dom.slide1;
    const activeSlide = activeSlideIndex === 1 ? dom.slide1 : dom.slide2;

    console.log(`Setting image src=${imageUrl} on slide element:`, inactiveSlide);
    
    // Set the source for the inactive slide
    inactiveSlide.src = imageUrl;

    // Add 'active' class to the inactive slide to start fade-in
    inactiveSlide.classList.add('active');

    // Remove 'active' class from the active slide to start fade-out
    activeSlide.classList.remove('active');

    // Update the title overlay (this handles the text transition)
    updateTitleOverlay(title, description);

    // Switch the active slide index for the next transition
    activeSlideIndex = activeSlideIndex === 1 ? 2 : 1;

    // Preload the *next* image after this one, if possible
    preloadNextImage();
}

/**
 * Gets next image index in sequence based on slideshow order setting
 * Implements Slideshow User Story 1 - different order modes
 * @returns {number} Index of the next image to display
 */
function getNextImageIndex() {
    const images = state.slideshow.images;
    if (!images || images.length === 0) return 0;
    if (images.length === 1) return 0; // Only one image, always return index 0
    
    const order = state.slideshow.order || DEFAULT_SLIDESHOW_ORDER;
    
    // Initialize usedRandomIndices if not exists
    if (!state.slideshow.usedRandomIndices) {
        state.slideshow.usedRandomIndices = new Set();
    }
    
    switch (order) {
        case 'random':
            // If all images have been shown, reset the tracking set
            if (state.slideshow.usedRandomIndices.size >= images.length - 1) { // -1 because current is already used
                state.slideshow.usedRandomIndices.clear();
                // Add current index to avoid showing it twice in a row
                state.slideshow.usedRandomIndices.add(currentImageIndex);
            }
            
            // Find a random index that hasn't been used yet
            let nextRandomIndex;
            do {
                nextRandomIndex = Math.floor(Math.random() * images.length);
            } while (state.slideshow.usedRandomIndices.has(nextRandomIndex));
            
            // Mark this index as used
            state.slideshow.usedRandomIndices.add(nextRandomIndex);
            return nextRandomIndex;
            
        case 'sequential':
        default:
            // Simple sequential order with wraparound
            return (currentImageIndex + 1) % images.length;
    }
}

/**
 * Gets previous image index in sequence
 * Used by Slideshow User Story 2 for navigation
 */
function getPrevImageIndex() {
    const images = state.slideshow.images;
    if (!images || images.length === 0) return 0;

    // Simple sequential previous for now. Random previous is less intuitive.
    return (currentImageIndex - 1 + images.length) % images.length;
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
 * Shows the next image in the slideshow based on current order
 * Part of Slideshow User Story 2
 */
function showNextImage() {
    console.log('Showing next image...');
    const images = state.slideshow.images;
    if (!images || images.length === 0) {
        console.warn('No images available to display.');
        return;
    }
    
    const nextIndex = getNextImageIndex();
    if (nextIndex >= 0 && nextIndex < images.length) {
        currentImageIndex = nextIndex;
        const image = images[currentImageIndex];
        crossfadeTo(image.url, image.title, image.description);
    }
}

/**
 * Shows the previous image in the slideshow
 * Part of Slideshow User Story 2
 */
function showPreviousImage() {
    console.log('Showing previous image...');
    const images = state.slideshow.images;
    if (!images || images.length === 0 || images.length === 1) {
        console.warn('No previous image available.');
        return;
    }
    
    // Simple previous for sequential order
    let prevIndex = currentImageIndex - 1;
    if (prevIndex < 0) {
        prevIndex = images.length - 1; // Wrap around to last image
    }
    
    currentImageIndex = prevIndex;
    const image = images[currentImageIndex];
    crossfadeTo(image.url, image.title, image.description);
}

/**
 * Reset the slideshow interval for automatic playback
 * If an interval already exists, it will be stopped and then restarted
 * Implements Slideshow User Story 1 - automatic playback
 */
function resetSlideshowInterval() {
    // Clear any existing interval first
    stopSlideshowInterval();
    
    const images = state.slideshow.images || [];
    const speed = state.slideshow.speed || DEFAULT_SLIDESHOW_SPEED;
    
    // Only start interval if there are multiple images and speed > 0
    if (images.length > 1 && speed > 0) {
        console.log(`Starting slideshow interval with ${images.length} images, speed: ${speed}ms`);
        intervalId = setInterval(showNextImage, speed);
    } else {
        console.log('Not starting interval: ' + 
            (images.length <= 1 ? 'Not enough images. ' : '') +
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
    console.log('Received playSelect event:', { 
        count: data?.images?.length, 
        speed: data?.speed, 
        order: data?.order,
        source: data?.source // 'selected', 'playlist', 'tags', or 'all'
    });
    
    // Stop current slideshow
    stopSlideshowInterval();
    
    // Reset usedRandomIndices when new images are loaded
    state.slideshow.usedRandomIndices = new Set();
    
    // Update slideshow state with new images and settings
    updateState('slideshow', {
        images: data.images || [],
        speed: data.speed || state.slideshow.speed || DEFAULT_SLIDESHOW_SPEED,
        order: data.order || state.slideshow.order || DEFAULT_SLIDESHOW_ORDER,
        source: data.source || 'all' // Track what triggered this play selection
    });
    
    // Log first image details
    console.log('First image in data:', data.images?.[0]); 
    
    if (!data.images || data.images.length === 0) {
        console.warn('No images received in playSelect event, trying to fetch all images');
        
        // If no images were selected, try to show all images
        fetchImages()
            .then(allImages => {
                if (allImages.images && allImages.images.length > 0) {
                    console.log(`Fetched ${allImages.images.length} images as fallback`);
                    
                    // Update state again with the fetched images
                    updateState('slideshow', {
                        images: allImages.images,
                        // Keep the other settings from before
                        speed: state.slideshow.speed,
                        order: state.slideshow.order,
                        source: 'all'
                    });
                    
                    // Start the slideshow with these images
                    startSlideshowWithImages(allImages.images);
                } else {
                    console.warn('No images found in fallback fetch');
                    crossfadeTo('', 'No images available');
                }
            })
            .catch(error => {
                console.error('Error fetching fallback images:', error);
                crossfadeTo('', 'Error loading images');
            });
    } else {
        // Start the slideshow with the provided images
        startSlideshowWithImages(data.images);
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
        crossfadeTo('', 'No images available');
        return;
    }
    
    console.log('First image object:', images[0]); // Debug first image object
    
    // Display the first image immediately
    currentImageIndex = 0;
    const firstImage = images[0];
    
    // Verify image has a URL property
    if (firstImage && firstImage.url) {
        console.log('Displaying first image with URL:', firstImage.url);
        crossfadeTo(firstImage.url, firstImage.title || '', firstImage.description || '');
        
        // Start the interval to display the rest of the images if there are more than one
        if (images.length > 1 && state.slideshow.speed > 0) {
            resetSlideshowInterval();
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
    console.log('Received settingsUpdate event:', data);
    if (data && (data.transitionTime !== undefined || data.order !== undefined)) {
        // Reset usedRandomIndices if order is changing
        if (data.order !== undefined && data.order !== state.slideshow.order) {
            state.slideshow.usedRandomIndices = new Set();
        }

        updateState('slideshow', {
            transitionTime: data.transitionTime ?? state.slideshow.transitionTime,
            order: data.order ?? state.slideshow.order,
        });

        // Restart interval with new settings
        resetSlideshowInterval();
    }
}

/**
 * Handles slide navigation actions
 * Used by Slideshow Management User Story 2 for navigation controls
 */
function handleSlideAction(data) {
    console.log('Received slideAction event:', data);
    if (data.action === 'next') {
        showNextImage();
    } else if (data.action === 'prev') {
        showPreviousImage();
    }
    // Note: showNextImage/showPreviousImage already call resetSlideshowInterval
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
    
    // First load: Try to fetch initial images
    try {
        console.log("Fetching initial images for slideshow...");
        const initialData = await fetchImages(); // Use existing API function
        console.log('Fetched image data structure:', initialData);
        
        // Extract images from the API response
        const initialImages = initialData.images || []; 
        console.log(`Fetched ${initialImages.length} initial images.`);
        
        if (initialImages.length === 0) {
            console.warn('No images found in initial fetch.');
            crossfadeTo('', 'No images available');
            return;
        }
        
        // Start slideshow with fetched images
        handlePlaySelect({
            images: initialImages,
            speed: state.slideshow.speed,
            order: state.slideshow.order
        });
    } catch (error) {
        console.error('Failed to load initial slideshow images:', error);
        crossfadeTo('', 'Error loading images'); // Show error state
    }
    
    // Set up socket event listeners
    console.log('Setting up socket event listeners for slideshow...');
    socket.on('playImage', handlePlayImage);
    socket.on('playSelect', handlePlaySelect);
    socket.on('settingsUpdate', handleSettingsUpdate);
    socket.on('slideAction', handleSlideAction);
    
    console.log('Slideshow initialization complete.');
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