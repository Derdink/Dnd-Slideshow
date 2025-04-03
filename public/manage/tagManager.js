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
 * Creates a tag pill element aligned with Carbon Design System, with custom colors.
 * Implements Image Management User Story 11 & 8.
 * @param {object} tag - The tag object { id, name, color }.
 * @param {number|null} [imageId=null] - The ID of the image this tag belongs to (if displayed in table). Null if in manager.
 * @param {boolean} [isRemovable=false] - True if the tag is displayed on an image and can be removed from it.
 * @returns {HTMLElement|null} The created tag pill element (span.bx--tag), or null on error.
 */
export function createTagPill(tag, imageId = null, isRemovable = false) {
    if (!tag || typeof tag.name !== 'string') {
        console.error('Invalid tag data provided to createTagPill:', tag);
        return null;
    }

    // Use <span> for the tag element, align with Carbon
    const tagPill = document.createElement('span');
    tagPill.classList.add('bx--tag', 'bx--tag--custom'); // Base Carbon class + our custom modifier
    tagPill.setAttribute('data-tag-id', tag.id); // Store tag ID

    // Apply special class for Hidden tag
    const isHiddenTag = tag.name.toLowerCase() === HIDDEN_TAG_NAME.toLowerCase();
    if (isHiddenTag) {
        tagPill.classList.add('bx--tag--gray', 'hidden-tag'); // Use a Carbon gray variant for hidden
        tagPill.title = 'Hidden images are excluded from slideshow unless played directly';
    }

    // Apply custom tag color and get contrast color for text/icons
    const tagColor = tag.color || DEFAULT_TAG_COLOR;
    const contrastColor = getContentColorForBackground(tagColor);

    // Apply color styles directly ONLY if it's not the Hidden tag (which uses Carbon gray)
    if (!isHiddenTag) {
        tagPill.style.setProperty('--tag-background-color', tagColor);
        tagPill.style.setProperty('--tag-text-color', contrastColor);
        // Add inline styles for background/color override
        tagPill.style.backgroundColor = tagColor;
        tagPill.style.color = contrastColor;
    } else {
        // Ensure Hidden tag uses Carbon's gray styles predominantly
        // Contrast color might still be needed if default Carbon gray text isn't right
         tagPill.style.setProperty('--tag-text-color', '#161616'); // Default dark text for gray
    }


    // Add the tag name
    const tagNameElem = document.createElement('span');
    // tagNameElem.classList.add('bx--tag__label'); // Carbon's internal label class (optional)
    tagNameElem.textContent = tag.name;
    tagPill.appendChild(tagNameElem);

    // --- Action Buttons (using Carbon structure) ---
    const closeSVG = `<svg focusable="false" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true"><path d="M24 9.4L22.6 8 16 14.6 9.4 8 8 9.4l6.6 6.6L8 22.6 9.4 24l6.6-6.6 6.6 6.6 1.4-1.4-6.6-6.6L24 9.4z"></path></svg>`;
    const deleteSVG = `<svg focusable="false" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="16" height="16" viewBox="0 0 32 32"><path d="M12 12H14V24H12zM18 12H20V24H18z"></path><path d="M4 6V8H6V28a2 2 0 002 2H24a2 2 0 002-2V8h2V6zM8 28V8H24V28zM12 2H20V4H12z"></path></svg>`;

    // Scenario 1: Tag on an image in the table
    if (isRemovable && imageId) {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.classList.add('bx--tag__close-icon');
        removeBtn.title = 'Remove tag from image';
        removeBtn.innerHTML = closeSVG;
        removeBtn.style.color = 'inherit';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleRemoveTagFromImage(tag, imageId);
        });
        tagPill.appendChild(tagNameElem);
        tagPill.appendChild(removeBtn);
        tagPill.classList.add('bx--tag--filter');
    }
    // Scenario 2: Tag in the manager
    else if (!imageId && !isRemovable) {
        // Add "Remove from Selected" button for ALL tags (including Hidden)
        const removeFromSelectedBtn = document.createElement('button');
        removeFromSelectedBtn.type = 'button';
        removeFromSelectedBtn.classList.add('bx--tag__close-icon', 'remove-from-selected-btn');
        removeFromSelectedBtn.title = `Remove tag "${tag.name}" from selected images`;
        removeFromSelectedBtn.innerHTML = closeSVG;
        removeFromSelectedBtn.style.color = 'inherit';
        removeFromSelectedBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const selectedIds = Array.from(state.management.selectedImageIds);
            console.log('[TagManager RemoveClick] Current selection before removeTagFromImages:', selectedIds);
            if (selectedIds.length > 0) {
                removeFromSelectedBtn.disabled = true;
                try {
                    await removeTagFromImages(selectedIds, tag.name);
                    await refreshManageData();
                    state.management.selectedImageIds.clear();
                    console.log('[TagManager RemoveClick] Cleared selection after removing tag.');
                } catch (error) { handleError(error, ErrorTypes.SERVER); }
                finally { removeFromSelectedBtn.disabled = false; }
            } else { console.log('[TagManager RemoveClick] No images selected.'); }
        });
        tagPill.appendChild(removeFromSelectedBtn); // Append BEFORE name

        tagPill.appendChild(tagNameElem); // Append name AFTER remove button

        // Add "Delete from DB" button ONLY IF NOT HIDDEN TAG
        if (!isHiddenTag) {
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.classList.add('bx--tag__close-icon');
            deleteBtn.title = 'Delete tag from database';
            deleteBtn.innerHTML = deleteSVG;
            deleteBtn.style.color = 'inherit';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                handleDeleteTag(tag);
            });
            tagPill.appendChild(deleteBtn);
        }

        // Add main click listener for Add-to-Selected for ALL TAGS (including Hidden)
        tagPill.addEventListener('click', async (e) => {
            if (!e.target.closest('button')) {
                const selectedIds = Array.from(state.management.selectedImageIds);
                console.log('[TagManager AddClick] Current selection before handleAddTagToImages:', selectedIds);
                if (selectedIds.length > 0) {
                    try {
                        await handleAddTagToImages(tag, selectedIds);
                        state.management.selectedImageIds.clear();
                        await refreshManageData();
                    } catch (error) { /* Handled in called function */ }
                } else if (!isHiddenTag) { // Only open edit modal if NOT hidden and no images selected
                    showTagEditModal(tag);
                }
            }
        });
        tagPill.style.cursor = 'pointer';
        tagPill.title = isHiddenTag
            ? 'Click to Add "Hidden" Tag to Selected Images'
            : 'Click to Edit (or Add to Selected Images)';
        tagPill.classList.add('bx--tag--filter');
    }
    // Scenario 3: Default fallback (e.g., hidden tag in table if not removable)
    else {
        tagPill.appendChild(tagNameElem);
    }

    return tagPill;
}

/**
 * Displays tags in the tag manager section
 * Used by Image Management User Story 11 for tag management
 */
export function displayTagsInManager(tags = state.tags) {
    if (!dom.tagManagerList) {
         console.warn("Tag manager list element not found.");
         return;
    }

    dom.tagManagerList.innerHTML = ''; // Clear existing tags
    const validTags = tags?.filter(tag => tag && typeof tag.name === 'string') || [];

    if (validTags.length === 0) {
        dom.tagManagerList.innerHTML = '<p class="bx--type-body-short-01">No tags defined.</p>'; // Use Carbon type class
        return;
    }

    // Sort tags alphabetically, handling potential undefined names safely
    validTags.sort((a, b) => a.name.localeCompare(b.name));

    validTags.forEach(tag => {
        // Pass isRemovable=false as these are manager tags
        const tagElement = createTagPill(tag, null, false);
        if (tagElement) { // Check if pill creation was successful
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
        const newTag = await createTag(tagName, tagColor);
        console.log('[handleAddNewTag] New tag created:', newTag);
        
        if (!newTag || typeof newTag.id === 'undefined' || typeof newTag.name !== 'string') {
             console.error('[handleAddNewTag] Invalid newTag object received from API:', newTag);
             handleError(new Error('Failed to process newly created tag data.'), ErrorTypes.SERVER);
             return; // Stop if the tag object is invalid
        }

        dom.newTagForm.reset();

        const selectedIds = Array.from(state.management.selectedImageIds);
        console.log('[handleAddNewTag] Selected IDs before applying new tag:', selectedIds);

        if (selectedIds.length > 0) {
            console.log(`[handleAddNewTag] Applying newly created tag "${newTag.name}" (ID: ${newTag.id}) to ${selectedIds.length} selected images.`);
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
    console.log('[handleAddTagToImages] Called with Tag:', tag, 'Image IDs:', imageIds);

    if (!tag || !imageIds || imageIds.length === 0) {
        console.warn('[handleAddTagToImages] Invalid tag or image selection passed.');
        return; // Just return if invalid input
    }
    
    // Validate tag object has necessary properties
    if (typeof tag.id === 'undefined' || typeof tag.name !== 'string') {
        console.error('[handleAddTagToImages] Invalid tag object structure:', tag);
        // Consider throwing an error or returning early
        return;
    }

    const updatePromises = imageIds.map(imageId => {
        console.log(`[handleAddTagToImages Loop] Processing imageId: ${imageId}`);
        
        const image = state.management.displayedImages.find(img => img.id === imageId);
        console.log(`[handleAddTagToImages Loop] Found image object for ID ${imageId}:`, image);

        if (!image) {
            console.warn(`[addTagToImages] Image ID ${imageId} not found in state`);
            return Promise.resolve(); // Skip this one
        }
        
        const imageTagIds = image.tagIds || [];
        if (imageTagIds.includes(tag.id)) {
            console.log(`[addTagToImages] Image ID ${imageId} already has tag "${tag.name}"`);
            return Promise.resolve(); // Skip update if tag already present
        }
        
        const updatedTagIds = [...imageTagIds, tag.id];
        
        const updateData = {
            title: image.title,
            description: image.description || '',
            tagIds: updatedTagIds
        };
        console.log(`[handleAddTagToImages Loop] Calling updateImage for ID ${imageId} with data:`, updateData);
        
        // Add individual try/catch for updateImage if needed, though Promise.all catches failures
        return updateImage(imageId, updateData);
    });
    
    try {
        const results = await Promise.all(updatePromises.filter(p => p)); // Filter out skipped promises
        console.log('[handleAddTagToImages] Promise.all results (length indicates successful updates):', results.length);
        console.log(`Tag "${tag.name}" add process completed for selected images.`);
    } catch (error) {
         console.error(`[handleAddTagToImages] Error during Promise.all execution while adding tag "${tag.name}":`, error);
         handleError(error, ErrorTypes.SERVER); // Handle error from Promise.all
         // Re-throw if the caller needs to know about the failure?
         // throw error;
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
    // Tag Manager Toggle - REMOVED (handled by manage.js)
    // if (dom.tagManagerToggle && dom.tagManagerSection) { ... }
    
    // Add New Tag Form
    if (dom.newTagForm) {
        dom.newTagForm.addEventListener('submit', handleAddNewTag);
    }

    // Tag List Event Delegation for actions
    if (dom.tagManagerList) {
        dom.tagManagerList.addEventListener('click', handleTagActionClick);
    }
    
    // Drag and Drop listeners for tags (if implementing)
    // ...
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
        const image = state.management.displayedImages.find(img => img.id === imageId);
        if (!image) {
            console.warn(`[addTagToImages] Image ID ${imageId} not found in state`);
            return Promise.resolve();
        }
        
        const imageTagIds = image.tagIds || [];
        if (imageTagIds.includes(tag.id)) {
            console.log(`[addTagToImages] Image ID ${imageId} already has tag "${tagName}"`);
            return Promise.resolve();
        }
        
        const updatedTagIds = [...imageTagIds, tag.id];
        
        // FIX: Include title and description when calling updateImage
        const updateData = {
            title: image.title, // Include current title
            description: image.description || '', // Include current description
            tagIds: updatedTagIds // Include updated tags
        };
        console.log(`[addTagToImages] Updating image ${imageId} with data:`, updateData); // Log update data
        return updateImage(imageId, updateData);
    });
    
    await Promise.all(updatePromises.filter(p => p));
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
        const image = state.management.displayedImages.find(img => img.id === imageId);
        if (!image) {
            console.warn(`[removeTagFromImages] Image ID ${imageId} not found in state`);
            return Promise.resolve();
        }
        
        const imageTagIds = image.tagIds || [];
        if (!imageTagIds.includes(tag.id)) {
            console.log(`[removeTagFromImages] Image ID ${imageId} does not have tag "${tagName}"`);
            return Promise.resolve();
        }
        
        const updatedTagIds = imageTagIds.filter(id => id !== tag.id);
        
        // FIX: Include title and description when calling updateImage
        const updateData = {
            title: image.title, // Include current title
            description: image.description || '', // Include current description
            tagIds: updatedTagIds // Include updated tags
        };
        console.log(`[removeTagFromImages] Updating image ${imageId} with data:`, updateData); // Log update data
        return updateImage(imageId, updateData);
    });
    
    await Promise.all(updatePromises.filter(p => p));
    console.log(`Tag "${tagName}" removed from selected images`);
} 