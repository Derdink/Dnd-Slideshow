// public/manage/tagManager.js
// Logic for the tag manager section, tag pills, and tag operations

import { state, updateState } from '../state.js';
import { createTag, updateTag, deleteTag, updateImage } from '../api.js'; // Added updateImage for tag operations
import { getContentColorForBackground } from './utils.js';
import { showTagEditModal } from './modals.js'; // Will need this dependency later
import { refreshManageData } from '../manage.js'; // Need main refresh function
import { BACKGROUND_COLORS, PROTECTED_TAGS, DEFAULTS, HIDDEN_TAG_NAME } from '../config.js';
import { validateTag } from './stateValidator.js';
import { handleError, ErrorTypes, withErrorHandling } from './errorHandler.js';

// DOM elements cached by parent manage.js module
let dom = {};
const DEFAULT_TAG_COLOR = '#FF4081';

export function setTagManagerDOMCache(cachedDom) {
    dom = cachedDom;
    // Add checks for required elements
    if (!dom.tagManagerSection || !dom.newTagForm || !dom.newTagNameInput || !dom.tagManagerList) {
        console.error('TagManager DOM Cache incomplete!');
    }
}

/**
 * tagManager.js
 * Implements tag management functionality based on user stories:
 * - Image Management User Story 11: Edit and manage tags
 * - Image Management User Story 8: Delete tags on images
 * - Performance and Optimization User Story 1: Quick loading with tag management
 */

/**
 * Creates a tag pill element
 * Implements Image Management User Story 11:
 * - Display tag with color
 * - Add remove button for images
 * - Add delete button for database
 * - Support double-click to add to selected images
 * - Support click to edit tag name
 */
export function createTagPill(tag, imageId = null, isRemovable = false) {
    const tagPill = document.createElement('div');
    tagPill.classList.add('tag-pill');
    if (imageId) tagPill.classList.add('image-tag');
    if (isRemovable) tagPill.classList.add('removable');
    
    // Add special styling for Hidden tag
    if (tag.name.toLowerCase() === HIDDEN_TAG_NAME.toLowerCase()) {
        tagPill.classList.add('hidden-tag');
        tagPill.title = 'Hidden images are excluded from slideshow unless played directly';
    }

    // Apply tag color and get contrast color for text
    const tagColor = tag.color || DEFAULT_TAG_COLOR;
    const contrastColor = getContentColorForBackground(tagColor);
    
    // Apply color styles
    tagPill.style.backgroundColor = tagColor;
    tagPill.style.color = contrastColor;

    const tagContents = document.createElement('span');
    tagContents.classList.add('tagContents');
    
    const tagNameElem = document.createElement('span');
    tagNameElem.classList.add('tagName');
    tagNameElem.textContent = tag.name;
    tagContents.appendChild(tagNameElem);

    // Add double-click editing for tag name, but not for Hidden tag
    if (!imageId && !isRemovable && tag.name.toLowerCase() !== HIDDEN_TAG_NAME.toLowerCase()) {
        tagNameElem.addEventListener('dblclick', (e) => {
            e.stopPropagation(); // Prevent other double-click handlers
            showTagEditModal(tag);
        });
        tagNameElem.style.cursor = 'pointer';
        tagNameElem.title = 'Double-click to edit tag name';
    }

    // Add remove button if applicable (for tags on specific images in the table)
    if (isRemovable && tag.name.toLowerCase() !== HIDDEN_TAG_NAME.toLowerCase()) {
        const removeBtn = document.createElement('span');
        removeBtn.classList.add('remove-tag');
        removeBtn.innerHTML = '&times;';
        removeBtn.title = 'Remove tag from image';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleRemoveTagFromImage(tag.id, imageId);
        });
        tagContents.appendChild(removeBtn);
    }

    tagPill.appendChild(tagContents);
    if (isRemovable && imageId) {
        const tagClear = document.createElement('span');
        tagClear.classList.add('tagClear');
        const removeBtn = document.createElement('button');
        removeBtn.className = 'tagRemoveButton';
        removeBtn.title = 'Remove tag from this image';
        removeBtn.innerHTML = `<svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="16" height="16" viewBox="0 0 32 32"><path d="M24 9.4L22.6 8 16 14.6 9.4 8 8 9.4l6.6 6.6L8 22.6 9.4 24l6.6-6.6 6.6 6.6 1.4-1.4-6.6-6.6L24 9.4z"></path></svg>`;
        removeBtn.style.color = contrastColor;
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent other clicks
            handleRemoveTagFromImage(tag, imageId);
        });
        tagClear.appendChild(removeBtn);
        tagContents.appendChild(tagClear);
    }
    // Add delete button for tags in the manager section (excluding 'Hidden')
    else if (!imageId && !isRemovable && tag.name.toLowerCase() !== 'hidden') {
        const tagDelete = document.createElement('span');
        tagDelete.classList.add('tagDelete');
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'tagDeleteButtonDb';
        deleteBtn.title = 'Delete tag from database';
        deleteBtn.innerHTML = `<svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="16" height="16" viewBox="0 0 32 32"><path d="M12 12H14V24H12zM18 12H20V24H18z"></path><path d="M4 6V8H6V28a2 2 0 002 2H24a2 2 0 002-2V8h2V6zM8 28V8H24V28zM12 2H20V4H12z"></path></svg>`;
        deleteBtn.style.color = contrastColor;
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleDeleteTag(tag);
        });
        tagDelete.appendChild(deleteBtn);
        tagContents.appendChild(tagDelete);

        // Add edit functionality on click for non-delete area
        tagPill.addEventListener('click', (e) => {
            // Ensure the click wasn't on the delete button itself
            if (!e.target.closest('.tagDeleteButtonDb')) {
                showTagEditModal(tag);
            }
        });
        tagPill.style.cursor = 'pointer'; // Indicate clickable for edit
    }

    tagPill.appendChild(tagContents);

    // Add double-click listener for adding tags to selected images (only in manager)
    if (!imageId && !isRemovable && tag.name.toLowerCase() !== 'hidden') {
        tagPill.addEventListener('dblclick', (e) => {
            if (e.target.closest('.tagDeleteButtonDb')) return; // Don't trigger if delete was clicked
            const selectedIds = Array.from(state.management.selectedImageIds);
            if (selectedIds.length > 0) {
                handleAddTagToImages(tag, selectedIds);
            } else {
                 alert("Select one or more images in the table first, then double-click a tag to add it.");
            }
        });
         tagPill.title = 'Click to edit, Double-click to add to selected images';
    }

    return tagPill;
}

/**
 * Displays tags in the tag manager section
 * Used by Image Management User Story 11 for tag management
 */
export function displayTagsInManager(tags = state.tags) {
    if (!dom.tagManagerList) return;

    dom.tagManagerList.innerHTML = ''; // Clear existing tags
    if (!tags || tags.length === 0) {
        dom.tagManagerList.innerHTML = '<p>No tags defined.</p>'; // Placeholder message
        return;
    }

    tags.forEach(tag => {
        const isHiddenTag = tag.name === PROTECTED_TAGS.HIDDEN;
        // Pass 'true' for isEditable if it's NOT the hidden tag
        const tagElement = createTagPill(tag, !isHiddenTag, !isHiddenTag); // Allow edit/delete if not hidden
        if (tagElement) {
            dom.tagManagerList.appendChild(tagElement);
        }
    });
}

/**
 * Handles adding a new tag
 * Implements Image Management User Story 11:
 * - Create new tag
 * - Assign color from list
 * - Apply to selected images
 * - Validate tag name
 */
async function handleAddNewTag(event) {
    event.preventDefault();
    if (!dom.newTagNameInput) return;

    const tagName = dom.newTagNameInput.value.trim();
    if (!tagName) {
        handleError(new Error('Tag name cannot be empty'), ErrorTypes.VALIDATION);
        return;
    }

    // Check for duplicate tag name (case-insensitive)
    if (state.tags.some(tag => tag.name.toLowerCase() === tagName.toLowerCase())) {
        handleError(new Error(`Tag "${tagName}" already exists`), ErrorTypes.VALIDATION);
        return;
    }

    // Check for protected tag names
    if (tagName.toLowerCase() === PROTECTED_TAGS.HIDDEN.toLowerCase() || 
        tagName.toLowerCase() === PROTECTED_TAGS.ALL.toLowerCase()) {
        handleError(new Error(`Cannot create protected tag "${tagName}"`), ErrorTypes.VALIDATION);
        return;
    }

    // Determine next color
    let colorIndex = parseInt(localStorage.getItem('nextTagColorIndex') || '0', 10);
    const tagColor = BACKGROUND_COLORS[colorIndex % BACKGROUND_COLORS.length];
    const nextIndex = (colorIndex + 1) % BACKGROUND_COLORS.length;
    localStorage.setItem('nextTagColorIndex', nextIndex.toString());

    try {
        const newTag = await createTag({ name: tagName, color: tagColor });
        console.log('New tag added:', newTag);
        dom.newTagForm.reset();

        // Add tag to selected images if any
        const selectedIds = Array.from(state.management.selectedImageIds);
        if (selectedIds.length > 0) {
            await handleAddTagToImages(newTag, selectedIds);
        }

        await refreshManageData();
    } catch (error) {
        handleError(error, ErrorTypes.SERVER);
    }
}

/**
 * Handles adding a tag to selected images
 * Used by Image Management User Story 11 for bulk tag operations
 */
async function handleAddTagToImages(tag, imageIds) {
    if (!tag || !imageIds || imageIds.length === 0) {
        handleError(new Error('Invalid tag or image selection'), ErrorTypes.VALIDATION);
        return;
    }

    try {
        await addTagToImages(imageIds, tag.name);
        await refreshManageData();
    } catch (error) {
        handleError(error, ErrorTypes.SERVER);
    }
}

/**
 * Handles removing a tag from a single image
 * Implements Image Management User Story 8:
 * - Remove tag from image
 * - Update UI after removal
 */
async function handleRemoveTagFromImage(tag, imageId) {
    if (!tag || !imageId) {
        handleError(new Error('Invalid tag or image'), ErrorTypes.VALIDATION);
        return;
    }

    try {
        await removeTagFromImages([imageId], tag.name);
        await refreshManageData();
    } catch (error) {
        handleError(error, ErrorTypes.SERVER);
    }
}

/**
 * Handles deleting a tag from the database
 * Implements Image Management User Story 11:
 * - Delete tag from database
 * - Remove from all images
 * - Confirm before deletion
 */
async function handleDeleteTag(tag) {
    if (tag.name.toLowerCase() === PROTECTED_TAGS.HIDDEN.toLowerCase()) {
        handleError(new Error('Cannot delete protected tag "Hidden"'), ErrorTypes.VALIDATION);
        return;
    }

    if (!confirm(`Delete tag "${tag.name}" from the database? This will remove it from all images and cannot be undone.`)) {
        return;
    }

    try {
        await deleteTag(tag.id);
        await refreshManageData();
    } catch (error) {
        handleError(error, ErrorTypes.SERVER);
    }
}

/**
 * Attaches event listeners for tag manager controls
 * Implements Image Management User Story 11:
 * - Tag manager toggle
 * - New tag form
 * - Tag action buttons
 * - Double-click handlers
 */
export function attachTagManagerEventListeners() {
    // Tag Manager Toggle Button
    if (dom.tagManagerToggle && dom.tagManagerList && dom.newTagForm) {
        dom.tagManagerToggle.addEventListener('click', () => {
             const isActive = dom.tagManagerToggle.classList.toggle('active');
             dom.tagManagerList.style.display = isActive ? 'flex' : 'none'; // Changed to flex
             dom.newTagForm.style.display = isActive ? 'flex' : 'none';
             if (isActive) {
                 displayTagsInManager(state.tags || []); // Refresh manager view
                 // Close playlist manager if open
                 if (dom.playlistManagerSection && dom.playlistManagerToggle) {
                     dom.playlistManagerSection.style.display = 'none';
                     dom.playlistManagerToggle.classList.remove('active');
                 }
             }
        });
    }

    // New Tag Form Submit
    if (dom.newTagForm) {
        dom.newTagForm.addEventListener('submit', handleAddNewTag);
    }

    // Use event delegation for tag action buttons
    if (dom.tagManagerList) {
        dom.tagManagerList.addEventListener('click', handleTagActionClick);
    }

    // Note: Listeners for individual tag pills (edit, delete, double-click add)
    // are added dynamically within createTagPill.
}

/**
 * Handles clicks on tag action buttons
 * Used by Image Management User Story 11 for tag operations
 */
async function handleTagActionClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const tagPill = button.closest('.tag-pill[data-tag-id]');
    const tagId = parseInt(tagPill?.dataset.tagId, 10);
    const action = button.dataset.action;

    if (!tagId || !action) {
        console.warn('[TagManager] Could not determine action or tag ID.');
        return;
    }

    // Find the tag data from the state
    const tag = state.tags.find(t => t.id === tagId);
    if (!tag) {
        console.error(`[TagManager] Tag data not found for ID ${tagId}.`);
        return;
    }

    // Prevent actions on the protected 'Hidden' tag
    if (tag.name === PROTECTED_TAGS.HIDDEN) {
        alert(`Cannot ${action} the protected tag '${PROTECTED_TAGS.HIDDEN}'.`);
        return;
    }

    console.log(`[TagManager] Action '${action}' on tag ID ${tagId}`);

    if (action === 'edit') {
        showTagEditModal(tag); // Pass the tag object to the modal function
    } else if (action === 'delete') {
        if (confirm(`Are you sure you want to delete the tag "${tag.name}"? This will remove it from all associated images.`)) {
            button.disabled = true;
            try {
                await deleteTag(tagId);
                await refreshManageData(); // Refresh data
            } catch (error) {
                console.error(`[TagManager] Error deleting tag ID ${tagId}:`, error);
                alert(`Failed to delete tag: ${error.message}`);
                button.disabled = false; // Re-enable on error
            }
        }
    }
}

/**
 * Initializes the tag manager
 * Sets up tag management functionality based on user stories
 */
export function initTagManager() {
    console.log('[TagManager] Initializing...');
    // Display initial tags - manage.js calls displayTagsInManager via refreshManageData
    // Attach listeners - manage.js calls attachTagManagerEventListeners
}

// Workaround functions since the direct API functions don't exist
/**
 * Adds a tag to multiple images
 * @param {string[]} imageIds - Array of image IDs to add the tag to
 * @param {string} tagName - Name of the tag to add
 */
async function addTagToImages(imageIds, tagName) {
    console.log(`Adding tag "${tagName}" to ${imageIds.length} images`);
    
    if (!imageIds.length || !tagName) {
        throw new Error('Invalid parameters for adding tag to images');
    }
    
    // Get the tag ID by name
    const tag = state.tags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
    if (!tag || !tag.id) {
        throw new Error(`Tag "${tagName}" not found`);
    }
    
    // Create an array of promises for each image update
    const updatePromises = imageIds.map(imageId => {
        // Find the image in state
        const image = state.management.displayedImages.find(img => img.id === imageId);
        if (!image) {
            console.warn(`Image ID ${imageId} not found in state`);
            return Promise.resolve(); // Skip this image
        }
        
        // Check if image already has this tag
        const imageTagIds = image.tagIds || [];
        if (imageTagIds.includes(tag.id)) {
            console.log(`Image ID ${imageId} already has tag "${tagName}"`);
            return Promise.resolve(); // Skip this image
        }
        
        // Add the tag ID to the image's tag IDs
        const updatedTagIds = [...imageTagIds, tag.id];
        
        // Update the image with the new tag IDs
        return updateImage(imageId, { tagIds: updatedTagIds });
    });
    
    // Wait for all updates to complete
    await Promise.all(updatePromises.filter(p => p)); // Filter out undefined promises
    console.log(`Tag "${tagName}" added to selected images`);
}

/**
 * Removes a tag from multiple images
 * @param {string[]} imageIds - Array of image IDs to remove the tag from
 * @param {string} tagName - Name of the tag to remove
 */
async function removeTagFromImages(imageIds, tagName) {
    console.log(`Removing tag "${tagName}" from ${imageIds.length} images`);
    
    if (!imageIds.length || !tagName) {
        throw new Error('Invalid parameters for removing tag from images');
    }
    
    // Get the tag ID by name
    const tag = state.tags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
    if (!tag || !tag.id) {
        throw new Error(`Tag "${tagName}" not found`);
    }
    
    // Create an array of promises for each image update
    const updatePromises = imageIds.map(imageId => {
        // Find the image in state
        const image = state.management.displayedImages.find(img => img.id === imageId);
        if (!image) {
            console.warn(`Image ID ${imageId} not found in state`);
            return Promise.resolve(); // Skip this image
        }
        
        // Check if image has this tag
        const imageTagIds = image.tagIds || [];
        if (!imageTagIds.includes(tag.id)) {
            console.log(`Image ID ${imageId} does not have tag "${tagName}"`);
            return Promise.resolve(); // Skip this image
        }
        
        // Remove the tag ID from the image's tag IDs
        const updatedTagIds = imageTagIds.filter(id => id !== tag.id);
        
        // Update the image with the new tag IDs
        return updateImage(imageId, { tagIds: updatedTagIds });
    });
    
    // Wait for all updates to complete
    await Promise.all(updatePromises.filter(p => p)); // Filter out undefined promises
    console.log(`Tag "${tagName}" removed from selected images`);
} 