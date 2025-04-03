// public/manage/imageManager.js
// Orchestrates fetching, state management, and updates for the image table and pagination.

import { state, updateState } from '../state.js';
import {
    fetchImages,
    deleteImageById,
    bulkDeleteImages,
    updateImage, // Needed for the edit modal save
    playImageAPI,
    playSelectedImagesAPI
} from '../api.js';
import { displayImagesInTable, updateSortArrows, updateRowSelectionVisuals } from './imageTable.js';
import { updatePaginationControls } from './pagination.js';
import { updateFilterTagAvailability } from './filters.js'; // Needed to update tags based on results
import { showImageEditModal } from './modals.js'; // Import the correct modal function for images

// --- DOM Cache (managed by manage.js) ---
let dom = {};

export function setImageManagerDOMCache(cachedDom) {
    console.log('[ImageManager] Received DOM object for caching:', cachedDom);
    dom = cachedDom;
    // Ensure required DOM elements for this module are present
    if (!dom.bulkDeleteBtn || !dom.imageTableBody) {
        console.error('ImageManager DOM Cache incomplete! Missing required elements.', {
            bulkDeleteBtn: dom.bulkDeleteBtn,
            imageTableBody: dom.imageTableBody
        });
    }
}

// --- Module State (if any specific to the manager itself) ---
// (Currently, most state is in the global state.management)

// --- Selection Management ---

/**
 * Toggles the selection state of a single image.
 * @param {number} imageId - The ID of the image to toggle.
 */
function toggleImageSelection(imageId) {
    const selectedIds = state.management.selectedImageIds;
    if (selectedIds.has(imageId)) {
        selectedIds.delete(imageId);
    } else {
        selectedIds.add(imageId);
    }
    // *** LOG: Log selection set after toggle ***
    console.log('[ImageManager toggleImageSelection] Updated selectedIds Set:', selectedIds);
    updateBulkActionButtons();
    updateRowSelectionVisuals(); // Update visuals in the table
}

/**
 * Selects or deselects all currently displayed images.
 * @param {boolean} select - True to select all, false to deselect all.
 */
function selectAllImages(select) {
    const selectedIds = state.management.selectedImageIds;
    if (select) {
        state.management.displayedImages.forEach(img => selectedIds.add(img.id));
    } else {
        state.management.displayedImages.forEach(img => selectedIds.delete(img.id));
    }
    // *** LOG: Log selection set after selectAll ***
    console.log('[ImageManager selectAllImages] Updated selectedIds Set:', selectedIds);
    updateBulkActionButtons();
    updateRowSelectionVisuals();
}

/**
 * Updates the enabled/disabled state of bulk action buttons based on selection.
 */
function updateBulkActionButtons() {
    const count = state.management.selectedImageIds.size;
    const disabled = count === 0;

    if (dom.bulkDeleteBtn) {
        dom.bulkDeleteBtn.disabled = disabled;
        dom.bulkDeleteBtn.classList.toggle('bx--btn--disabled', disabled);
    }
    // Add logic for other bulk buttons (e.g., add tag, add to playlist) here if needed
}

// --- Bulk Actions ---

/**
 * Handles the click event for the Bulk Delete button.
 */
async function handleBulkDeleteClick() {
    const selectedIds = Array.from(state.management.selectedImageIds);
    if (selectedIds.length === 0) {
        alert('Please select images to delete.');
        return;
    }

    if (confirm(`Are you sure you want to delete ${selectedIds.length} selected image(s)? This cannot be undone.`)) {
        console.log(`[ImageManager] Initiating bulk delete for IDs: ${selectedIds.join(', ')}`);
        dom.bulkDeleteBtn.disabled = true; // Disable while processing
        dom.bulkDeleteBtn.classList.add('bx--btn--disabled');
        try {
            await bulkDeleteImages(selectedIds);
            state.management.selectedImageIds.clear(); // Clear selection after successful delete
            updateBulkActionButtons(); // Update button states
            await refreshImageData(); // Refresh the image list
            // Optionally show success notification
        } catch (error) {
            console.error('[ImageManager] Bulk delete failed:', error);
            alert(`Error deleting images: ${error.message}`);
        } finally {
            // Re-enable button even if failed, unless logic dictates otherwise
            updateBulkActionButtons();
        }
    }
}

/**
 * Handles the click event for the Play Selected button.
 */
async function handlePlaySelectedClick() {
    const selectedIds = Array.from(state.management.selectedImageIds);
    if (selectedIds.length === 0) {
        alert('Please select images to play.');
        return;
    }

    const imagesToPlay = state.management.displayedImages.filter(img => selectedIds.includes(img.id));

    // Get current slideshow settings from state
    const speed = state.slideshow.transitionTime ?? 3;
    const order = state.slideshow.order ?? 'random'; // Or maybe 'current' to respect the displayed order?

    console.log(`[ImageManager] Initiating play selected for ${imagesToPlay.length} images.`);
    dom.playSelectBtn.disabled = true;
    dom.playSelectBtn.classList.add('bx--btn--disabled');

    try {
        await playSelectedImagesAPI(imagesToPlay, speed, order);
        // Optionally show notification
    } catch (error) {
        console.error('[ImageManager] Play selected failed:', error);
        alert(`Error starting slideshow: ${error.message}`);
    } finally {
        updateBulkActionButtons(); // Re-enable based on selection count
    }
}

// --- Individual Image Actions (Event Delegation) ---

/**
 * Handles clicks within the image table body for action buttons.
 * @param {Event} event - The click event.
 */
function handleImageActionClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const row = button.closest('tr');
    const imageId = parseInt(row?.dataset.imageId, 10);
    const action = button.dataset.action;

    if (!imageId || !action) {
        console.warn('[ImageManager] Could not determine action or image ID from button click.', event.target);
        return;
    }

    console.log(`[ImageManager] Action '${action}' triggered for image ID ${imageId}`);

    switch (action) {
        case 'delete':
            handleDeleteImage(imageId);
            break;
        case 'edit':
            handleEditImage(imageId);
            break;
        case 'play':
            handlePlayImage(imageId);
            break;
        // Add cases for other actions like 'addTag', 'addToPlaylist'
        default:
            console.warn(`[ImageManager] Unhandled image action: ${action}`);
    }
}

/**
 * Handles deleting a single image.
 * @param {number} imageId - The ID of the image to delete.
 */
async function handleDeleteImage(imageId) {
    if (confirm('Are you sure you want to delete this image? This cannot be undone.')) {
        console.log(`[ImageManager] Deleting image ID: ${imageId}`);
        try {
            await deleteImageById(imageId);
            state.management.selectedImageIds.delete(imageId); // Remove if selected
            updateBulkActionButtons();
            await refreshImageData(); // Refresh list
            // Optionally show success notification
        } catch (error) {
            console.error(`[ImageManager] Delete failed for image ID ${imageId}:`, error);
            alert(`Error deleting image: ${error.message}`);
        }
    }
}

/**
 * Handles editing a single image (opens the edit modal).
 * @param {number} imageId - The ID of the image to edit.
 */
function handleEditImage(imageId) {
    const image = state.management.displayedImages.find(img => img.id === imageId);
    if (image) {
        showImageEditModal(image); // Call function from modals.js
    } else {
        console.error(`[ImageManager] Image data not found for ID ${imageId} to edit.`);
        alert('Could not find image data to edit.');
    }
}

/**
 * Handles playing a single image.
 * @param {number} imageId - The ID of the image to play.
 */
async function handlePlayImage(imageId) {
    const image = state.management.displayedImages.find(img => img.id === imageId);
    if (image) {
        console.log(`[ImageManager] Playing image ID: ${imageId}`);
        try {
            await playImageAPI(image);
            // Optionally show notification
        } catch (error) {
            console.error(`[ImageManager] Play image failed for ID ${imageId}:`, error);
            alert(`Error playing image: ${error.message}`);
        }
    } else {
        console.error(`[ImageManager] Image data not found for ID ${imageId} to play.`);
        alert('Could not find image data to play.');
    }
}


// --- Fetching and Display Logic (Moved from manage.js) ---

/**
 * Fetches image data based on current state and updates relevant UI modules.
 * This replaces the core data fetching logic previously in manage.js's refreshManageData.
 */
export async function refreshImageData() {
    console.log('[ImageManager] Refreshing image data...', state.management);

    const fetchOptions = {
        page: state.management.currentPage,
        limit: state.management.currentLimit,
        sortKey: state.management.sortKey,
        sortDir: state.management.sortDirection,
        filters: {
            search: state.management.searchQuery,
            tags: state.management.selectedFilterTags,
            playlistId: state.management.selectedPlaylistId,
            includeHidden: true
        }
    };
    
    console.log('[ImageManager] Fetching images with options:', fetchOptions);

    try {
        const imageData = await fetchImages(fetchOptions);
        
        console.log('[ImageManager] Raw imageData received from API:', imageData);
        
        const receivedImages = imageData.images || [];
        
        const expectedNewId = null; // Or set to the ID you are testing
        if (expectedNewId) {
             const foundNew = receivedImages.some(img => img.id === expectedNewId);
             console.log(`[ImageManager] Does raw API response contain image ID ${expectedNewId}? : ${foundNew}`);
        }
        console.log(`[ImageManager] Received ${receivedImages.length} images from fetch. First 5 IDs:`, 
             receivedImages.slice(0, 5).map(img => img.id)
        );

        updateState('management', {
            displayedImages: receivedImages, 
            totalPages: imageData.pagination.totalPages || 1,
            currentPage: imageData.pagination.currentPage || 1
        });
        
        console.log('[ImageManager] State updated. Current state.management.displayedImages (first 5 stringified):', 
            JSON.stringify(state.management.displayedImages?.slice(0, 5), null, 2)
        );
         console.log('[ImageManager] Full state.management.displayedImages object:', state.management.displayedImages);

        console.log('[ImageManager] Calling displayImagesInTable with image count:', receivedImages.length);
        displayImagesInTable(receivedImages); 
        
        updatePaginationControls(imageData.pagination || { currentPage: 1, totalPages: 1, totalItems: 0, itemsPerPage: state.management.currentLimit });
        updateSortArrows(); 
        updateFilterTagAvailability(receivedImages); 
        updateBulkActionButtons(); 
        updateRowSelectionVisuals(); 

        console.log('[ImageManager] Image data refresh complete.');

    } catch (error) {
        console.error('[ImageManager] Error refreshing image data:', error);
        displayImagesInTable([]);
        updatePaginationControls({ currentPage: 1, totalPages: 1, totalItems: 0, itemsPerPage: state.management.currentLimit });
        updateBulkActionButtons();
    }
}

/**
 * Sets the current sorting parameters and triggers a data refresh.
 * @param {string} key - The key to sort by (e.g., 'title', 'dateAdded').
 */
export function setSort(key) {
    const currentKey = state.management.sortKey;
    const currentDir = state.management.sortDirection;
    let newDirection = 'asc';

    if (currentKey === key && currentDir === 'asc') {
        newDirection = 'desc';
    } // Defaults to 'asc' if key changes or currentDir is 'desc'

    updateState('management', {
        sortKey: key,
        sortDirection: newDirection,
        currentPage: 1 // Reset to first page when sort changes
    });
    refreshImageData(); // Refresh data with new sort
}

/**
 * Sets the current page number and triggers a data refresh.
 * @param {number} pageNumber - The page number to navigate to.
 */
export function setCurrentPage(pageNumber) {
    if (pageNumber >= 1 && pageNumber <= state.management.totalPages) {
        updateState('management', {
            currentPage: pageNumber
        });
        refreshImageData();
    } else {
        console.warn(`[ImageManager] Attempted to set invalid page number: ${pageNumber}`);
    }
}

/**
 * Sets the number of items per page and triggers a data refresh.
 * @param {number} limit - The number of items per page.
 */
export function setItemsPerPage(limit) {
    const newLimit = Math.max(1, limit); // Ensure limit is at least 1
    updateState('management', {
        currentLimit: newLimit,
        currentPage: 1 // Reset to first page when limit changes
    });
    refreshImageData();
}


// --- Initialization ---

/**
 * Initializes the Image Manager: attaches listeners for bulk actions and row actions.
 */
export function initImageManager() {
    console.log('[ImageManager] Initializing...');

    // Attach listeners for bulk actions
    if (dom.bulkDeleteBtn) {
        dom.bulkDeleteBtn.addEventListener('click', handleBulkDeleteClick);
    }
    if (dom.playSelectBtn) {
        dom.playSelectBtn.addEventListener('click', handlePlaySelectedClick);
    }

    // Attach listener for individual row actions using event delegation
    if (dom.imageTableBody) {
        dom.imageTableBody.addEventListener('click', handleImageActionClick);
        // Also handle row click for selection (can be combined with action click or separate)
        dom.imageTableBody.addEventListener('click', (event) => {
            const row = event.target.closest('tr');
            const checkbox = event.target.closest('input[type="checkbox"]');
            const button = event.target.closest('button[data-action]');
            const imageId = parseInt(row?.dataset.imageId, 10);

            // If click was on checkbox or action button, handled by their specific listeners or handleImageActionClick
            // Otherwise, treat click on row (but not buttons/checkbox) as selection toggle
            if (row && imageId && !checkbox && !button) {
                toggleImageSelection(imageId);
            }
        });
    }

    // Attach listener for header checkbox
    if (dom.headerSelectCheckbox) {
        dom.headerSelectCheckbox.addEventListener('change', (event) => {
            selectAllImages(event.target.checked);
        });
    }

    // Initial state setup for buttons
    updateBulkActionButtons();

    // Initial data fetch is handled by manage.js calling refreshManageData
    // which in turn calls refreshImageData from this module.
}

// Export necessary functions to be called by other modules (e.g., upload.js)
export { toggleImageSelection }; 