// public/manage/playlistManager.js
// Logic for playlist management, filtering, and playback selection

import { state, updateState } from '../state.js';
import { playSelectedPlaylist, updatePlaylist, deletePlaylist, addImagesToPlaylist, removeImageFromPlaylist, fetchImages } from '../api.js'; // Using available CRUD operations
// TODO: Refactor backend for individual playlist CRUD APIs
import { showPlaylistEditModal } from './modals.js';
import { handleError, ErrorTypes, withErrorHandling } from './errorHandler.js';
import { refreshManageData } from '../manage.js';
import { getContentColorForBackground } from './utils.js';

// DOM elements cached by parent manage.js module
let dom = {};
const DEFAULT_PLAYLIST_COLOR = '#8a3ffc'; // A default purple

// --- State for Settings Playlist Selection ---
let settingsSelectedPlaylistIds = new Set();

export function setPlaylistManagerDOMCache(cachedDom) {
    dom = cachedDom;
    // Add checks for required elements used by *all* playlist functionalities
    if (!dom.playlistManagerSection || !dom.playlistList || !dom.newPlaylistForm || !dom.playlistSearchInput || // Manager section
        !dom.playlistFilterContainer || // Filter section
        !dom.settingsPlaylistList // Settings section
       ) {
        console.warn('PlaylistManager DOM Cache incomplete! Some features might fail.');
    }
}

// --- Helper Function to create Thumbnail Grid ---
/**
 * Creates a grid of image thumbnails for a playlist.
 * @param {object} playlist - The playlist object.
 * @param {Array<object>} imagesDataForGrid - Array of image objects fetched for this playlist.
 * @returns {HTMLDivElement} The div element containing the thumbnail grid.
 */
function createPlaylistThumbnailGrid(playlist, imagesDataForGrid) {
    console.log(`[Grid] Creating grid for playlist ${playlist.id}. Image IDs:`, playlist.imageIds, 'Received data:', imagesDataForGrid);
    const gridContainer = document.createElement('div');
    gridContainer.className = 'playlist-thumbnail-grid';

    if (!playlist.imageIds || playlist.imageIds.length === 0) {
        gridContainer.textContent = 'No images in this playlist.';
        gridContainer.style.padding = 'var(--cds-spacing-03)';
        gridContainer.style.color = 'var(--cds-text-02)';
        return gridContainer;
    }

    let imagesFoundCount = 0;
    playlist.imageIds.forEach(imageId => {
        // Find the image object in the data fetched specifically for this playlist
        const image = imagesDataForGrid.find(img => img && img.id === imageId);

        // --- DETAILED LOGGING --- >
        console.log(`[Grid Loop] Processing ID: ${imageId}`);
        console.log(`[Grid Loop] Found image object:`, image);
        if (image) {
            console.log(`[Grid Loop] image.thumbnailUrl exists?: ${image.hasOwnProperty('thumbnailUrl')}, Value:`, image.thumbnailUrl);
        } else {
            console.log(`[Grid Loop] Image object NOT found for ID ${imageId}`);
        }
        // < --- END LOGGING ---

        // The actual check to create the element
        if (image && image.thumbnailUrl) { // Check if image exists and has a non-empty thumbnailUrl
            imagesFoundCount++;
            const thumbWrapper = document.createElement('div');
            thumbWrapper.className = 'playlist-thumbnail-item';
            thumbWrapper.setAttribute('data-image-id', image.id); // Add image ID for removal reference

            const img = document.createElement('img');
            img.src = image.thumbnailUrl;
            img.alt = image.title || 'Playlist image';
            img.loading = 'lazy';
            thumbWrapper.appendChild(img);

            // Add Delete Button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-thumbnail-btn bx--btn bx--btn--ghost bx--btn--icon-only';
            deleteBtn.title = 'Remove from playlist';
            deleteBtn.innerHTML = `
                <svg focusable="false" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true">
                    <path d="M24 9.4L22.6 8 16 14.6 9.4 8 8 9.4l6.6 6.6L8 22.6 9.4 24l6.6-6.6 6.6 6.6 1.4-1.4-6.6-6.6L24 9.4z"></path>
                </svg>`;
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent other clicks
                handleRemoveImageFromPlaylistClick(playlist.id, image.id, thumbWrapper);
            });
            thumbWrapper.appendChild(deleteBtn);

            gridContainer.appendChild(thumbWrapper);
        } else {
            // Keep this warning for clarity
            console.warn(`[Grid] Condition failed: Image data or thumbnail URL missing/invalid for ID: ${imageId}`);
        }
    });

    if (imagesFoundCount === 0 && playlist.imageIds.length > 0) {
        gridContainer.textContent = 'Could not load thumbnails for this playlist.';
         gridContainer.style.padding = 'var(--cds-spacing-03)';
         gridContainer.style.color = 'var(--cds-text-02)';
    }

    return gridContainer;
}

// --- Playlist Manager Section UI --- (Add/Edit/Delete/Expand/Reorder)

/**
 * Creates DOM elements for a single playlist item row and its details row.
 * @param {object} playlist - The playlist object.
 * @param {Array<object>} allImages - Array of all image objects (for thumbnail lookup).
 * @returns {DocumentFragment} A fragment containing the main row and the details row.
 */
function createManagerPlaylistItem(playlist, allImages) {
    const fragment = document.createDocumentFragment();

    // --- Main Playlist Row ---
    const row = document.createElement('tr');
    row.setAttribute('data-playlist-id', playlist.id);
    row.setAttribute('draggable', true);
    if (playlist.hidden) {
        row.classList.add('hidden');
    }

    // Cell for Playlist Name
    const nameCell = document.createElement('td');
    nameCell.classList.add('bx--table-cell');
    const nameContainer = document.createElement('div');
    nameContainer.style.display = 'flex';
    nameContainer.style.alignItems = 'center';
    nameContainer.innerHTML = `
        <span class="playlist-color" style="background-color: ${playlist.color || DEFAULT_PLAYLIST_COLOR}; width: 12px; height: 12px; border-radius: 50%; display: inline-block; margin-right: var(--cds-spacing-03);"></span>
            <span class="playlist-name">${playlist.name}</span>
    `;
    nameCell.appendChild(nameContainer);

    // Cell for Actions
    const actionsCell = document.createElement('td');
    actionsCell.classList.add('bx--table-cell');

    // Action buttons container
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'playlist-actions-container'; // Added class for easier styling

    // Clickable container for count and arrow
    const countToggleContainer = document.createElement('div');
    countToggleContainer.className = 'playlist-count-toggle';
    countToggleContainer.title = 'Toggle image thumbnails';
    countToggleContainer.innerHTML = `
        <svg class="playlist-toggle-arrow" focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M12 8L22 18 12 28z"></path>
        </svg>
        <span class="playlist-count">(${playlist.imageIds.length} images)</span>
    `;
    actionsContainer.appendChild(countToggleContainer);


    // -- Action Buttons (Edit, Visibility, Delete, Play) --
    const editBtn = document.createElement('button');
    editBtn.className = 'bx--btn bx--btn--ghost bx--btn--icon-only';
    editBtn.title = 'Edit playlist';
    editBtn.innerHTML = `
        <svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M2 26H30V28H2zM25.4 9c.8-.8.8-2 0-2.8 0 0 0 0 0 0l-3.6-3.6c-.8-.8-2-.8-2.8 0 0 0 0 0 0 0l-15 15V24h6.4L25.4 9zM20.4 4L24 7.6l-3 3L17.4 7 20.4 4zM6 22v-3.6l10-10 3.6 3.6-10 10H6z"></path>
        </svg>`;
    editBtn.addEventListener('click', () => showPlaylistEditModal(playlist));

    const toggleHiddenBtn = document.createElement('button');
    toggleHiddenBtn.className = 'bx--btn bx--btn--ghost bx--btn--icon-only';
    toggleHiddenBtn.title = playlist.hidden ? 'Show playlist' : 'Hide playlist';
    toggleHiddenBtn.innerHTML = playlist.hidden ? `
        <svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true">
           <path d="M16 6C6.5 6 2 12.5 2 16s4.5 10 14 10 14-6.5 14-10S25.5 6 16 6zm0 18c-8.8 0-12-4.9-12-8s3.2-8 12-8 12 4.9 12 8-3.2 8-12 8z"></path>
           <path d="M16 10.5c-3 0-5.5 2.5-5.5 5.5s2.5 5.5 5.5 5.5 5.5-2.5 5.5-5.5-2.5-5.5-5.5-5.5zm0 9c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5z"></path>
        </svg>` : `
        <svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M30.94,15.66A16.69,16.69,0,0,0,16,5,16.69,16.69,0,0,0,1.06,15.66a1,1,0,0,0,0,.68A16.69,16.69,0,0,0,16,27,16.69,16.69,0,0,0,30.94,16.34,1,1,0,0,0,30.94,15.66ZM16,25c-5.3,0-10.9-3.93-12.93-9C5.1,10.93,10.7,7,16,7s10.9,3.93,12.93,9C26.9,21.07,21.3,25,16,25Z"></path>
            <path d="M16,10a6,6,0,1,0,6,6A6,6,0,0,0,16,10Zm0,10a4,4,0,1,1,4-4A4,4,0,0,1,16,20Z"></path>
        </svg>`;
    toggleHiddenBtn.addEventListener('click', () => handleTogglePlaylistHidden(playlist.id));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'bx--btn bx--btn--ghost bx--btn--icon-only'; // Removed bx--btn--danger
    deleteBtn.title = 'Delete playlist';
    deleteBtn.innerHTML = `
        <svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M12 12H14V24H12zM18 12H20V24H18z"></path>
            <path d="M4 6V8H6V28a2 2 0 002 2H24a2 2 0 002-2V8h2V6zM8 28V8H24V28zM12 2H20V4H12z"></path>
        </svg>`;
    deleteBtn.addEventListener('click', () => handleDeletePlaylist(playlist.id));

    const playBtn = document.createElement('button');
    playBtn.className = 'bx--btn bx--btn--ghost bx--btn--icon-only';
    playBtn.title = 'Play playlist';
    playBtn.innerHTML = `
        <svg focusable="false" preserveAspectRatio="xMidYMid meet" fill="currentColor" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M7 6l20 10L7 26z"></path>
        </svg>`;
    playBtn.addEventListener('click', () => handlePlayPlaylistClick(playlist.id));

    // Add buttons to container in the correct order
    actionsContainer.appendChild(editBtn);
    actionsContainer.appendChild(toggleHiddenBtn);
    actionsContainer.appendChild(deleteBtn);
    actionsContainer.appendChild(playBtn);

    // Add container to cell
    actionsCell.appendChild(actionsContainer);

    // Add cells to row
    row.appendChild(nameCell);
    row.appendChild(actionsCell);

    // --- Details Row (Initially Hidden) ---
    const detailsRow = document.createElement('tr');
    detailsRow.className = 'playlist-details-row';
    detailsRow.style.display = 'none'; // Hide initially
    detailsRow.setAttribute('data-playlist-id', playlist.id);

    const detailsCell = document.createElement('td');
    detailsCell.colSpan = 2; // Span across both columns
    detailsRow.appendChild(detailsCell);

    // --- Event Listeners ---

    // Add listener for the count/arrow toggle (make it async)
    countToggleContainer.addEventListener('click', async () => { // Added async
        const isHidden = detailsRow.style.display === 'none';

        // Populate content only on first expansion
        if (isHidden && detailsCell.dataset.populated !== 'true') {
            detailsCell.textContent = 'Loading thumbnails...'; // Show loading indicator
            try {
                // Fetch images specifically for this playlist
                console.log(`[Toggle] Fetching images for playlist ${playlist.id}, IDs:`, playlist.imageIds);
                const limit = playlist.imageIds.length > 0 ? playlist.imageIds.length : 50; // Ensure limit is at least 1, or reasonable default
                const imageData = await fetchImages({ filters: { ids: playlist.imageIds }, limit: limit });
                const imagesForPlaylist = imageData.images || [];
                console.log(`[Toggle] Received image data for playlist ${playlist.id}:`, imagesForPlaylist);

                detailsCell.innerHTML = ''; // Clear loading message
                // Pass the fetched images to the grid creation function
                detailsCell.appendChild(createPlaylistThumbnailGrid(playlist, imagesForPlaylist));
                detailsCell.dataset.populated = 'true'; // Mark as populated
            } catch (error) {
                console.error(`Error fetching images for playlist ${playlist.id}:`, error);
                detailsCell.textContent = 'Error loading thumbnails.';
                detailsCell.style.color = 'var(--cds-support-error)';
                // Don't mark as populated on error, allow retry
            }
        }

        // Toggle display
        detailsRow.style.display = isHidden ? 'table-row' : 'none';

        // Toggle arrow icon
        const arrowSvg = countToggleContainer.querySelector('svg');
        if (arrowSvg) {
            arrowSvg.innerHTML = isHidden ?
                '<path d="M24 12L16 22 8 12z"></path>' : // Down arrow
                '<path d="M12 8l10 10-10 10z"></path>'; // Right arrow
        }
    });


    // Drag and Drop for Main Row
    row.addEventListener('dragstart', handleDragStart);
    row.addEventListener('dragover', handleDragOver);
    row.addEventListener('dragleave', handleDragLeave);
    row.addEventListener('drop', handleDrop);

    // Append both rows to the fragment
    fragment.appendChild(row);
    fragment.appendChild(detailsRow);

    return fragment;
}

/**
 * Displays playlists in the playlist manager section, filtered by search term.
 */
export function displayPlaylistsInManager() {
    if (!dom.playlistList) return;
    const searchTerm = dom.playlistSearchInput ? dom.playlistSearchInput.value.toLowerCase() : '';
    const playlists = state.playlists || [];
    const allImages = state.management?.displayedImages || []; // Use images from management state for consistency
    dom.playlistList.innerHTML = ''; // Clear

    const filteredPlaylists = playlists
        .filter(p => p.name.toLowerCase().includes(searchTerm))
        .sort((a, b) => a.name.localeCompare(b.name));

    if (filteredPlaylists.length === 0) {
        // Add a row indicating no results, matching table structure
        const noResultRow = dom.playlistList.insertRow();
        const cell = noResultRow.insertCell();
        cell.colSpan = 2; // Span columns
        cell.textContent = 'No playlists found.';
        cell.style.textAlign = 'center';
        cell.style.padding = 'var(--cds-spacing-05)';
        cell.style.color = 'var(--cds-text-02)';
        return;
    }

    filteredPlaylists.forEach(playlist => {
        // Append the fragment containing both rows
        dom.playlistList.appendChild(createManagerPlaylistItem(playlist, allImages));
    });
}

// --- Playlist Filtering UI --- (Moved from filters.js)

/**
 * Displays playlists in the filter panel.
 */
export function displayPlaylistsInFilter() {
    const container = dom.playlistFilterContainer;
    if (!container) return;

    let scrollContainer = container.querySelector('.playlists-scroll-container');
    if (!scrollContainer) { // Create header and scroll container if they don't exist
        let header = container.querySelector('.playlist-filter-header');
        if (!header) {
            header = document.createElement('div');
            header.className = 'playlist-filter-header';
            // Use Carbon search sm, update deselect button icon
            header.innerHTML = `
                <div class="bx--search bx--search--sm" role="search">
                     <label class="bx--label bx--visually-hidden" for="playlist-filter-search-input">Filter Playlists</label>
                     <input type="text" class="bx--search-input" id="playlist-filter-search-input" placeholder="Filter playlists..." aria-label="Filter playlists">
                    <button class="bx--search-close bx--search-close--hidden" title="Clear search input" aria-label="Clear search input">
                         <svg focusable="false" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true"><path d="M24 9.4L22.6 8 16 14.6 9.4 8 8 9.4l6.6 6.6L8 22.6 9.4 24l6.6-6.6 6.6 6.6 1.4-1.4-6.6-6.6L24 9.4z"></path></svg>
                    </button>
                </div>
                <button class="bx--btn bx--btn--ghost bx--btn--sm playlist-deselect-btn" title="Deselect All Playlist Filters">
                    <svg focusable="false" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true">
                        <path d="M24 9.4L22.6 8 16 14.6 9.4 8 8 9.4l6.6 6.6L8 22.6 9.4 24l6.6-6.6 6.6 6.6 1.4-1.4-6.6-6.6L24 9.4z"></path>
                    </svg>
                    <span class="bx--assistive-text">Deselect All Playlist Filters</span>
                </button>
            `;
            container.appendChild(header);
             // Add listeners for filter header controls
            const searchInput = header.querySelector('.bx--search-input'); // Use correct class
            const clearSearchBtn = header.querySelector('.bx--search-close');
            searchInput.addEventListener('input', (e) => {
                filterPlaylistFilterView(e.target.value);
                clearSearchBtn.classList.toggle('bx--search-close--hidden', !e.target.value);
            });
            clearSearchBtn.addEventListener('click', () => {
                searchInput.value = '';
                filterPlaylistFilterView('');
                clearSearchBtn.classList.add('bx--search-close--hidden');
            });
            header.querySelector('.playlist-deselect-btn').addEventListener('click', handleDeselectPlaylistFilter);
        }
        scrollContainer = document.createElement('div');
        scrollContainer.className = 'playlists-scroll-container';
        container.appendChild(scrollContainer);
    }

    scrollContainer.innerHTML = ''; // Clear previous items
    const selectedPlaylistIds = state.management.selectedPlaylistIds || []; // Expecting an array now
    const playlists = state.playlists || [];
    
    // Filter for non-hidden, non-empty playlists, then sort
    const visiblePlaylists = playlists
        .filter(p => !p.hidden && p.imageIds && p.imageIds.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name));

    visiblePlaylists.forEach(playlist => {
        const item = document.createElement('div');
        item.className = 'playlist-filter-item';
        item.setAttribute('data-playlist-id', playlist.id);
        // Check if the current playlist ID is in the selected array
        if (selectedPlaylistIds.includes(playlist.id)) {
            item.classList.add('selected');
        }
        // Format count correctly
        const imageCountText = `${playlist.imageIds.length} image${playlist.imageIds.length !== 1 ? 's' : ''}`;
        item.innerHTML = `
            <span class="playlist-filter-color" style="background-color: ${playlist.color || DEFAULT_PLAYLIST_COLOR}"></span>
            <div class="playlist-filter-info">
                <span class="playlist-filter-name">${playlist.name}</span>
                <span class="playlist-filter-count">${imageCountText}</span>
            </div>
        `;
        item.addEventListener('click', () => handleSelectPlaylistFilter(playlist.id)); // Pass only ID
        scrollContainer.appendChild(item);
    });
    // Pass the actual input element's value for filtering
    filterPlaylistFilterView(container.querySelector('.bx--search-input').value);
}

/**
 * Handles selecting/deselecting a playlist filter.
 * @param {number} playlistId - The ID of the playlist clicked.
 */
function handleSelectPlaylistFilter(playlistId) {
    const currentSelectedIds = [...(state.management.selectedPlaylistIds || [])]; // Clone current selection
    const index = currentSelectedIds.indexOf(playlistId);

    if (index === -1) {
        // Not selected, add it
        currentSelectedIds.push(playlistId);
    } else {
        // Already selected, remove it
        currentSelectedIds.splice(index, 1);
    }

    console.log('Updating selected playlist filters:', currentSelectedIds);
    updateState('management', { selectedPlaylistIds: currentSelectedIds, currentPage: 1 }); // Update state, reset page
    displayPlaylistsInFilter(); // Re-render the filter list to show selection change
    refreshManageData(); // Fetch data with new filters
}

/**
 * Handles deselecting ALL playlist filters.
 */
function handleDeselectPlaylistFilter() {
    console.log('Deselecting all playlist filters');
    updateState('management', { selectedPlaylistIds: [], currentPage: 1 }); // Clear selection, reset page
    displayPlaylistsInFilter(); // Re-render the filter list
    refreshManageData(); // Fetch data with cleared filters
}

/** Filters the visible list of playlist filters based on search input. */
function filterPlaylistFilterView(searchTerm) {
    const term = searchTerm.toLowerCase();
    const container = dom.playlistFilterContainer?.querySelector('.playlists-scroll-container');
    if (!container) return;

    let hasVisibleItems = false;
    container.querySelectorAll('.playlist-filter-item').forEach(item => {
        const name = item.querySelector('.playlist-filter-name').textContent.toLowerCase();
        const isVisible = name.includes(term);
        item.style.display = isVisible ? 'flex' : 'none';
        if (isVisible) hasVisibleItems = true;
    });

    // Show/hide no results message
    let noResultsMsg = container.querySelector('.no-results-message');
    if (!hasVisibleItems) {
        if (!noResultsMsg) {
            noResultsMsg = document.createElement('p');
            noResultsMsg.className = 'no-results-message';
            noResultsMsg.style.padding = '8px';
            noResultsMsg.style.color = 'var(--cds-text-secondary)';
            container.appendChild(noResultsMsg);
        }
        noResultsMsg.textContent = `No playlists matching "${searchTerm}"`;
    } else if (noResultsMsg) {
        noResultsMsg.remove();
    }
}

// --- Playlist Playback Selection (Settings Tab) ---

/** Displays playlists for selection in the settings tab. */
export function displayPlaylistsForSelection() {
    const container = dom.settingsPlaylistList; // The list container div
    const controlsContainer = document.getElementById('settingsPlaylistSelectionBtns'); // Button container
    if (!container || !controlsContainer) {
        console.warn('Settings playlist list or controls container not found in DOM cache.');
        return;
    }
    container.innerHTML = ''; // Clear list
    controlsContainer.innerHTML = ''; // Clear buttons
    settingsSelectedPlaylistIds.clear(); // Clear selection state

    const allPlaylists = (state.playlists || [])
        .filter(p => !p.hidden && p.imageIds && p.imageIds.length > 0); // Only show non-hidden AND non-empty playlists

    // --- Add Select/Deselect Buttons --- 
    const selectAllBtn = createSettingsPlaylistActionButton('Select All', true, () => {
        container.querySelectorAll('.settings-playlist-item').forEach(item => {
            if (item.style.display !== 'none') { // Only select visible items
                item.classList.add('selected');
                settingsSelectedPlaylistIds.add(parseInt(item.dataset.playlistId, 10));
            }
        });
    });
    controlsContainer.appendChild(selectAllBtn);

    const deselectAllBtn = createSettingsPlaylistActionButton('Deselect All', false, () => {
        container.querySelectorAll('.settings-playlist-item.selected').forEach(item => {
            item.classList.remove('selected');
        });
        settingsSelectedPlaylistIds.clear();
    });
    controlsContainer.appendChild(deselectAllBtn);
    // --- ------------------------ --- 

    if (allPlaylists.length === 0) {
        container.innerHTML = '<p class="bx--type-body-short-01">No playlists with images available.</p>'; 
        return;
    }

    // Sort playlists by name
    allPlaylists.sort((a, b) => a.name.localeCompare(b.name));

    allPlaylists.forEach(playlist => {
        const item = document.createElement('div'); // Use div, style like list item
        // Apply similar classes as the filter items for styling
        item.className = 'settings-playlist-item playlist-filter-item'; 
        item.setAttribute('data-playlist-id', playlist.id);
        
        // Format count correctly
        const imageCountText = `(${playlist.imageIds.length} image${playlist.imageIds.length !== 1 ? 's' : ''})`;
        
        item.innerHTML = `
            <span class="playlist-filter-color" style="background-color: ${playlist.color || DEFAULT_PLAYLIST_COLOR}"></span>
            <div class="playlist-filter-info">
                <span class="playlist-filter-name">${playlist.name}</span>
                <span class="playlist-filter-count">${imageCountText}</span>
            </div>
        `;
        
        // Click listener for selection
        item.addEventListener('click', () => {
            const isSelected = item.classList.toggle('selected');
            const playlistId = parseInt(playlist.id, 10);
            if (isSelected) {
                settingsSelectedPlaylistIds.add(playlistId);
            } else {
                settingsSelectedPlaylistIds.delete(playlistId);
            }
            console.log('Settings selected playlist IDs:', settingsSelectedPlaylistIds);
        });
        
        container.appendChild(item);
    });

    // Initial filter based on search input value
    const searchInput = document.getElementById('settingsPlaylistSearch');
    if (searchInput) {
        filterSettingsPlaylistsView(searchInput.value);
    }
}

/** Helper to create action buttons for settings playlist selection */
function createSettingsPlaylistActionButton(text, isPrimary, onClick) { 
    const btn = document.createElement('button');
    btn.className = `bx--btn bx--btn--sm ${isPrimary ? 'bx--btn--primary' : 'bx--btn--secondary'}`;
    btn.type = 'button'; 
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
}

/** Filters the visible list of playlists in the settings tab. */
function filterSettingsPlaylistsView(searchTerm) {
    const term = searchTerm.toLowerCase();
    const container = dom.settingsPlaylistList; // The list container
    if (!container) return;

    let hasVisibleItems = false;
    container.querySelectorAll('.settings-playlist-item').forEach(item => {
        const name = item.querySelector('.playlist-filter-name')?.textContent.toLowerCase() || '';
        const isVisible = name.includes(term);
        item.style.display = isVisible ? 'flex' : 'none'; // Use flex to match playlist-filter-item style
        if (isVisible) hasVisibleItems = true;
    });

    // Show/hide no results message (similar to filter panel)
    let noResultsMsg = container.querySelector('.no-results-message');
    if (!hasVisibleItems && allPlaylists.length > 0) { // Only show if there were playlists to begin with
        if (!noResultsMsg) {
            noResultsMsg = document.createElement('p');
            noResultsMsg.className = 'no-results-message bx--type-body-short-01';
            noResultsMsg.style.padding = 'var(--cds-spacing-03)';
            noResultsMsg.style.color = 'var(--cds-text-secondary)';
            container.appendChild(noResultsMsg);
        }
        noResultsMsg.textContent = `No playlists matching "${searchTerm}"`;
    } else if (noResultsMsg) {
        noResultsMsg.remove();
    }
}

// --- API Interaction Functions ---

/**
 * Workaround: Creates a new playlist using the updatePlaylist endpoint.
 * @param {object} playlistData - Data for the new playlist (name, color, hidden).
 * @returns {Promise<string>} The temporary ID assigned to the playlist.
 */
async function createPlaylistWorkaround(playlistData) {
    // Create a temporary ID - the server will assign a real one
    const tempId = `temp-${Date.now()}`; 
    const newPlaylist = {
        id: tempId,
        name: playlistData.name,
        color: playlistData.color || DEFAULT_PLAYLIST_COLOR,
        is_hidden: playlistData.hidden || false,
        imageIds: [], // Start with no images
        created_at: new Date().toISOString()
    };
    
    try {
        // Use updatePlaylist as a workaround - the backend should handle new playlists
        await updatePlaylist(tempId, newPlaylist);
        console.log(`Playlist "${playlistData.name}" created successfully (temp ID: ${tempId}).`);
        return tempId;
    } catch (error) {
        console.error('Error creating playlist:', error);
        throw error; // Re-throw for handling by caller
    }
}

/**
 * Handles form submission for adding a new playlist.
 */
async function handleAddNewPlaylist(event) {
    event.preventDefault();
    if (!dom.newPlaylistNameInput) return;
    const playlistName = dom.newPlaylistNameInput.value.trim();
    if (!playlistName) return;
    
    const currentPlaylists = state.playlists || [];
    if (currentPlaylists.some(p => p.name.toLowerCase() === playlistName.toLowerCase())) {
        alert(`Playlist "${playlistName}" already exists.`);
        return;
    }
    
    try {
        // Use our workaround function instead of a direct API call
        await createPlaylistWorkaround({ 
            name: playlistName, 
            color: DEFAULT_PLAYLIST_COLOR 
        });
        dom.newPlaylistForm.reset();
        await refreshManageData(); // Refresh data to show the new playlist
    } catch (error) {
        handleError(error, ErrorTypes.SERVER);
    }
}

/**
 * Handles deleting a playlist
 */
async function handleDeletePlaylist(playlistId) {
    const playlist = state.playlists.find(p => p.id === playlistId);
    if (!playlist) {
        handleError(new Error('Playlist not found'), ErrorTypes.NOT_FOUND);
        return;
    }

    if (!confirm(`Are you sure you want to delete playlist "${playlist.name}"? This cannot be undone.`)) {
        return;
    }

    try {
        await deletePlaylist(playlist.id);
        await refreshManageData();
    } catch (error) {
        handleError(error, ErrorTypes.SERVER);
    }
}

/**
 * Handles toggling the hidden state of a playlist.
 * @param {number} playlistId - The ID of the playlist to toggle.
 */
async function handleTogglePlaylistHidden(playlistId) {
    const playlist = state.playlists.find(p => p.id === playlistId);
    if (!playlist) {
        handleError(new Error('Playlist not found'), ErrorTypes.NOT_FOUND);
        return;
    }

    const newHiddenState = !playlist.hidden;

    try {
        await updatePlaylist(playlistId, { is_hidden: newHiddenState });
        await refreshManageData(); // Refresh UI
    } catch (error) {
        handleError(error, ErrorTypes.SERVER);
    }
}

/**
 * Handles playing a playlist by its ID.
 * @param {number} playlistId - The ID of the playlist to play.
 */
async function handlePlayPlaylistClick(playlistId) {
    // You might want to add UI feedback (e.g., disable button)
    console.log(`Attempting to play playlist ID: ${playlistId}`);
    try {
        await playSelectedPlaylist(parseInt(playlistId, 10));
        // Add success feedback if needed
    } catch (error) {
        handleError(error, ErrorTypes.SERVER);
    }
}

// --- Drag and Drop Handlers for Playlist Rows ---

/**
 * Handles drag starting on a playlist row (for future reordering).
 * @param {DragEvent} e - The drag event.
 */
function handleDragStart(e) {
    // If implementing reordering:
    // const playlistId = e.target.closest('tr')?.dataset.playlistId;
    // if (playlistId) {
    //     e.dataTransfer.setData('text/plain', playlistId);
    //     e.dataTransfer.effectAllowed = 'move';
    //     e.target.closest('tr').classList.add('dragging');
    // }
    console.warn('Playlist reordering drag not implemented yet.');
    // Prevent dragging for now if not implemented
    e.preventDefault();
}

/**
 * Handles dragging over a playlist row (target for adding images).
 * @param {DragEvent} e - The drag event.
 */
function handleDragOver(e) {
    e.preventDefault(); // Necessary to allow dropping
    const row = e.target.closest('tr');
    if (row) {
        row.classList.add('bx--data-table--drag-over');
    }
    e.dataTransfer.dropEffect = 'copy'; // Indicate copying is allowed
}

/**
 * Handles dragging leaving a playlist row target.
 * @param {DragEvent} e - The drag event.
 */
function handleDragLeave(e) {
    const row = e.target.closest('tr');
    if (row) {
        row.classList.remove('bx--data-table--drag-over');
    }
}

/**
 * Handles dropping data (images) onto a playlist row.
 * @param {DragEvent} e - The drag event.
 */
async function handleDrop(e) {
    e.preventDefault();
    const row = e.target.closest('tr');
    const playlistId = parseInt(row?.dataset.playlistId, 10);

    if (row) {
        row.classList.remove('bx--data-table--drag-over');
    }

    if (!playlistId) {
        console.error('Could not determine playlist ID on drop.');
        return;
    }

    try {
        // Assuming data is JSON stringified image IDs from imageManager.js
        const data = JSON.parse(e.dataTransfer.getData('application/json'));
        if (!data.imageIds || !Array.isArray(data.imageIds)) {
            throw new Error('Invalid drag data format for images.');
        }
        console.log(`Dropping ${data.imageIds.length} images onto playlist ${playlistId}`);
        await addImagesToPlaylist(playlistId, data.imageIds);
        await refreshManageData(); // Refresh playlist list and potentially image table tags
        // Add success feedback?
    } catch (error) {
        handleError(error, ErrorTypes.VALIDATION, 'Failed to add images to playlist from drop.');
    }
}

/**
 * Handles removing an image from a specific playlist (called from thumbnail delete button).
 * @param {number} playlistId - The ID of the playlist.
 * @param {number} imageId - The ID of the image to remove.
 * @param {HTMLElement} thumbWrapperElement - The DOM element of the thumbnail to remove visually.
 */
async function handleRemoveImageFromPlaylistClick(playlistId, imageId, thumbWrapperElement) {
    console.log(`Attempting to remove image ${imageId} from playlist ${playlistId}`);
    // Optionally disable the button or show a loading state on the thumbnail
    const deleteButton = thumbWrapperElement.querySelector('.delete-thumbnail-btn');
    if (deleteButton) deleteButton.disabled = true;

    try {
        await removeImageFromPlaylist(playlistId, imageId);
        // Remove the thumbnail from the grid immediately
        thumbWrapperElement.remove();
        console.log(`Image ${imageId} removed from playlist ${playlistId} visually.`);
        // TODO: Update the playlist count in the main row without full refresh?
        // For now, rely on manual refresh or next data load to update count.
        await refreshManageData(); // Or trigger a targeted refresh later
    } catch (error) {
        handleError(error, ErrorTypes.SERVER, `Failed to remove image ${imageId} from playlist ${playlistId}`);
        // Re-enable button on error
        if (deleteButton) deleteButton.disabled = false;
    }
}

// --- Initialization --- //

/** Attaches event listeners for playlist manager, filter, and settings controls. */
export function attachPlaylistManagerEventListeners() {
    // Manager Section Toggle - REMOVED (handled by manage.js)
    // if (dom.playlistManagerToggle && dom.playlistManagerSection) { ... }
    
    // Manager Section Add Form
    if (dom.newPlaylistForm) {
        dom.newPlaylistForm.addEventListener('submit', handleAddNewPlaylist);
    }
    // Manager Section Search
    if (dom.playlistSearchInput) {
        dom.playlistSearchInput.addEventListener('input', displayPlaylistsInManager);
    }
    // Note: Manager item actions (edit, delete, play, expand, drop, remove-image) are delegated or added dynamically.

    // Filter Section listeners are added dynamically in displayPlaylistsInFilter.

    // ADD Listeners for Settings Playlist Search
    const searchInput = document.getElementById('settingsPlaylistSearch');
    const clearSearchBtn = searchInput?.parentElement.querySelector('.bx--search-close');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterSettingsPlaylistsView(e.target.value);
            clearSearchBtn?.classList.toggle('bx--search-close--hidden', !e.target.value);
        });
    }
    if(clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            if(searchInput) searchInput.value = '';
            filterSettingsPlaylistsView('');
            clearSearchBtn.classList.add('bx--search-close--hidden');
        });
    }

    // Select/Deselect button listeners are added dynamically
}

// Main initialization function (called by manage.js)
export function initPlaylistManager() {
    console.log('Initializing Playlist Manager...');
    // Initialize state if needed (assuming state module handles defaults)
    // if (state.management.selectedPlaylistIds === undefined) {
    //     updateState('management', { selectedPlaylistIds: [] }); 
    // }
    attachPlaylistManagerEventListeners(); 
    // Initial display calls are handled by refreshManageData
} 