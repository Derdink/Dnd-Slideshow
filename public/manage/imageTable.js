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
 * Creates a single table row (<tr>) for an image.
 * @param {object} image - The image object.
 * @returns {HTMLTableRowElement} The created table row element.
 */
function createImageRow(image) {
    const row = document.createElement('tr');
    row.setAttribute('data-image-id', image.id);
    row.setAttribute('draggable', true); // Make row draggable
    if (state.management.selectedImageIds.has(image.id)) {
        row.classList.add('selected');
    }

    // --- Create Cells ---

    // 1. Select Checkbox
    const cellSelect = document.createElement('td');
    cellSelect.classList.add('col-select');
    const label = document.createElement('label');
    label.classList.add('custom-checkbox');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.management.selectedImageIds.has(image.id);
    checkbox.addEventListener('change', () => handleRowSelectionChange(image.id, checkbox.checked));
    const checkmark = document.createElement('span');
    checkmark.classList.add('checkmark');
    label.appendChild(checkbox);
    label.appendChild(checkmark);
    cellSelect.appendChild(label);

    // 2. Thumbnail
    const cellThumb = document.createElement('td');
    cellThumb.classList.add('col-thumb');
    const img = document.createElement('img');
    img.classList.add('thumbnail');
    img.src = image.thumbnailUrl;
    img.alt = image.title;
    img.loading = 'lazy'; // Lazy load thumbnails
    // Optional: Add placeholder/skeleton and load event handler
    img.addEventListener('load', () => img.classList.add('loaded'));
    img.addEventListener('error', () => { img.alt = 'Error loading thumb'; img.src=''; }); // Handle broken thumbs
    cellThumb.appendChild(img);

    // 3. Name
    const cellName = createCell('col-name', image.title);
    // Add click listener to Name cell for editing
    cellName.addEventListener('click', () => showImageEditModal(image));
    cellName.style.cursor = 'pointer';
    cellName.title = 'Click to edit title/description';

    // 4. Tags
    const cellTags = createCell('col-tags', ''); // Create empty cell first
    if (image.tags && image.tags.length > 0) {
        image.tags.forEach(tag => {
            cellTags.appendChild(createTagPill(tag, image.id, true));
        });
    }

    // 5. Date Added
    const cellDate = createCell('col-date', formatDateAdded(image.dateAdded));

    // 6. Actions
    const cellActions = createCell('col-actions', ''); // Create empty cell
    cellActions.style.textAlign = 'right'; // Keep alignment

    const deleteBtn = createActionButton('deleteBtn', 'Delete', () => handleDeleteImage(image.id, image.title));
    const playBtn = createActionButton('playBtn', 'Play', () => handlePlayImage(image));
    const editBtn = createActionButton('editBtn', 'Edit', () => showImageEditModal(image));

    cellActions.appendChild(deleteBtn);
    cellActions.appendChild(playBtn); // Add Play button
    cellActions.appendChild(editBtn); // Add Edit button

    // --- Append Cells to Row ---
    row.appendChild(cellSelect);
    row.appendChild(cellThumb);
    row.appendChild(cellName);
    row.appendChild(cellTags);
    row.appendChild(cellDate);
    row.appendChild(cellActions);

    // --- Drag and Drop Source --- 
    row.addEventListener('dragstart', (e) => {
        // Only allow dragging if rows are selected, and drag all selected rows
        const selectedIds = Array.from(state.management.selectedImageIds);
        if (selectedIds.length === 0) {
             e.preventDefault(); // Prevent drag if nothing selected
             return;
        }
        // If the dragged row itself isn't selected, maybe select it first?
        // Or only drag the currently selected set.
        // Current approach: Drag *all* currently selected images, regardless of which row started the drag
        e.dataTransfer.setData('application/json', JSON.stringify({ imageIds: selectedIds }));
        e.dataTransfer.effectAllowed = 'copy';

        // Add dragging class to all selected rows for visual feedback
         selectedIds.forEach(id => {
            const selectedRow = dom.imageTableBody?.querySelector(`tr[data-image-id="${id}"]`);
            selectedRow?.classList.add('dragging');
         });
    });

    row.addEventListener('dragend', () => {
         // Remove dragging class from all rows
        const draggingRows = dom.imageTableBody?.querySelectorAll('tr.dragging');
        draggingRows?.forEach(r => r.classList.remove('dragging'));
    });

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

// --- Functions moved from utils.js ---

/**
 * Creates a table cell.
 */
function createCell(className, content) {
    const cell = document.createElement('td');
    cell.classList.add(className);
    if (typeof content === 'string' || typeof content === 'number') {
        cell.textContent = content;
    } else if (content instanceof Node) {
        cell.appendChild(content);
    }
    return cell;
}

/**
 * Creates an action button for the image table.
 */
function createActionButton(className, title, onClick) {
    const btn = document.createElement('button');
    btn.classList.add('bx--btn', 'bx--btn--ghost', 'bx--btn--icon-only', 'action-button', className);
    btn.title = title;
    // Add appropriate SVG icon based on className
    let svgPath = '';
    if (className === 'deleteBtn') {
        // Keep existing delete SVG
        svgPath = `<svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M12 12H14V24H12zM18 12H20V24H18z"></path>
            <path d="M4 6V8H6V28a2 2 0 002 2H24a2 2 0 002-2V8h2V6zM8 28V8H24V28zM12 2H20V4H12z"></path>
        </svg>`;
    } else if (className === 'playBtn') { // Added Play Button SVG
        svgPath = `<svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="16" height="16" viewBox="0 0 32 32">
            <path d="M7,28a1,1,0,0,1-1-1V5a1,1,0,0,1,1.4819-.8763l20,11a1,1,0,0,1,0,1.7525l-20,11A1.0005,1.0005,0,0,1,7,28Z"></path>
        </svg>`;
    } else if (className === 'editBtn') { // Added Edit Button SVG
        svgPath = `<svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 32 32">
            <path d="M2 26H30V28H2zM25.4 9c.8-.8.8-2 0-2.8l-3.6-3.6c-.8-.8-2-.8-2.8 0l-15 15V24h6.4L25.4 9zm-3.6-2L24 8.6 12.6 20H10v-2.6L21.8 7z"></path>
        </svg>`;
    }
    btn.innerHTML = svgPath + `<span class="bx--assistive-text">${title}</span>`;

    btn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent row click
        onClick(); // The specific handler will be passed in
    });
    return btn;
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