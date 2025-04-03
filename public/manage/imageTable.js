// public/manage/imageTable.js
// Logic for rendering and interacting with the main image table

import { state, updateState } from '../state.js';
import { deleteImageById, bulkDeleteImages, playImageAPI } from '../api.js';
import { showImageEditModal } from './modals.js';
import { createTagPill } from './tagManager.js';
import { refreshManageData } from '../manage.js';
import { formatDateAdded } from './utils.js'; // Assuming utils.js exists or will be created
import { setSort } from './imageManager.js'; // Import the setSort function

// DOM elements cached by parent manage.js module
let dom = {};

export function setImageTableDOMCache(cachedDom) {
    dom = cachedDom;
}

/**
 * Displays images in the main table.
 * @param {Array<object>} images - Array of image objects to display.
 */
export function displayImagesInTable(images) {
    const tbody = dom.imageTableBody;
    if (!tbody) {
        console.error('[ImageTable] Table body not found in DOM cache!');
        return;
    }
    console.log('[ImageTable] Target tbody element:', tbody);
    console.log(`[ImageTable] tbody is connected: ${tbody.isConnected}`);
    
    console.log(`[ImageTable] displayImagesInTable called with ${images?.length || 0} images.`);
    
    // Clear existing rows
    tbody.innerHTML = '';
    console.log('[ImageTable] Table body cleared.');

    // *** LOG: Inspect the entire images array ***
    console.log('[ImageTable] displayImagesInTable received array (first 5 stringified):', JSON.stringify(images?.slice(0, 5), null, 2));
    console.log('[ImageTable] Full images array object:', images);

    if (!images || images.length === 0) {
        console.log('[ImageTable] No images to display, adding empty row.');
        // Optionally add a row indicating no images found
        const emptyRow = tbody.insertRow();
        const cell = emptyRow.insertCell();
        cell.colSpan = 6; // Adjust colspan based on the number of columns
        cell.textContent = 'No images found matching the criteria.';
        cell.style.textAlign = 'center';
        cell.style.padding = 'var(--cds-spacing-05)';
        return;
    }

    // Process and append rows for each image
    images.forEach((image, index) => {
        // *** LOG: Check the individual image object *before* the try...catch ***
        console.log(`[ImageTable Loop PRE-TRY] Processing index ${index}, ID: ${image?.id}. Image object:`, image);
        console.log(`[ImageTable Loop PRE-TRY] Stringified Image object:`, JSON.stringify(image, null, 2));

        console.log(`[ImageTable] Processing image index ${index}, ID: ${image?.id}`);
        try {
            const row = createImageRow(image);
            // *** LOG: Log the returned row element *** (Log moved from previous step)
            console.log(`[ImageTable] createImageRow returned:`, row);
            
            if (row instanceof HTMLTableRowElement) {
                console.log(`[ImageTable] Row created for image ID: ${image.id}. Appending...`);
                tbody.appendChild(row);
                console.log(`[ImageTable] Row appended for image ID: ${image.id}.`);
            } else {
                // Log if it's not a row element or null/undefined
                console.warn(`[ImageTable] Failed to create a valid row element for image index ${index}, ID: ${image?.id}. Return value:`, row);
            }
        } catch (error) {
            console.error(`[ImageTable] Error creating/appending row for image index ${index}, ID: ${image?.id}:`, error);
        }
    });

    updateHeaderCheckboxState(images.length);
    console.log('[ImageTable] Finished processing all images loop.');
    console.log(`[ImageTable] Current tbody innerHTML length after loop: ${tbody.innerHTML.length}`);

    setTimeout(() => {
        console.log(`[ImageTable] Delayed Check: tbody innerHTML length (100ms later): ${tbody.innerHTML.length}`);
        if (tbody.children.length !== images.length && images.length > 0) {
             console.warn(`[ImageTable] Delayed Check: Row count mismatch! Expected ${images.length}, found ${tbody.children.length}. Something might have cleared the table.`);
        }
    }, 100);
}

/**
 * Creates a table row element (<tr>) for a given image object, styled with Carbon classes.
 * @param {object} image - The image object with properties like id, thumbnailUrl, title, description, tags, dateAdded.
 * @returns {HTMLTableRowElement} The created table row element.
 */
function createImageRow(image) {
    console.log(`[ImageTable - createImageRow] Received image data:`, image);
    
    const row = document.createElement('tr');
    row.className = 'bx--table-row bx--parent-row'; // Add Carbon row class
    row.setAttribute('data-image-id', image.id); // Keep data attribute for identification
    // Add selection state if needed (based on global state)
    if (state.management.selectedImageIds.has(image.id)) {
        row.classList.add('bx--data-table--selected');
        row.setAttribute('data-selected', 'true');
    }

    // 1. Selection Checkbox Cell
    const cellSelect = document.createElement('td');
    cellSelect.className = 'bx--table-cell bx--table-cell-checkbox';
    cellSelect.innerHTML = `
        <div class="bx--checkbox-wrapper">
            <input id="checkbox-${image.id}" class="bx--checkbox row-select-checkbox" type="checkbox" value="${image.id}" name="selectRow" ${state.management.selectedImageIds.has(image.id) ? 'checked' : ''}>
            <label for="checkbox-${image.id}" class="bx--checkbox-label" aria-label="Select row ${image.id}">
                <!-- Visual checkbox representation -->
            </label>
        </div>
    `;
    row.appendChild(cellSelect);

    // 2. Thumbnail Cell
    const cellThumb = createCell('bx--table-cell'); // Use helper, add base class
    const thumbImg = document.createElement('img');
    thumbImg.src = image.thumbnailUrl || 'placeholder.png'; // Handle missing thumbnail
    thumbImg.alt = image.title;
    thumbImg.classList.add('image-thumbnail');
    thumbImg.loading = 'lazy'; // Lazy load thumbnails
    thumbImg.onerror = (e) => { 
        e.target.onerror = null; // Prevent infinite loops
        e.target.src='icons/error_file.svg'; // Display fallback icon
        e.target.classList.add('thumbnail-error');
    };
    cellThumb.appendChild(thumbImg);
    row.appendChild(cellThumb);

    // 3. Title Cell
    const cellTitle = createCell('bx--table-cell', image.title);
    row.appendChild(cellTitle);

    // 4. Tags Cell
    const cellTags = createCell('bx--table-cell tags-cell');
    const tagContainer = document.createElement('div');
    tagContainer.className = 'tag-container-in-table';

    if (image.tags && Array.isArray(image.tags)) {
        image.tags.forEach(tag => {
            // Pass true for isRemovable as these are tags on an image
            const pill = createTagPill(tag, image.id, true); 
            if (pill) { 
                tagContainer.appendChild(pill);
            }
        });
    } else {
        // Optional: Display something if no tags array
        // tagContainer.textContent = '-'; 
    }

    cellTags.appendChild(tagContainer);
    row.appendChild(cellTags);

    // 5. Date Added Cell
    const cellDate = createCell('bx--table-cell', formatDateAdded(image.dateAdded));
    row.appendChild(cellDate);

    // 6. Actions Cell
    const cellActions = createCell('bx--table-cell actions-cell');
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'actions-container-in-table'; // For potential flex layout

    // Edit Button (Carbon Ghost Icon Button)
    const editBtn = createActionButton(
        'bx--btn--ghost bx--btn--icon-only image-edit-btn',
        'Edit Image',
        () => showImageEditModal(image), // Assumes showImageEditModal is imported/available
        // Carbon Edit SVG
        '<svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true"><path d="M2 26H30V28H2zM25.4 9c.8-.8.8-2 0-2.8 0 0 0 0 0 0l-3.6-3.6c-.8-.8-2-.8-2.8 0 0 0 0 0 0 0l-15 15V24h6.4L25.4 9zM20.4 4L24 7.6l-3 3L17.4 7 20.4 4zM6 22v-3.6l10-10 3.6 3.6-10 10H6z"></path></svg>'
    );

    // Delete Button (Carbon Ghost Icon Button - Danger)
    const deleteBtn = createActionButton(
        'bx--btn--ghost bx--btn--icon-only image-delete-btn', // Added danger class
        'Delete Image',
        () => handleDeleteImage(image.id, image.title),
        // Carbon Delete SVG
        '<svg focusable="false" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true"><path d="M12 12H14V24H12zM18 12H20V24H18z"></path><path d="M4 6V8H6V28a2 2 0 002 2H24a2 2 0 002-2V8h2V6zM8 28V8H24V28zM12 2H20V4H12z"></path></svg>'
    );
    
    // Play Button (Carbon Ghost Icon Button)
    const playBtn = createActionButton(
        'bx--btn--ghost bx--btn--icon-only image-play-btn',
        'Play Image',
        () => handlePlayImage(image),
        // Carbon Play SVG
        '<svg focusable="false" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true"><path d="M7,28a1,1,0,0,1-1-1V5a1,1,0,0,1,1.4819-.8763l20,11a1,1,0,0,1,0,1.7527l-20,11A.998.998,0,0,1,7,28ZM8,6.6909V25.3091L24.926,16Z"></path></svg>'
    );


    actionsContainer.appendChild(editBtn);
    actionsContainer.appendChild(deleteBtn);
    actionsContainer.appendChild(playBtn);
    cellActions.appendChild(actionsContainer);
    row.appendChild(cellActions);

    console.log(`[ImageTable - createImageRow] Returning row element for ID ${image.id}:`, row);
    return row;
}

/**
 * Handles selection change for a single row checkbox.
 * @param {number} imageId - The ID of the image.
 * @param {boolean} isSelected - The new selection state.
 */
function handleRowSelectionChange(imageId, isSelected) {
    const selectedIds = state.management.selectedImageIds;
    if (isSelected) {
        selectedIds.add(imageId);
    } else {
        selectedIds.delete(imageId);
    }
    updateState('management', { selectedImageIds: new Set(selectedIds) }); // Update state

    // Update visual state of the row
    const row = dom.imageTableBody?.querySelector(`tr[data-image-id="${imageId}"]`);
    if (row) {
        row.classList.toggle('selected', isSelected);
    }

    updateHeaderCheckboxState();
}

/**
 * Handles selection change for the header checkbox (select/deselect all).
 */
function handleHeaderSelectionChange() {
    if (!dom.headerSelectCheckbox || !dom.imageTableBody) return;
    const isSelected = dom.headerSelectCheckbox.checked;
    const newSelectedIds = new Set();

    const rows = dom.imageTableBody.querySelectorAll('tr[data-image-id]');
    rows.forEach(row => {
        const imageId = parseInt(row.getAttribute('data-image-id'), 10);
        const checkbox = row.querySelector('input[type="checkbox"]');
        if (isSelected && !isNaN(imageId)) {
            newSelectedIds.add(imageId);
        }
        if (checkbox) {
            checkbox.checked = isSelected;
        }
        row.classList.toggle('selected', isSelected);
    });

    updateState('management', { selectedImageIds: newSelectedIds });
}

/**
 * Updates the state of the header checkbox (checked, indeterminate, unchecked).
 * @param {number} [rowCount] - The number of rows currently displayed in the table body.
 */
function updateHeaderCheckboxState(rowCount = -1) {
    if (!dom.headerSelectCheckbox) return;

    const numSelected = state.management.selectedImageIds.size;
    const totalRows = rowCount >= 0 ? rowCount : dom.imageTableBody?.querySelectorAll('tr[data-image-id]').length ?? 0;

    if (numSelected === 0 || totalRows === 0) {
        dom.headerSelectCheckbox.checked = false;
        dom.headerSelectCheckbox.indeterminate = false;
    } else if (numSelected === totalRows) {
        dom.headerSelectCheckbox.checked = true;
        dom.headerSelectCheckbox.indeterminate = false;
    } else {
        dom.headerSelectCheckbox.checked = false;
        dom.headerSelectCheckbox.indeterminate = true;
    }
}

/**
 * Handles clicking on a sortable table header.
 * @param {Event} event - The click event.
 */
function handleSortClick(event) {
    const header = event.target.closest('th[data-key]');
    if (!header || !header.classList.contains('sortable')) return;

    const newSortKey = header.getAttribute('data-key');
    let newSortDir = 'asc';

    const currentSortKey = state.management.sortKey;
    const currentSortDir = state.management.sortDirection;

    if (newSortKey === currentSortKey) {
        // Toggle direction if clicking the same key
        newSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
    } else {
        // Default to ascending for a new key
        newSortDir = 'asc';
    }

    // Update state and refresh data
    updateState('management', { sortKey: newSortKey, sortDirection: newSortDir, currentPage: 1 }); // Reset to page 1 on sort
    refreshManageData();
}

/**
 * Updates the visual indicators (Carbon classes) on sortable table headers.
 */
export function updateSortArrows() {
    if (!dom.imageTableHead) {
        console.warn("[ImageTable] Table head not found, cannot update sort arrows.");
        return;
    }
    const headers = dom.imageTableHead.querySelectorAll('th[data-sort-key]');
    const currentSortKey = state.management.sortKey;
    const currentSortDir = state.management.sortDirection;
    
    console.log(`[ImageTable] Updating sort arrows. Key: ${currentSortKey}, Dir: ${currentSortDir}`);

    headers.forEach(th => {
        const key = th.dataset.sortKey;
        // Clear existing sort classes
        th.classList.remove('bx--table-sort--active', 'bx--table-sort--ascending');
        // Note: Carbon doesn't seem to have an explicit descending class, 
        // active without ascending implies descending for their built-in handlers.

        if (key === currentSortKey) {
            th.classList.add('bx--table-sort--active');
            if (currentSortDir === 'asc') {
                th.classList.add('bx--table-sort--ascending');
                console.log(`[ImageTable] Added active/ascending classes to header for key: ${key}`);
            } else {
                console.log(`[ImageTable] Added active class (descending implied) to header for key: ${key}`);
            }
        }
    });
}

/**
 * Handles deleting a single image.
 * @param {number} id - The ID of the image to delete.
 * @param {string} title - The title of the image (for confirmation).
 */
async function handleDeleteImage(id, title) {
    if (confirm(`Are you sure you want to delete the image "${title}"?`)) {
        try {
            await deleteImageById(id);
            console.log(`Image ${id} deleted.`);
            // Remove from selection if it was selected
            const selectedIds = state.management.selectedImageIds;
            selectedIds.delete(id);
            updateState('management', { selectedImageIds: new Set(selectedIds) });

            await refreshManageData(); // Refresh the table
        } catch (error) {
            console.error(`Error deleting image ${id}:`, error);
            alert(`Failed to delete image: ${error.message}`);
        }
    }
}

/**
 * Handles deleting selected images in bulk.
 */
async function handleBulkDelete() {
    const selectedIds = Array.from(state.management.selectedImageIds);
    if (selectedIds.length === 0) {
        alert('Please select images to delete first.');
        return;
    }

    if (confirm(`Are you sure you want to delete ${selectedIds.length} selected image(s)?`)) {
        try {
            await bulkDeleteImages(selectedIds);
            console.log(`${selectedIds.length} images deleted.`);
            updateState('management', { selectedImageIds: new Set() }); // Clear selection
            await refreshManageData(); // Refresh the table
        } catch (error) {
            console.error('Error during bulk delete:', error);
            alert(`Failed to delete images: ${error.message}`);
        }
    }
}

/**
 * Attaches event listeners for the image table controls.
 */
export function attachImageTableEventListeners() {
    if (!dom.imageTableHead || !dom.imageTableBody) {
        console.warn('Image table head or body not cached. Listeners not attached.');
        return;
    }

    // --- Sort Listener --- 
    dom.imageTableHead.addEventListener('click', (event) => {
        const header = event.target.closest('th[data-sort-key]');
        if (header) {
            const sortKey = header.dataset.sortKey;
            console.log(`[ImageTable] Header clicked, setting sort key: ${sortKey}`);
            setSort(sortKey); // Call the imported sort function
        }
    });

    // --- Row Selection Checkbox Listener (Delegated) ---
    // Moved selection logic to imageManager.js
    /*
    dom.imageTableBody.addEventListener('change', (event) => {
        if (event.target.matches('.row-select-checkbox')) {
            const row = event.target.closest('tr[data-image-id]');
            const imageId = parseInt(row?.getAttribute('data-image-id'), 10);
            if (!isNaN(imageId)) {
                handleRowSelectionChange(imageId, event.target.checked);
            }
        }
    });
    */

    // --- Header Selection Checkbox Listener ---
    // Moved selection logic to imageManager.js
    /*
    if (dom.headerSelectCheckbox) {
        dom.headerSelectCheckbox.addEventListener('change', handleHeaderSelectionChange);
    }
    */

    // --- Row Action Button Listener (Delegated) ---
    // Moved action logic to imageManager.js 
    /* 
    dom.imageTableBody.addEventListener('click', async (event) => {
        // ... existing action button logic ...
    });
    */
}

/**
 * Initializes the image table functionality.
 */
export function initImageTable() {
    console.log('Initializing Image Table...');
    attachImageTableEventListeners();
    updateSortArrows(); // Initial sort arrow display
    // Initial display happens in refreshManageData
}

/**
 * Updates the visual state of the row selection based on state.
 */
export function updateRowSelectionVisuals() {
    if (!dom.imageTableBody) return;
    
    const selectedIds = state.management.selectedImageIds;
    const rows = dom.imageTableBody.querySelectorAll('tr[data-image-id]');
    
    rows.forEach(row => {
        const imageId = parseInt(row.getAttribute('data-image-id'), 10);
        const isSelected = selectedIds.has(imageId);
        
        // Update row visual state
        row.classList.toggle('selected', isSelected);
        
        // Update checkbox state
        const checkbox = row.querySelector('input[type="checkbox"]');
        if (checkbox) {
            checkbox.checked = isSelected;
        }
    });
    
    // Update header checkbox state
    updateHeaderCheckboxState();
}

/**
 * Helper function to create a table cell (<td>).
 * @param {string} className - CSS class(es) to add.
 * @param {string|Node} [content] - Text content or HTML Node to append.
 * @returns {HTMLTableCellElement}
 */
function createCell(className, content = '') {
    const cell = document.createElement('td');
    cell.className = className; // Set full class string
    if (typeof content === 'string') {
        cell.textContent = content;
    } else if (content instanceof Node) {
        cell.appendChild(content);
    }
    return cell;
}

/**
 * Helper function to create an action button (using Carbon styles).
 * @param {string} className - Additional CSS class(es) for the button.
 * @param {string} title - Tooltip/title text.
 * @param {function} onClick - Click handler function.
 * @param {string} svgHTML - Inner HTML string for the SVG icon.
 * @returns {HTMLButtonElement}
 */
function createActionButton(className, title, onClick, svgHTML) {
    const button = document.createElement('button');
    // Add base Carbon classes and specific classes
    button.className = `bx--btn ${className}`; 
    button.type = 'button';
    button.title = title;
    button.innerHTML = svgHTML; // Insert the SVG HTML
    button.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent row click if button is clicked
        onClick();
    });
    return button;
}

/**
 * Handles playing a single image via the API.
 */
async function handlePlayImage(image) {
    try {
        await playImageAPI(image);
        console.log(`Sent play request for image: ${image.title}`);
    } catch (err) {
        console.error('Error sending play request:', err);
        alert('Error sending play request.');
    }
}

// --- End of moved functions --- 