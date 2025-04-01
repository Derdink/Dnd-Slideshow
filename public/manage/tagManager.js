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

    // Scenario 1: Tag on an image in the table (Removable)
    if (isRemovable && imageId && !isHiddenTag) {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.classList.add('bx--tag__close-icon');
        removeBtn.title = 'Remove tag from image';
        removeBtn.innerHTML = closeSVG;
        
        removeBtn.style.color = 'inherit'; // Inherit contrast color
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent other clicks
            handleRemoveTagFromImage(tag, imageId);
        });
        tagPill.appendChild(removeBtn);
        tagPill.classList.add('bx--tag--filter'); // Use filter style for removable tags
    }
    // Scenario 2: Tag in the manager (Deletable, Click-to-Edit/Add, Remove-from-Selected)
    else if (!imageId && !isRemovable && !isHiddenTag) {
        // NEW: Add "Remove from Selected" button (before name)
        const removeFromSelectedBtn = document.createElement('button');
        removeFromSelectedBtn.type = 'button';
        removeFromSelectedBtn.classList.add('bx--tag__close-icon', 'remove-from-selected-btn'); // Use close icon style
        removeFromSelectedBtn.title = 'Remove tag from selected images';
        removeFromSelectedBtn.innerHTML = closeSVG;
        removeFromSelectedBtn.style.color = 'inherit'; // Inherit contrast color
        

        removeFromSelectedBtn.addEventListener('click', async (e) => {
            e.stopPropagation(); // Prevent edit/add clicks
            const selectedIds = Array.from(state.management.selectedImageIds);
            if (selectedIds.length > 0) {
                console.log(`Attempting to remove tag "${tag.name}" from ${selectedIds.length} selected images.`);
                removeFromSelectedBtn.disabled = true; // Disable during operation
                try {
                    // Call the workaround function directly
                    await removeTagFromImages(selectedIds, tag.name);
                    await refreshManageData(); // Refresh to show changes
                } catch (error) {
                    console.error('Error removing tag from selected images:', error);
                    handleError(error, ErrorTypes.SERVER); // Use centralized error handler
                } finally {
                     removeFromSelectedBtn.disabled = false;
                }
            } else {
                console.log('Remove from selected: No images selected.');
                // Optionally provide feedback that nothing is selected
            }
        });
        tagPill.appendChild(removeFromSelectedBtn); // Append BEFORE name

        // Add the tag name (after the remove button)
        tagPill.appendChild(tagNameElem);

        // MODIFIED: Change icon for Delete from DB button
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.classList.add('bx--tag__close-icon'); // Keep same class for layout
        deleteBtn.title = 'Delete tag from database';
        deleteBtn.innerHTML = deleteSVG; // USE DELETE ICON
        deleteBtn.style.color = 'inherit'; // Inherit contrast color

        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent edit/add clicks
            handleDeleteTag(tag);
        });
        tagPill.appendChild(deleteBtn); // Append AFTER name

        // MODIFIED: Single click listener for Add or Edit
        tagPill.addEventListener('click', async (e) => {
            // Ensure click wasn't on any button
            if (!e.target.closest('button')) {
                const selectedIds = Array.from(state.management.selectedImageIds);
                if (selectedIds.length > 0) {
                    // Add tag to selected images
                    console.log(`Attempting to add tag "${tag.name}" to ${selectedIds.length} selected images.`);
                    // Optionally disable the whole pill briefly?
                    try {
                        await handleAddTagToImages(tag, selectedIds); // Use existing handler
                        // Clear selection after adding
                        state.management.selectedImageIds.clear();
                        await refreshManageData(); // Refresh table to show changes and clear selection visuals
                        console.log(`Tag "${tag.name}" added and selection cleared.`);
                    } catch (error) { 
                        console.error('Error adding tag to selected images:', error);
                        // Error already handled in handleAddTagToImages via withErrorHandling
                    }
                } else {
                    // No images selected, open edit modal
                    showTagEditModal(tag);
                }
            }
        });
        tagPill.style.cursor = 'pointer'; // Indicate clickable
        tagPill.title = 'Click to Edit (or Add to Selected Images)'; // Update title

        tagPill.classList.add('bx--tag--filter');
    }
    // Scenario 3: Hidden tag in manager or non-removable tag in table
    else {
         tagPill.appendChild(tagNameElem); // Just add the name
         // ... (existing title logic for hidden tag)
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
    if (dom.tagManagerToggle && dom.tagManagerContainer) { // Check for container
        dom.tagManagerToggle.addEventListener('click', () => {
             const isActive = dom.tagManagerToggle.classList.toggle('active');
             dom.tagManagerContainer.style.display = isActive ? 'block' : 'none'; // Toggle container

             if (isActive) {
                 displayTagsInManager(state.tags || []); // Refresh manager view
                 // Close playlist manager if open
                 if (dom.playlistManagerSection && dom.playlistManagerToggle) {
                     dom.playlistManagerSection.style.display = 'none';
                     dom.playlistManagerToggle.classList.remove('active');
                 }
             }
        });
    } else {
        console.warn('Tag Manager Toggle or Container not found in DOM cache.');
    }

    // New Tag Form Submit
    if (dom.newTagForm) {
        dom.newTagForm.addEventListener('submit', handleAddNewTag);
    } else {
        console.warn('New Tag Form not found in DOM cache.');
    }

    // Use event delegation for tag action buttons (like delete)
    if (dom.tagManagerList) {
        // This listener might need adjustment if actions aren't on buttons
        // Currently handled in createTagPill
        // dom.tagManagerList.addEventListener('click', handleTagActionClick);
    } else {
        console.warn('Tag Manager List not found in DOM cache.');
    }
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