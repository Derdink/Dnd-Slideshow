// public/manage/imageTable.js
// Logic for rendering and interacting with the main image table

import { state, updateState } from '../state.js';
import { deleteImageById, bulkDeleteImages, playImageAPI } from '../api.js';
import { showImageEditModal } from './modals.js';
import { createTagPill } from './tagManager.js';
import { refreshManageData } from '../manage.js';
import { formatDateAdded } from './utils.js'; // Assuming utils.js exists or will be created

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
    if (!dom.imageTableBody) {
        console.warn('Image table body not cached.');
        return;
    }
    dom.imageTableBody.innerHTML = ''; // Clear existing rows

    if (!images || images.length === 0) {
        // Optional: Display a message if no images match filters
        const row = dom.imageTableBody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 6; // Span across all columns
        cell.textContent = 'No images found matching your criteria.';
        cell.style.textAlign = 'center';
        return;
    }

    images.forEach(image => {
        dom.imageTableBody.appendChild(createImageRow(image));
    });

    // Update header checkbox state
    updateHeaderCheckboxState(images.length);
}

/**
 * Creates a table row element (<tr>) for a given image object, styled with Carbon classes.
 * @param {object} image - The image object with properties like id, thumbnailUrl, title, description, tags, dateAdded.
 * @returns {HTMLTableRowElement} The created table row element.
 */
function createImageRow(image) {
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
    const cellTags = createCell('bx--table-cell tags-cell'); // Add class for styling tags
    const tagContainer = document.createElement('div');
    tagContainer.className = 'tag-container-in-table';
    (image.tags || []).forEach(tag => {
        const pill = createTagPill(tag, image.id, true); // Use existing tagManager helper
        tagContainer.appendChild(pill);
    });
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
        '<svg focusable="false" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true"><path d="M2 26H30V28H2zM25.4 9c.8-.8.8-2 0-2.8l-3.6-3.6c-.8-.8-2-.8-2.8 0l-15 15V24h6.4L25.4 9zm-3.6 0L25.4 12l-15 15H6.4v-4z"></path></svg>'
    );

    // Delete Button (Carbon Ghost Icon Button - Danger)
    const deleteBtn = createActionButton(
        'bx--btn--ghost bx--btn--icon-only bx--btn--danger image-delete-btn', // Added danger class
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
 * Updates the visual indicators (arrows) on sortable table headers.
 */
export function updateSortArrows() {
    if (!dom.imageTableHead) return;
    const headers = dom.imageTableHead.querySelectorAll('th.sortable[data-key]');
    const currentSortKey = state.management.sortKey;
    const currentSortDir = state.management.sortDirection;

    headers.forEach(th => {
        const key = th.getAttribute('data-key');
        let arrowSpan = th.querySelector('.sort-arrow'); // Use let
        // Ensure arrow span exists, create if not
        if (!arrowSpan) {
            arrowSpan = document.createElement('span');
            arrowSpan.classList.add('sort-arrow');
            th.appendChild(arrowSpan);
        }

        if (key === currentSortKey) {
            arrowSpan.textContent = currentSortDir === 'asc' ? '▲' : '▼';
            arrowSpan.style.opacity = '1';
        } else {
            arrowSpan.textContent = '▲'; // Default arrow
            arrowSpan.style.opacity = '0.3'; // Dim inactive arrows
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
    // Sorting
    if (dom.imageTableHead) {
        dom.imageTableHead.addEventListener('click', handleSortClick);
    }

    // Header checkbox
    if (dom.headerSelectCheckbox) {
        dom.headerSelectCheckbox.addEventListener('change', handleHeaderSelectionChange);
    }

    // Bulk delete button
    if (dom.bulkDeleteBtn) {
        dom.bulkDeleteBtn.addEventListener('click', handleBulkDelete);
    }

    // Note: Row-specific listeners (checkbox, delete, name click, dragstart)
    // are added dynamically within createImageRow.
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