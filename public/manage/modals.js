// public/manage/modals.js
// Logic for handling edit modals

import { state, updateState } from '../state.js';
import { updateImage, updateTag, updatePlaylist } from '../api.js';
// TODO: Use specific updatePlaylist API call when available
import { refreshManageData } from '../manage.js';
import { HIDDEN_TAG_NAME } from '../config.js';

// DOM elements cached by parent manage.js module
let dom = {};

// Store the ID of the item being edited
let currentEditImageId = null;
let currentEditTagId = null;
let currentEditPlaylistId = null;

export function setModalsDOMCache(cachedDom) {
    dom = cachedDom;
}

// --- General Modal Functions ---

/**
 * Opens a specified modal using Carbon's recommended class.
 * @param {HTMLElement} modalElement - The modal element to show.
 */
function openModal(modalElement) {
    if (modalElement) {
        // Use Carbon's visibility class
        modalElement.classList.add('is-visible');
        // Optional: Focus on the primary button or container for accessibility
        const primaryButton = modalElement.querySelector('[data-modal-primary-focus]');
        if (primaryButton) {
            primaryButton.focus();
        } else {
            // Focus container or first focusable element as fallback
            const focusable = modalElement.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
             if (focusable) focusable.focus();
             else modalElement.focus();
        }
    }
}

/**
 * Closes a specified modal using Carbon's recommended class.
 * @param {HTMLElement} modalElement - The modal element to hide.
 */
function closeModal(modalElement) {
    if (modalElement) {
        // Use Carbon's visibility class
        modalElement.classList.remove('is-visible');
    }
}


// --- Image Edit Modal ---

/**
 * Shows the image edit modal and populates it with data.
 * @param {object} image - The image object { id, title, description }.
 */
export function showImageEditModal(image) {
    if (!dom.editModal || !dom.editTitleInput || !dom.editDescriptionInput) {
        console.warn('Image edit modal DOM elements not cached.');
        return;
    }
    currentEditImageId = image.id;
    dom.editTitleInput.value = image.title;
    dom.editDescriptionInput.value = image.description || '';
    openModal(dom.editModal);
}

/**
 * Handles saving changes from the image edit modal.
 */
async function handleSaveImageEdit() {
    if (currentEditImageId === null || !dom.editTitleInput || !dom.editDescriptionInput) {
        return;
    }

    const newTitle = dom.editTitleInput.value.trim();
    const newDescription = dom.editDescriptionInput.value.trim();

    if (!newTitle) {
        alert('Image title cannot be empty.');
        return;
    }

    try {
        await updateImage(currentEditImageId, { title: newTitle, description: newDescription });
        console.log(`Image ${currentEditImageId} updated.`);
        closeModal(dom.editModal);
        await refreshManageData(); // Refresh the table to show changes
    } catch (error) {
        console.error(`Error updating image ${currentEditImageId}:`, error);
        alert(`Error saving image changes: ${error.message}`);
    }
    finally {
        currentEditImageId = null; // Reset ID
    }
}

// --- Tag Edit Modal ---

/**
 * Shows the tag edit modal
 */
export function showTagEditModal(tag) {
    // Prevent editing of Hidden tag
    if (tag.name.toLowerCase() === HIDDEN_TAG_NAME.toLowerCase()) {
        alert('The Hidden tag cannot be edited as it is a system tag.');
        return;
    }

    // Use cached DOM element for the modal
    if (!dom.tagEditModal || !dom.editTagNameInput) { // Check for the input element
        console.warn('Tag edit modal or input field not found in DOM cache.');
        return;
    }

    // Store the current tag ID
    currentEditTagId = tag.id;
    console.log(`[Modal] Opening tag edit modal for ID: ${currentEditTagId}, Name: ${tag.name}`);

    // Populate the input field with the current tag name
    dom.editTagNameInput.value = tag.name; 

    // Show the modal
    openModal(dom.tagEditModal);
}

/**
 * Handles saving changes from the tag edit modal.
 */
async function handleSaveTagEdit() {
    // Use the module-level variable
    if (currentEditTagId === null || !dom.editTagNameInput) {
        console.warn('[handleSaveTagEdit] No tag ID stored or input element missing.');
        return;
    }

    const newName = dom.editTagNameInput.value.trim();
    // Potential enhancement: Get new color
    // const newColor = dom.editTagColorInput.value;

    if (!newName) {
        alert('Tag name cannot be empty.');
        return;
    }
     if (newName.toLowerCase() === HIDDEN_TAG_NAME.toLowerCase()) {
        alert(`Cannot rename tag to "${HIDDEN_TAG_NAME}".`);
        return;
    }
    // Optional: Check for duplicate name against other tags in state
    if (state.tags.some(t => t.id !== currentEditTagId && t.name.toLowerCase() === newName.toLowerCase())) {
         alert(`Another tag with the name "${newName}" already exists.`);
         return;
    }

    console.log(`[handleSaveTagEdit] Attempting to update tag ID ${currentEditTagId} to name: "${newName}"`);

    try {
        // Call updateTag API
        await updateTag(currentEditTagId, newName); // Pass ID and new name string
        console.log(`[handleSaveTagEdit] Tag ${currentEditTagId} updated successfully.`);
        
        // Close modal on success
        closeModal(dom.tagEditModal);
        
        // Refresh data to show changes
        await refreshManageData(); 
        
    } catch (error) {
        console.error(`[handleSaveTagEdit] Error updating tag ${currentEditTagId}:`, error);
        // Use centralized error handler if preferred
        // handleError(error, ErrorTypes.SERVER, `Error saving tag changes: ${error.message}`);
        alert(`Error saving tag changes: ${error.message}`);
    } finally {
        // Reset ID regardless of success/failure to prevent accidental edits
        console.log(`[handleSaveTagEdit] Resetting currentEditTagId.`);
        currentEditTagId = null; 
    }
}

// --- Playlist Edit Modal ---

/**
 * Shows the playlist edit modal and populates it with data.
 * @param {object} playlist - The playlist object { id, name, ... }.
 */
export function showPlaylistEditModal(playlist) {
    if (!dom.playlistEditModal || !dom.editPlaylistNameInput) {
        console.warn('Playlist edit modal DOM elements not cached.');
        return;
    }
    currentEditPlaylistId = playlist.id;
    dom.editPlaylistNameInput.value = playlist.name;
    // Potential enhancement: Add color picker, hidden toggle
    openModal(dom.playlistEditModal);
}

/**
 * Handles saving changes from the playlist edit modal.
 */
async function handleSavePlaylistEdit() {
    if (currentEditPlaylistId === null || !dom.editPlaylistNameInput) {
        return;
    }

    const newName = dom.editPlaylistNameInput.value.trim();
    if (!newName) {
        alert('Playlist name cannot be empty.');
        return;
    }

    // Check if new name conflicts with another existing playlist
    if (state.playlists.some(p => p.id !== currentEditPlaylistId && p.name.toLowerCase() === newName.toLowerCase())) {
        alert(`Another playlist with the name "${newName}" already exists.`);
        return;
    }

    try {
        await updatePlaylist(currentEditPlaylistId, { name: newName });
        console.log(`Playlist ${currentEditPlaylistId} updated.`);
        closeModal(dom.playlistEditModal);
        await refreshManageData(); // Refresh playlists
    } catch (error) {
        console.error(`Error updating playlist ${currentEditPlaylistId}:`, error);
        alert(`Error saving playlist changes: ${error.message}`);
    } finally {
        currentEditPlaylistId = null; // Reset ID
    }
}

// --- Event Listener Attachment ---

/**
 * Attaches event listeners for all modal controls.
 */
export function attachModalEventListeners() {
    // Image Edit Modal
    if (dom.editModal) {
        const closeBtn = dom.editModal.querySelector('#closeEditBtn');
        const cancelBtn = dom.editModal.querySelector('#cancelEditBtn');
        const saveBtn = dom.editModal.querySelector('#saveEditBtn');
        if (closeBtn) closeBtn.addEventListener('click', () => closeModal(dom.editModal));
        if (cancelBtn) cancelBtn.addEventListener('click', () => closeModal(dom.editModal));
        if (saveBtn) saveBtn.addEventListener('click', handleSaveImageEdit);
    }

    // Tag Edit Modal
    if (dom.tagEditModal) {
        const closeBtn = dom.tagEditModal.querySelector('#closeTagEditBtn');
        const cancelBtn = dom.tagEditModal.querySelector('#cancelTagEditBtn');
        const saveBtn = dom.tagEditModal.querySelector('#saveTagEditBtn');
        
        if (!saveBtn) {
            console.warn('Save button for Tag Edit Modal not found!');
        } else {
            console.log('Attaching listener to Tag Edit Save button');
            saveBtn.addEventListener('click', handleSaveTagEdit);
        }
        if (closeBtn) closeBtn.addEventListener('click', () => {
             closeModal(dom.tagEditModal);
             currentEditTagId = null; // Also reset ID on explicit close/cancel
        });
        if (cancelBtn) cancelBtn.addEventListener('click', () => {
            closeModal(dom.tagEditModal);
             currentEditTagId = null; // Also reset ID on explicit close/cancel
        });
    }

    // Playlist Edit Modal
    if (dom.playlistEditModal) {
        const closeBtn = dom.playlistEditModal.querySelector('#closePlaylistEditBtn');
        const cancelBtn = dom.playlistEditModal.querySelector('#cancelPlaylistEditBtn');
        const saveBtn = dom.playlistEditModal.querySelector('#savePlaylistEditBtn');
        if (closeBtn) closeBtn.addEventListener('click', () => closeModal(dom.playlistEditModal));
        if (cancelBtn) cancelBtn.addEventListener('click', () => closeModal(dom.playlistEditModal));
        if (saveBtn) saveBtn.addEventListener('click', handleSavePlaylistEdit);
    }

    // Close modal if backdrop is clicked (optional - Might interfere with Carbon structure)
    /*
    [dom.editModal, dom.tagEditModal, dom.playlistEditModal].forEach(modal => {
        if (modal) {
            modal.addEventListener('click', (event) => {
                 // Check if the click is on the modal overlay itself, not the container
                if (event.target === modal) {
                    closeModal(modal);
                }
            });
        }
    });
    */
}

/**
 * Initializes modal functionality.
 */
export function initModals() {
    console.log('Initializing Modals...');
    attachModalEventListeners();
}